const socket = io();

/* ================= DOM ================= */
const enterBtn=document.getElementById("enterBtn");
const continueBtn=document.getElementById("continueBtn");
const createBtn=document.getElementById("createBtn");
const joinBtn=document.getElementById("joinBtn");
const usernameInput=document.getElementById("username");
const codeInput=document.getElementById("code");
const roomOptions=document.getElementById("roomOptions");
const adminControls=document.getElementById("adminControls");
const teamSelect=document.getElementById("teamSelect");
const teamNotice=document.getElementById("teamNotice");
const playerName=document.getElementById("playerName");
const playerMeta=document.getElementById("playerMeta");
const startBidEl=document.getElementById("startBid");
const bidEl=document.getElementById("bid");
const timerEl=document.getElementById("timer");
const bidBtn=document.getElementById("bidBtn");
const auctionCard=document.getElementById("auctionCard");
const auctionResult=document.getElementById("auctionResult");
const logBox=document.getElementById("log");
const chatBox=document.getElementById("chat");
const msgInput = document.getElementById("msg");
const TEAM_COLORS = {
  CSK: "#facc15",
  MI: "#38bdf8",
  RCB: "#dc2626",
  KKR: "#a855f7",
  RR: "#fb7185",
  DC: "#60a5fa",
  SRH: "#fb923c",
  PBKS: "#ef4444",
  GT: "#0ea5e9",
  LSG: "#22c55e"
};


/* ================= RULES SAVE ================= */
document.getElementById("saveRules").onclick = () => {

  socket.emit("setRules", {
    maxPlayers: Number(document.getElementById("maxPlayers").value),
    maxForeign: Number(document.getElementById("maxForeign").value),
    purse: Number(document.getElementById("purse").value),
    minBat: Number(minBat.value),
    minAll: Number(minAll.value),
    minBowl: Number(minBowl.value),
    minSpin: Number(minSpin.value),
    minWK: Number(minWK.value)
  });

};


/* ================= SOUNDS ================= */
const soundBid=new Audio("/sounds/bid.mp3");
const soundHammer=new Audio("/sounds/sold.mp3");
const soundUnsold=new Audio("/sounds/unsold.mp3");
const soundTick=new Audio("/sounds/beep.mp3");

/* ================= STATE ================= */
let username="";
let roomCode="";
let myTeam=null;
let isHost=false;
let auctionLive=false;
let auctionPaused=false;
let lastBidTeam=null;
let fullSetPlayers=[];
let allSquads = {};     // team -> players[]
let teamPurse = {};    // team -> remaining purse
let lastTickSecond = null;
let rules = {};
let squadWindow = null;
let selectedSquadTeam = null;
let remainingSets = [];
let viewSetWindow = null; 


/* ================= SCREENS ================= */

function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* ================= LANDING ================= */
enterBtn.onclick=()=>showScreen("auth");
continueBtn.onclick=()=>{
  username=usernameInput.value.trim();
  if(!username) return alert("Enter name");
  usernameInput.disabled = true;
  continueBtn.classList.add("hidden");
  roomOptions.classList.remove("hidden");
};

