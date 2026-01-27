const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require('path');
const PLAYERS = require("./players"); // Ensure players.js exists

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 60000, 
    pingInterval: 25000
});

// --- JSONBIN.IO CONFIGURATION ---
// Replace these with your actual keys from jsonbin.io
const BIN_ID = process.env.BIN_ID; 
const API_KEY = process.env.API_KEY; 

const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// --- SERVER STATE ---
let rooms = {}; // Fast in-memory storage
const disconnectTimers = {};

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));

// --- DEEP LINK HANDLER ---
// This ensures that refreshing /room/ABCD loads the page instead of 404
app.get('/room/:roomCode*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ================================================= */
/* ☁️ CLOUD STORAGE FUNCTIONS (JSONBIN)              */
/* ================================================= */

// 1. READ ALL DATA (Load on startup)
async function loadFromCloud() {
    console.log("☁️ Loading Data from Cloud...");
    try {
        const res = await fetch(BIN_URL + "/latest", {
            headers: { 'X-Master-Key': API_KEY }
        });
        
        if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
        
        const json = await res.json();
        
        // Merge cloud data (history) with current memory
        if (json.record && json.record.rooms) {
            rooms = { ...json.record.rooms, ...rooms };
            console.log(`✅ Loaded ${Object.keys(rooms).length} rooms from Cloud.`);
        }
    } catch (e) {
        console.error("⚠️ Cloud Load Failed (Starting Empty):", e.message);
    }
}

// 2. SAVE DATA (Persist state)
async function saveToCloud() {
    try {
        // We sanitize the rooms object to avoid circular JSON errors if any sockets are stored
        // (Though our 'rooms' structure mostly stores data, checking ensures safety)
        const cleanRooms = JSON.parse(JSON.stringify(rooms)); 

        await fetch(BIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ rooms: cleanRooms })
        });
        console.log("💾 Data Saved to Cloud");
    } catch (e) {
        console.error("⚠️ Cloud Save Failed:", e.message);
    }
}

// Load data immediately when server starts
loadFromCloud();

/* ================================================= */
/* 🌐 API ROUTES                                     */
/* ================================================= */

// API: Client checks this when visiting /room/CODE
app.get('/api/room/:code', async (req, res) => {
    const code = req.params.code.toUpperCase();
    
    // 1. Check Memory first (Fastest)
    let room = rooms[code];

    // 2. If not in memory, try refreshing from Cloud (Sync check)
    if (!room) {
        await loadFromCloud();
        room = rooms[code];
    }

    if (!room) {
        return res.json({ exists: false });
    }

    // Return Data for Client to Render
    res.json({
        exists: true,
        active: !room.auctionEnded, 
        data: {
            squads: room.squads,      
            purses: room.purse,
            owners: getTeamOwners(room),
            rules: room.rules
        }
    });
});

/* ================= CONSTANTS & HELPERS ================= */

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

function getTeamOwners(room) {
    const owners = {};
    if(room.users) {
        Object.values(room.users).forEach(u => {
            if(u.team) owners[u.team] = u.name;
        });
    }
    return owners;
}

/* ================= HELPERS FOR SETS ================= */

function createSets(allPlayers) {
    // 1. Initialize Containers for each Tag
    const buckets = {
        "M": [],     // Marquee
        "BAT1": [],  // Capped Bat
        "WK1": [],   // Capped WK
        "ALL1": [],  // Capped All
        "BOWL1": [], // Capped Bowl
        "BAT2": [],  // Uncapped Bat
        "WK2": [],   // Uncapped WK
        "ALL2": [],  // Uncapped All
        "BOWL2": []  // Uncapped Bowl
    };

    // 2. Sort everyone by rating first (so they are ordered within sets)
    const sortedPlayers = [...allPlayers].sort((a, b) => b.rating - a.rating);

    // 3. Distribute players into buckets based on their TAG
    sortedPlayers.forEach(p => {
        // If player has a tag and that bucket exists, push them there
        if (p.tag && buckets[p.tag]) {
            buckets[p.tag].push(p);
        } else {
            // FALLBACK: If you forgot to tag a player in players.js
            // We guess based on role so they don't disappear
            if(p.rating >= 9.5) buckets["M"].push(p);
            else if(p.rating < 7.5) buckets["BAT2"].push(p); // Assume uncapped if low rating
            else buckets["BAT1"].push(p); // Assume capped otherwise
        }
    });

    // 4. Define the Exact Set Order you requested
    const setOrder = ["M", "BAT1", "WK1", "ALL1", "BOWL1", "BAT2", "WK2", "BOWL2", "ALL2"];
    
    const finalSets = [];

    setOrder.forEach(tagKey => {
        const playersInTag = buckets[tagKey];
        
        // If we have players, chunk them into groups of 8 (so sets aren't too huge)
if (playersInTag.length > 0) {
    // No chunking needed - push the entire array as one set
    finalSets.push(playersInTag);
}
    });

    return finalSets;
}

