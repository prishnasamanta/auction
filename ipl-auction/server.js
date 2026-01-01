const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

// Make sure you have players.js file
const PLAYERS = require("./players"); 
const disconnectTimers = {};
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 60000, // Increase connection tolerance
    pingInterval: 25000
});

app.use(express.static("public"));

// --- Handle /room/:code requests ---
app.get('/room/:roomCode', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

/* ================= CONSTANTS & GLOBALS ================= */
const rooms = {};

const DEFAULT_RULES = {
    purse: 120,      
    maxPlayers: 18,  
    maxForeign: 6,   
    minBat: 3,
    minBowl: 3,
    minWK: 1,
    minAll: 1,
    minSpin: 1,
    maxForeignXI: 4
};

const AVAILABLE_TEAMS_LIST = ["CSK", "MI", "RCB", "KKR", "RR", "SRH", "DC", "PBKS", "LSG", "GT"];

/* ================= HELPER FUNCTIONS ================= */

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}
function startBid(rating) {
    if (rating >= 9) return 2;
    if (rating >= 8.5) return 1.5;
    if (rating >= 8) return 1;
    if (rating >= 7.5) return 0.75;
    if (rating >= 7) return 0.5;
    return 0.3;
}

function createSets(allPlayers) {
    const sets = [];
    let currentSet = [];
    
    if (!allPlayers || allPlayers.length === 0) return [];

    let lastP = allPlayers[0];
    currentSet.push(lastP);

    for (let i = 1; i < allPlayers.length; i++) {
        const p = allPlayers[i];
        if (p.role !== lastP.role || p.foreign !== lastP.foreign) {
            sets.push(currentSet); 
            currentSet = [];       
        }
        currentSet.push(p);
        lastP = p;
    }
    sets.push(currentSet); 
    return sets;
}

function getSetName(set) {
    if (!set || set.length === 0) return "Empty Set";
    const p = set[0];
    return `${p.foreign ? "Overseas" : "Indian"} ${p.role}s`;
}

function broadcastSets(r, roomCode) {
    const payload = [];
    for (let i = r.currentSetIndex; i < r.sets.length; i++) {
        payload.push({
            name: getSetName(r.sets[i]),
            players: r.sets[i],
            active: (i === r.currentSetIndex)
        });
    }
    io.to(roomCode).emit("setUpdate", payload);
}

// --- NEW: Helper to check if team is truly taken (even by disconnected user) ---
function isTeamTaken(room, teamName) {
    // Check available teams list
    if (!room.availableTeams.includes(teamName)) return true;
    
    // Check if ANY user (connected or waiting for timeout) holds this team
    const isHeldByUser = Object.values(room.users).some(u => u.team === teamName);
    if (isHeldByUser) return true;

    return false;
}

/* ================= SOCKET LOGIC ================= */