/* ================= ROOM ================= */
createBtn.onclick=()=>{
  isHost=true;
  socket.emit("createRoom",{user:username});
};
joinBtn.onclick=()=>{
  roomCode=codeInput.value.trim();
  if(!roomCode) return alert("Enter room code");
  socket.emit("joinRoom",{roomCode,user:username});
};
socket.on("roomCreated", code => {
  roomCode = code;

  // 1. Hide Landing/Auth
  document.getElementById("landing").classList.add("hidden");
  document.getElementById("auth").classList.add("hidden");

  // 2. SHOW Auction UI (Background)
  document.getElementById("auctionUI").classList.remove("hidden"); 

  // 3. SHOW Rules Popup
  document.getElementById("rulesScreen").classList.remove("hidden");
  
  // LOCK SCROLLING so user can't scroll the background
  document.body.style.overflow = "hidden"; 

  document.getElementById("roomCodeText").innerText = code;
  document.getElementById("roomCodeBar").classList.remove("hidden");
});
socket.on("joinedRoom", (data) => {
    console.log("Joined Room Payload:", data);

    // 1. Sync Rules (if sent)
    if(data && data.rules) {
        activeRules = data.rules;
        // rules = data.rules; // Uncomment if needed
        // updateRulesUI();    // Uncomment if needed
    }
    
    // 2. Switch to Auction Screen
    showScreen("auctionUI");

    // --- 3. SHOW ROOM CODE (Critical Step) ---
    if (data.roomCode) {
        // Remove 'hidden' class so the box is visible
        document.getElementById("roomCodeBar").classList.remove("hidden");
        
        // Insert the actual code text
        document.getElementById("roomCodeText").innerText = data.roomCode;
    }

    // --- 4. HANDLE ADMIN BUTTONS ---
    // Only show Start/Stop buttons if the user is the Host
    const adminControls = document.getElementById("adminControls");
    if (data.isHost) {
        adminControls.classList.remove("hidden");
    } else {
        adminControls.classList.add("hidden");
    }

    // 5. Sync State
    socket.emit("checkAdmin");
    socket.emit("getAuctionState");
});


// Listen for the answer
socket.on("adminStatus", (isAdmin) => {
    isHost = isAdmin;
    if(isHost){
        document.getElementById("adminControls").classList.remove("hidden");
    } else {
        document.getElementById("adminControls").classList.add("hidden");
    }
});

socket.on("forceTeamPopup", ({ teams }) => {
  if(myTeam) return;

  const popup = document.getElementById("teamPopup");
  popup.classList.remove("hidden");

  renderTeamPopup(teams);
});


socket.on("startTeamSelection", ({ teams }) => {

  if(myTeam) return; 

  document.getElementById("teamPopup").classList.remove("hidden");

  renderTeamPopup(teams);
});

socket.on("needTeamSelection", ({ teams }) => {

  if(myTeam) return; // safety

  console.log("Late joiner → opening team popup");

  const popup = document.getElementById("teamPopup");
  popup.classList.remove("hidden");

  renderTeamPopup(teams);
});


/* ================= SET UPDATE ================= */
socket.on("setUpdate", data => {
  remainingSets = data; 

  if(viewSetWindow && !viewSetWindow.closed){
    viewSet(); 
  }
});


/* ================= TEAM ================= */
function renderTeams(teams){
  teamSelect.innerHTML="";
  teams.forEach(t=>{
    const b=document.createElement("button");
    b.innerText=t;
    b.onclick=()=>pickTeam(t);
    teamSelect.appendChild(b);
  });
}
function pickTeam(team){
  myTeam = team;
  socket.emit("selectTeam", { team, user: username });
}

/* ================= TEAM PICKED ================= */
socket.on("teamPicked", ({ team, remaining }) => {
  renderTeamPopup(remaining);
  socket.emit("getSquads");
  if(myTeam === team) {
      const teamPopup = document.getElementById("teamPopup");
      if(teamPopup) {
          teamPopup.classList.add("hidden");
          teamPopup.style.display = "none"; // Extra safety
      }
      const notice = document.getElementById("teamNotice");
      if(notice) notice.innerText = `You are: ${team}`;
  }
});

/* ================= RULES UPDATED ================= */
/* ================= RULES UPDATED ================= */
/* ================= RULES UPDATED ================= */
socket.on("rulesUpdated", data => {
  console.log("Rules Updated:", data);
  
  // 1. Update BOTH variables to ensure data is consistent
  rules = data.rules;
  activeRules = data.rules; 

  // 2. Hide the Waiting Screen
  document.getElementById("rulesScreen").classList.add("hidden");
  document.body.style.overflow = "auto"; 
  
  // 3. Show Team Selection
  document.getElementById("teamPopup").classList.remove("hidden");
  renderTeamPopup(data.teams);
  
  // 4. Show Admin Controls (if host)
  if(isHost){
      document.getElementById("adminControls").classList.remove("hidden");
  }

  // 5. 🔥 IMPORTANT: Refresh the Rules Popup UI immediately
  updateRulesUI();
});



