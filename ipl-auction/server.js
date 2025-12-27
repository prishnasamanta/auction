const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PLAYERS = require("./players");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ================= CONSTANTS ================= */
//const TEAMS = ["CSK","MI","RCB","KKR","RR","DC","SRH","PBKS","GT","LSG"];
const rooms = {};


/* ================= HELPERS ================= */
function generateRoomCode(){
  return Math.random().toString(36).substring(2,7).toUpperCase();
}
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function startBid(r){
  if(r>=9) return 2;
  if(r>=8) return 1;
  return 0.5;
}
function incBid(b){
  if(b<1) return .05;
  if(b<10) return .1;
  return .2;
}
/* ================= HELPERS ================= */
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
/* ================= SOCKET ================= */
io.on("connection", socket => {
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
      minBat: 4,      // Default values (will be overwritten by setRules)
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
  socket.emit("joinedRoom", rooms[code].squads);
  
  // 👇 UPDATED: Send ALL sets using the helper
  broadcastSets(rooms[code], code);
});
socket.on("joinRoom", ({ roomCode, user }) => {
  const room = rooms[roomCode];
  if(!room) return;

  socket.join(roomCode);
  socket.room = roomCode;
  socket.user = user;
  socket.isAdmin = false;

  room.users[socket.id] = user;

  socket.emit("joinedRoom");
  // socket.emit("fullSet", room.players); <-- DELETE THIS LINE

  // 👇 UPDATED: Send ALL sets to the new joiner
  broadcastSets(room, roomCode);

  // If rules are locked AND user has not picked a team
  if(room.rulesLocked && !socket.team){
    socket.emit("needTeamSelection", {
      teams: room.availableTeams
    });
  }
});
socket.on("requestTeamState", () => {
  const room = rooms[socket.room];
  if(!room) return;

  // If rules are locked and this user has not picked a team
  if(room.rulesLocked && !socket.team){
    socket.emit("forceTeamPopup", {
      teams: room.availableTeams
    });
  }
});


socket.on("selectTeam", ({ team, user }) => {

  const r = rooms[socket.room];
  if(!r) return;

  // safety
  if(!Array.isArray(r.availableTeams)) return;

  // already picked
  if(socket.team) return;

  // team not available
  if(!r.availableTeams.includes(team)) return;

  socket.team = team;
  r.users[socket.id] = { name: user, team };
  r.squads[team] = [];
  r.purse[team] = r.rules.purse;

  // remove team
  r.availableTeams = r.availableTeams.filter(t => t !== team);

  // notify everyone
  io.to(socket.room).emit("teamPicked", {
    team,
    remaining: r.availableTeams
  });

  io.to(socket.room).emit(
    "logUpdate",
    `👕 ${user} selected ${team}`
  );
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

  // 🔒 ONLY lock rules here
  room.rulesLocked = true;

  io.to(socket.room).emit("rulesUpdated", {
    rules: room.rules,
    teams: room.availableTeams
  });

  // 🔥 START TEAM SELECTION FOR EVERYONE
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
      // Currently Paused -> RESUME
      r.auction.paused = false;
      io.to(socket.room).emit("auctionResumed");
    } else {
      // Currently Playing -> PAUSE
      r.auction.paused = true;
      io.to(socket.room).emit("auctionPaused");
    }
  }

  // 3. SKIP PLAYER (Current Player only)
  if(action === "skip"){
    if(!r.auction.player) return;
    const skippedPlayer = r.auction.player;

    // Clear timer
    if(r.auction.interval){
      clearInterval(r.auction.interval);
      r.auction.interval = null;
    }

    io.to(socket.room).emit("logUpdate", `⏭ ${skippedPlayer.name} skipped`);
    io.to(socket.room).emit("unsold", { player: skippedPlayer });

    setTimeout(() => {
      nextPlayer(r, socket.room);
    }, 800);
  }

  // 4. SKIP SET (Entire remaining set)
  if(action === "skipSet"){
    // Clear current timer
    if(r.auction.interval){
      clearInterval(r.auction.interval);
      r.auction.interval = null;
    }
    
    // Log it
    const currentSetName = getSetName(r.sets[r.currentSetIndex]);
    io.to(socket.room).emit("logUpdate", `⏩ SKIPPING REST OF: ${currentSetName}`);

    // 🔥 THE MAGIC: Empty the current set array
    // This forces nextPlayer() to see it as empty and jump to the next set index
    if(r.sets[r.currentSetIndex]){
        r.sets[r.currentSetIndex] = []; 
    }

    // Call nextPlayer immediately (it will handle the set transition)
    nextPlayer(r, socket.room);
  }

  // 5. END AUCTION
  if(action === "end"){
    endAuction(r, socket.room);
  }
});

  /* ================= BID ================= */
