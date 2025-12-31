const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

// Make sure you have players.js file
const PLAYERS = require("./players"); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// --- NEW: Handle /room/:code requests ---
app.get('/room/:roomCode', (req, res) => {
    // Send the main HTML file regardless of the room code
    // The Client JS will extract the code from the URL
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
    if (rating >= 90) return 2;
    if (rating >= 80) return 1;
    return 0.5;
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

/* ================= SOCKET LOGIC ================= */

io.on("connection", socket => {

    // --- 1. GET PUBLIC ROOMS ---
   // Inside io.on('connection')
    socket.on('getPublicRooms', () => {
        const liveRooms = [];
        const waitingRooms = [];
        
        for (const [id, room] of Object.entries(rooms)) {
            // Check !room.auctionEnded
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


    // --- 2. CREATE ROOM (FIXED) ---
    socket.on("createRoom", ({ user, isPublic }) => {
        const code = generateRoomCode();
        
        // Initialize Room
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
            rules: { ...DEFAULT_RULES },
            auction: {
                live: false, paused: false, player: null, 
                bid: 0, team: null, timer: 5, interval: null, lastBidTeam: null
            }
        };

        // FIX: Define 'room' variable here so we can use it below
        const room = rooms[code];

        // Init Purses
        AVAILABLE_TEAMS_LIST.forEach(t => {
            room.squads[t] = [];
            room.purse[t] = room.rules.purse;
        });

        // Join Socket
        socket.join(code);
        socket.room = code;
        socket.user = user;
        socket.isAdmin = true;
        
        room.users[socket.id] = { name: user, team: null, id: socket.id, connected: true };

        socket.emit("roomCreated", code);
        
        // Use 'room' variable safely here
        socket.emit("joinedRoom", {
            squads: room.squads,
            rules: room.rules,
            roomCode: code,
            isHost: true,
            auctionStarted: room.auctionStarted,
            availableTeams: room.availableTeams,
            auctionEnded: (room.auctionStarted && !room.auction.live && room.auction.paused) // or check if room.phase === "xi"
        });

        broadcastSets(room, code);
    });

    // --- 3. RECONNECT USER ---
    // --- 3. RECONNECT USER ---
        // --- 3. RECONNECT USER ---
    socket.on('reconnectUser', ({ roomId, username, team }) => {
        const room = rooms[roomId];
        if (room) {
            // 1. FIND EXISTING USER IN MEMORY
            // We search for a user with the same name to see if they were already here.
            let oldSocketId = Object.keys(room.users).find(key => room.users[key].name === username);
            
            // 2. SECURITY: BLOCK STRANGERS IF AUCTION ENDED
            // If user is not found in memory AND the game is over, deny access.
            if (!oldSocketId && room.auctionEnded) {
                return socket.emit("error", "Auction Closed.");
            }

            // 3. UPDATE SOCKET MAPPING
            if(oldSocketId) {
                // Existing user: Swap old socket data to the new socket ID
                const userData = room.users[oldSocketId];
                delete room.users[oldSocketId]; // Remove old ID
                room.users[socket.id] = userData; // Add new ID
                userData.id = socket.id;
                userData.connected = true;
            } else {
                // New user (only happens if game is NOT ended due to check above)
                room.users[socket.id] = { name: username, team: team, id: socket.id, connected: true };
            }

            // 4. SETUP SOCKET PROPERTIES
            socket.join(roomId);
            socket.room = roomId;
            socket.user = username;
            socket.team = team;
            if(room.adminUser === username) socket.isAdmin = true;

            // 5. SEND STATE TO THE RECONNECTING USER
            socket.emit("joinedRoom", { 
                rules: room.rules,
                squads: room.squads,
                roomCode: roomId,
                isHost: socket.isAdmin,
                auctionStarted: room.auctionStarted,
                availableTeams: room.availableTeams,
                auctionEnded: room.auctionEnded, // Critical flag for client logic
                userCount: Object.keys(room.users).length, // <--- Send Count
                teamOwners: getTeamOwners(room)            // <--- Send Owners
            });
            
            // 6. BROADCAST UPDATES TO EVERYONE ELSE
            // Tell everyone the new user count immediately
            io.to(roomId).emit("updateUserCount", Object.keys(room.users).length);

            // 7. SYNC GAMEPLAY DATA
            broadcastSets(room, roomId);

            if(team) {
                socket.emit("teamPicked", { team, remaining: room.availableTeams });
            } 

            // Sync Auction Timer/Bids
            socket.emit("auctionState", {
                live: room.auction.live,
                paused: room.auction.paused,
                player: room.auction.player,
                bid: room.auction.bid,
                lastBidTeam: room.auction.lastBidTeam
            });

            // If a player is currently being auctioned, show them
            if(room.auction.player){
                 socket.emit("newPlayer", { 
                    player: room.auction.player, 
                    bid: room.auction.bid 
                 });
            }

            // 8. FINAL DATA SYNC (IF GAME OVER)
            // If they reconnect after the game ended, ensure they have data for the Leaderboard/XI screen
            if(room.auctionEnded) {
                socket.emit("squadData", room.squads);
                // Send leaderboard if calculated
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
    // 2. JOIN ROOM
    // --- 4. JOIN ROOM ---
    socket.on("joinRoom", ({ roomCode, user }) => {
        const room = rooms[roomCode];
        if(!room) return socket.emit("error", "Room not found");
        
        if(room.auctionEnded) {
            return socket.emit("error", "This auction has ended and is closed.");
        }

        socket.join(roomCode);
        socket.room = roomCode;
        socket.user = user;
        
        // Add to user list
        room.users[socket.id] = { name: user, team: null, id: socket.id, connected: true };

        // 1. Send State to the NEW User
        socket.emit("joinedRoom", { 
            rules: room.rules,
            squads: room.squads,
            roomCode: roomCode,
            isHost: false,
            auctionStarted: room.auctionStarted,
            availableTeams: room.availableTeams,
            auctionEnded: false,
            userCount: Object.keys(room.users).length,
            teamOwners: getTeamOwners(room)
        });

        // 2. BROADCAST UPDATES TO EVERYONE ELSE (The Fix)
        io.to(roomCode).emit("updateUserCount", Object.keys(room.users).length); // <--- ADD THIS
        
        broadcastSets(room, roomCode);
        io.to(roomCode).emit('logUpdate', `👋 ${user} has joined.`);
    });

    // --- 5. SELECT TEAM ---
    socket.on("selectTeam", ({ team, user }) => {
        const r = rooms[socket.room];
        if(!r) return;
        if(socket.team) return; 
        if(!r.availableTeams.includes(team)) return;

        socket.team = team;
        if(r.users[socket.id]) r.users[socket.id].team = team;

        if(!r.squads[team]) r.squads[team] = [];
        if(!r.purse[team]) r.purse[team] = r.rules.purse;

        r.availableTeams = r.availableTeams.filter(t => t !== team);

        io.to(socket.room).emit("teamPicked", {
            team,
            remaining: r.availableTeams
        });
        io.to(socket.room).emit("logUpdate", `👕 ${user} selected ${team}`);
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

        io.to(socket.room).emit("rulesUpdated", {
            rules: room.rules,
            teams: room.availableTeams
        });
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
            
            io.to(socket.room).emit("logUpdate", `⏭ ${r.auction.player.name} skipped`);
            io.to(socket.room).emit("unsold", { player: r.auction.player });
            setTimeout(() => nextPlayer(r, socket.room), 800);
        }

        if(action === "skipSet"){
            io.to(socket.room).emit("logUpdate", `⏩ SKIPPING SET: ${getSetName(r.sets[r.currentSetIndex])}`);
            r.sets[r.currentSetIndex] = []; 
            if(r.auction.interval) clearInterval(r.auction.interval);
            nextPlayer(r, socket.room);
        }

                  if(action === "end"){
            if (r.auction.interval) {
                clearInterval(r.auction.interval);
                r.auction.interval = null;
            }
            r.auction.live = false;
            r.auction.paused = true;
            
            // 1. Mark ended and hide from public
            r.auctionEnded = true; 
            r.isPublic = false; 

            // 2. TRIGGER TRANSITION TO SUBMIT XI SCREEN
            // We use "auctionEnded" event which the client already knows means "Go to XI"
            io.to(socket.room).emit("auctionEnded");
            
            // 3. Send final data
            io.to(socket.room).emit("logUpdate", "🛑 Auction Ended. Prepare Playing XI.");
            io.to(socket.room).emit("squadData", r.squads);
        }


    });

    // --- 8. BIDDING ---
        // --- 8. BIDDING ---
    socket.on("bid", () => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;
        if(!r.auction.live || r.auction.paused) return;
        if(r.auction.lastBidTeam === socket.team) return;

        // 1. Calculate Next Bid (Base Price logic included)
        let nextBid;
        if (r.auction.team === null) {
            // No one has bid yet -> Start at Base Price
            nextBid = r.auction.bid; 
        } else {
            // Someone holds the bid -> Add Increment
            const increment =
  r.auction.bid < 1  ? 0.05 :
  r.auction.bid < 5  ? 0.1  :
  r.auction.bid < 10 ? 0.2  :
  r.auction.bid < 20 ? 0.25 :
  1;

            nextBid = r.auction.bid + increment;
        }

        // 2. Define currentPurse (This line was missing!)
        const currentPurse = r.purse[socket.team]; 
        
        // 3. Validate Purse
        if(currentPurse < nextBid){
            socket.emit("bidRejected", "Insufficient purse");
            return;
        }

        // 4. Update State
        r.auction.bid = nextBid;
        r.auction.lastBidTeam = socket.team;
        r.auction.team = socket.team; 
        r.auction.timer = 10;         

        io.to(socket.room).emit("bidUpdate", {
            bid: r.auction.bid,
            team: socket.team
        });
        io.to(socket.room).emit("logUpdate", `⚬ ${socket.team} bids ₹${r.auction.bid.toFixed(2)} Cr`);
    });


    // --- 9. CHAT & SQUADS ---
    socket.on("chat", data => {
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

    // --- 10. SUBMIT XI ---
        // --- 10. HANDLE DISCONNECT ---
    socket.on("disconnect", () => {
        const r = rooms[socket.room];
        if (!r) return;

        // 1. Remove User from Room
        if (r.users[socket.id]) {
            const userTeam = r.users[socket.id].team;
            const userName = r.users[socket.id].name;
            const wasAdmin = (r.adminUser === userName);

            delete r.users[socket.id];

            // 2. LOGIC: IF HOST LEAVES
            if (wasAdmin) {
                // Hide room from public list immediately
                r.isPublic = false; 
                // Mark auction as ended (Game Over)
                r.auctionEnded = true; 
                
                // Notify everyone remaining
                io.to(socket.room).emit("logUpdate", "🛑 Host disconnected. Auction Ended.");
                io.to(socket.room).emit("joinedRoom", { auctionEnded: true });
            }

            // 3. LOGIC: IF PLAYER LEAVES (Free up the team)
            if (userTeam) {
                // Add team back to available list if not already there
                if (!r.availableTeams.includes(userTeam)) {
                    r.availableTeams.push(userTeam);
                    r.availableTeams.sort(); // Keep it tidy
                }
                // Clear the team purse/squad association if you want? 
                // Usually we KEEP the squad so if they rejoin they get it back, 
                // OR if someone else takes it, they inherit the squad. 
                // For this logic, we assume someone else can take it and inherit the current state.
                
                io.to(socket.room).emit("teamPicked", { team: null, remaining: r.availableTeams });
                io.to(socket.room).emit("logUpdate", `🏃 ${userTeam} is now available.`);
            }

            // 4. UPDATE PLAYER COUNT
            io.to(socket.room).emit("updateUserCount", Object.keys(r.users).length);
        }
    });

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
    // Logic: Standard IPL is max 4 in XI usually, but using your dynamic rule variable
    // If your variable 'minForeignXI' actually meant 'Max Foreign in XI', we use that limit.
    // Assuming 'maxForeign' is total squad limit, and 'minForeignXI' is actually MAX in XI (based on your prompt)
    disqualified = true; reason = `Max ${R.maxForeign} Overseas allowed in Squad`; 
}
// Specific check for XI foreign limit (renaming variable logic for clarity)
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

        io.to(socket.room).emit("logUpdate", `📝 ${socket.team} submitted Playing XI`);

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
        io.to(room).emit("logUpdate", `🔔 NEW SET: ${getSetName(set)}`);
    }

    const randIdx = Math.floor(Math.random() * set.length);
    r.auction.player = set.splice(randIdx, 1)[0];
    
    broadcastSets(r, room); 

    r.auction.lastBidTeam = null;
// Use player's specific basePrice, or calculate it from rating if missing
    r.auction.bid = r.auction.player.basePrice || startBid(r.auction.player.rating || 80);
    r.auction.team = null;
    r.auction.timer = 10;

    io.to(room).emit("newPlayer", {
        player: r.auction.player,
        bid: r.auction.bid,
        live: true,
        paused: false
    });

    r.auction.interval = setInterval(() => {
        if (r.auction.paused) return;

        io.to(room).emit("timer", r.auction.timer);
        r.auction.timer--;

        if (r.auction.timer < 0) {
            clearInterval(r.auction.interval);
            resolvePlayer(r, room);
            setTimeout(() => nextPlayer(r, room), 2000); 
        }
    }, 1000);
}
function resolvePlayer(r, room) {
    const p = r.auction.player;

    if (r.auction.team) {
        const team = r.auction.team;
        const squad = r.squads[team];
        
        // --- FIX 2: REMOVED RULE BLOCKING ---
        // Only check Purse. Rules are checked at Submit XI.
        if (r.purse[team] >= r.auction.bid) {
            // SOLD
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
            io.to(room).emit("logUpdate", `🔨 SOLD: ${p.name} → ${team} ₹${r.auction.bid.toFixed(2)} Cr`);
            io.to(room).emit("squadData", r.squads);
            
            // Remove team from available list if they exist there (just in case)
            r.availableTeams = r.availableTeams.filter(t => t !== team);
        } else {
            // UNSOLD (Only if insufficient funds)
            io.to(room).emit("unsold", { player: p });
            io.to(room).emit("logUpdate", `❌ UNSOLD (Insufficient Funds): ${p.name}`);
        }
    } else {
        io.to(room).emit("unsold", { player: p });
        io.to(room).emit("logUpdate", `❌ UNSOLD: ${p.name}`);
    }
}


function endAuction(r, room) {
    if (r.auction.interval) {
        clearInterval(r.auction.interval);
        r.auction.interval = null;
    }
    r.auction.live = false;
    r.auction.paused = true;
    
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

const PORT = process.env.PORT || 2500; 
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});