function toggleRules(){
    const el = document.getElementById("activeRulesPopup");
    el.classList.toggle("hidden");
    if(!el.classList.contains("hidden")) updateRulesUI();
}
function updateRulesUI() {
    // Safety check
    if (!activeRules) return;

    // Helper to safely get value or show "---"
    const getVal = (val) => (val !== undefined && val !== null) ? val : "---";

    // Update the Popup Text
    const elPurse = document.getElementById('viewPurse');
    const elSquad = document.getElementById('viewSquadSize');
    const elForeign = document.getElementById('viewForeign');

    if(elPurse) elPurse.innerText = "₹" + getVal(activeRules.purse) + " Cr";
    if(elSquad) elSquad.innerText = getVal(activeRules.maxPlayers);
    if(elForeign) elForeign.innerText = getVal(activeRules.maxForeign);
    
    // Update Playing XI Requirements
    if(document.getElementById('viewBat')) document.getElementById('viewBat').innerText = getVal(activeRules.minBat);
    if(document.getElementById('viewBowl')) document.getElementById('viewBowl').innerText = getVal(activeRules.minBowl);
    if(document.getElementById('viewWK')) document.getElementById('viewWK').innerText = getVal(activeRules.minWK);
    if(document.getElementById('viewAR')) document.getElementById('viewAR').innerText = getVal(activeRules.minAll);
}



/* ================= ADMIN ================= */
const startBtn = document.getElementById("startBtn");
const togglePauseBtn = document.getElementById("togglePauseBtn"); // The Toggle Button
const skipBtn = document.getElementById("skipBtn");
const skipSetBtn = document.getElementById("skipSetBtn");         // The Skip Set Button

if(startBtn) startBtn.onclick = () => socket.emit("adminAction", "start");
if(skipBtn) skipBtn.onclick = () => socket.emit("adminAction", "skip");

if(togglePauseBtn) togglePauseBtn.onclick = () => socket.emit("adminAction", "togglePause");

if(skipSetBtn) skipSetBtn.onclick = () => {
    if(confirm("⚠ Are you sure you want to skip the rest of this set?")) {
        socket.emit("adminAction", "skipSet");
    }
};

function admin(action){
    socket.emit("adminAction", action);
}

/* ================= AUCTION ================= */
socket.on("auctionStarted",()=>{
  
  auctionLive=true;
  auctionPaused=false;
  teamSelect.innerHTML="";
  teamNotice.innerText="Auction Live 🔴";
  socket.emit("getSquads");
  if(isHost){
    adminControls.classList.remove("hidden");
  }  

});
socket.on("auctionState", s => {

  auctionLive = s.live;
  auctionPaused = s.paused;

  if(s.player){
    playerName.innerText = s.player.name;
    bidEl.innerText = `₹${s.bid.toFixed(2)} Cr`;
  }

  updateBidButton(s);
});

function updateBidButton(state){
  if(!myTeam || !auctionLive || auctionPaused){
    bidBtn.disabled = true;
    return;
  }

  if(teamPurse && teamPurse[myTeam] !== undefined && state){
    const currentBid = state.bid || 0;
    const nextBid = currentBid + 0.1; // Estimate next bid
    
    if(teamPurse[myTeam] < nextBid){
      bidBtn.disabled = true;
      return;
    }
  }

  // last bidder cannot bid again
  bidBtn.disabled = (lastBidTeam === myTeam);
}

socket.on("auctionPaused", () => {
    auctionPaused = true;
    bidBtn.disabled = true;
    lastTickSecond = null;
    updateBidButton();
    
    // 👇 Change Admin Button Text
    if(togglePauseBtn) {
        togglePauseBtn.innerText = "Resume ▶";
        togglePauseBtn.style.backgroundColor = "#22c55e"; // Green for Resume
    }
});

socket.on("auctionResumed", () => {
    auctionPaused = false;
    bidBtn.disabled = false;
    updateBidButton();
    
    // 👇 Change Admin Button Text
    if(togglePauseBtn) {
        togglePauseBtn.innerText = "Pause ⏸";
        togglePauseBtn.style.backgroundColor = "#eab308"; // Yellow for Pause
    }
});

