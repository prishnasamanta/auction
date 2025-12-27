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
let viewSetWindow = null; // 👈 Add this line
/* ================= STATE ================= 
// ... existing variables ...
let currentSetPlayers = []; // Store only the current set
let currentSetName = "";

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
socket.on("roomCreated",code=>{
  roomCode=code;
  alert("Room Code: "+code);

  // show auction UI in background
  showScreen("auctionUI");

  // show rules as popup
  document.getElementById("rulesScreen").classList.remove("hidden");
  document.getElementById("roomCodeText").innerText = code;
  document.getElementById("roomCodeBar").classList.remove("hidden");

  // keep admin controls hidden until rules locked
  //adminControls.classList.add("hidden");
});
socket.on("joinedRoom", (data) => {
    // Save rules if sent
    if(data && data.rules) {
        activeRules = data.rules;
        updateRulesUI();
    }
    
    showScreen("auctionUI");
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

  if(myTeam) return; // already picked

  // FORCE popup visible
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
/* ================= SET UPDATE ================= */
/* ================= SET UPDATE ================= */
socket.on("setUpdate", data => {
  remainingSets = data; // Store the full list
  
  // Auto-refresh if open
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
  
  // 1. Re-render list for others
  renderTeamPopup(remaining);

  // 2. Update Squads Data
  socket.emit("getSquads");

  // 3. 🔥 FORCE HIDE IF IT WAS ME
  // We check if the picked team matches the one I selected
  if(myTeam === team) {
      const teamPopup = document.getElementById("teamPopup");
      if(teamPopup) {
          teamPopup.classList.add("hidden");
          teamPopup.style.display = "none"; // Extra safety
      }
      
      // Update header info immediately
      const notice = document.getElementById("teamNotice");
      if(notice) notice.innerText = `You are: ${team}`;
  }
});




/* ================= RULES UPDATED ================= */
socket.on("rulesUpdated", data => {
  console.log("Rules Updated:", data); // Debugging

  // 1. Update Global Rules
  rules = data.rules;

  // 2. 🔥 FORCE HIDE RULES SCREEN
  const rulesScreen = document.getElementById("rulesScreen");
  if(rulesScreen) rulesScreen.classList.add("hidden");

  // 3. FORCE SHOW TEAM SELECTION
  const teamPopup = document.getElementById("teamPopup");
  if(teamPopup) teamPopup.classList.remove("hidden");

  // 4. Render the teams
  renderTeamPopup(data.teams);

  // 5. Show Admin Controls (if host)
  if(isHost){
      const controls = document.getElementById("adminControls");
      if(controls) controls.classList.remove("hidden");
  }
});

function toggleRules(){
    const el = document.getElementById("activeRulesPopup");
    el.classList.toggle("hidden");
    
    // Refresh content when opened
    if(!el.classList.contains("hidden")) updateRulesUI();
}