function getSetName(set) {
    if (!set || set.length === 0) return "Empty Set";
    
    // Look at the tag of the first player to determine the Set Name
    const tag = set[0].tag;

    switch(tag) {
        case "M": return "🏆 Marquee Set";
        case "BAT1": return "🏏 Capped Batters";
        case "WK1": return "🧤 Capped Wicket Keepers";
        case "ALL1": return "⚡ Capped All-Rounders";
        case "BOWL1": return "🥎 Capped Bowlers";
        case "BAT2": return "🏏 Uncapped Batters";
        case "WK2": return "🧤 Uncapped Wicket Keepers";
        case "ALL2": return "⚡ Uncapped All-Rounders";
        case "BOWL2": return "🥎 Uncapped Bowlers";
        default: return "Mixed Set"; // Fallback
    }
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

function isTeamTaken(room, teamName) {
    if (!room.availableTeams.includes(teamName)) return true;
    const isHeldByUser = Object.values(room.users).some(u => u.team === teamName);
    if (isHeldByUser) return true;
    return false;
}

function sendLog(room, code, msg) {
    if (!room) return;
    room.logs.push(msg);
    if (room.logs.length > 20) room.logs.shift(); 
    io.to(code).emit("logUpdate", msg);
}

function broadcastUserList(room, roomCode) {
    if (!room) return;
    const userList = Object.values(room.users).map(u => ({
        name: u.name,
        team: u.team,
        status: u.isKicked ? 'kicked' : (u.isAway ? 'away' : 'online'),
        disconnectTime: u.disconnectTime || null,
        isHost: (room.admin === u.id)
    }));
    io.to(roomCode).emit("roomUsersUpdate", userList);
}

/* ================= SOCKET LOGIC ================= */

io.on("connection", socket => {

    // 1. GET PUBLIC ROOMS
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

    // 2. CREATE ROOM
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
            auctionEnded: false,
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
            auctionEnded: room.auctionEnded,
            leaderboardData: room.auctionEnded ? Object.values(room.playingXI) : [],
            userCount: 1,
            teamOwners: getTeamOwners(room),
            purses: room.purse,
            history: { chat: room.chat, logs: room.logs }
        });

        broadcastSets(room, code);
        
        // Save initial state
        saveToCloud();
    });