/* ================= NEW PLAYER (RESET) ================= */
socket.on("newPlayer", d => {
  // 1. Reset Game State
  auctionLive = true;
  auctionPaused = false;
  lastBidTeam = null;
  lastTickSecond = null;
  
  updateBidButton({ bid: d.bid });

  document.getElementById('resultOverlay').classList.add('hidden'); // Hide Stamp
  document.getElementById('currentBidder').classList.add('hidden'); // Hide Badge

  playerName.innerText = d.player.name;
  playerMeta.innerText = `${d.player.role} • ⭐${d.player.rating}`;
  bidEl.innerText = `₹${d.bid.toFixed(2)} Cr`;
  bidBtn.disabled = !myTeam;
});
let activeRules = {
    purse: 120,
    maxPlayers: 25,
    maxForeign: 8,
    minBat: 3,
    minBowl: 3,
    minWK: 1,
    minAll: 1
};

socket.on('syncRules', (serverRules) => {
    console.log("Rules synced:", serverRules);
    activeRules = serverRules;
    // Update UI if the popup happens to be open
    updateRulesUI(); 
});

function showRules() {
    updateRulesUI();
    document.getElementById('viewRulesOverlay').classList.remove('hidden');
}
function updateRulesUI() {
    // 1. Safety Check
    const r = activeRules || {};
    const val = (v) => (v !== undefined && v !== null) ? v : "---";

    // 2. Update PLAYING XI SCREEN (Hidden screen)
    const elPurse = document.getElementById('viewPurse');
    const elSquad = document.getElementById('viewSquadSize');
    const elForeign = document.getElementById('viewForeign');

    if(elPurse) elPurse.innerText = val(r.purse);
    if(elSquad) elSquad.innerText = val(r.maxPlayers);
    if(elForeign) elForeign.innerText = val(r.maxForeign);

    // 3. Update POPUP OVERLAY (The one you are looking at)
    const popPurse = document.getElementById('pop_viewPurse');
    const popSquad = document.getElementById('pop_viewSquadSize');
    const popForeign = document.getElementById('pop_viewForeign');
    
    if(popPurse) popPurse.innerText = val(r.purse);
    if(popSquad) popSquad.innerText = val(r.maxPlayers);
    if(popForeign) popForeign.innerText = val(r.maxForeign);

    // 4. Update POPUP REQUIREMENTS
    const setTxt = (id, v) => {
        const el = document.getElementById(id);
        if(el) el.innerText = val(v);
    };

    setTxt('pop_viewBat', r.minBat);
    setTxt('pop_viewBowl', r.minBowl);
    setTxt('pop_viewSpin', r.minSpin);
    setTxt('pop_viewWK', r.minWK);
    setTxt('pop_viewAR', r.minAll); // Ensure your variable is minAll (or minAR)
}


function closeRules(event) {
    if (event.target.id === 'viewRulesOverlay') {
        document.getElementById('viewRulesOverlay').classList.add('hidden');
    }
}

/* ================= TIMER ================= */
socket.on("timer", t => {
  timerEl.innerText = "⏱ " + t;
  
  // ❌ no sound if auction paused or not live
  if(!auctionLive || auctionPaused) return;

  // 🔔 beep ONLY at 3,2,1 and ONLY once per second
  if(t <= 3 && t > 0 && t !== lastTickSecond){
    lastTickSecond = t;

    soundTick.pause();
    soundTick.currentTime = 0;
    soundTick.play().catch(()=>{});
  }
});

/* ================= BID ================= */
function bid(){
  if(!myTeam){
    alert("Select a team");
    return;
  }

  if(!auctionLive || auctionPaused) return;
  if(lastBidTeam === myTeam) return;
  if(bidBtn.disabled) return; // safety

  soundBid.currentTime = 0;
  soundBid.play().catch(()=>{});

  socket.emit("bid"); 
}

bidBtn.onclick=bid;

