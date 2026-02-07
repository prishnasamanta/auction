const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const PLAYERS = require("./players");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 60000, 
    pingInterval: 25000
});
const admin = require("firebase-admin");

// Note: You must download your service account key from Firebase Console
// and place it in your project folder.
// Check if we are local or on a server
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : require("./firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://auction-10874-default-rtdb.asia-southeast1.firebasedatabase.app"
});


const db = admin.database();

// --- SERVER STATE ---
let rooms = {}; // Fast in-memory storage
const disconnectTimers = {};
const hostLeftEmptyTimers = {}; // When host leaves with no one else, room lives 2 mins then destroy

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));

// --- DEEP LINK HANDLER ---
// Refreshing /room/ABCD loads the SPA, plain /room redirects back to main landing
app.get('/room', (req, res) => {
    res.redirect('/');
});

app.get('/room/:roomCode*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ================================================= */
/* ☁️ CLOUD STORAGE FUNCTIONS (JSONBIN)              */
/* ================================================= */

// 1. READ ALL DATA (Load on startup)
// This helper saves ONLY the changed room, preventing data loss in other rooms
async function syncRoom(roomCode) {
    const r = rooms[roomCode];
    if (!r) return;
    try {
        // We sanitize to avoid circular socket references
        const cleanData = JSON.parse(JSON.stringify(r)); 
        // We remove the 'auction.interval' because it can't be saved to JSON
        if (cleanData.auction) delete cleanData.auction.interval;

        await db.ref(`rooms/${roomCode}`).set(cleanData);
        console.log(`☁️ Firebase: Room ${roomCode} synced.`);
    } catch (e) {
        console.error("⚠️ Firebase Sync Failed:", e.message);
    }
}

// Load data immediately when server starts

/* ================================================= */
/* 🌐 API ROUTES                                     */
/* ================================================= */
app.get('/api/room/:code', async (req, res) => {
    const code = req.params.code.toUpperCase();
    let room = rooms[code];

    if (!room) {
        // Pull from Firebase if server restarted
        const snapshot = await db.ref(`rooms/${code}`).once('value');
        if (snapshot.exists()) {
            rooms[code] = snapshot.val();
            room = rooms[code];
        }
    }

    if (!room) return res.json({ exists: false });

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

// API: Expose player pools to the client (for custom builder / legends)
app.get('/api/players/:setId?', (req, res) => {
    const setId = (req.params.setId || "ipl2026").toLowerCase();
    
    let pool = PLAYERS;
    try {
        if (setId === "legends") {
            // Optional legends.js file; fallback handled by catch
            // eslint-disable-next-line global-require, import/no-dynamic-require
            pool = require("./legends");
        } else if (setId === "custom") {
            // Optional custom.js file; if missing, use main players list
            // eslint-disable-next-line global-require, import/no-dynamic-require
            pool = require("./custom");
        } else if (setId === "mixed") {
            // public/mixed.js – great icons pool
            const mixedPaths = [
                path.join(__dirname, "public", "mixed.js"),
                path.join(__dirname, "mixed.js")
            ];
            for (const mp of mixedPaths) {
                try {
                    if (fs.existsSync(mp)) {
                        pool = require(mp);
                        if (!Array.isArray(pool)) pool = pool.default || pool || PLAYERS;
                        break;
                    }
                } catch (e2) { /* try next */ }
            }
            if (!Array.isArray(pool)) pool = PLAYERS;
        }
    } catch (e) {
        console.warn("API /api/players fallback to default PLAYERS:", e.message);
        pool = PLAYERS;
    }

    // Ensure every player has pteam (IPL 2025 team or "--")
    if (Array.isArray(pool)) pool.forEach(p => { p.pteam = p.pteam || "--"; });
    res.json({ players: pool });
});

/* ================= CONSTANTS & HELPERS ================= */

const DEFAULT_RULES = {
    purse: 120,
    minSquadSize: 18,
    maxPlayers: 24,
    maxForeign: 6,
    minBat: 3,
    minBowl: 3,
    minWK: 1,
    minAll: 1,
    minSpin: 1,
    maxForeignXI: 4,
    rtmEnabled: false,
    rtmPerTeam: 2
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

function getSocketIdByTeam(room, teamName) {
    if (!room || !room.users) return null;
    const sid = Object.keys(room.users).find(id => room.users[id].team === teamName);
    return sid || null;
}

function commitSoldTo(r, room, team, price, isRtm) {
    const p = r.auction.player;
    if (!p || !r.squads[team]) return;
    p.price = price;
    if (isRtm) p.rtm = true;
    r.squads[team].push(p);
    r.purse[team] -= price;
    io.to(room).emit("sold", { player: p, team, price, purse: r.purse });
    sendLog(r, room, `🔨 SOLD: ${p.name} → ${team} ₹${price.toFixed(2)} Cr`);
    io.to(room).emit("squadData", { squads: r.squads, rtmLeft: r.rtmLeft || {} });
    r.availableTeams = r.availableTeams.filter(t => t !== team);
    syncRoom(room);
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
        const poolDisplay = (datasetId) => {
            if (!datasetId) return 'IPL 2026';
            if (datasetId === 'legends') return 'Legends';
            if (datasetId === 'custom') return 'Custom';
            if (datasetId === 'mixed') return 'Mixed';
            return 'IPL 2026';
        };
        for (const [id, room] of Object.entries(rooms)) {
            if (room.isPublic && !room.auctionEnded) {
                const info = { id, count: Object.keys(room.users).length, poolName: poolDisplay(room.datasetId) };
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
    socket.on("createRoom", async ({ user, isPublic, datasetId }) => {
        const code = generateRoomCode();
        
        // Choose player pool based on selected dataset (default -> PLAYERS)
        let playerPool = PLAYERS;

if (datasetId === "legends") {
    const rootPath = path.join(process.cwd(), "legends.js");
    const publicPath = path.join(process.cwd(), "public", "legends.js");
    
    let selectedPath = null;

    // Check if files exist physically before requiring
    if (fs.existsSync(rootPath)) {
        selectedPath = rootPath;
    } else if (fs.existsSync(publicPath)) {
        selectedPath = publicPath;
    }

    if (selectedPath) {
        try {
            // require(selectedPath) might need .default if legends.js uses 'export default'
            const imported = require(selectedPath);
            playerPool = imported.default || imported; 
            console.log(`Successfully loaded legends from: ${selectedPath}`);
        } catch (err) {
            console.error("Error parsing legends.js:", err.message);
            playerPool = PLAYERS;
        }
    } else {
        console.warn("legends.js not found in root or public/, falling back to default.");
        playerPool = PLAYERS;
    }
} else if (datasetId === "mixed") {
    const rootPath = path.join(__dirname, "mixed.js");
    const publicPath = path.join(__dirname, "public", "mixed.js");
    let selectedPath = null;
    if (fs.existsSync(publicPath)) selectedPath = publicPath;
    else if (fs.existsSync(rootPath)) selectedPath = rootPath;
    if (selectedPath) {
        try {
            const imported = require(selectedPath);
            playerPool = Array.isArray(imported) ? imported : (imported.default || imported);
            console.log("Loaded mixed pool from:", selectedPath);
        } catch (err) {
            console.error("Error loading mixed.js:", err.message);
            playerPool = PLAYERS;
        }
    } else {
        console.warn("mixed.js not found, falling back to default.");
        playerPool = PLAYERS;
    }
} else if (datasetId === "custom") {
    playerPool = PLAYERS;
}

        if (Array.isArray(playerPool)) playerPool.forEach(p => { p.pteam = p.pteam || "--"; });

        rooms[code] = {
            admin: socket.id,
            adminUser: user,
            isPublic: !!isPublic,
            users: {}, 
            availableTeams: [...AVAILABLE_TEAMS_LIST],
            squads: {},
            purse: {},
            sets: createSets([...playerPool]),
            currentSetIndex: 0,
            playingXI: {},
            rulesLocked: false,
            auctionStarted: false,
            auctionEnded: false,
            datasetId: datasetId || "ipl2026",
            customPlayers: null,
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
        room.rtmLeft = {};
        AVAILABLE_TEAMS_LIST.forEach(t => { room.rtmLeft[t] = room.rules.rtmPerTeam || 0; });

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
            rtmLeft: room.rtmLeft || {},
            history: { chat: room.chat, logs: room.logs }
        });

        broadcastSets(room, code);
        
        // Save initial state
await syncRoom(code);
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

    // Always send leaderboard when auction ended: include ALL teams (disqualified/no-submit = 0 rating)
    if (r.auctionEnded) {
        const allTeamNames = Object.keys(r.purse || {});
        const boardMap = {};
        allTeamNames.forEach(t => {
            const entry = r.playingXI[t];
            const purse = (r.purse && r.purse[t]) != null ? r.purse[t] : 0;
            if (entry) {
                boardMap[t] = { ...entry, team: t, rating: entry.disqualified ? 0 : (entry.rating != null ? entry.rating : 0), purse };
            } else {
                boardMap[t] = { team: t, rating: 0, disqualified: true, reason: "No XI submitted", purse, xi: [] };
            }
        });
        const board = Object.values(boardMap).sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            return (b.purse || 0) - (a.purse || 0);
        });
        socket.emit("leaderboard", board);
    } else if (Object.keys(r.playingXI).length > 0) {
        const board = Object.values(r.playingXI).sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
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
            let wasKicked = false;

            if(oldSocketId) {
                // Restore old user data to new socket ID
                const userData = room.users[oldSocketId];
                wasKicked = userData.isKicked;
                delete room.users[oldSocketId];
                
                userData.id = socket.id;
                userData.connected = true;
                userData.isAway = false;
                userData.disconnectTime = null; 
                userData.isKicked = false;
                
                room.users[socket.id] = userData;
                assignedTeam = userData.team;

                // Restore Admin Status if they were host, or reclaim host if room was waiting (2-min timer)
                if (room.admin === oldSocketId) {
                    room.admin = socket.id;
                } else if (room.admin === null && room.pendingHostName === username) {
                    room.admin = socket.id;
                    room.adminUser = username;
                    delete room.pendingHostName;
                    if (hostLeftEmptyTimers[roomId]) {
                        clearTimeout(hostLeftEmptyTimers[roomId]);
                        delete hostLeftEmptyTimers[roomId];
                    }
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
                rtmLeft: room.rtmLeft || {},
                history: { chat: room.chat, logs: room.logs },
                yourTeam: assignedTeam,
                leaderboardData: room.auctionEnded ? Object.values(room.playingXI) : [] 
            });
            
            // Broadcast user list update
            broadcastUserList(room, roomId);
            broadcastSets(room, roomId);

            if(assignedTeam) {
                socket.emit("teamPicked", { team: assignedTeam, remaining: room.availableTeams });
            }
            if (wasKicked) socket.emit("youAreSpectator");

            // 3. HANDLE GAME PHASE ROUTING
            if (room.auctionEnded) {
                socket.emit("auctionEnded"); // Triggers client routing (XI or Summary)
                // Full leaderboard: all teams (disqualified/no-submit = 0 rating)
                const allTeamNames = Object.keys(room.purse || {});
                const boardMap = {};
                allTeamNames.forEach(t => {
                    const entry = room.playingXI[t];
                    const purse = (room.purse && room.purse[t]) != null ? room.purse[t] : 0;
                    if (entry) {
                        boardMap[t] = { ...entry, team: t, rating: entry.disqualified ? 0 : (entry.rating != null ? entry.rating : 0), purse };
                    } else {
                        boardMap[t] = { team: t, rating: 0, disqualified: true, reason: "No XI submitted", purse, xi: [] };
                    }
                });
                const board = Object.values(boardMap).sort((a, b) => {
                    if (b.rating !== a.rating) return b.rating - a.rating;
                    return (b.purse || 0) - (a.purse || 0);
                });
                socket.emit("leaderboard", board);
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

    // 4. JOIN ROOM (with identity verification for same-name joins)
    socket.on("joinRoom", ({ roomCode, user }) => {
        const room = rooms[roomCode];
        if(!room) return socket.emit("error", "Room not found");
        
        if(room.auctionEnded) {
            // Room still exists but auction ended - send to summary
            socket.join(roomCode);
            socket.room = roomCode;
            socket.user = user;
            socket.emit("joinedRoom", {
                rules: room.rules,
                squads: room.squads,
                purses: room.purse,
                roomCode: roomCode,
                isHost: false,
                auctionStarted: true,
                availableTeams: [],
                auctionEnded: true,
                userCount: Object.keys(room.users).length,
                history: { chat: room.chat, logs: room.logs },
                teamOwners: getTeamOwners(room),
                rtmLeft: room.rtmLeft || {},
                yourTeam: null,
                leaderboardData: Object.values(room.playingXI || {})
            });
            socket.emit("auctionEnded");
            return;
        }

        const existingSocketId = Object.keys(room.users).find(id => room.users[id].name === user);
        
        // If a user with this name already exists, check if they are disconnected/away
        if (existingSocketId) {
            const existingUser = room.users[existingSocketId];
            // If user is disconnected (isAway, !connected, or timer running), allow direct rejoin
            const timerKey = `${roomCode}_${user}`;
            const isDisconnected = existingUser.isAway || existingUser.connected === false || disconnectTimers[timerKey];
            
            if (isDisconnected) {
                // Cancel any pending disconnect timer
                if (disconnectTimers[timerKey]) {
                    clearTimeout(disconnectTimers[timerKey]);
                    delete disconnectTimers[timerKey];
                }
                // Restore user to new socket
                const userData = room.users[existingSocketId];
                const wasKicked = userData.isKicked;
                delete room.users[existingSocketId];
                
                userData.id = socket.id;
                userData.connected = true;
                userData.isAway = false;
                userData.disconnectTime = null;
                userData.isKicked = false;
                
                room.users[socket.id] = userData;
                
                // Restore admin status if they were host, or reclaim host if room was waiting (host left, 2-min timer)
                if (room.admin === existingSocketId) {
                    room.admin = socket.id;
                } else if (room.admin === null && room.pendingHostName === user) {
                    room.admin = socket.id;
                    room.adminUser = user;
                    delete room.pendingHostName;
                    if (hostLeftEmptyTimers[roomCode]) {
                        clearTimeout(hostLeftEmptyTimers[roomCode]);
                        delete hostLeftEmptyTimers[roomCode];
                    }
                }
                
                socket.join(roomCode);
                socket.room = roomCode;
                socket.user = user;
                socket.team = userData.team;
                if (room.adminUser === user) socket.isAdmin = true;
                
                socket.emit("joinedRoom", {
                    rules: room.rules,
                    squads: room.squads,
                    purses: room.purse,
                    roomCode: roomCode,
                    isHost: (room.adminUser === user),
                    auctionStarted: room.auctionStarted,
                    availableTeams: room.availableTeams,
                    auctionEnded: room.auctionEnded,
                    userCount: Object.keys(room.users).length,
                    history: { chat: room.chat, logs: room.logs },
                    teamOwners: getTeamOwners(room),
                    rtmLeft: room.rtmLeft || {},
                    yourTeam: userData.team,
                    leaderboardData: room.auctionEnded ? Object.values(room.playingXI) : []
                });
                
                broadcastUserList(room, roomCode);
                sendLog(room, roomCode, `🔄 ${user} reconnected.`);
                if (wasKicked) socket.emit("youAreSpectator");
                return;
            }
            
            // Kicked user rejoining as spectator (same name, was kicked after 90s – allow rejoin with no team)
            if (existingUser.isKicked) {
                const userData = room.users[existingSocketId];
                delete room.users[existingSocketId];
                userData.id = socket.id;
                userData.connected = true;
                userData.isAway = false;
                userData.isKicked = false;
                userData.team = null;
                room.users[socket.id] = userData;
                if (room.admin === existingSocketId) room.admin = socket.id;
                else if (room.admin === null && room.pendingHostName === user) {
                    room.admin = socket.id;
                    room.adminUser = user;
                    delete room.pendingHostName;
                    if (hostLeftEmptyTimers[roomCode]) {
                        clearTimeout(hostLeftEmptyTimers[roomCode]);
                        delete hostLeftEmptyTimers[roomCode];
                    }
                }
                socket.join(roomCode);
                socket.room = roomCode;
                socket.user = user;
                socket.team = null;
                socket.emit("joinedRoom", {
                    rules: room.rules,
                    squads: room.squads,
                    purses: room.purse,
                    roomCode: roomCode,
                    isHost: (room.admin === socket.id),
                    auctionStarted: room.auctionStarted,
                    availableTeams: room.availableTeams,
                    auctionEnded: room.auctionEnded,
                    userCount: Object.keys(room.users).length,
                    history: { chat: room.chat, logs: room.logs },
                    teamOwners: getTeamOwners(room),
                    rtmLeft: room.rtmLeft || {},
                    yourTeam: null,
                    leaderboardData: room.auctionEnded ? Object.values(room.playingXI || {}) : [],
                    isSpectatorRejoin: true
                });
                broadcastUserList(room, roomCode);
                socket.emit("youAreSpectator");
                return;
            }
            
            // User is online - trigger identity check flow
            const oldSocketId = existingSocketId;
            
            // Generate Code
            const code = Math.floor(100 + Math.random() * 900).toString();

            // 1. Send Code to OLD Device (To Display)
            io.to(oldSocketId).emit("identityShowCode", {
                code,
                name: user,
                device: "New Device"
            });

            // 2. Ask NEW Device for Input
            socket.emit("identityInputRequired", { 
                roomCode, 
                name: user 
            });

            // Store challenge
            const challengeKey = `${roomCode}:${user}`;
            if (!global.identityChallenges) global.identityChallenges = {};
            
            global.identityChallenges[challengeKey] = {
                code,
                roomCode,
                name: user,
                oldSocketId,
                newSocketId: socket.id, // Store New Socket ID
                createdAt: Date.now()
            };

            // Auto-expire
            setTimeout(() => {
                const ch = global.identityChallenges[challengeKey];
                if (ch && ch.newSocketId === socket.id) {
                    delete global.identityChallenges[challengeKey];
                    io.to(socket.id).emit("identityFailed", { reason: "timeout" });
                }
            }, 30000); // Give them 30 seconds

            return; 
        }
        // Normal first-time join
        room.users[socket.id] = { name: user, team: null, id: socket.id, connected: true };

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
            teamOwners: getTeamOwners(room),
            rtmLeft: room.rtmLeft || {},
            yourTeam: socket.team || null,
            leaderboardData: room.auctionEnded ? Object.values(room.playingXI) : []
        });

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

    // 5a. IDENTITY CHALLENGE RESPONSE (old device typing the 3‑digit code)
 socket.on("verifyIdentityCode", ({ roomCode, name, code }) => {
    const challengeKey = `${roomCode}:${name}`;
    if (!global.identityChallenges) return;
    const ch = global.identityChallenges[challengeKey];
    if (!ch) return;

    // 🛑 CRITICAL CHANGE: Only accept response from NEW SOCKET
    if (socket.id !== ch.newSocketId) return;

    // Check code
    const validCode = ch.code === String(code).trim();
    
    if (!validCode) {
        socket.emit("identityFailed", { reason: "invalid" });
        return;
    }

    // --- SUCCESS: TRANSFER ACCOUNT ---
    const room = rooms[roomCode];
    if (!room) return;

    const userRecord = Object.values(room.users).find(u => u.name === name);
    const oldSocketId = ch.oldSocketId;
    const newSocketId = ch.newSocketId;

    // Kick/Notify Old Device
    io.to(oldSocketId).emit("forceHome", "Logged in on another device.");
    // Remove old socket data
    delete room.users[oldSocketId];

    // Setup New Socket Data
    room.users[newSocketId] = {
        ...userRecord,
        id: newSocketId,
        connected: true,
        isAway: false,
        isKicked: false
    };

    // Transfer Admin if necessary
    if (room.admin === oldSocketId) {
        room.admin = newSocketId;
    }

    // Join New Socket to Room
    socket.join(roomCode);
    socket.room = roomCode;
    socket.user = name;
    socket.team = room.users[newSocketId].team;
    if (room.adminUser === name) socket.isAdmin = true;

    // Send Join Data to New Device
    socket.emit("joinedRoom", {
        rules: room.rules,
        squads: room.squads,
        purses: room.purse,
        roomCode,
        isHost: (room.adminUser === name),
        auctionStarted: room.auctionStarted,
        availableTeams: room.availableTeams,
        auctionEnded: room.auctionEnded,
        userCount: Object.keys(room.users).length,
        teamOwners: getTeamOwners(room),
        rtmLeft: room.rtmLeft || {},
        yourTeam: socket.team,
        history: { chat: room.chat, logs: room.logs },
        leaderboardData: room.auctionEnded ? Object.values(room.playingXI) : []
    });

    // Cleanup
    delete global.identityChallenges[challengeKey];
    
    // Close the popup on Old Device (if still open)
    io.to(oldSocketId).emit("identityDismiss"); 
});

    // 5b. SAVE CUSTOM PLAYER SET (Host only, before auction starts)
    socket.on("saveCustomSet", (players) => {
        const room = rooms[socket.room];
        if (!room || !socket.isAdmin) return;
        if (room.auctionStarted || room.auctionEnded) return;
        if (!Array.isArray(players) || players.length === 0) return;

        room.customPlayers = players;
        room.datasetId = "custom";
        room.sets = createSets(players);
        room.currentSetIndex = 0;

        // Re-broadcast updated sets to all users
        broadcastSets(room, socket.room);
        sendLog(room, socket.room, `🛠️ Host loaded a custom player pool (${players.length} players).`);
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
        syncRoom(socket.room);
    });

    // 9. CHAT & SQUADS
    socket.on("chat", data => {
        const r = rooms[socket.room];
        if(!r) return;
        const msg = { ...data, id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, reactions: {} };
        r.chat.push(msg);
        if(r.chat.length > 20) r.chat.shift();
        io.to(socket.room).emit("chatUpdate", msg);
    });
    socket.on("chatReaction", ({ msgId, emoji }) => {
        const r = rooms[socket.room];
        if(!r || !msgId || !emoji) return;
        const msg = r.chat.find(m => m.id === msgId);
        if(!msg) return;
        if(!msg.reactions) msg.reactions = {};
        msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
        io.to(socket.room).emit("chatReactionUpdate", { msgId, reactions: msg.reactions });
    });
    socket.on("getSquads", () => {
        const r = rooms[socket.room];
        if(!r) return;
        socket.emit("squadData", { squads: r.squads, rtmLeft: r.rtmLeft || {} });
    });
    socket.on("getMySquad", () => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;
        socket.emit("mySquad", {
            squad: r.squads[socket.team],
            rules: r.rules
        });
    });

    // RTM (Right to Match)
    socket.on("rtmReject", () => {
        const r = rooms[socket.room];
        if (!r || !r.auction.rtmPending || r.auction.rtmPending.pteamSocketId !== socket.id) return;
        if (r.auction.rtmTimer) clearTimeout(r.auction.rtmTimer);
        r.auction.rtmTimer = null;
        const pend = r.auction.rtmPending;
        r.auction.rtmPending = null;
        commitSoldTo(r, socket.room, pend.team, pend.bid);
        io.to(socket.room).emit("rtmOverlay", { show: false });
        syncRoom(socket.room);
        setTimeout(() => nextPlayer(r, socket.room), 2000);
    });

    socket.on("rtmAccept", ({ amount }) => {
        const r = rooms[socket.room];
        if (!r || !r.auction.rtmPending || r.auction.rtmPending.pteamSocketId !== socket.id) return;
        const pend = r.auction.rtmPending;
        const amt = Number(amount);
        if (r.auction.rtmTimer) clearTimeout(r.auction.rtmTimer);
        r.auction.rtmTimer = null;
        if (isNaN(amt) || amt <= pend.bid || r.purse[pend.pteam] < amt) {
            r.auction.rtmPending = null;
            commitSoldTo(r, socket.room, pend.team, pend.bid);
            io.to(socket.room).emit("rtmOverlay", { show: false });
            syncRoom(socket.room);
            setTimeout(() => nextPlayer(r, socket.room), 2000);
            return;
        }
        r.rtmLeft[pend.pteam] = (r.rtmLeft[pend.pteam] || 0) - 1;
        const buyerSocketId = getSocketIdByTeam(r, pend.team);
        r.auction.rtmPending = { ...pend, rtmPrice: amt, phase: "buyerChoice" };
        if (buyerSocketId) {
            io.to(buyerSocketId).emit("rtmBuyerChoice", {
                player: pend.player,
                rtmPrice: amt,
                rtmTeam: pend.pteam
            });
        } else {
            r.auction.rtmPending = null;
            commitSoldTo(r, socket.room, pend.pteam, amt, true);
            io.to(socket.room).emit("rtmOverlay", { show: false });
            syncRoom(socket.room);
            setTimeout(() => nextPlayer(r, socket.room), 2000);
        }
    });

    socket.on("rtmBuyerAccept", () => {
        const r = rooms[socket.room];
        if (!r || !r.auction.rtmPending || r.auction.rtmPending.phase !== "buyerChoice") return;
        const buyerTeam = r.auction.rtmPending.team;
        if (socket.team !== buyerTeam) return;
        const pend = r.auction.rtmPending;
        r.auction.rtmPending = null;
        commitSoldTo(r, socket.room, buyerTeam, pend.rtmPrice, true);
        io.to(socket.room).emit("rtmOverlay", { show: false });
        syncRoom(socket.room);
        setTimeout(() => nextPlayer(r, socket.room), 2000);
    });

    socket.on("rtmBuyerReject", () => {
        const r = rooms[socket.room];
        if (!r || !r.auction.rtmPending || r.auction.rtmPending.phase !== "buyerChoice") return;
        const buyerTeam = r.auction.rtmPending.team;
        if (socket.team !== buyerTeam) return;
        const pend = r.auction.rtmPending;
        r.auction.rtmPending = null;
        commitSoldTo(r, socket.room, pend.pteam, pend.rtmPrice, true);
        io.to(socket.room).emit("rtmOverlay", { show: false });
        syncRoom(socket.room);
        setTimeout(() => nextPlayer(r, socket.room), 2000);
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
            const finalRoom = rooms[roomCode];
            if (!finalRoom) { delete disconnectTimers[timerKey]; return; }
            // Find user by name (they may still be keyed by old socket.id)
            const userEntry = Object.entries(finalRoom.users).find(([, u]) => u.name === userName);
            if (!userEntry) { delete disconnectTimers[timerKey]; return; }
            const [oldSocketId, targetUser] = userEntry;
            const userTeam = targetUser.team;

            targetUser.isKicked = true;
            targetUser.team = null;

            // HOST TRANSFER (don't destroy room – transfer or keep for 2 mins)
            if (finalRoom.admin === oldSocketId) {
                const remainingIDs = Object.keys(finalRoom.users).filter(id => id !== oldSocketId && !finalRoom.users[id].isKicked && !finalRoom.users[id].isAway);

                if (remainingIDs.length > 0) {
                    const randomIndex = Math.floor(Math.random() * remainingIDs.length);
                    const newHostID = remainingIDs[randomIndex];
                    finalRoom.admin = newHostID;
                    finalRoom.adminUser = finalRoom.users[newHostID].name;

                    io.to(newHostID).emit("adminPromoted");
                    sendLog(finalRoom, roomCode, `👑 Host timed out. ${finalRoom.adminUser} is now Host.`);
                } else {
                    // No one else – keep room for 2 mins then destroy (don't end auction immediately)
                    finalRoom.admin = null;
                    finalRoom.adminUser = null;
                    finalRoom.pendingHostName = userName; // so host can rejoin and reclaim
                    sendLog(finalRoom, roomCode, `⏳ Host left. Room will close in 2 minutes if no one rejoins.`);
                    const EMPTY_ROOM_GRACE = 120000; // 2 mins
                    hostLeftEmptyTimers[roomCode] = setTimeout(() => {
                        if (rooms[roomCode]) {
                            const r = rooms[roomCode];
                            const activeCount = Object.keys(r.users).filter(id => !r.users[id].isKicked && !r.users[id].isAway).length;
                        if (activeCount === 0) {
                            // 🛡️ DATA PROTECTION FIX:
                            if (!r.auctionEnded) {
                                console.log(`🗑️ Deleting abandoned lobby: ${roomCode}`);
                                io.to(roomCode).emit("forceHome", "Room closed (no active players).");
                                
                                // 1. Remove from local memory
                                delete rooms[roomCode];
                                
                                // 2. Remove from Firebase (Since it was abandoned)
                                // FIX: Use db.ref().remove() instead of saveToCloud()
                                db.ref(`rooms/${roomCode}`).remove(); 
                            } else {
                                console.log(`💾 Persisting completed game: ${roomCode} for results viewing.`);
                                // We do NOT delete from Firebase. We only delete from RAM.
                                delete rooms[roomCode];
                            }
                        }

                        }
                        delete hostLeftEmptyTimers[roomCode];
                    }, EMPTY_ROOM_GRACE);
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
                roomCode,
                teamOwners: getTeamOwners(finalRoom),
                availableTeams: finalRoom.availableTeams,
                userCount: Object.keys(finalRoom.users).length
            });
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
        else if ((R.minSpin || 0) > 0 && counts.SPIN < R.minSpin) { disqualified = true; reason = `Need min ${R.minSpin} Spinner(s). Current: ${counts.SPIN}`; }
        
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
syncRoom(socket.room);
    });

    socket.on("checkAdmin", () => {
        const r = rooms[socket.room];
        socket.emit("adminStatus", (r && r.admin === socket.id));
    });

    // --- GOD MODE: ROOM INFO (pool name for UI) ---
    const godPoolDisplay = (datasetId) => {
        if (!datasetId) return 'IPL 2026';
        if (datasetId === 'legends') return 'Legends';
        if (datasetId === 'custom') return 'Custom';
        if (datasetId === 'mixed') return 'Mixed';
        return 'IPL 2026';
    };
    socket.on("godModeRoomInfo", (targetRoomCode) => {
        const r = rooms[targetRoomCode];
        if (!r) return socket.emit("godModeRoomInfoResult", { found: false });
        socket.emit("godModeRoomInfoResult", {
            found: true,
            roomCode: targetRoomCode,
            poolName: godPoolDisplay(r.datasetId)
        });
    });

    // --- GOD MODE: FETCH DATA ---
    socket.on("godModeFetch", (targetRoomCode) => {
        const r = rooms[targetRoomCode];
        if (!r) return socket.emit("error", "Target Room Not Found");
        
        const activeTeams = Object.keys(r.squads || {}).filter(t => r.squads[t] && r.squads[t].length > 0);
        socket.emit("godModeData", {
            sets: r.sets,
            teams: r.availableTeams.concat(Object.keys(r.squads)),
            activeTeams: activeTeams.length ? activeTeams : Object.keys(r.squads || {}),
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

            io.to(roomCode).emit("squadData", { squads: r.squads, rtmLeft: r.rtmLeft || {} }); 
            
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
            syncRoom(socket.room); // Save change
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
                r.auction.interval = null;
                resolvePlayer(r, room);
                if (!r.auction.rtmPending) setTimeout(() => nextPlayer(r, room), 2000);
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

        if (r.purse[team] < r.auction.bid) {
            io.to(room).emit("unsold", { player: p });
            sendLog(r, room, `❌ UNSOLD (Insufficient Funds): ${p.name}`);
            syncRoom(room);
            return;
        }

        // RTM: if enabled, player has pteam, pteam owner is online and has RTMs left, and buyer !== pteam (don't offer RTM to self)
        const playerPteam = (p.pteam || "").trim();
        if (r.rules.rtmEnabled && playerPteam && playerPteam !== "--" && playerPteam !== team && (r.rtmLeft[playerPteam] || 0) > 0) {
            const pteamSocketId = getSocketIdByTeam(r, playerPteam);
            if (pteamSocketId) {
                r.auction.rtmPending = {
                    player: p,
                    team,
                    bid: r.auction.bid,
                    pteam: playerPteam,
                    pteamSocketId
                };
                io.to(room).emit("rtmOverlay", {
                    show: true,
                    player: p,
                    soldToTeam: team,
                    soldPrice: r.auction.bid
                });
                io.to(pteamSocketId).emit("rtmOffer", {
                    player: p,
                    soldToTeam: team,
                    soldPrice: r.auction.bid,
                    timer: 15
                });
                r.auction.rtmTimer = setTimeout(() => {
                    r.auction.rtmTimer = null;
                    if (!r.auction.rtmPending) return;
                    const pend = r.auction.rtmPending;
                    r.auction.rtmPending = null;
                    commitSoldTo(r, room, pend.team, pend.bid);
                    io.to(room).emit("rtmOverlay", { show: false });
                    syncRoom(room);
                    setTimeout(() => nextPlayer(r, room), 2000);
                }, 15000);
                return;
            }
        }

        commitSoldTo(r, room, team, r.auction.bid);
    } else {
        io.to(room).emit("unsold", { player: p });
        sendLog(r, room, `❌ UNSOLD: ${p.name}`);
    }

syncRoom(room);
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
    io.to(room).emit("squadData", { squads: r.squads, rtmLeft: r.rtmLeft || {} });
    
syncRoom(room);
}

const PORT = process.env.PORT || 3500; 
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