io.on("connection", socket => {

    // --- 1. GET PUBLIC ROOMS ---
    socket.on('getPublicRooms', () => {
        const liveRooms = [];
        const waitingRooms = [];
        
        for (const [id, room] of Object.entries(rooms)) {
            if (room.isPublic && !room.auctionEnded) { 
                const info = { id: id, count: Object.keys(room.users).length };
                if (room.auctionStarted) {
                    liveRooms.push(info);
                } else {
                    waitingRooms.push(info);
                }
            }
        }
        socket.emit('publicRoomsList', { live: liveRooms, waiting: waitingRooms });
    });


    // --- 2. CREATE ROOM ---
    socket.on("createRoom", ({ user, isPublic }) => {
        const code = generateRoomCode();
        
        rooms[code] = {
            admin: socket.id,
            adminUser: user,
            isPublic: !!isPublic,
            users: {}, 
            availableTeams: [...AVAILABLE_TEAMS_LIST],
            squads: {},
            purse: {},
            sets: createSets([...PLAYERS]),
            currentSetIndex: 0,
            playingXI: {},
            rulesLocked: false,
            auctionStarted: false,
            chat: [], 
            logs: [], 
            rules: { ...DEFAULT_RULES },
            auction: {
                live: false, paused: false, player: null, 
                bid: 0, team: null, timer: 5, interval: null, lastBidTeam: null
            }
        };

        const room = rooms[code];

        AVAILABLE_TEAMS_LIST.forEach(t => {
            room.squads[t] = [];
            room.purse[t] = room.rules.purse;
        });

        socket.join(code);
        socket.room = code;
        socket.user = user;
        socket.isAdmin = true;
        
        room.users[socket.id] = { name: user, team: null, id: socket.id, connected: true };

        socket.emit("roomCreated", code);
        
        socket.emit("joinedRoom", {
            squads: room.squads,
            rules: room.rules,
            roomCode: code,
            isHost: true,
            auctionStarted: room.auctionStarted,
            availableTeams: room.availableTeams,
            auctionEnded: (room.auctionStarted && !room.auction.live && room.auction.paused),
            userCount: 1,
            teamOwners: getTeamOwners(room)
        });

        broadcastSets(room, code);
    });

    // --- 3. RECONNECT USER ---
    // --- 3. RECONNECT USER (FIXED LOGIC) ---
    socket.on('reconnectUser', ({ roomId, username, team }) => {
        const room = rooms[roomId];
        const timerKey = `${roomId}_${username}`;
        
        // 1. CANCEL TIMER (If they made it back in time)
        if (disconnectTimers[timerKey]) {
            console.log(`♻️ User ${username} reconnected. Cancelling disconnect timer.`);
            clearTimeout(disconnectTimers[timerKey]);
            delete disconnectTimers[timerKey];
        }

        if (room) {
            // 2. CHECK IF USER STILL EXISTS IN MEMORY
            let oldSocketId = Object.keys(room.users).find(key => room.users[key].name === username);
            
            // SECURITY: Block strangers if auction ended
            if (!oldSocketId && room.auctionEnded) {
                return socket.emit("error", "Auction Closed.");
            }

            let assignedTeam = null;

            if(oldSocketId) {
                // === SCENARIO A: CAME BACK IN TIME ===
                // Swap socket ID, keep existing team
                const userData = room.users[oldSocketId];
                delete room.users[oldSocketId];
                
                userData.id = socket.id;
                userData.connected = true;
                userData.isAway = false;     // Clear Yellow status
                userData.disconnectTime = null; 
                
                room.users[socket.id] = userData;
                assignedTeam = userData.team; // Keep their team
            } else {
                // === SCENARIO B: TIMED OUT (OR NEW TAB) ===
                // They were deleted from memory. Even if they sent a 'team' param,
                // we IGNORE it and force them to be a Spectator (null).
                // This prevents 2 people having the same team.
                
                room.users[socket.id] = { 
                    name: username, 
                    team: null, // <--- FORCE SPECTATOR
                    id: socket.id, 
                    connected: true, 
                    isAway: false 
                };
                assignedTeam = null;
            }

            // 3. SETUP SOCKET
            socket.join(roomId);
            socket.room = roomId;
            socket.user = username;
            socket.team = assignedTeam; // Update socket session
            if(room.adminUser === username) socket.isAdmin = true;

            // 4. SEND STATE (Include specific 'yourTeam' instruction)
            socket.emit("joinedRoom", { 
                rules: room.rules,
                squads: room.squads,
                purses: room.purse,
                roomCode: roomId,
                isHost: socket.isAdmin,
                auctionStarted: room.auctionStarted,
                availableTeams: room.availableTeams,
                auctionEnded: room.auctionEnded,
                userCount: Object.keys(room.users).length,
                teamOwners: getTeamOwners(room),
                history: { chat: room.chat, logs: room.logs }, // <--- SEND HISTORY
        
                
                // CRITICAL: Tell client exactly who they are now
                yourTeam: assignedTeam 
            });
            
            // 5. BROADCAST UPDATES
            broadcastUserList(room, roomId); // Update Dots (Yellow -> Green)
            broadcastSets(room, roomId);

            if(assignedTeam) {
                // If they kept their team, refresh everyone's view just in case
                socket.emit("teamPicked", { team: assignedTeam, remaining: room.availableTeams });
            } 

            // Sync Auction State
            socket.emit("auctionState", {
                live: room.auction.live,
                paused: room.auction.paused,
                player: room.auction.player,
                bid: room.auction.bid,
                lastBidTeam: room.auction.lastBidTeam
            });

            if(room.auction.player){
                 socket.emit("newPlayer", { 
                    player: room.auction.player, 
                    bid: room.auction.bid 
                 });
            }

            // Final Data if ended
            if(room.auctionEnded) {
                socket.emit("squadData", room.squads);
                if(Object.keys(room.playingXI).length > 0){
                    const board = Object.values(room.playingXI).sort((a,b) => {
                       if(b.rating !== a.rating) return b.rating - a.rating; 
                       return (b.purse || 0) - (a.purse || 0); 
                    });
                    socket.emit("leaderboard", board);
                }
            }

        } else {
            socket.emit("error", "Room expired or not found");
        }
    });

    // --- 4. JOIN ROOM ---
    socket.on("joinRoom", ({ roomCode, user }) => {
        const room = rooms[roomCode];
        if(!room) return socket.emit("error", "Room not found");
        
        if(room.auctionEnded) {
            return socket.emit("error", "This auction has ended and is closed.");
        }

        // --- KEY FIX: Check if this is actually a reconnect ---
        const existingSocketId = Object.keys(room.users).find(id => room.users[id].name === user);
        
        if (existingSocketId) {
            console.log(`♻️ User ${user} rejoined via joinRoom. Merging session.`);
            
            // 1. Cancel the 'disconnect' timer immediately
            const timerKey = `${roomCode}_${user}`;
            if (disconnectTimers[timerKey]) {
                clearTimeout(disconnectTimers[timerKey]);
                delete disconnectTimers[timerKey];
            }

            // 2. Transfer data
            const userData = room.users[existingSocketId];
            delete room.users[existingSocketId];
            room.users[socket.id] = userData;
            
            userData.id = socket.id;
            userData.connected = true;

            socket.team = userData.team;
            if(room.adminUser === user) socket.isAdmin = true;

        } else {
            // New User
            room.users[socket.id] = { name: user, team: null, id: socket.id, connected: true };
        }

        socket.join(roomCode);
        socket.room = roomCode;
        socket.user = user;
        
        socket.emit("joinedRoom", { 
            rules: room.rules,
            squads: room.squads,
            purses: room.purse, // <--- ADD THIS LINE
            roomCode: roomCode,
            isHost: (room.adminUser === user),
            auctionStarted: room.auctionStarted,
            availableTeams: room.availableTeams,
            auctionEnded: false,
            userCount: Object.keys(room.users).length,
            history: { chat: room.chat, logs: room.logs }, // <--- SEND HISTORY
            teamOwners: getTeamOwners(room)
        });

        if (socket.team) {
             socket.emit("teamPicked", { team: socket.team, remaining: room.availableTeams });
        }

        broadcastUserList(room, roomCode);
        broadcastSets(room, roomCode);
        sendLog(room, roomCode, `👋 ${user} has joined.`);
    });

    // --- 5. SELECT TEAM (STRICT CHECK) ---
    socket.on("selectTeam", ({ team, user }) => {
        const r = rooms[socket.room];
        if(!r) return;
        if(socket.team) return; 
        
        // --- FIX: Strict check for race conditions ---
        if (isTeamTaken(r, team)) {
             socket.emit("error", "Team is currently held by another player (or temporarily disconnected).");
             // Refresh list just in case
             socket.emit("teamPicked", { team: null, remaining: r.availableTeams });
             return;
        }

        socket.team = team;
        if(r.users[socket.id]) r.users[socket.id].team = team;

        if(!r.squads[team]) r.squads[team] = [];
        if(!r.purse[team]) r.purse[team] = r.rules.purse;

        r.availableTeams = r.availableTeams.filter(t => t !== team);

        io.to(socket.room).emit("teamPicked", {
            team,
            remaining: r.availableTeams
        });
        // OLD: io.to(socket.room).emit("logUpdate", `👕 ${user} selected ${team}`);
        sendLog(r, socket.room, `👕 ${user} selected ${team}`);
        broadcastUserList(rooms[socket.room], socket.room);
    });

    // --- 6. ADMIN: SET RULES ---
    socket.on("setRules", rules => {
        const room = rooms[socket.room];
        if(!room || !socket.isAdmin) return;
        if(room.auctionStarted) return;

        room.rules = { ...room.rules, ...rules };
        Object.keys(room.purse).forEach(t => {
            room.purse[t] = room.rules.purse;
        });
        room.rulesLocked = true;
        io.to(socket.room).emit("rulesUpdated", { rules: room.rules, teams: room.availableTeams });
    });

    // --- 7. ADMIN ACTIONS ---
    socket.on("adminAction", action => {
        const r = rooms[socket.room];
        if(!r || !socket.isAdmin) return;

        if(action === "start"){
            if(r.auctionStarted) return;
            r.auctionStarted = true;
            r.auction.live = true;
            io.to(socket.room).emit("auctionStarted");
            nextPlayer(r, socket.room);
        }
        if(action === "togglePause"){
            r.auction.paused = !r.auction.paused;
            io.to(socket.room).emit(r.auction.paused ? "auctionPaused" : "auctionResumed");
        }
        if(action === "skip"){
            if(!r.auction.player) return;
            if(r.auction.interval) clearInterval(r.auction.interval);
// OLD: io.to(socket.room).emit("logUpdate", `⏭ ${r.auction.player.name} skipped`);
            sendLog(r, socket.room, `⏭ ${r.auction.player.name} skipped`);
            io.to(socket.room).emit("unsold", { player: r.auction.player });
            setTimeout(() => nextPlayer(r, socket.room), 800);
        }
        if(action === "skipSet"){
// OLD: io.to(socket.room).emit("logUpdate", `⏩ SKIPPING SET: ${getSetName(r.sets[r.currentSetIndex])}`);
            sendLog(r, socket.room, `⏩ SKIPPING SET: ${getSetName(r.sets[r.currentSetIndex])}`);
            r.sets[r.currentSetIndex] = []; 
            if(r.auction.interval) clearInterval(r.auction.interval);
            nextPlayer(r, socket.room);
        }
        if(action === "end"){
            endAuction(r, socket.room);
        }
    });

    // --- 8. BIDDING ---
    socket.on("bid", () => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;
        if(!r.auction.live || r.auction.paused) return;
        if(r.auction.lastBidTeam === socket.team) return;

        let nextBid;
        if (r.auction.team === null) {
            nextBid = r.auction.bid; 
        } else {
            let currentBid = Math.round(r.auction.bid * 100) / 100;
            const increment = 
                currentBid < 1  ? 0.05 : 
                currentBid < 5  ? 0.10 : 
                currentBid < 10 ? 0.20 : 
                currentBid < 20 ? 0.25 : 
                1.0;
            nextBid = r.auction.bid + increment;
        }

        const currentPurse = r.purse[socket.team]; 
        
        if(currentPurse < nextBid){
            socket.emit("bidRejected", "Insufficient purse");
            return;
        }

        r.auction.bid = nextBid;
        r.auction.lastBidTeam = socket.team;
        r.auction.team = socket.team; 
        r.auction.timer = 10;          

        // EMIT EVENT FOR SOUND
        io.to(socket.room).emit("bidUpdate", {
            bid: r.auction.bid,
            team: socket.team
        });
// OLD: io.to(socket.room).emit("logUpdate", `⚬ ${socket.team} bids ₹${r.auction.bid.toFixed(2)} Cr`);
        sendLog(r, socket.room, `⚬ ${socket.team} bids ₹${r.auction.bid.toFixed(2)} Cr`);
    });

    // --- 9. CHAT & SQUADS ---
    socket.on("chat", data => {
        const r = rooms[socket.room];
        if(!r) return;        // Store
        r.chat.push(data);
        if(r.chat.length > 20) r.chat.shift(); // Limit to 20
        io.to(socket.room).emit("chatUpdate", data);
    });
    socket.on("getSquads", () => {
        const r = rooms[socket.room];
        if(!r) return;
        socket.emit("squadData", r.squads);
    });
    socket.on("getMySquad", () => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;
        socket.emit("mySquad", {
            squad: r.squads[socket.team],
            rules: r.rules
        });
    });

    // --- 10. HANDLE DISCONNECT (90 SECONDS LOGIC) ---
       // --- 10. HANDLE DISCONNECT (WITH TIMER) ---
    socket.on("disconnect", () => {
        const r = rooms[socket.room];
        if (!r) return;
        const user = r.users[socket.id];
        if (!user) return;

        // 1. MARK AS AWAY & START CLOCK
        user.isAway = true; 
        user.disconnectTime = Date.now(); // <--- Save current server time
        
        broadcastUserList(r, socket.room); // Notify everyone immediately

        const userName = user.name;
        const roomCode = socket.room;
        const timerKey = `${roomCode}_${userName}`;

        // 90 Seconds (1.5 Minutes) Grace Period
        const GRACE_PERIOD = 90000; 

        disconnectTimers[timerKey] = setTimeout(() => {
            if (rooms[roomCode] && rooms[roomCode].users[socket.id]) {
                const finalRoom = rooms[roomCode];
                const wasAdmin = (finalRoom.admin === socket.id); // Check by ID, safer
                const userTeam = finalRoom.users[socket.id].team;

                // 1. Remove User
                delete finalRoom.users[socket.id];

                // 2. HOST TRANSFER LOGIC
                if (wasAdmin) {
                    const remainingIDs = Object.keys(finalRoom.users);
                    if (remainingIDs.length > 0) {
                        // Transfer to first available user
                        const newAdminID = remainingIDs[0];
                        finalRoom.admin = newAdminID;
                        finalRoom.adminUser = finalRoom.users[newAdminID].name;
                        
                        // Notify the new admin
                        io.to(newAdminID).emit("adminPromoted");
                        sendLog(finalRoom, roomCode, `👑 Host left. ${finalRoom.adminUser} is now Host.`);
                    } else {
                        // No one left? Kill room.
                        finalRoom.isPublic = false; 
                        finalRoom.auctionEnded = true; 
                    }
                }

                // 3. FREE TEAM LOGIC
                if (userTeam && !finalRoom.auctionEnded) {
                    if (!finalRoom.availableTeams.includes(userTeam)) {
                        finalRoom.availableTeams.push(userTeam);
                        finalRoom.availableTeams.sort();
                    }
                    // Notify everyone that team is free
                    io.to(roomCode).emit("teamPicked", { team: null, remaining: finalRoom.availableTeams });
                    sendLog(finalRoom, roomCode, `🏃 ${userTeam} is available (Player left).`);
                }

                // 4. SYNC EVERYONE
                broadcastUserList(finalRoom, roomCode);
                
                // Force update owners for Squad View
                io.to(roomCode).emit("joinedRoom", { 
                    updateOnly: true, // Flag to tell client just update data, don't reset screen
                    teamOwners: getTeamOwners(finalRoom),
                    availableTeams: finalRoom.availableTeams
                });
            }
            delete disconnectTimers[timerKey];
        }, GRACE_PERIOD);

    socket.on("submitXI", ({ xi }) => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;

        const allPlayers = [
            ...(xi.BAT || []), ...(xi.WK || []), 
            ...(xi.ALL || []), ...(xi.BOWL || [])
        ];

        let counts = { BAT: 0, WK: 0, ALL: 0, BOWL: 0, SPIN: 0, FOREIGN: 0 };
        let totalRating = 0;

        allPlayers.forEach(p => {
            totalRating += (p.rating || 75);
            if(p.foreign) counts.FOREIGN++;
            if(p.role === "BAT") counts.BAT++;
            if(p.role === "WK") counts.WK++;
            if(p.role === "ALL") counts.ALL++;
            if(p.role === "PACE") counts.BOWL++;
            if(p.role === "SPIN") { counts.BOWL++; counts.SPIN++; }
        });

        let disqualified = false;
        let reason = "";
        const R = r.rules;
        if (allPlayers.length !== 11) { 
            disqualified = true; reason = `Selected ${allPlayers.length}/11 Players`; 
        }
        else if (counts.FOREIGN > R.maxForeign) { 
            disqualified = true; reason = `Max ${R.maxForeign} Overseas allowed in Squad`; 
        }
        else if (counts.FOREIGN > (R.minForeignXI || 4)) {
            disqualified = true; reason = `Max ${R.minForeignXI || 4} Overseas allowed in XI`; 
        }
        else if (counts.WK < R.minWK) { disqualified = true; reason = `Need min ${R.minWK} Wicket Keeper`; }
        else if (counts.BAT < R.minBat) { disqualified = true; reason = `Need min ${R.minBat} Batsmen`; }
        else if (counts.ALL < R.minAll) { disqualified = true; reason = `Need min ${R.minAll} All-Rounders`; }
        else if (counts.BOWL < R.minBowl) { disqualified = true; reason = `Need min ${R.minBowl} Bowlers`; }
        
        const finalRating = disqualified ? 0 : Number((totalRating / 11).toFixed(2));

        r.playingXI[socket.team] = {
            team: socket.team,
            rating: finalRating,
            disqualified: disqualified,
            reason: reason,
            xi: allPlayers,
            purse: r.purse[socket.team]
        };

        socket.emit("submitResult", {
            success: true,
            rating: finalRating,
            disqualified: disqualified,
            reason: reason
        });

// OLD: io.to(socket.room).emit("logUpdate", `📝 ${socket.team} submitted Playing XI`);
        sendLog(r, socket.room, `📝 ${socket.team} submitted Playing XI`);

        const board = Object.values(r.playingXI).sort((a,b) => {
            if(b.rating !== a.rating) return b.rating - a.rating; 
            return (b.purse || 0) - (a.purse || 0); 
        });

        io.to(socket.room).emit("leaderboard", board);
    });

    socket.on("checkAdmin", () => {
        const r = rooms[socket.room];
        socket.emit("adminStatus", (r && r.admin === socket.id));
    });

    socket.on("getAuctionState", () => {
        if(!socket.room) return;
        const r = rooms[socket.room];
        if(!r) return;
        socket.emit("auctionState", {
            live: r.auction.live,
            paused: r.auction.paused,
            player: r.auction.player,
            bid: r.auction.bid,
            lastBidTeam: r.auction.lastBidTeam
        });
    });

});