/* ================= BID UPDATE ================= */
socket.on("bidUpdate", data => {
  bidEl.innerText = `₹${data.bid.toFixed(2)} Cr`;
  lastBidTeam = data.team; 
  updateBidButton({ bid: data.bid });
  bidBtn.disabled = (myTeam === data.team); 
  const color = TEAM_COLORS[data.team] || "#22c55e";
  document.documentElement.style.setProperty("--accent", color);
  const badge = document.getElementById('currentBidder');
  const badgeName = document.getElementById('bidderName');
  
  badge.classList.remove('hidden'); // Reveal the badge
  badgeName.innerText = data.team;
  badge.style.borderColor = color;
  badge.style.boxShadow = `0 0 15px ${color}66`; 
  auctionCard.classList.add("pulse");
  setTimeout(() => auctionCard.classList.remove("pulse"), 300);
});

/* ================= SOLD / UNSOLD ================= */
socket.on("sold", d => {
  soundHammer.pause();
  soundHammer.currentTime = 0;
  soundHammer.play();
  const color = TEAM_COLORS[d.team] || "#22c55e";
  const overlay = document.getElementById('resultOverlay');
  const title = document.getElementById('stampTitle');
  const detail = document.getElementById('stampDetail');
  const container = document.querySelector('.stamp-container');

  title.innerText = "SOLD";
  detail.innerText = `TO ${d.team}`;
  container.classList.remove('unsold'); // Ensure it's not red
  container.style.borderColor = color; 
  overlay.classList.remove('hidden');
  allSquads[d.team] = allSquads[d.team] || [];
  allSquads[d.team].push(d.player);

  if(d.purse){
    teamPurse = d.purse;
  }
});

socket.on("unsold", () => {
  soundUnsold.pause();
  soundUnsold.currentTime = 0;
  soundUnsold.play();
  
  bidBtn.disabled = true;
  const overlay = document.getElementById('resultOverlay');
  const title = document.getElementById('stampTitle');
  const detail = document.getElementById('stampDetail');
  const container = document.querySelector('.stamp-container');

  title.innerText = "UNSOLD";
  detail.innerText = "PASSED IN";
  container.classList.add('unsold'); // Adds red styling
  container.style.borderColor = "";  
  overlay.classList.remove('hidden');
});

socket.on("bidRejected", msg => {
  alert("❌ " + msg);
  bidBtn.disabled = true;
});

/* ================= PLAYER SET ================= */

socket.on("fullSet",players=>{
  fullSetPlayers=players;
});
function viewSet(){
  if(!remainingSets || remainingSets.length === 0){
    alert("No sets remaining!");
    return;
  }
  if(!viewSetWindow || viewSetWindow.closed){
     viewSetWindow = window.open("", "ViewSetWindow", "width=480,height=650");
  } else {
     viewSetWindow.focus();
  }

  const activeSet = remainingSets[0]; // Topmost is current

  viewSetWindow.document.open();
  viewSetWindow.document.write(`
    <html>
    <head>
      <title>Auction Sets</title>
      <style>
        body{font-family:sans-serif;padding:15px;background:#111;color:#fff}
        
        /* Set Headers */
        h2.set-title {
            background: #222; padding: 10px; border-radius: 6px;
            margin-top: 20px; border-left: 5px solid #444;
            font-size: 1.1rem; text-transform: uppercase;
        }
        h2.active {
            background: #2a1a00; border-left: 5px solid #facc15; color: #facc15;
        }
        .p {
          display:flex; justify-content:space-between;
          padding: 6px 10px; border-bottom:1px solid #333;
          align-items:center; color: #ccc;
        }
        .p.active-p { color: #fff; font-weight: bold; } /* Brighter for active set */
        
        .role {
            background:#333; color:#fff; 
            padding:2px 6px; border-radius:4px; font-size:0.75rem;
        }
        .rating { color:#facc15; font-size: 0.9rem; }
        .meta { display:flex; align-items:center; gap: 8px; }
      </style>
    </head>
    <body>
      
      <h2 class="set-title active">🔥 ${activeSet.name} (${activeSet.players.length})</h2>
      <div>
        ${activeSet.players.map(p => `
          <div class="p active-p">
            <span>${p.name}</span>
            <div class="meta">
                <span class="role">${p.role}</span>
                <span class="rating">⭐ ${p.rating}</span>
            </div>
          </div>
        `).join("")}
        ${activeSet.players.length===0 ? '<div class="p" style="color:#666">Set Finished</div>' : ''}
      </div>

      ${remainingSets.slice(1).map(set => `
          <h2 class="set-title">📦 ${set.name} (${set.players.length})</h2>
          <div style="opacity: 0.6;"> ${set.players.map(p => `
              <div class="p">
                <span>${p.name}</span>
                <div class="meta">
                    <span class="role">${p.role}</span>
                    <span class="rating">⭐ ${p.rating}</span>
                </div>
              </div>
            `).join("")}
          </div>
      `).join("")}

    </body>
    </html>
  `);
  viewSetWindow.document.close();
}