function updateRulesUI(){
    const list = document.getElementById("activeRulesList");
    const xiDisplay = document.getElementById("xiRulesDisplay"); // The box in XI screen
    
    if(!activeRules || Object.keys(activeRules).length === 0) return;

    // Readable HTML for rules
    const html = `
        <ul style="list-style:none; padding:0; line-height:1.6;">
            <li>💰 <b>Purse:</b> ₹${activeRules.purse} Cr</li>
            <li>👥 <b>Max Squad:</b> ${activeRules.maxPlayers}</li>
            <li>✈️ <b>Max Foreign:</b> ${activeRules.maxForeign}</li>
            <hr style="border-color:#444; margin:8px 0;">
            <li>🏏 <b>Batsmen:</b> Min ${activeRules.minBat}</li>
            <li>⚾ <b>Bowlers:</b> Min ${activeRules.minBowl}</li>
            <li>🧤 <b>Wicket Keepers:</b> Min ${activeRules.minWK}</li>
            <li>⚔️ <b>All-Rounders:</b> Min ${activeRules.minAll}</li>
            <li>🌀 <b>Spinners:</b> Min ${activeRules.minSpin}</li>
            <li>🌍 <b>Foreign (XI):</b> Max 4</li>
        </ul>
    `;

    // 1. Update Popup
    if(list) list.innerHTML = html;

    // 2. Update XI Screen Box
    if(xiDisplay) xiDisplay.innerHTML = "<b>⚠️ Selection Criteria:</b> <br>" + 
        `Bat: ${activeRules.minBat}+ | Bowl: ${activeRules.minBowl}+ | WK: ${activeRules.minWK}+ | All: ${activeRules.minAll}+ | Spin: ${activeRules.minSpin}+ | Foreign: Max 4`;
}
/* ================= ADMIN ================= */
// 1. Select the buttons
const startBtn = document.getElementById("startBtn");
const togglePauseBtn = document.getElementById("togglePauseBtn"); // The Toggle Button
const skipBtn = document.getElementById("skipBtn");
const skipSetBtn = document.getElementById("skipSetBtn");         // The Skip Set Button

// 2. Add Click Listeners
if(startBtn) startBtn.onclick = () => socket.emit("adminAction", "start");
if(skipBtn) skipBtn.onclick = () => socket.emit("adminAction", "skip");

// Logic for Toggle Button (Pause/Resume)
if(togglePauseBtn) togglePauseBtn.onclick = () => socket.emit("adminAction", "togglePause");

// Logic for Skip Set Button
if(skipSetBtn) skipSetBtn.onclick = () => {
    if(confirm("⚠ Are you sure you want to skip the rest of this set?")) {
        socket.emit("adminAction", "skipSet");
    }
};

// 3. Helper for 'end' or other manual calls
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

  // Only check purse if we actually have purse data
  // logic: if we know the purse, and the purse < next bid, disable.
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
  auctionLive = true;
  auctionPaused = false;
  lastBidTeam = null;
  lastTickSecond = null;
  
  updateBidButton({ bid: d.bid });

  // Reset Card Styles
  auctionCard.classList.remove("sold", "unsold");
  
  // 👇 UPDATED: Clear visual state, but keep space occupied
  auctionResult.style.backgroundColor = "transparent"; // Remove color
  auctionResult.style.boxShadow = "none";              // Remove glow
  auctionResult.innerText = "";                        // Clear text
  auctionResult.classList.remove("visible");           // Remove animation class

  // Update Player Info
  playerName.innerText = d.player.name;
  playerMeta.innerText = `${d.player.role} • ⭐${d.player.rating}`;
  //startBidEl.innerText = `₹${d.bid.toFixed(2)} Cr`;
  bidEl.innerText = `₹${d.bid.toFixed(2)} Cr`;

  bidBtn.disabled = !myTeam;
});



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

  socket.emit("bid"); // 🔥 DO NOT disable here
}

bidBtn.onclick=bid;
/* ================= BID UPDATE ================= */
socket.on("bidUpdate", data => {
  // 1. Update Price
  bidEl.innerText = `₹${data.bid.toFixed(2)} Cr`;

  // 2. Logic
  lastBidTeam = data.team; 
  updateBidButton({ bid: data.bid });

  // 3. Colors
  const color = TEAM_COLORS[data.team] || "#22c55e";
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent2", color);

  // 4. Pulse
  auctionCard.classList.add("pulse");
  setTimeout(() => auctionCard.classList.remove("pulse"), 300);

  // 5. Button State
  bidBtn.disabled = (myTeam === data.team);

  // 👇 UPDATED: Fill the result box
  auctionResult.style.backgroundColor = color; // Fill with team color
  auctionResult.style.boxShadow = `0 4px 15px ${color}66`; // Add glow
  auctionResult.innerText = `${data.team} LEADS`; // Text
  
  // Trigger pop animation
  auctionResult.classList.remove("visible");
  void auctionResult.offsetWidth; 
  auctionResult.classList.add("visible");
});