/* ================= AUCTION ENGINE ================= */

function nextPlayer(r, room) {
    if (!r.auction.live) return;

    if (r.auction.interval) {
        clearInterval(r.auction.interval);
        r.auction.interval = null;
    }

    let set = r.sets[r.currentSetIndex];

    if (!set || set.length === 0) {
        r.currentSetIndex++;
        if (r.currentSetIndex >= r.sets.length) {
            endAuction(r, room);
            return;
        }
        set = r.sets[r.currentSetIndex];
// OLD: io.to(room).emit("logUpdate", `🔔 NEW SET: ${getSetName(set)}`);
        sendLog(r, room, `🔔 NEW SET: ${getSetName(set)}`);
    }

    const randIdx = Math.floor(Math.random() * set.length);
    r.auction.player = set.splice(randIdx, 1)[0];
    
    broadcastSets(r, room); 

    r.auction.lastBidTeam = null;
    r.auction.bid = r.auction.player.basePrice || startBid(r.auction.player.rating || 80);
    r.auction.team = null;
    r.auction.timer = 10;

    io.to(room).emit("newPlayer", {
        player: r.auction.player,
        bid: r.auction.bid,
        live: true,
        paused: false
    });

    // --- FIX: Try/Catch loop for stability ---
    r.auction.interval = setInterval(() => {
        try {
            if (r.auction.paused) return;

            io.to(room).emit("timer", r.auction.timer);
            r.auction.timer--;

            if (r.auction.timer < 0) {
                clearInterval(r.auction.interval);
                resolvePlayer(r, room);
                setTimeout(() => nextPlayer(r, room), 2000); 
            }
        } catch (e) {
            console.error("Auction Interval Error:", e);
            clearInterval(r.auction.interval);
        }
    }, 1000);
}
function resolvePlayer(r, room) {
    const p = r.auction.player;

    if (r.auction.team) {
        const team = r.auction.team;
        const squad = r.squads[team];
        
        if (r.purse[team] >= r.auction.bid) {
            p.price = r.auction.bid;
            squad.push(p);
            r.squads[team] = squad;
            r.purse[team] -= r.auction.bid;

            io.to(room).emit("sold", {
                player: p,
                team: team,
                price: r.auction.bid,
                purse: r.purse
            });
// OLD: io.to(room).emit("logUpdate", `🔨 SOLD: ${p.name} → ${team} ₹${r.auction.bid.toFixed(2)} Cr`);
            sendLog(r, room, `🔨 SOLD: ${p.name} → ${team} ₹${r.auction.bid.toFixed(2)} Cr`);
            io.to(room).emit("squadData", r.squads);
            
            r.availableTeams = r.availableTeams.filter(t => t !== team);
        } else {
            io.to(room).emit("unsold", { player: p });
            io.to(room).emit("logUpdate", `❌ UNSOLD (Insufficient Funds): ${p.name}`);
        }
    } else {
        io.to(room).emit("unsold", { player: p });
// OLD: io.to(room).emit("logUpdate", `❌ UNSOLD: ${p.name}`);
        sendLog(r, room, `❌ UNSOLD: ${p.name}`);
    }
}


