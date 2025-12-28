const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PLAYERS = require("./players"); // Ensure this file exists

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ================= CONSTANTS ================= */
const RECONNECT_TIME = 2 * 60 * 1000; // ⏳ 2 Minutes in milliseconds
const rooms = {};

// ================= GLOBAL VARIABLES (DEFAULTS) =================
let auctionRules = {
    purse: 120,       // Default Crore
    maxPlayers: 18,   // Max Squad Size
    maxForeign: 6,    // Max Foreigners
    minBat: 3,
    minBowl: 3,
    minWK: 1,
    minAll: 1
};

/* ================= HELPERS ================= */
function generateRoomCode(){
  return Math.random().toString(36).substring(2,7).toUpperCase();
}

function startBid(r){
  if(r>=9) return 2;
  if(r>=8) return 1;
  return 0.5;
}

// Groups players into sets based on Role and Nationality
function createSets(allPlayers) {
  const sets = [];
  let currentSet = [];
  
  if (allPlayers.length === 0) return [];

  // Start with first player
  let lastP = allPlayers[0];
  currentSet.push(lastP);

  for (let i = 1; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    
    // If Role changes OR Foreign status changes -> New Set
    if (p.role !== lastP.role || p.foreign !== lastP.foreign) {
      sets.push(currentSet); // Save previous set
      currentSet = [];       // Start new set
    }
    
    currentSet.push(p);
    lastP = p;
  }
  sets.push(currentSet); // Save the final set
  return sets;
}

// Helper to get a readable name for the set (e.g., "Indian WK")
function getSetName(set) {
  if(!set || set.length === 0) return "Empty Set";
  const p = set[0];
  return `${p.foreign ? "Overseas" : "Indian"} ${p.role}s`;
}

function broadcastSets(r, roomCode) {
  const payload = [];
  // Loop from current set index to the end
  for(let i = r.currentSetIndex; i < r.sets.length; i++){
    payload.push({
      name: getSetName(r.sets[i]),
      players: r.sets[i],
      active: (i === r.currentSetIndex) // Mark if this is the active bidding set
    });
  }
  io.to(roomCode).emit("setUpdate", payload);
}