/* ================= BID ================= */
/* ================= BID ================= */
socket.on("bid", () => {

  const r = rooms[socket.room];
  if(!r || !socket.team) return;

  // 1. Basic checks
  if(!r.auction.live || r.auction.paused) return;

  // 2. Prevent double bidding
  if(r.auction.lastBidTeam === socket.team) return;

  // =====================================================
  // 👉 ADD THE LOGIC HERE (Before checking purse)
  // =====================================================
  
  // Define increment based on current price (Example: <10Cr = 0.2, >10Cr = 0.5)
  // You can also use your helper function: const increment = incBid(r.auction.bid);
  const increment = r.auction.bid < 10 ? 0.2 : 0.5; 
  
  // Calculate what the new bid total will be
  const nextBid = r.auction.bid + increment;

  // =====================================================

  // 3. Check if team has enough money
  const currentPurse = r.purse[socket.team];
  
  if(currentPurse < nextBid){
    socket.emit("bidRejected", "Insufficient purse");
    return;
  }

  // 4. ✅ Accept the bid (Update Server State)
  r.auction.bid = nextBid;
  r.auction.lastBidTeam = socket.team;
  r.auction.team = socket.team; // 🔥 CRITICAL FIX: Mark this team as the current winner
  r.auction.timer = 10;         // 🔥 OPTIONAL: Reset timer to 10s to give others time

  // 5. Notify everyone
  io.to(socket.room).emit("bidUpdate", {
    bid: r.auction.bid,
    team: socket.team
  });
  io.to(socket.room).emit("logUpdate", 
    `🟢 ${socket.team} bids ₹${r.auction.bid.toFixed(2)} Cr`
  );
});


  /* ================= CHAT ================= */
  socket.on("chat",data=>{
    io.to(socket.room).emit("chatUpdate",data);
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
/* ================= SUBMIT XI & VALIDATION ================= */
/* ================= SERVER: SUBMIT XI & LIVE LEADERBOARD ================= */
socket.on("submitXI", ({ xi }) => {
  const r = rooms[socket.room];
  if(!r || !socket.team) return;

  // 1. Flatten the XI to a single list of 11 players
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

  // 2. Calculate Stats
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

  // 3. VALIDATE RULES
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

  // 4. Save Result
  const finalRating = disqualified ? 0 : Number((totalRating / 11).toFixed(2));

  r.playingXI[socket.team] = {
    team: socket.team,
    rating: finalRating,
    disqualified: disqualified,
    reason: reason,
    xi: allPlayers,
    purse: r.purse[socket.team] // Save purse for tie-breaker
  };

  // 5. Feedback to User (Popup)
  socket.emit("submitResult", {
    success: true,
    rating: finalRating,
    disqualified: disqualified,
    reason: reason
  });

  io.to(socket.room).emit("logUpdate", `📝 ${socket.team} submitted Playing XI`);

  // =========================================================
  // 🔥 LIVE LEADERBOARD LOGIC
  // =========================================================
  
  // Generate the board based on whoever has submitted SO FAR
  const board = Object.values(r.playingXI).sort((a,b) => {
      // Sort by Rating (High to Low), then by Purse (High to Low)
      if(b.rating !== a.rating) return b.rating - a.rating;
      return (b.purse || 0) - (a.purse || 0);
  });

  // 1. Send to the USER who just submitted (So they see it immediately)
  socket.emit("leaderboard", board);

  // 2. Check if everyone is done
  const totalTeams = Object.keys(r.squads).length;
  const submittedCount = Object.keys(r.playingXI).length;

  if(submittedCount >= totalTeams){
      // Everyone is done: Broadcast final board to EVERYONE
      io.to(socket.room).emit("leaderboard", board);
      io.to(socket.room).emit("logUpdate", "🏆 Tournament Complete! Final Results are out.");
  } else {
      // Still waiting: Notify others that leaderboard updated
      // We broadcast to everyone so spectators can watch the race live
      io.to(socket.room).emit("leaderboard", board);
      
      const remaining = totalTeams - submittedCount;
      io.to(socket.room).emit("logUpdate", `⏳ Waiting for ${remaining} more teams...`);
  }
});
});
/* ================= PLAYING XI LEADERBOARD ================= */
function computeLeaderboard(room){
  const results = [];

  for(const sid in room.playingXI){
    const xi = room.playingXI[sid];
    const teamName = room.users[sid]?.team || "Unknown";

    const xiRating = xi.reduce((s,p)=>s+p.rating,0);

    results.push({
      team: teamName,
      xiRating
    });
  }

  return results.sort((a,b)=>b.xiRating - a.xiRating);
}
/* ================= AUCTION FLOW ================= */
function nextPlayer(r, room){
  if(!r.auction.live) return;

  // 1. Clear existing timer
  if(r.auction.interval) {
    clearInterval(r.auction.interval);
    r.auction.interval = null;
  }

  // 2. Get current active set
  let set = r.sets[r.currentSetIndex];

  // 3. If set is empty, move to next set
  if (!set || set.length === 0) {
    r.currentSetIndex++;
    
    // Check if auction ended
    if (r.currentSetIndex >= r.sets.length) {
      endAuction(r, room);
      return;
    }
    
    set = r.sets[r.currentSetIndex];
    io.to(room).emit("logUpdate", `🔔 NEW SET: ${getSetName(set)}`);
  }

  // 4. Pick RANDOM player
  const randIdx = Math.floor(Math.random() * set.length);
  r.auction.player = set.splice(randIdx, 1)[0]; 
  
  // 5. Send updated sets to everyone
  broadcastSets(r, room); 

  // ======================================================
  // 👇 THIS WAS MISSING IN YOUR CODE 👇
  // ======================================================

  // 6. Reset Auction State for new player
  r.auction.lastBidTeam = null;
  r.auction.bid = startBid(r.auction.player.rating);
  r.auction.team = null;
  r.auction.timer = 4; // Start countdown at 4s
  
  // 7. Notify Clients (Show the player on screen)
  io.to(room).emit("newPlayer", {
    player: r.auction.player,
    bid: r.auction.bid,
    live: true,
    paused: false
  });

  // 8. Start the Timer Loop
  r.auction.interval = setInterval(() => {
    if(r.auction.paused) return;
    
    io.to(room).emit("timer", r.auction.timer);
    r.auction.timer--;
    
    if(r.auction.timer < 0){
      clearInterval(r.auction.interval);
      resolvePlayer(r, room);
      // Wait 1.2s before showing next player
      setTimeout(() => nextPlayer(r, room), 1200);
    }
  }, 1000);
}