function endAuction(r, room) {
    if (r.auction.interval) {
        clearInterval(r.auction.interval);
        r.auction.interval = null;
    }
    r.auction.live = false;
    r.auction.paused = true;
    
    r.auctionEnded = true; 
    r.isPublic = false; 

    io.to(room).emit("auctionEnded");
    io.to(room).emit("logUpdate", "🛑 Auction Ended. Prepare Playing XI.");
    io.to(room).emit("squadData", r.squads);
}
function getTeamOwners(room) {
    const owners = {};
    Object.values(room.users).forEach(u => {
        if(u.team) owners[u.team] = u.name;
    });
    return owners;
}
// --- HELPER: Broadcast User List ---
// --- HELPER: Broadcast User List ---
function broadcastUserList(room, roomCode) {
    if (!room) return;
    
    // Map to simple objects to send to client
    const userList = Object.values(room.users).map(u => ({
        name: u.name,
        team: u.team,
        status: u.isAway ? 'away' : 'online',
        // Send the timestamp if they are away
        disconnectTime: u.disconnectTime || null 
    }));
    
    io.to(roomCode).emit("roomUsersUpdate", userList);
}

// --- HELPER: Send Log & Store History ---
function sendLog(room, code, msg) {
    if (!room) return;
    room.logs.push(msg);
    if (room.logs.length > 20) room.logs.shift(); // Limit to last 20 logs
    io.to(code).emit("logUpdate", msg);
}

const PORT = process.env.PORT || 2500; 
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});