// Add or Update this handler
socket.on("getAuctionState", () => {
    const r = rooms[socket.room];
    if(!r) return;

    // Send Auction Data
    socket.emit("auctionState", {
        live: r.auction.live,
        paused: r.auction.paused,
        player: r.auction.player,
        bid: r.auction.bid,
        lastBidTeam: r.auction.lastBidTeam
    });

    // Send Leaderboard if data exists (Fixes Issue 4)
    if (Object.keys(r.playingXI).length > 0) {
        const board = Object.values(r.playingXI).sort((a,b) => {
            if(b.rating !== a.rating) return b.rating - a.rating; 
            return (b.purse || 0) - (a.purse || 0); 
        });
        socket.emit("leaderboard", board);
    }
});

    // 3. RECONNECT USER
    // 3. RECONNECT USER (Updated Logic)
    socket.on('reconnectUser', ({ roomId, username }) => {
        const room = rooms[roomId];
        const timerKey = `${roomId}_${username}`;
        
        // 1. Cancel any pending "Kick" timer
        if (disconnectTimers[timerKey]) {
            clearTimeout(disconnectTimers[timerKey]);
            delete disconnectTimers[timerKey];
        }

        if (room) {
            // Find user by name (since socket ID changes on reconnect)
            let oldSocketId = Object.keys(room.users).find(key => room.users[key].name === username);
            
            // If user wasn't in room and auction ended -> block them unless they just want to see results
            // (Optional: You can remove this check if you want to allow late spectators)
            if (!oldSocketId && room.auctionEnded) {
                // Allow them as a spectator to see results
            }

            let assignedTeam = null;

            if(oldSocketId) {
                // Restore old user data to new socket ID
                const userData = room.users[oldSocketId];
                delete room.users[oldSocketId];
                
                userData.id = socket.id;
                userData.connected = true;
                userData.isAway = false;
                userData.disconnectTime = null; 
                userData.isKicked = false;
                
                room.users[socket.id] = userData;
                assignedTeam = userData.team;

                // Restore Admin Status if they were host
                if (room.admin === oldSocketId) {
                    room.admin = socket.id;
                }
            } else {
                // New User / Spectator joining mid-game or post-game
                room.users[socket.id] = { 
                    name: username, 
                    team: null, 
                    id: socket.id, 
                    connected: true, 
                    isAway: false 
                };
                assignedTeam = null;
            }

            // Join socket.io room
            socket.join(roomId);
            socket.room = roomId;
            socket.user = username;
            socket.team = assignedTeam;
            if(room.adminUser === username) socket.isAdmin = true;

            // 2. SEND SYNC DATA
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
                history: { chat: room.chat, logs: room.logs },
                yourTeam: assignedTeam,
                // Critical Fix: Send Leaderboard Data if game is over
                leaderboardData: room.auctionEnded ? Object.values(room.playingXI) : [] 
            });
            
            // Broadcast user list update
            broadcastUserList(room, roomId);
            broadcastSets(room, roomId);

            if(assignedTeam) {
                socket.emit("teamPicked", { team: assignedTeam, remaining: room.availableTeams });
            } 

            // 3. HANDLE GAME PHASE ROUTING
            if (room.auctionEnded) {
                socket.emit("auctionEnded"); // Triggers client routing (XI or Summary)
                
                // Send Leaderboard if available
                if(Object.keys(room.playingXI).length > 0){
                    const board = Object.values(room.playingXI).sort((a,b) => {
                       if(b.rating !== a.rating) return b.rating - a.rating; 
                       return (b.purse || 0) - (a.purse || 0); 
                    });
                    socket.emit("leaderboard", board);
                }
            } else if (room.auctionStarted) {
                // If auction is LIVE, send current player data immediately
                socket.emit("auctionStarted");
                
                if(room.auction.player){
                     socket.emit("auctionState", {
                        live: room.auction.live,
                        paused: room.auction.paused,
                        player: room.auction.player,
                        bid: room.auction.bid,
                        lastBidTeam: room.auction.lastBidTeam
                    });
                }
            }

        } else {
            socket.emit("error", "Room expired or not found");
        }
    });

    // 4. JOIN ROOM
    socket.on("joinRoom", ({ roomCode, user }) => {
        const room = rooms[roomCode];
        if(!room) return socket.emit("error", "Room not found");
        
        if(room.auctionEnded) {
            return socket.emit("error", "This auction has ended and is closed.");
        }

        const existingSocketId = Object.keys(room.users).find(id => room.users[id].name === user);
        
        if (existingSocketId) {
            const timerKey = `${roomCode}_${user}`;
            if (disconnectTimers[timerKey]) {
                clearTimeout(disconnectTimers[timerKey]);
                delete disconnectTimers[timerKey];
            }
            const userData = room.users[existingSocketId];
            delete room.users[existingSocketId];
            room.users[socket.id] = userData;
            
            userData.id = socket.id;
            userData.connected = true;
            userData.isAway = false;
            userData.disconnectTime = null;
            userData.isKicked = false;

            if (room.admin === existingSocketId) {
                room.admin = socket.id;
            }

            socket.team = userData.team;
            if(room.adminUser === user) socket.isAdmin = true;
        } else {
            room.users[socket.id] = { name: user, team: null, id: socket.id, connected: true };
        }

        socket.join(roomCode);
        socket.room = roomCode;
        socket.user = user;
        
        socket.emit("joinedRoom", { 
            rules: room.rules,
            squads: room.squads,
            purses: room.purse, 
            roomCode: roomCode,
            isHost: (room.adminUser === user),
            auctionStarted: room.auctionStarted,
            availableTeams: room.availableTeams,
            auctionEnded: false,
            userCount: Object.keys(room.users).length,
            history: { chat: room.chat, logs: room.logs }, 
            teamOwners: getTeamOwners(room)
        });

        if (socket.team) {
             socket.emit("teamPicked", { team: socket.team, remaining: room.availableTeams });
        }

        broadcastUserList(room, roomCode);
        broadcastSets(room, roomCode);
        sendLog(room, roomCode, `👋 ${user} has joined.`);
    });

    // 5. SELECT TEAM
    socket.on("selectTeam", ({ team, user }) => {
        const r = rooms[socket.room];
        if(!r) return;
        if(socket.team) return; 
        
        if (isTeamTaken(r, team)) {
             socket.emit("error", "Team is currently held by another player.");
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
            user: user,
            remaining: r.availableTeams
        });
        sendLog(r, socket.room, `👕 ${user} selected ${team}`);
        broadcastUserList(rooms[socket.room], socket.room);
    });

    // 6. SET RULES
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

    // 7. ADMIN ACTIONS
    socket.on("adminAction", action => {
        const r = rooms[socket.room];
        if (!r || r.admin !== socket.id) return; 

        if(action === "start"){
            if(r.auctionStarted) return;
            r.auctionStarted = true;
            r.auction.live = true;
            io.to(socket.room).emit("auctionStarted");
            nextPlayer(r, socket.room);
        }
        if(action === "togglePause"){
            r.auction.paused = !r.auction.paused;
            if(r.auction.paused) {
                sendLog(r, socket.room, "⏸ Auction Paused");
            } else {
                sendLog(r, socket.room, "▶ Auction Resumed");
            }
            io.to(socket.room).emit(r.auction.paused ? "auctionPaused" : "auctionResumed");
        }
        if(action === "skip"){
            if(!r.auction.player) return;
            if(r.auction.interval) clearInterval(r.auction.interval);
            sendLog(r, socket.room, `⏭ ${r.auction.player.name} skipped`);
            io.to(socket.room).emit("unsold", { player: r.auction.player });
            setTimeout(() => nextPlayer(r, socket.room), 800);
        }
        if(action === "skipSet"){
            sendLog(r, socket.room, `⏩ SKIPPING SET: ${getSetName(r.sets[r.currentSetIndex])}`);
            r.sets[r.currentSetIndex] = []; 
            if(r.auction.interval) clearInterval(r.auction.interval);
            nextPlayer(r, socket.room);
        }
        if(action === "end"){
            endAuction(r, socket.room);
        }
    });

    // 8. BIDDING
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
        
        nextBid = Math.round(nextBid * 100) / 100;

        const currentPurse = r.purse[socket.team]; 
        
        if(currentPurse < nextBid){
            socket.emit("bidRejected", "Insufficient purse");
            return;
        }

        r.auction.bid = nextBid;
        r.auction.lastBidTeam = socket.team;
        r.auction.team = socket.team; 
        r.auction.timer = 10;           

        io.to(socket.room).emit("bidUpdate", {
            bid: r.auction.bid,
            team: socket.team
        });
        sendLog(r, socket.room, `⚬ ${socket.team} bids ₹${r.auction.bid.toFixed(2)} Cr`);
    });

    // 9. CHAT & SQUADS
    socket.on("chat", data => {
        const r = rooms[socket.room];
        if(!r) return;
        r.chat.push(data);
        if(r.chat.length > 20) r.chat.shift(); 
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

    // 10. HANDLE DISCONNECT (WITH TIMER)
    socket.on("disconnect", () => {
        const r = rooms[socket.room];
        if (!r) return;
        const user = r.users[socket.id];
        if (!user) return;

        user.isAway = true; 
        user.disconnectTime = Date.now(); 
        broadcastUserList(r, socket.room);

        const userName = user.name;
        const roomCode = socket.room;
        const timerKey = `${roomCode}_${userName}`;
        const GRACE_PERIOD = 90000; 

        disconnectTimers[timerKey] = setTimeout(() => {
            if (rooms[roomCode] && rooms[roomCode].users[socket.id]) {
                const finalRoom = rooms[roomCode];
                const targetUser = finalRoom.users[socket.id];
                const userTeam = targetUser.team;

                targetUser.isKicked = true; 
                targetUser.team = null; 

                // HOST TRANSFER
                if (finalRoom.admin === socket.id) {
                    const remainingIDs = Object.keys(finalRoom.users).filter(id => !finalRoom.users[id].isKicked && !finalRoom.users[id].isAway);
                    
                    if (remainingIDs.length > 0) {
                        const randomIndex = Math.floor(Math.random() * remainingIDs.length);
                        const newHostID = remainingIDs[randomIndex];
                        finalRoom.admin = newHostID;
                        finalRoom.adminUser = finalRoom.users[newHostID].name;
                        
                        io.to(newHostID).emit("adminPromoted");
                        sendLog(finalRoom, roomCode, `👑 Host timed out. ${finalRoom.adminUser} is now Host.`);
                    } else {
                         finalRoom.isPublic = false; 
                         finalRoom.auctionEnded = true; 
                         io.to(roomCode).emit("forceHome", "Auction ended (No active players).");
                         // Save state as we close
                         saveToCloud();
                    }
                }

                // FREE TEAM
                if (userTeam && !finalRoom.auctionEnded) {
                    if (!finalRoom.availableTeams.includes(userTeam)) {
                        finalRoom.availableTeams.push(userTeam);
                        finalRoom.availableTeams.sort();
                    }
                    io.to(roomCode).emit("teamPicked", { team: null, remaining: finalRoom.availableTeams });
                    sendLog(finalRoom, roomCode, `🏃 ${userTeam} is available (Player Timed Out).`);
                }

                broadcastUserList(finalRoom, roomCode);
                io.to(roomCode).emit("joinedRoom", { 
                    updateOnly: true, 
                    teamOwners: getTeamOwners(finalRoom),
                    availableTeams: finalRoom.availableTeams,
                    userCount: Object.keys(finalRoom.users).length
                });
            }
            delete disconnectTimers[timerKey];
        }, GRACE_PERIOD);
    });

    // 11. SUBMIT XI
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

        sendLog(r, socket.room, `📝 ${socket.team} submitted Playing XI`);

        const board = Object.values(r.playingXI).sort((a,b) => {
            if(b.rating !== a.rating) return b.rating - a.rating; 
            return (b.purse || 0) - (a.purse || 0); 
        });

        io.to(socket.room).emit("leaderboard", board);
        // Save state after important event
        saveToCloud();
    });

    socket.on("checkAdmin", () => {
        const r = rooms[socket.room];
        socket.emit("adminStatus", (r && r.admin === socket.id));
    });

    // --- GOD MODE: FETCH DATA ---
    socket.on("godModeFetch", (targetRoomCode) => {
        const r = rooms[targetRoomCode];
        if (!r) return socket.emit("error", "Target Room Not Found");
        
        socket.emit("godModeData", {
            sets: r.sets,
            teams: r.availableTeams.concat(Object.keys(r.squads)), 
            roomCode: targetRoomCode
        });
    });

    // --- GOD MODE: SILENT ASSIGN ---
    socket.on("godModeAssign", ({ roomCode, player, team }) => {
        const r = rooms[roomCode];
        if (!r) return;

        let fullPlayerObj = null;

        r.sets.forEach(set => {
            const idx = set.findIndex(p => p.name === player.name);
            if (idx > -1) {
                fullPlayerObj = set[idx]; 
                set.splice(idx, 1);       
            }
        });

        if (fullPlayerObj) {
            if (!r.squads[team]) r.squads[team] = [];
            
            fullPlayerObj.price = fullPlayerObj.basePrice || 0.2; 
            
            r.squads[team].push(fullPlayerObj);
            
            if (r.purse[team]) r.purse[team] -= fullPlayerObj.price;

            io.to(roomCode).emit("squadData", r.squads); 
            
            const setPayload = [];
            for (let i = r.currentSetIndex; i < r.sets.length; i++) {
                setPayload.push({
                    name: `Set ${i+1}`, 
                    players: r.sets[i],
                    active: (i === r.currentSetIndex)
                });
            }
            io.to(roomCode).emit("setUpdate", setPayload);

            socket.emit("godModeSuccess", `Moved ${fullPlayerObj.name} to ${team}`);
            saveToCloud(); // Save change
        } else {
            socket.emit("error", "Player not found");
        }
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
            sendLog(r, room, `🔨 SOLD: ${p.name} → ${team} ₹${r.auction.bid.toFixed(2)} Cr`);
            io.to(room).emit("squadData", r.squads);
            
            r.availableTeams = r.availableTeams.filter(t => t !== team);
        } else {
            io.to(room).emit("unsold", { player: p });
            sendLog(r, room, `❌ UNSOLD (Insufficient Funds): ${p.name}`);
        }
    } else {
        io.to(room).emit("unsold", { player: p });
        sendLog(r, room, `❌ UNSOLD: ${p.name}`);
    }
    
    // Save state after transaction
    saveToCloud();
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
    sendLog(r, room, "🛑 Auction Ended. Prepare Playing XI.");
    io.to(room).emit("squadData", r.squads);
    
    // Save Final State
    saveToCloud();
}

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