/* ================= SOLD / UNSOLD ================= */
/* ================= SOLD / UNSOLD ================= */
socket.on("sold", d => {
  auctionCard.classList.remove("unsold");
  auctionCard.classList.add("sold");
  const color = TEAM_COLORS[d.team] || "#22c55e"; // Winner color
  
  auctionResult.style.display = "block";
  auctionResult.style.backgroundColor = color;
  // Ensure text is white and visible
  auctionResult.style.color = "#fff";
  auctionResult.innerText =
    `🔨 SOLD to ${d.team} for ₹${d.price.toFixed(2)} Cr`;

  soundHammer.pause();
  soundHammer.currentTime = 0;
  soundHammer.play();

  //bidBtn.disabled = true;

  // ✅ STEP 3 START: map player to team squad
  allSquads[d.team] = allSquads[d.team] || [];
  allSquads[d.team].push(d.player);

  // ✅ keep purse in sync (from server)
  if(d.purse){
    teamPurse = d.purse;
  }
  // ✅ STEP 3 END
});

socket.on("unsold",()=>{
  auctionCard.classList.remove("sold");
  auctionCard.classList.add("unsold");
  auctionResult.style.display = "block";
  auctionResult.style.backgroundColor = "#555"; // Grey background
  //auctionResult.innerText = "❌ UNSOLD";
  auctionResult.innerText="❌ UNSOLD";
  soundUnsold.pause();
  soundUnsold.currentTime=0;
  soundUnsold.play();
  bidBtn.disabled=true;
  
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

  // Reuse window logic
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

        /* Player Rows */
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

  // 🔥 AUTO-UPDATE OPEN SQUAD WINDOW
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

// Define this globally as you did
let selectedXI = {
  BAT: [],
  BOWL: [], 
  WK: [],
  ALL: []
};

socket.on("mySquad", ({ squad }) => {
  const box = document.getElementById("mySquadList");
  
  // 1. SAFETY: Ensure squad exists
  if(!squad) return;

  // 2. 🔥 CRITICAL FIX: Reset the selection state every time the screen loads
  // This prevents "Already selected 11" errors when the UI is refreshed
  selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
  
  // 3. Unlock UI (in case it was locked from a previous submit)
  box.style.pointerEvents = "auto";
  box.style.opacity = "1";
  
  // Reset Submit Button Text
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
    // Map roles specifically
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
      btn.innerHTML = `${p.name} <br><small>⭐${p.rating}</small>`; // Added HTML for better look
      
      // Click Handler
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
  // Safety check: ensure the array exists
  if(!selectedXI[groupKey]) selectedXI[groupKey] = [];
  
  const list = selectedXI[groupKey];
  
  // Check if player is already in the list
  const index = list.findIndex(x => x.name === p.name);

  if(index > -1){
    // REMOVE PLAYER
    list.splice(index, 1);
    btn.classList.remove("picked");
  } else {
    // ADD PLAYER
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

// 4. Counting Helper (Safe calculation)
function countTotalXI(){
    // Uses optional chaining (?.) to prevent crashes if a key is missing
    return (selectedXI.BAT?.length || 0) + 
           (selectedXI.WK?.length || 0) + 
           (selectedXI.ALL?.length || 0) + 
           (selectedXI.BOWL?.length || 0);
}
function updateXIPreview() {
    // 1. Calculate Count
    const count = countTotalXI();
    
    // 2. Update Button Text (Existing Logic)
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
            // Optional: disable button until 11 are picked
            // submitBtn.disabled = true; 
        }
    }

    // 3. 🔥 NEW: Render the Selected List
    const box = document.getElementById("xiPreviewContent");
    if(!box) return;

    // Clear previous
    box.innerHTML = "";

    // Define display order and labels
    const displayConfig = [
        { key: 'WK', label: 'Wicket Keepers' },
        { key: 'BAT', label: 'Batsmen' },
        { key: 'ALL', label: 'All-Rounders' },
        { key: 'BOWL', label: 'Bowlers' }
    ];

    displayConfig.forEach(conf => {
        const players = selectedXI[conf.key] || []; // Get players for this role
        
        // Create the row div
        const row = document.createElement("div");
        row.className = "preview-row";

        // Create the count label (e.g., "Batsmen (3)")
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
      
      // Disable UI to prevent double submit
      const box = document.getElementById("mySquadList");
      box.style.opacity = "0.5";
      box.style.pointerEvents = "none"; // 👈 This locks it (Reset in step 2)
      
      const submitBtn = document.querySelector("button[onclick='submitXI()']");
      if(submitBtn) submitBtn.innerText = "Submitted... Waiting for others";
  }
}

// 7. Result Feedback
socket.on("submitResult", (res) => {
    if(res.success){
        let msg = res.disqualified 
            ? `❌ DISQUALIFIED: ${res.reason}` 
            : `✅ Team Rating: ${res.rating}`;
        
        alert(msg);
        
        // Ensure we switch to leaderboard screen if needed
        // showScreen("leaderboardScreen"); (Optional: Wait for full leaderboard)
    }
});
/* ================= LEADERBOARD RENDER ================= */
socket.on("leaderboard", board => {
  console.log("Leaderboard received:", board);

  // 1. Force Screen Switch (Only if user has submitted or auction is over)
  // If the user hasn't submitted yet, we might not want to yank them away from selection
  // But usually, showing the final results is fine.
  
  // Logic: If I have submitted (button disabled), show me the leaderboard.
  const submitBtn = document.getElementById("submitXIBtn");
  const iHaveSubmitted = submitBtn && (submitBtn.disabled || submitBtn.innerText.includes("Submitted"));
  
  // If I submitted OR everyone is done (board length matches total), show screen
  if (iHaveSubmitted || board.length > 0) {
      showScreen("leaderboard"); 
      // Note: Make sure your HTML has <section id="leaderboard" class="screen">
  }

  // 2. Render Table
  const tbody = document.getElementById("leaderboardBody");
  if(tbody) {
      tbody.innerHTML = "";
      board.forEach((t, i) => {
          const isDisq = t.disqualified;
          
          const row = document.createElement("tr");
          if(isDisq) row.classList.add("disqualified-row");
          
          row.innerHTML = `
              <td>#${i + 1}</td>
              <td style="font-weight:bold;">${t.team} ${isDisq ? '🚫' : ''}</td>
              <td style="font-size:1.1em; color:${isDisq ? '#ef4444' : '#22c55e'}">
                  ${isDisq ? "0.00" : t.rating}
              </td>
              <td>${isDisq ? `<small style='color:#fca5a5'>${t.reason}</small>` : "Qualified"}</td>
              <td>₹${(t.purse || 0).toFixed(2)} Cr</td>
          `;
          tbody.appendChild(row);
      });
  }

  // 3. Also Render the Mini-Box inside the Playing XI screen (for live updates)
  const miniBox = document.getElementById("leaderboardBox");
  if(miniBox) {
      miniBox.innerHTML = "<h3>🏆 Live Standings</h3>";
      board.forEach((t, i) => {
          miniBox.innerHTML += `
             <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #444; ${t.disqualified?'opacity:0.6':''}">
                <span>#${i+1} ${t.team}</span>
                <span style="color:${t.disqualified?'red':'#4ade80'}">
                    ${t.disqualified ? 'Disq.' : t.rating}
                </span>
             </div>
          `;
      });
  }
});

socket.on("xiError", msg => alert(msg));

function renderTeamPopup(teams){
  const box = document.getElementById("teamSelectList");
  box.innerHTML = "";

  teams.forEach(team => {
    const btn = document.createElement("button");
    btn.innerText = team;

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