socket.on("squadData", squads => {
  allSquads = squads;

  const sel = document.getElementById("squadSelect");
  if(sel){
    sel.innerHTML = `<option value="">🧢 View Squad</option>`;
    Object.keys(squads).forEach(team=>{
      const opt=document.createElement("option");
      opt.value=team;
      opt.innerText=team;
      sel.appendChild(opt);
    });
  }
  renderSquadWindow();
});

function showSelectedSquad(){

  const team = document.getElementById("squadSelect").value;
  if(!team) return;

  selectedSquadTeam = team;

  if(!squadWindow || squadWindow.closed){
    squadWindow = window.open("", "_blank", "width=450,height=650");
  }

  renderSquadWindow();
}
function renderSquadWindow(){

  if(!squadWindow || squadWindow.closed || !selectedSquadTeam) return;

  const squad = allSquads[selectedSquadTeam] || [];
  const purse = teamPurse?.[selectedSquadTeam];

  const roles = { BAT: [], WK: [], ALL: [], BOWLER: [] };

  squad.forEach(p => {
    if(p.role === "BAT") roles.BAT.push(p);
    else if(p.role === "WK") roles.WK.push(p);
    else if(p.role === "ALL") roles.ALL.push(p);
    else roles.BOWLER.push(p);
  });

  squadWindow.document.open();
  squadWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${selectedSquadTeam} Squad</title>
      <style>
        body{font-family:Arial;padding:15px;background:#111;color:#fff}
        h2{text-align:center}
        h3{margin-top:15px;border-bottom:1px solid #444}
        li{padding:4px 0}
      </style>
    </head>
    <body>
      <h2>${selectedSquadTeam} Squad</h2>
      <p><b>Remaining Purse:</b>
        ${typeof purse==="number" ? `₹${purse.toFixed(2)} Cr` : "—"}
      </p>

      ${Object.keys(roles).map(r=>`
        <h3>${r}</h3>
        <ul>
          ${roles[r].length
            ? roles[r].map(p=>`
              <li>${p.name} ⭐${p.rating} — ₹${p.price?.toFixed(2) ?? "—"} Cr</li>
            `).join("")
            : "<li>—</li>"
          }
        </ul>
      `).join("")}
    </body>
    </html>
  `);
  squadWindow.document.close();
}


/* ================= CHAT ================= */
function sendChat(){
  if(!msgInput.value.trim()) return;
  socket.emit("chat",{user:username,team:myTeam||"Viewer",msg:msgInput.value});
  msgInput.value="";
}
socket.on("chatUpdate",d=>{
  chatBox.innerHTML+=`<b>${d.team} (${d.user}):</b> ${d.msg}<br>`;
  chatBox.scrollTop=chatBox.scrollHeight;
});

/* ================= LOG ================= */
socket.on("logUpdate",msg=>{
  const div=document.createElement("div");
  div.innerText=msg;
  logBox.appendChild(div);
  logBox.scrollTop=logBox.scrollHeight;
});
/* ================= PLAYING XI LOGIC ================= */
let selectedXI = {
  BAT: [],
  BOWL: [], 
  WK: [],
  ALL: []
};

socket.on("mySquad", ({ squad }) => {
  const box = document.getElementById("mySquadList");

  if(!squad) return;
  selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
  box.style.pointerEvents = "auto";
  box.style.opacity = "1";
  const submitBtn = document.querySelector("button[onclick='submitXI()']");
  if(submitBtn) {
      submitBtn.innerText = "Submit XI (0/11)";
      submitBtn.disabled = false;
  }

  box.innerHTML = `<div class="xi-container" id="xiContainer"></div>`;
  const container = document.getElementById("xiContainer");

  const groups = {
    WK: { title: "Wicket Keepers", players: [] },
    BAT: { title: "Batsmen", players: [] },
    ALL: { title: "All Rounders", players: [] },
    BOWL: { title: "Bowlers", players: [] } 
  };

  squad.forEach(p => {
    if(p.role === "WK") groups.WK.players.push(p);
    else if(p.role === "BAT") groups.BAT.players.push(p);
    else if(p.role === "ALL") groups.ALL.players.push(p);
    else groups.BOWL.players.push(p);
  });

  Object.keys(groups).forEach(key => {
    const g = groups[key];
    const col = document.createElement("div");
    col.className = "role-group";
    col.innerHTML = `<div class="role-header">${g.title}</div>`;

    g.players.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "xi-player";
      btn.innerHTML = `${p.name} <br><small>⭐${p.rating}</small>`; 
      btn.onclick = (e) => {
          e.preventDefault(); 
          assignPlayer(p, btn, key);
      };
      
      col.appendChild(btn);
    });
    container.appendChild(col);
  });
  
  updateXIPreview();
});

function assignPlayer(p, btn, groupKey){
  if(!selectedXI[groupKey]) selectedXI[groupKey] = [];
  const list = selectedXI[groupKey];
  const index = list.findIndex(x => x.name === p.name);

  if(index > -1){
    list.splice(index, 1);
    btn.classList.remove("picked");
  } else {
    const total = countTotalXI();
    if(total >= 11) {
        alert("⚠️ You have already selected 11 players!");
        return;
    }
    list.push(p);
    btn.classList.add("picked");
  }
  
  updateXIPreview();
}
function countTotalXI(){
    return (selectedXI.BAT?.length || 0) + 
           (selectedXI.WK?.length || 0) + 
           (selectedXI.ALL?.length || 0) + 
           (selectedXI.BOWL?.length || 0);
}
function updateXIPreview() {
    const count = countTotalXI();
    const submitBtn = document.getElementById("submitXIBtn") || document.querySelector("button[onclick='submitXI()']");
    if(submitBtn) {
        submitBtn.innerText = `Submit XI (${count}/11)`;
        
        // Visual cue on button
        if(count === 11) {
            submitBtn.style.backgroundColor = "#22c55e"; // Green
            submitBtn.style.color = "#000";
            submitBtn.disabled = false;
        } else {
            submitBtn.style.backgroundColor = ""; 
            submitBtn.style.color = "";
        }
    }
    const box = document.getElementById("xiPreviewContent");
    if(!box) return;
    box.innerHTML = "";
    const displayConfig = [
        { key: 'WK', label: 'Wicket Keepers' },
        { key: 'BAT', label: 'Batsmen' },
        { key: 'ALL', label: 'All-Rounders' },
        { key: 'BOWL', label: 'Bowlers' }
    ];

    displayConfig.forEach(conf => {
        const players = selectedXI[conf.key] || []; 
        const row = document.createElement("div");
        row.className = "preview-row";
        const labelDiv = document.createElement("div");
        labelDiv.className = "preview-label";
        labelDiv.innerText = `${conf.label} (${players.length})`;

        // Create the player names list
        const namesDiv = document.createElement("div");
        namesDiv.className = "preview-players";

        if(players.length === 0) {
            namesDiv.innerHTML = `<span style="color:#555">—</span>`;
        } else {
            // Map players to small tags
            namesDiv.innerHTML = players.map(p => 
                `<span class="p-tag">${p.name}</span>`
            ).join(" ");
        }

        // Append to row, then to box
        row.appendChild(labelDiv);
        row.appendChild(namesDiv);
        box.appendChild(row);
    });
}


// 6. Submit Logic
function submitXI(){
  const total = countTotalXI();
  
  if(total !== 11){
    alert(`❌ Incomplete XI. You have selected ${total} players. Need exactly 11.`);
    return;
  }
  if(confirm("Confirm Playing XI? This cannot be changed.")){
      socket.emit("submitXI", { xi: selectedXI });
      const box = document.getElementById("mySquadList");
      box.style.opacity = "0.5";
      box.style.pointerEvents = "none"; // 👈 This locks it (Reset in step 2)
      
      const submitBtn = document.querySelector("button[onclick='submitXI()']");
      if(submitBtn) submitBtn.innerText = "Submitted... Waiting for others";
  }
}
/* ================= LOGIC: PLAYING XI & LEADERBOARD ================= */
socket.on("submitResult", (res) => {
    document.getElementById("xiSelectionArea").classList.add("hidden");
    document.getElementById("submitXIBtn").classList.add("hidden");
    const statusBox = document.getElementById("xiStatus");
    statusBox.innerHTML = `
        <div class="glass" style="text-align:center; padding:20px; border:1px solid ${res.disqualified ? 'red' : '#22c55e'}">
            <h2 style="color:${res.disqualified ? '#ef4444' : '#22c55e'}">
                ${res.disqualified ? '❌ DISQUALIFIED' : '✅ SUBMITTED'}
            </h2>
            <p style="font-size:1.2rem; margin:10px 0;">
                Your Rating: <b>${res.rating}</b>
            </p>
            ${res.disqualified ? `<p style="color:#fca5a5">Reason: ${res.reason}</p>` : ''}
            <div id="waitingMsg" style="margin-top:20px; color:#aaa; font-style:italic;">
                ⏳ Waiting for other teams to finish...
            </div>
        </div>
    `;
    const btn = document.getElementById("submitXIBtn");
    if(btn) { btn.disabled = true; btn.innerText = "Submitted"; }
});

socket.on("leaderboard", (board) => {
    console.log("Board Update:", board);
    const myTeamName = myTeam; 
    const isMyTeamDone = board.find(t => t.team === myTeamName);
    const miniBox = document.getElementById("leaderboardBox");
    if(miniBox) {
        miniBox.innerHTML = "<h4 style='border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:10px;'>🔴 Live Standings</h4>";
        board.forEach((t, i) => {
            miniBox.innerHTML += `
                <div style="display:flex; justify-content:space-between; font-size:0.9rem; padding:4px 0;">
                    <span>#${i+1} ${t.team}</span>
                    <span style="font-weight:bold; color:${t.disqualified?'red':'#4ade80'}">${t.rating}</span>
                </div>
            `;
        });
    }
    if(isMyTeamDone) {
        const waitingMsg = document.getElementById("waitingMsg");
        if(waitingMsg) {
            waitingMsg.innerHTML = `
                <br>
                📊 <b>Current Rank:</b> #${board.findIndex(t => t.team === myTeam) + 1} / ${board.length} Teams Submitted
                <br><br>
                <button onclick="showScreen('leaderboard')" class="primary-btn">View Full Leaderboard</button>
            `;
        }
    }
});

socket.on("xiError", msg => alert(msg));
function renderTeamPopup(teams){
  const box = document.getElementById("teamSelectList");
  if(!box) return;
  box.innerHTML = "";
  teams.sort(); // Keep alphabetical order
  teams.forEach(team => {
    const btn = document.createElement("button");
    btn.innerText = team;
    btn.className = "team-btn";
    const color = TEAM_COLORS[team] || "#94a3b8";
    btn.style.setProperty("--team-color", color);
    btn.onclick = () => {
      myTeam = team;
      socket.emit("selectTeam", { team, user: username });
    };
    box.appendChild(btn);
  });
}

/* ================= END ================= */
socket.on("auctionEnded", () => {
  showScreen("playingXI");
  socket.emit("getMySquad");
});
socket.on("leaderboard", board => {
  const box = document.getElementById("leaderboardBox");
  box.innerHTML = "<h2>🏆 Final Leaderboard</h2>";
  board.forEach((t,i)=>{
    box.innerHTML += `
      <div class="row">
        <b>${i+1}. ${t.team}</b> —
        ${t.disqualified
          ? "❌ Disqualified"
          : `⭐ Rating: ${t.rating}`
        }
      </div>
    `;
  });
});