function resolvePlayer(r, room){
  const p = r.auction.player;

  // If someone placed a bid
  if(r.auction.team){

    const team = r.auction.team;
    const squad = r.squads[team] || [];
    const foreignCount = squad.filter(pl => pl.foreign).length;

    // ✅ RULE CHECK
    if(
      squad.length < r.rules.maxPlayers &&
      (!p.foreign || foreignCount < r.rules.maxForeign) &&
      r.purse[team] >= r.auction.bid
    ){
      // ✅ SUCCESSFUL PURCHASE
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

      io.to(room).emit(
        "logUpdate",
        `🔨 SOLD: ${p.name} → ${team} ₹${r.auction.bid.toFixed(2)} Cr`
      );
    io.to(room).emit("squadData", r.squads);

    } else {
      // ❌ RULE VIOLATION → UNSOLD
      io.to(room).emit("unsold", { player: p });

      io.to(room).emit(
        "logUpdate",
        `❌ UNSOLD (rule limit): ${p.name}`
      );
    }

  } else {
    // ❌ NO BIDS → UNSOLD
    io.to(room).emit("unsold", { player: p });

    io.to(room).emit(
      "logUpdate",
      `❌ UNSOLD: ${p.name}`
    );
  }
}

function endAuction(r, room){

  // ✅ STOP TIMER
  if(r.auction.interval){
    clearInterval(r.auction.interval);
    r.auction.interval = null;
  }

  // ✅ STOP AUCTION
  r.auction.live = false;
  r.auction.paused = true;

  r.phase = "xi";

  io.to(room).emit("auctionEnded");
  io.to(room).emit("startXI", r.squads);
  io.to(room).emit("squadData", r.squads);

}


/* ================= LEADERBOARD ================= */
function generateLeaderboard(r,room){
  const board=[];

  for(const t in r.playingXI){
    const xi=r.playingXI[t];
    const xiRating=[...xi.bats,...xi.bowls,...xi.wk,...xi.all,...xi.flex]
      .reduce((s,p)=>s+p.rating,0);

    const remaining=r.squads[t]
      .filter(p=>!Object.values(xi).flat().includes(p))
      .reduce((s,p)=>s+p.rating,0);

    board.push({
      team:t,
      xiRating,
      remaining,
      purse:r.purse[t]
    });
  }

  board.sort((a,b)=>
    b.xiRating-a.xiRating ||
    b.remaining-a.remaining ||
    b.purse-a.purse
  );

  io.to(room).emit("leaderboard",board);
}


const PORT = process.env.PORT || 3000; // <--- CHANGE THIS LINE
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