/* ================= SOCKET LOGIC ================= */
io.on("connection", socket => {

    /* --- GET STATE --- */
    socket.on("getAuctionState", () => {
        const r = rooms[socket.room];
        if(!r) return;

        socket.emit("auctionState", {
            live: r.auction.live,
            paused: r.auction.paused,
            player: r.auction.player,
            bid: r.auction.bid
        });
    });

    /* ================= CREATE ROOM ================= */
    socket.on("createRoom", ({ user }) => {
        const code = generateRoomCode();
        socket.isAdmin = true;
        
        rooms[code] = {
            admin: socket.id,
            adminUser: user,
            phase: "auction",
            rulesLocked: false,
            auctionStarted: false,
            users: {},
            availableTeams: ["CSK", "MI", "RCB", "KKR", "RR", "SRH", "DC", "PBKS", "LSG", "GT"],
            squads: {},
            purse: {},
            
            // Groups players into sets (Order preserved from players.js)
            sets: createSets([...PLAYERS]), 
            currentSetIndex: 0,            
            
            playingXI: {},
            xiSubmitted: {},
            rules: {
                maxPlayers: 18,
                maxForeign: 6,
                purse: 120,
                minBat: 4,
                minAll: 2,
                minBowl: 4,
                minSpin: 1,
                minWK: 1,
                minForeignXI: 0
            },

            auction: {
                live: false,
                paused: false,
                player: null,
                bid: 0,
                team: null,
                timer: 4,
                interval: null,
                increment: 0.1 
            }
        };

        socket.join(code);
        socket.room = code;
        socket.user = user;
        socket.isAdmin = true;
        rooms[code].users[socket.id] = user;

        socket.emit("roomCreated", code);
        
        // Send State Immediately
        socket.emit("joinedRoom", { 
            squads: rooms[code].squads,
            rules: rooms[code].rules 
        });
        
        broadcastSets(rooms[code], code);
    });

    /* ================= JOIN ROOM ================= */
    socket.on("joinRoom", ({ roomCode, user }) => {
        const room = rooms[roomCode];
        if(!room) return socket.emit("error", "Room not found");

        socket.join(roomCode);
        socket.room = roomCode;
        socket.user = user;
        
        // 1. 🔄 CHECK RECONNECTION (Did this user hold a team?)
        let recoveredTeam = null;

        // Search reservations for this username
        for (const team in room.reservations) {
            if (room.reservations[team].user === user) {
                recoveredTeam = team;
                // ✅ Cancel the 2-min timeout (User is back!)
                clearTimeout(room.reservations[team].timeout);
                delete room.reservations[team];
                break;
            }
        }

        // 2. ASSIGN ROLE
       

        // 3. SEND STATE
// Inside your server logic (likely inside joinRoom event)
        socket.emit("joinedRoom", { 
            rules: room.rules,
            squads: room.squads,
            
            // ADD THESE TWO LINES:
            roomCode: roomCode,          // Send the code so client can display it
            isHost: socket.id === room.hostId // Send true if this user is the host
        });

        broadcastSets(room, roomCode);
        socket.emit('syncRules', room.rules); 

        // 4. TEAM SELECTION LOGIC
        // If user has NO team (didn't recover one), and rules are locked, show available teams
        if(room.rulesLocked && !socket.team){
            socket.emit("needTeamSelection", {
                teams: room.availableTeams
            });
        }
                io.to(roomCode).emit('logUpdate', `👋${user} has joined the room.`);

    });

  

    /* ================= TEAM SELECTION ================= */
    socket.on("requestTeamState", () => {
        const room = rooms[socket.room];
        if(!room) return;
        if(room.rulesLocked && !socket.team){
            socket.emit("forceTeamPopup", { teams: room.availableTeams });
        }
    });

    socket.on("selectTeam", ({ team, user }) => {
        const r = rooms[socket.room];
        if(!r) return;
        if(!Array.isArray(r.availableTeams)) return;
        if(socket.team) return;
        if(!r.availableTeams.includes(team)) return;

        socket.team = team;
        r.users[socket.id] = { name: user, team };
        r.squads[team] = [];
        r.purse[team] = r.rules.purse;

        // remove team
        r.availableTeams = r.availableTeams.filter(t => t !== team);

        io.to(socket.room).emit("teamPicked", {
            team,
            remaining: r.availableTeams
        });
        io.to(socket.room).emit("logUpdate", `👕 ${user} selected ${team}`);
    });

    /* ================= RULES LOGIC ================= */
    socket.on('updateRules', (newRules) => {
        // Global admin update (optional, usually for dev)
        auctionRules = newRules;
        io.emit('syncRules', auctionRules);
    });

    socket.on("setRules", rules => {
        const room = rooms[socket.room];
        if(!room || !socket.isAdmin) return;
        if(room.auction.live) return;

        room.rules = {
            maxPlayers: rules.maxPlayers,
            maxForeign: rules.maxForeign,
            purse: rules.purse,
            minBat: rules.minBat,
            minAll: rules.minAll,
            minBowl: rules.minBowl,
            minSpin: rules.minSpin,
            minWK: rules.minWK,
            minForeignXI: rules.minForeignXI
        };

        room.rulesLocked = true;

        io.to(socket.room).emit("rulesUpdated", {
            rules: room.rules,
            teams: room.availableTeams
        });

        // FORCE TEAM SELECTION FOR EVERYONE
        io.to(socket.room).emit("forceTeamPopup", {
            teams: room.availableTeams
        });
    });

    socket.on("getSquads", () => {
        const r = rooms[socket.room];
        if(!r) return;
        io.to(socket.room).emit("squadData", r.squads);
    });

    /* ================= ADMIN ACTIONS ================= */
    socket.on("adminAction", action => {
        const r = rooms[socket.room];
        if(!r || socket.id !== r.admin) return;

        // 1. START
        if(action === "start"){
            if(r.auctionStarted) return;
            r.auctionStarted = true;
            r.auction.live = true;
            r.auction.paused = false;
            io.to(socket.room).emit("auctionStarted");
            nextPlayer(r, socket.room);
        }

        // 2. TOGGLE PAUSE / RESUME
        if(action === "togglePause"){
            if(r.auction.paused){
                r.auction.paused = false;
                io.to(socket.room).emit("auctionResumed");
            } else {
                r.auction.paused = true;
                io.to(socket.room).emit("auctionPaused");
            }
        }

        // 3. SKIP PLAYER
        if(action === "skip"){
            if(!r.auction.player) return;
            const skippedPlayer = r.auction.player;
            if(r.auction.interval){
                clearInterval(r.auction.interval);
                r.auction.interval = null;
            }
            io.to(socket.room).emit("logUpdate", `⏭ ${skippedPlayer.name} skipped`);
            io.to(socket.room).emit("unsold", { player: skippedPlayer });
            setTimeout(() => nextPlayer(r, socket.room), 800);
        }

        // 4. SKIP SET
        if(action === "skipSet"){
            if(r.auction.interval){
                clearInterval(r.auction.interval);
                r.auction.interval = null;
            }
            const currentSetName = getSetName(r.sets[r.currentSetIndex]);
            io.to(socket.room).emit("logUpdate", `⏩ SKIPPING REST OF: ${currentSetName}`);

            // Empty current set
            if(r.sets[r.currentSetIndex]){
                r.sets[r.currentSetIndex] = []; 
            }
            nextPlayer(r, socket.room);
        }

        // 5. END AUCTION
        if(action === "end"){
            endAuction(r, socket.room);
        }
    });

    /* ================= BIDDING ================= */
    socket.on("bid", () => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;
        if(!r.auction.live || r.auction.paused) return;
        if(r.auction.lastBidTeam === socket.team) return;

        const increment = r.auction.bid < 10 ? 0.2 : 0.5; 
        const nextBid = r.auction.bid + increment;
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
        io.to(socket.room).emit("logUpdate", `🟢 ${socket.team} bids ₹${r.auction.bid.toFixed(2)} Cr`);
    });

    /* ================= CHAT & MISC ================= */
    socket.on("chat", data => {
        io.to(socket.room).emit("chatUpdate", data);
    });

    socket.on("checkAdmin", () => {
        const r = rooms[socket.room];
        if(r && r.admin === socket.id){
            socket.emit("adminStatus", true);
        } else {
            socket.emit("adminStatus", false);
        }
    });

    /* ================= PLAYING XI ================= */
    socket.on("getMySquad", () => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;
        socket.emit("mySquad", {
            squad: r.squads[socket.team],
            rules: r.rules
        });
    });

    socket.on("submitXI", ({ xi }) => {
        const r = rooms[socket.room];
        if(!r || !socket.team) return;

        const allPlayers = [
            ...(xi.BAT || []),
            ...(xi.WK || []),
            ...(xi.ALL || []),
            ...(xi.BOWL || []),
            ...(xi.BOWLER || [])
        ];

        if(allPlayers.length !== 11){
             return socket.emit("xiError", "Server received incomplete XI.");
        }

        let counts = { BAT: 0, WK: 0, ALL: 0, BOWL: 0, SPIN: 0, FOREIGN: 0 };
        let totalRating = 0;

        allPlayers.forEach(p => {
            totalRating += (p.rating || 0);
            if(p.foreign) counts.FOREIGN++;
            if(p.role === "BAT") counts.BAT++;
            if(p.role === "WK") counts.WK++;
            if(p.role === "ALL") counts.ALL++;
            if(p.role === "PACE") counts.BOWL++;
            if(p.role === "SPIN") { counts.BOWL++; counts.SPIN++; }
        });

        // VALIDATE
        let disqualified = false;
        let reason = "";
        const R = r.rules;

        if(counts.FOREIGN > 4) { disqualified = true; reason = "More than 4 Overseas players"; }
        else if(counts.BAT < R.minBat) { disqualified = true; reason = `Need min ${R.minBat} Batsmen`; }
        else if(counts.WK < R.minWK) { disqualified = true; reason = `Need min ${R.minWK} Wicket Keeper`; }
        else if(counts.ALL < R.minAll) { disqualified = true; reason = `Need min ${R.minAll} All-Rounders`; }
        else if(counts.BOWL < R.minBowl) { disqualified = true; reason = `Need min ${R.minBowl} Bowlers`; }
        else if(counts.SPIN < R.minSpin) { disqualified = true; reason = `Need min ${R.minSpin} Spinner`; }
        else if(counts.FOREIGN < R.minForeignXI) { disqualified = true; reason = `Need min ${R.minForeignXI} Overseas`; }

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

        // LIVE LEADERBOARD
        const board = Object.values(r.playingXI).sort((a,b) => {
             if(b.rating !== a.rating) return b.rating - a.rating;
             return (b.purse || 0) - (a.purse || 0);
        });

        const totalTeams = Object.keys(r.squads).length;
        const submittedCount = Object.keys(r.playingXI).length;

        io.to(socket.room).emit("leaderboard", board);

        if(submittedCount >= totalTeams){
             io.to(socket.room).emit("logUpdate", "🏆 Tournament Complete! Final Results are out.");
        } else {
             const remaining = totalTeams - submittedCount;
             io.to(socket.room).emit("logUpdate", `⏳ Waiting for ${remaining} more teams...`);
        }
    });

}); // End io.on connection

/* ================= AUCTION ENGINE ================= */
function nextPlayer(r, room){
  if(!r.auction.live) return;

  if(r.auction.interval) {
    clearInterval(r.auction.interval);
    r.auction.interval = null;
  }

  let set = r.sets[r.currentSetIndex];

  // Move to next set if empty
  if (!set || set.length === 0) {
    r.currentSetIndex++;
    if (r.currentSetIndex >= r.sets.length) {
      endAuction(r, room);
      return;
    }
    set = r.sets[r.currentSetIndex];
    io.to(room).emit("logUpdate", `🔔 NEW SET: ${getSetName(set)}`);
  }

  // Pick player
  const randIdx = Math.floor(Math.random() * set.length);
  r.auction.player = set.splice(randIdx, 1)[0]; 
  
  broadcastSets(r, room); 

  // Reset Auction State
  r.auction.lastBidTeam = null;
  r.auction.bid = startBid(r.auction.player.rating);
  r.auction.team = null;
  r.auction.timer = 4;
  
  io.to(room).emit("newPlayer", {
    player: r.auction.player,
    bid: r.auction.bid,
    live: true,
    paused: false
  });

  // Start Timer
  r.auction.interval = setInterval(() => {
    if(r.auction.paused) return;
    
    io.to(room).emit("timer", r.auction.timer);
    r.auction.timer--;
    
    if(r.auction.timer < 0){
      clearInterval(r.auction.interval);
      resolvePlayer(r, room);
      setTimeout(() => nextPlayer(r, room), 1200);
    }
  }, 1000);
}

function resolvePlayer(r, room){
  const p = r.auction.player;

  if(r.auction.team){
    const team = r.auction.team;
    const squad = r.squads[team] || [];
    const foreignCount = squad.filter(pl => pl.foreign).length;

    // Rule Check
    if(
      squad.length < r.rules.maxPlayers &&
      (!p.foreign || foreignCount < r.rules.maxForeign) &&
      r.purse[team] >= r.auction.bid
    ){
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
    } else {
      // UNSOLD (Rule)
      io.to(room).emit("unsold", { player: p });
      io.to(room).emit("logUpdate", `❌ UNSOLD (rule limit): ${p.name}`);
    }
  } else {
    // UNSOLD (No Bids)
    io.to(room).emit("unsold", { player: p });
    io.to(room).emit("logUpdate", `❌ UNSOLD: ${p.name}`);
  }
}

function endAuction(r, room){
  if(r.auction.interval){
    clearInterval(r.auction.interval);
    r.auction.interval = null;
  }
  r.auction.live = false;
  r.auction.paused = true;
  r.phase = "xi";

  io.to(room).emit("auctionEnded");
  io.to(room).emit("startXI", r.squads);
  io.to(room).emit("squadData", r.squads);
}

const PORT = process.env.PORT || 2500; 
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
