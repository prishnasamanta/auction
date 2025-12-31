/* ================================================= */
/* ============= GLOBAL SETUP & STATE ============== */
/* ================================================= */
const socket = io();

// --- DOM ELEMENTS ---
const enterBtn = document.getElementById("enterBtn");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const usernameInput = document.getElementById("username");
const codeInput = document.getElementById("code");

// --- GAME STATE ---
let username = "";
let roomCode = "";
let myTeam = null;
let isHost = false;
let auctionLive = false;
let auctionPaused = false;
let gameStarted = false; // <--- NEW FLAG to track overall status
let lastBidTeam = null;
let teamPurse = {}; 
let allSquads = {};
let activeRules = {};
let selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
let lastTickSecond = null;

// --- POPUP WINDOW STATE ---
let remainingSets = [];
let viewSetWindow = null; 
let squadWindow = null;
let selectedSquadTeam = null;

// --- CONFIG ---
const TEAM_COLORS = {
    CSK: "#facc15", MI: "#38bdf8", RCB: "#dc2626", KKR: "#a855f7",
    RR: "#fb7185", DC: "#60a5fa", SRH: "#fb923c", PBKS: "#ef4444",
    GT: "#0ea5e9", LSG: "#22c55e"
};

// --- SOUNDS ---
const soundBid = new Audio("/sounds/bid.mp3");
const soundHammer = new Audio("/sounds/sold.mp3");
const soundUnsold = new Audio("/sounds/unsold.mp3");
const soundTick = new Audio("/sounds/beep.mp3");

/* ================================================= */
/* ========= 1. INITIALIZATION & NAVIGATION ======== */
/* ================================================= */
/* ================= 1. INITIALIZATION & URL HANDLING ================= */

window.onload = () => {
    // 1. Get Room Code from URL (if exists)
    // Example: /room/ABCD -> code = ABCD
    const path = window.location.pathname;
    const urlCode = path.startsWith('/room/') ? path.split('/')[2] : null;

    // 2. Check Session
    const sRoom = sessionStorage.getItem('ipl_room');
    const sUser = sessionStorage.getItem('ipl_user');
    const sTeam = sessionStorage.getItem('ipl_team');

    // SCENARIO A: Reconnecting (Has Session + Matching URL or just Session)
    // If URL code exists, it MUST match the session to reconnect automatically
    if (sUser && sRoom && (!urlCode || urlCode === sRoom)) {
        console.log("🔄 Reconnecting...");
        username = sUser;
        roomCode = sRoom;
        if(sTeam) myTeam = sTeam;
        
        // Ensure URL is correct
        updateBrowserURL(sRoom);
        
        socket.emit('reconnectUser', { roomId: sRoom, username: sUser, team: sTeam });
        
        document.getElementById('landing').classList.add('hidden');
        document.getElementById('auth').classList.add('hidden');
        document.getElementById('auctionUI').classList.remove('hidden');
    }
    // SCENARIO B: Visiting a Link (No Session, but URL has Code)
    else if (urlCode) {
        console.log("🔗 Shared Link Detected:", urlCode);
        
        // 1. Hide Landing, Show Auth
        document.getElementById("landing").classList.add("hidden");
        document.getElementById("auth").classList.remove("hidden");
        
        // 2. Switch to Join Tab & Pre-fill Code
        switchAuthTab('join');
        document.getElementById('code').value = urlCode;
        
        // Optional: Highlight the input to show it's ready
        document.getElementById('code').style.borderColor = "var(--primary)";
    }

    // 3. Fetch Public Rooms (Always do this in background)
    socket.emit('getPublicRooms');
};

// --- HELPER: Update URL without Reloading ---
function updateBrowserURL(code) {
    const newUrl = `/room/${code}`;
    // Only push if we aren't already there
    if (window.location.pathname !== newUrl) {
        window.history.pushState({ path: newUrl }, '', newUrl);
    }
}

// --- ENTER BUTTON ---
if(enterBtn) {
    enterBtn.onclick = () => {
        document.getElementById("landing").classList.add("hidden");
        document.getElementById("auth").classList.remove("hidden");
        switchAuthTab('join'); 
    };
}

// --- TAB SWITCHING ---
window.switchAuthTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab' + (tab === 'join' ? 'Join' : 'Create')).classList.add('active');
    
    if(tab === 'create') {
        document.getElementById('createSection').classList.remove('hidden');
        document.getElementById('joinSection').classList.add('hidden');
    } else {
        document.getElementById('createSection').classList.add('hidden');
        document.getElementById('joinSection').classList.remove('hidden');
        socket.emit('getPublicRooms'); 
    }
};
window.exitToHome = function() {
    if(confirm("Are you sure you want to exit?")) {
        sessionStorage.clear();
        // Go back to root URL
        window.location.href = "/"; 
    }
}
/* ================= SHARE LOGIC ================= */
window.shareRoomLink = async function() {
    const url = window.location.href;
    const shareData = {
        title: 'IPL Auction Live',
        text: `Join my IPL Auction room! Code: ${roomCode}`,
        url: url
    };

    try {
        // Use Native Share (Mobile)
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback to Clipboard (Desktop)
            await navigator.clipboard.writeText(url);
            // Visual feedback
            const btn = document.getElementById('shareBtn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<span style="color:#4ade80; font-size:0.8rem; font-weight:bold;">COPIED!</span>`;
            setTimeout(() => btn.innerHTML = originalHTML, 2000);
        }
    } catch (err) {
        console.error("Share failed:", err);
    }
};


/* ================================================= */
/* ============ 2. JOIN & CREATE ROOM ============== */
/* ================================================= */

if(createBtn) {
    createBtn.onclick = () => {
        username = usernameInput.value.trim();
        const isPublic = document.getElementById('isPublicRoom').checked;
        if(!username) return alert("Enter name");

        sessionStorage.setItem('ipl_user', username);
        socket.emit("createRoom", { user: username, isPublic: isPublic });
    };
}

if(joinBtn) {
    joinBtn.onclick = () => {
        roomCode = document.getElementById('code').value.trim();
        username = usernameInput.value.trim();
        if(!roomCode || !username) return alert("Enter details");
        
        sessionStorage.setItem('ipl_room', roomCode);
        sessionStorage.setItem('ipl_user', username);
        socket.emit("joinRoom", { roomCode, user: username });
    };
}

/* ================= PUBLIC ROOMS ================= */
socket.on('publicRoomsList', ({ live, waiting }) => {
    const box = document.getElementById('publicRoomList');
    if(!box) return;
    box.innerHTML = '';

    const render = (list, title, type) => {
        if(list.length > 0) {
            const h = document.createElement("div");
            h.className = "room-section-title";
            h.innerText = title;
            box.appendChild(h);
            list.forEach(r => {
                const div = document.createElement('div');
                div.className = `room-tile ${type}`;
                div.innerHTML = `<span class="r-name">${r.id}</span> <span class="r-count">👤 ${r.count}</span>`;
                div.onclick = () => { document.getElementById('code').value = r.id; };
                box.appendChild(div);
            });
        }
    };

    render(waiting, "⏳ Waiting to Start", "waiting");
    render(live, "🔴 Ongoing Auctions", "live");

    if(waiting.length === 0 && live.length === 0) {
        box.innerHTML = '<div style="padding:10px; color:#666;">No active rooms found.</div>';
    }
});

/* ================================================= */
/* ============= 3. ROOM STATE LOGIC =============== */
/* ================================================= */
/* ================= ROOM CREATED EVENT ================= */
socket.on("roomCreated", code => {
    roomCode = code;
    sessionStorage.setItem('ipl_room', code);
    
    // 1. Setup UI
    setupAuctionScreen();
    
    // 2. SHOW RULES IMMEDIATELY FOR HOST
    document.getElementById("rulesScreen").classList.remove("hidden");

    // 3. --- FIX: UPDATE URL IMMEDIATELY ---
    updateBrowserURL(code);
});

/* ================= ROOM STATE LOGIC ================= */
/* ================= ROOM STATE LOGIC ================= */
/* ================= ROOM STATE LOGIC ================= */
/* ================= ROOM STATE LOGIC ================= */
socket.on("joinedRoom", (data) => {
    console.log("Room Data:", data);
    
    // 1. SAVE METADATA (Owners & Count)
    if (data.teamOwners) teamOwners = data.teamOwners;
    
    // Update the live user count pill in the top bar
    if (data.userCount !== undefined) {
        const countEl = document.getElementById("liveUserCount");
        if(countEl) countEl.innerText = data.userCount;
    }

    // 2. CHECK: HAS AUCTION ENDED?
    if (data.auctionEnded) {
        // If user is refreshing (already has session matching this room), let them stay for Leaderboard/XI
        const savedRoom = sessionStorage.getItem('ipl_room');
        
        if (savedRoom === data.roomCode) {
            // Restore session variables if needed
            roomCode = data.roomCode;
            if(data.squads) allSquads = data.squads;
            if(data.rules) activeRules = data.rules;
            
            // Setup base UI background
            setupAuctionScreen();
            
            // SKIP to Post-Game Screen
            showScreen("playingXI");
            document.body.style.overflow = "auto"; // Enable scrolling
            
            // Fetch personal data
            socket.emit("getMySquad"); 
            updateRulesUI();
        } else {
            // If user is new (no session matching room), kick them out because game is over
            alert("⚠️ The Auction has ended. Returning to Main Screen.");
            sessionStorage.clear();
            window.location.href = "/";
        }
        return; // Stop further processing
    }

    // 3. STANDARD SETUP (Game Active)
    roomCode = data.roomCode;
    sessionStorage.setItem('ipl_room', roomCode);
    
    if(data.rules) activeRules = data.rules;
    if(data.squads) allSquads = data.squads;

    isHost = data.isHost;
    gameStarted = data.auctionStarted; // Sync global state flag
    
    setupAuctionScreen();

    // 4. RENDER TEAMS (If selecting)
    if (data.availableTeams) {
        renderEmbeddedTeams(data.availableTeams);
    }

    // 5. DETERMINE SCREEN PHASE
    if (data.auctionStarted) {
        // Auction is LIVE.
        // If I don't have a team AND there are teams available -> Show Selection First
        if (!myTeam && data.availableTeams && data.availableTeams.length > 0) {
            setGamePhase("TEAM_SELECT");
        } else {
            // Already has team OR no teams left -> Show Auction
            setGamePhase("AUCTION");
            
            // If I have a team, update the notice
            if (myTeam) {
                document.getElementById("teamNotice").innerText = `You are: ${myTeam}`;
            }
        }
    } else {
        // Auction NOT started -> Always show Selection
        setGamePhase("TEAM_SELECT");
        if (myTeam) {
             // If I already picked (reconnecting), show waiting message
             document.getElementById("embeddedTeamList").classList.add("hidden");
             document.getElementById("waitingForHostMsg").classList.remove("hidden");
             document.getElementById("teamNotice").innerText = `You are: ${myTeam}`;
        }
    }
    
    updateAdminButtons(data.auctionStarted);
});

/* ================= USER LIST LOGIC ================= */

// 1. Toggle the Dropdown
window.toggleUserList = function() {
    const list = document.getElementById("userListDropdown");
    list.classList.toggle("hidden");
    
    // Close if clicking outside (Optional helper)
    if (!list.classList.contains("hidden")) {
        document.addEventListener('click', closeUserListOutside);
    }
};

function closeUserListOutside(e) {
    const list = document.getElementById("userListDropdown");
    const btn = document.querySelector(".count-pill-btn");
    if (!list.contains(e.target) && !btn.contains(e.target)) {
        list.classList.add("hidden");
        document.removeEventListener('click', closeUserListOutside);
    }
}

// 2. Handle Live Updates from Server
socket.on("roomUsersUpdate", (users) => {
    // Update the Count Number
    const countEl = document.getElementById("liveUserCount");
    if (countEl) countEl.innerText = users.length;

    // Render the List
    const box = document.getElementById("userListContent");
    if (box) {
        box.innerHTML = "";
        
        // Sort: Me first, then Host, then others
        users.sort((a, b) => {
            if (a.name === username) return -1;
            return a.name.localeCompare(b.name);
        });

        users.forEach(u => {
            const isMe = u.name === username;
            const teamBadge = u.team ? `<span class="ul-team" style="color:${TEAM_COLORS[u.team] || '#fbbf24'}">${u.team}</span>` : `<span style="opacity:0.5; font-size:0.7rem;">Spectator</span>`;
            
            const div = document.createElement("div");
            div.className = "ul-item";
            div.innerHTML = `
                <div class="ul-name">
                    <span class="ul-dot"></span>
                    ${u.name} ${isMe ? '(You)' : ''}
                </div>
                ${teamBadge}
            `;
            box.appendChild(div);
        });
    }
});



function setupAuctionScreen() {
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("auctionUI").classList.remove("hidden");
    document.body.style.overflow = "hidden";

    document.getElementById("roomCodeBar").classList.remove("hidden");
    document.getElementById("roomCodeText").innerText = roomCode;
    document.getElementById("shareBtn").classList.remove("hidden");
    // --- NEW: Update the Browser Address Bar ---
    updateBrowserURL(roomCode);

    socket.emit("getAuctionState");
    socket.emit("checkAdmin");
    socket.emit("getSquads"); 
}

// Add this or update existing error handler
socket.on("error", msg => {
    alert("❌ " + msg);
    // If room is invalid/closed, clear session so they don't get stuck in a loop
    if(msg.includes("not found") || msg.includes("closed") || msg.includes("expired")) {
        sessionStorage.clear();
        window.location.href = "/";
    }
});

/* ================================================= */
/* ========= 4. SETS & SQUAD VIEWING =============== */
/* ================================================= */

// --- A. UPCOMING SETS ---
socket.on("setUpdate", data => {
    remainingSets = data; 
    if(viewSetWindow && !viewSetWindow.closed){
        viewSet(); 
    }
});

window.viewSet = function() {
    if(!remainingSets || remainingSets.length === 0){
        alert("No sets remaining!");
        return;
    }
    if(!viewSetWindow || viewSetWindow.closed){
        viewSetWindow = window.open("", "ViewSetWindow", "width=480,height=650");
    } else {
        viewSetWindow.focus();
    }

    const activeSet = remainingSets[0]; 

    viewSetWindow.document.open();
    viewSetWindow.document.write(`
        <html>
        <head>
            <title>Auction Sets</title>
            <style>
                body{font-family:sans-serif;padding:15px;background:#111;color:#fff}
                h2.set-title { background: #222; padding: 10px; border-radius: 6px; margin-top: 20px; border-left: 5px solid #444; font-size: 1.1rem; text-transform: uppercase; }
                h2.active { background: #2a1a00; border-left: 5px solid #facc15; color: #facc15; }
                .p { display:flex; justify-content:space-between; padding: 6px 10px; border-bottom:1px solid #333; align-items:center; color: #ccc; }
                .p.active-p { color: #fff; font-weight: bold; }
                .role { background:#333; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.75rem; }
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
                        <div class="meta"><span class="role">${p.role}</span></div>
                    </div>
                `).join("")}
                </div>
            `).join("")}
        </body>
        </html>
    `);
    viewSetWindow.document.close();
};
/* ================= FORCE REDIRECT ================= */
socket.on("forceHome", (msg) => {
    alert("⚠️ " + msg + " Returning to Main Screen.");
    sessionStorage.clear();
    window.location.href = "/";
});

// --- B. SQUAD VIEWING (FIXED) ---
socket.on("squadData", squads => {
    allSquads = squads;

    // Populate Dropdown
    const sel = document.getElementById("squadSelect");
    if(sel){
        sel.innerHTML = `<option value="">🧢 View Team Squads</option>`;
        Object.keys(squads).forEach(team => {
            const opt = document.createElement("option");
            opt.value = team;
            opt.innerText = team;
            sel.appendChild(opt);
        });
    }
    
    // Refresh Popup if open
    if(squadWindow && !squadWindow.closed) renderSquadWindow();
});

window.showSelectedSquad = function() {
    const team = document.getElementById("squadSelect").value;
    if(!team) return;

    selectedSquadTeam = team;

    if(!squadWindow || squadWindow.closed){
        squadWindow = window.open("", "_blank", "width=450,height=650");
    }
    renderSquadWindow();
};

// 1. FIX: Helper function to switch tabs from inside the popup
window.switchSquadTab = function(team) {
    selectedSquadTeam = team;
    socket.emit("getSquads"); // Refresh data
    renderSquadWindow();      // Re-render UI
}
/* ================= SQUAD WINDOW (FIXED STYLE) ================= */
/* ================= SQUAD WINDOW POPUP ================= */
function renderSquadWindow() {
    if(!squadWindow || squadWindow.closed || !selectedSquadTeam) return;

    const squad = allSquads[selectedSquadTeam] || [];
    const purse = teamPurse?.[selectedSquadTeam];
    
    // GET OWNER NAME
    // Check our local map. Default to "(CPU/Available)" if undefined.
    const ownerName = teamOwners[selectedSquadTeam] || "(CPU/Available)";

    const teams = Object.keys(allSquads).sort();
    const tabsHtml = teams.map(t => 
        `<button onclick="window.opener.switchSquadTab('${t}')" 
         style="padding:6px 12px; margin:2px; background:${t===selectedSquadTeam?'#fff':'#222'}; color:${t===selectedSquadTeam?'#000':'#ccc'}; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold;">
         ${t}
         </button>`
    ).join(" ");

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
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding:15px; background:#111; color:#eee; }
                .tabs { overflow-x:auto; white-space:nowrap; padding-bottom:10px; border-bottom:1px solid #333; margin-bottom:15px; }
                h2 { text-align:center; margin:0 0 5px 0; }
                .stats { text-align:center; font-size:0.9rem; color:#aaa; margin-bottom:20px; }
                h3 { margin:15px 0 5px 0; border-bottom:1px solid #444; color:#facc15; font-size:0.85rem; }
                ul { list-style:none; padding:0; margin:0; }
                li { padding:5px 0; border-bottom:1px solid #222; font-size:0.95rem; }
                .price { color:#4ade80; font-weight:bold; float:right; }
                
                .dl-btn {
                    display: block; width: 100%; padding: 12px; margin-top: 20px;
                    background: #6366f1; color: white; border: none; border-radius: 8px;
                    font-weight: bold; cursor: pointer; text-align: center;
                }
                .dl-btn:hover { background: #4f46e5; }
            </style>
        </head>
        <body>
            <div class="tabs">${tabsHtml}</div>
            
            <div id="captureTarget" style="padding:10px; background:#111;">
                <h2 style="color:${TEAM_COLORS[selectedSquadTeam] || '#fff'}">${selectedSquadTeam}</h2>
                
                <div style="text-align:center; color:#94a3b8; font-size:0.85rem; margin-bottom:10px; font-family:sans-serif;">
                    Manager: <span style="color:#fff; font-weight:bold;">${ownerName}</span>
                </div>

                <div class="stats">
                    Purse: <span style="color:#fff; font-weight:bold;">${typeof purse==="number" ? `₹${purse.toFixed(2)} Cr` : "—"}</span> 
                    | Players: ${squad.length}
                </div>

                ${Object.keys(roles).map(r => `
                    <h3>${r}</h3>
                    <ul>
                        ${roles[r].length 
                            ? roles[r].map(p => `<li>${p.name} <span style="color:#888; font-size:0.8em">⭐${p.rating}</span> <span class="price">₹${p.price?.toFixed(2)}</span></li>`).join("") 
                            : "<li style='color:#444; font-style:italic;'>Empty</li>"
                        }
                    </ul>
                `).join("")}
            </div>

            <button class="dl-btn" onclick="downloadImage()">📸 Download Squad List</button>

            <script>
                function downloadImage() {
                    const el = document.getElementById('captureTarget');
                    html2canvas(el, { backgroundColor: "#111" }).then(canvas => {
                        const a = document.createElement('a');
                        a.download = '${selectedSquadTeam}_Full_Squad.png';
                        a.href = canvas.toDataURL();
                        a.click();
                    });
                }
            <\/script>
        </body>
        </html>
    `);
    squadWindow.document.close();
}


/* ================================================= */
/* =========== 5. RULES & TEAM SELECTION =========== */
/* ================================================= */

// Save Rules
document.getElementById("saveRules").onclick = () => {
    socket.emit("setRules", {
        maxPlayers: Number(document.getElementById("maxPlayers").value),
        maxForeign: Number(document.getElementById("maxForeign").value),
        purse: Number(document.getElementById("purse").value),
        minBat: Number(document.getElementById("minBat").value),
        minAll: Number(document.getElementById("minAll").value),
        minBowl: Number(document.getElementById("minBowl").value),
        minSpin: Number(document.getElementById("minSpin").value),
        minWK: Number(document.getElementById("minWK").value),
        minForeignXI: Number(document.getElementById("maxForeignXI").value)
    });
};

// Rules Locked
socket.on("rulesUpdated", data => {
    activeRules = data.rules;
    document.getElementById("rulesScreen").classList.add("hidden");
    setGamePhase("TEAM_SELECT");
    renderEmbeddedTeams(data.teams);
    updateAdminButtons(false);
    updateRulesUI();
});
/* ================= TEAM SELECTION ================= */
// --- UPDATED TEAM RENDERER ---
function renderEmbeddedTeams(teams) {
    const box = document.getElementById("embeddedTeamList");
    if(!box) return;
    box.innerHTML = "";
    
    // If empty
    if(teams.length === 0) {
        box.innerHTML = "<p style='color:#ccc; padding:20px;'>All teams taken! You are a spectator.</p>";
        // If game is live, give button to go to auction
        if(gameStarted) {
            const btn = document.createElement("button");
            btn.className = "primary-btn";
            btn.innerText = "Watch Auction";
            btn.style.width = "100%";
            btn.onclick = () => setGamePhase("AUCTION");
            box.appendChild(btn);
        }
        return;
    }

    // Render Buttons
    teams.sort().forEach(team => {
        const btn = document.createElement("button");
        btn.innerText = team;
        btn.className = "team-btn"; 
        btn.style.setProperty("--team-color", TEAM_COLORS[team] || "#94a3b8");
        
        btn.onclick = () => {
            myTeam = team;
            sessionStorage.setItem('ipl_team', team);
            socket.emit("selectTeam", { team, user: username });
            
            // LOGIC FIX:
            if(gameStarted) {
                // If game is live -> GO TO AUCTION IMMEDIATELY
                setGamePhase("AUCTION");
                document.getElementById("teamNotice").innerText = `You are: ${team}`;
            } else {
                // If waiting for host -> Show "Waiting" message
                document.getElementById("embeddedTeamList").classList.add("hidden");
                document.getElementById("waitingForHostMsg").classList.remove("hidden");
                document.getElementById("teamNotice").innerText = `You are: ${team}`;
            }
            
            // Hide "Join Team" header button since we just picked
            const lateBtn = document.getElementById("lateJoinBtn");
            if(lateBtn) lateBtn.classList.add("hidden");
        };
        box.appendChild(btn);
    });
    
    // Add "Just Spectate" button if Game is Live (Optional)
    if(gameStarted) {
        const specBtn = document.createElement("button");
        specBtn.innerText = "👀 Watch as Spectator";
        specBtn.className = "secondary-btn";
        specBtn.style.width = "100%";
        specBtn.style.marginTop = "8px";
        specBtn.onclick = () => setGamePhase("AUCTION");
        box.appendChild(specBtn);
    }
    
    box.classList.remove("hidden");
}
/* ================= TEAM PICKED LOGIC ================= */
socket.on("teamPicked", ({ team, user, remaining }) => {
    // 1. Update Local Owners Map
    if (team && user) {
        teamOwners[team] = user; // Mark as owned
    } else {
        // If team is null (freed), we might not know exactly which one was freed 
        // without reloading, but we can assume 'remaining' list is correct.
        // Ideally, we just refresh the full state if needed, but for now:
        // We rely on renderEmbeddedTeams to show it as available again.
    }

    // 2. Logic for ME (The current user)
    if(myTeam === team) {
        document.getElementById("teamSelectionMain").classList.add("hidden");
        // If game is already live, go straight to auction
        if(gameStarted) {
            setGamePhase("AUCTION");
        } else {
            // Otherwise show waiting message
            document.getElementById("waitingForHostMsg").classList.remove("hidden");
        }
        document.getElementById("teamNotice").innerText = `You are: ${team}`;
        
        // Hide "Join Team" button since I have a team now
        const lateBtn = document.getElementById("lateJoinBtn");
        if(lateBtn) lateBtn.classList.add("hidden");
    }

    // 3. Logic for EVERYONE ELSE (Update the list of buttons)
    // Only re-render if I haven't picked a team yet
    if(!myTeam) {
        renderEmbeddedTeams(remaining);
    }
});


/* ================================================= */
/* =============== 6. ADMIN CONTROLS =============== */
/* ================================================= */

function updateAdminButtons(isStarted) {
    const adminPanel = document.getElementById("adminControls");
    if(!isHost) {
        adminPanel.classList.add("hidden");
        return;
    }
    adminPanel.classList.remove("hidden");
    const startBtn = document.getElementById("startBtn");
    const controls = document.querySelectorAll("#togglePauseBtn, #skipBtn, #skipSetBtn");

    if (!isStarted) {
        startBtn.classList.remove("hidden");
        controls.forEach(b => b.classList.add("hidden"));
    } else {
        startBtn.classList.add("hidden");
        controls.forEach(b => b.classList.remove("hidden"));
    }
}

window.admin = function(action) {
    if(action === 'end' && !confirm("End Auction?")) return;
    socket.emit("adminAction", action);
};

const startBtn = document.getElementById("startBtn");
if(startBtn) startBtn.onclick = () => socket.emit("adminAction", "start");

const togglePauseBtn = document.getElementById("togglePauseBtn");
if(togglePauseBtn) togglePauseBtn.onclick = () => socket.emit("adminAction", "togglePause");

const skipBtn = document.getElementById("skipBtn");
if(skipBtn) skipBtn.onclick = () => socket.emit("adminAction", "skip");

const skipSetBtn = document.getElementById("skipSetBtn");
if(skipSetBtn) skipSetBtn.onclick = () => {
    if(confirm("⚠ Skip set?")) socket.emit("adminAction", "skipSet");
};

/* ================================================= */
/* ============ 7. AUCTION GAMEPLAY ================ */
/* ================================================= */
socket.on("auctionStarted", () => {
    auctionLive = true;
    auctionPaused = false;
    gameStarted = true; // Update flag
    
    document.getElementById("teamNotice").innerText = myTeam ? `You are: ${myTeam}` : "Spectating";
    setGamePhase("AUCTION");
    updateAdminButtons(true);
});

socket.on("auctionState", s => {
    auctionLive = s.live;
    auctionPaused = s.paused;
    lastBidTeam = s.lastBidTeam;
    if(s.player) {
        updatePlayerCard(s.player, s.bid);
    }
    updateBidButton(s);
});

socket.on("newPlayer", d => {
    auctionLive = true;
    auctionPaused = false;
    lastBidTeam = null;
    lastTickSecond = null;
    
    document.getElementById('resultOverlay').classList.add('hidden');
    document.getElementById('currentBidder').classList.add('hidden');
    document.getElementById("auctionCard").classList.remove("pulse");
    
    updatePlayerCard(d.player, d.bid);
    updateBidButton({ bid: d.bid });
});

function updatePlayerCard(player, bid) {
    document.getElementById("playerName").innerText = player.name;
    document.getElementById("playerMeta").innerText = `${player.role} • ⭐${player.rating}`;
    document.getElementById("bid").innerText = `₹${bid.toFixed(2)} Cr`;
}

socket.on("timer", t => {
    document.getElementById("timer").innerText = "⏱ " + t;
    if(auctionLive && !auctionPaused && t <= 3 && t > 0 && t !== lastTickSecond) {
        lastTickSecond = t;
        soundTick.play().catch(()=>{});
    }
});

const bidBtn = document.getElementById("bidBtn");
if(bidBtn) {
    bidBtn.onclick = () => {
        if(!myTeam) return alert("Select a team first!");
        if(bidBtn.disabled) return;
        soundBid.play().catch(()=>{});
        socket.emit("bid");
    };
}

socket.on("bidUpdate", data => {
    document.getElementById("bid").innerText = `₹${data.bid.toFixed(2)} Cr`;
    lastBidTeam = data.team;
    
    const badge = document.getElementById('currentBidder');
    badge.classList.remove('hidden');
    document.getElementById('bidderName').innerText = data.team;
    
    const color = TEAM_COLORS[data.team] || "#22c55e";
    badge.style.border = `1px solid ${color}`;
    badge.style.setProperty("--team", color);
    
    const card = document.getElementById("auctionCard");
    card.classList.add("pulse");
    setTimeout(() => card.classList.remove("pulse"), 300);

    updateBidButton({ bid: data.bid });
});

function updateBidButton(state) {
    if(!myTeam || !auctionLive || auctionPaused) {
        bidBtn.disabled = true;
        return;
    }
    if(lastBidTeam === myTeam) {
        bidBtn.disabled = true;
        return;
    }
    if(state && teamPurse && teamPurse[myTeam] !== undefined) {
        const nextBid = (state.bid || 0) + (state.bid < 10 ? 0.2 : 0.5);
        if(teamPurse[myTeam] < nextBid) {
            bidBtn.disabled = true;
            return;
        }
    }
    bidBtn.disabled = false;
}

socket.on("sold", d => {
    soundHammer.play();
    showResultStamp("SOLD", `TO ${d.team}`, TEAM_COLORS[d.team], false);
    if(d.purse) teamPurse = d.purse;
});

socket.on("unsold", () => {
    soundUnsold.play();
    showResultStamp("UNSOLD", "PASSED IN", "#f43f5e", true);
});

function showResultStamp(title, detail, color, isUnsold) {
    bidBtn.disabled = true;
    const overlay = document.getElementById('resultOverlay');
    const t = document.getElementById('stampTitle');
    const d = document.getElementById('stampDetail');
    const c = document.querySelector('.stamp-container');

    t.innerText = title;
    d.innerText = detail;
    c.style.borderColor = isUnsold ? "" : color;
    if(isUnsold) c.classList.add('unsold'); else c.classList.remove('unsold');
    overlay.classList.remove('hidden');
}

/* ================================================= */
/* ============= 8. HELPER FUNCTIONS =============== */
/* ================================================= */

function setGamePhase(phase) {
    const teamCard = document.getElementById("teamSelectionMain");
    const auctionCard = document.getElementById("auctionCard");
    const lateJoinBtn = document.getElementById("lateJoinBtn");

    if (phase === "TEAM_SELECT") {
        if(teamCard) teamCard.classList.remove("hidden");
        if(auctionCard) auctionCard.classList.add("hidden");
        if(lateJoinBtn) lateJoinBtn.classList.add("hidden");
    } 
    else if (phase === "AUCTION") {
        if(teamCard) teamCard.classList.add("hidden");
        if(auctionCard) auctionCard.classList.remove("hidden");
        if(lateJoinBtn && !myTeam) lateJoinBtn.classList.remove("hidden");
    }
}

window.toggleLateJoin = function() {
    const teamCard = document.getElementById("teamSelectionMain");
    const auctionCard = document.getElementById("auctionCard");
    
    if (teamCard.classList.contains("hidden")) {
        teamCard.classList.remove("hidden");
        auctionCard.classList.add("hidden");
    } else {
        teamCard.classList.add("hidden");
        auctionCard.classList.remove("hidden");
    }
};

window.showRules = function() {
    document.getElementById('viewRulesOverlay').classList.remove('hidden');
    updateRulesUI();
};

function updateRulesUI() {
    if(!activeRules) return;
    const r = activeRules;
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };

    set('pop_viewPurse', r.purse);
    set('pop_viewSquadSize', r.maxPlayers);
    set('pop_viewForeign', r.maxForeign);
    set('pop_viewBat', r.minBat);
    set('pop_viewBowl', r.minBowl);
    set('pop_viewWK', r.minWK);
    set('pop_viewAR', r.minAll);
    set('pop_viewSpin', r.minSpin);
    set('pop_viewForeignXI', r.maxForeignXI); // Ensure HTML has this ID
    
    set('viewPurse', r.purse);
    set('viewSquadSize', r.maxPlayers);
    set('viewForeign', r.maxForeign);
}

socket.on("chatUpdate", d => {
    const chat = document.getElementById("chat");
    chat.innerHTML += `<div><b style="color:${TEAM_COLORS[d.team] || '#aaa'}">${d.team} (${d.user})</b>: ${d.msg}</div>`;
    chat.scrollTop = chat.scrollHeight;
});

window.sendChat = function() {
    const msgInput = document.getElementById("msg");
    if(!msgInput.value.trim()) return;
    socket.emit("chat", { user: username, team: myTeam || "Viewer", msg: msgInput.value });
    msgInput.value = "";
};

socket.on("logUpdate", msg => {
    const log = document.getElementById("log");
    const div = document.createElement("div");
    div.className = "log-item";
    div.innerText = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
});

/* ================================================= */
/* ========= 9. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */
socket.on("auctionEnded", () => {
    showScreen("playingXI"); // Switches the screen immediately
    document.body.style.overflow = "auto"; 
    socket.emit("getMySquad");
});

socket.on("mySquad", ({ squad, rules }) => {
    if(rules) {
        activeRules = rules;
        updateRulesUI();
    }

    // Reset
    selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
    
    const container = document.getElementById("mySquadList");
    if(!container || !squad) return;
    
    container.innerHTML = "";
    
    // Create Grid Container
    const grid = document.createElement("div");
    grid.className = "xi-select-container";

    // Define Roles
    const roles = { WK: "Wicket Keepers", BAT: "Batsmen", ALL: "All Rounders", BOWL: "Bowlers" };

    Object.keys(roles).forEach(key => {
        // Filter players for this role
        const players = squad.filter(p => {
            if(key === "BOWL") return (p.role === "PACE" || p.role === "SPIN" || p.role === "BOWL");
            return p.role === key;
        });

        if(players.length > 0) {
            // Header
            const title = document.createElement("div");
            title.className = "role-group-title";
            title.innerText = roles[key];
            grid.appendChild(title);

            // Buttons
            players.forEach(p => {
                const btn = document.createElement("div");
                btn.className = "xi-player-btn";
                // ID helps us find it to toggle class later
                btn.id = `btn-${p.name.replace(/\s/g, '')}`; 
                
                btn.innerHTML = `
                    <span>${p.name} ${p.foreign ? '✈️' : ''}</span>
                    <small>⭐${p.rating}</small>
                `;
                
                btn.onclick = () => togglePlayerXI(p, btn, key);
                grid.appendChild(btn);
            });
        }
    });
    
    container.appendChild(grid);
    updateXIPreview();
});
function togglePlayerXI(p, btnElement, roleKey) {
    const list = selectedXI[roleKey];
    const idx = list.findIndex(x => x.name === p.name);

    if(idx > -1) {
        // Remove
        list.splice(idx, 1);
        btnElement.classList.remove("picked");
    } else {
        // Add
        if(countTotalXI() >= 11) return alert("Squad full (11/11)");
        list.push(p);
        btnElement.classList.add("picked");
    }
    updateXIPreview();
}

function countTotalXI() {
    return Object.values(selectedXI).reduce((acc, arr) => acc + arr.length, 0);
}

function countForeign() {
    return Object.values(selectedXI).flat().filter(p => p.foreign).length;
}
function updateDashboard() {
    // 1. UPDATE STATS BAR
    const total = countTotalXI();
    const foreign = countForeign();
    const wk = selectedXI.WK.length;
    const bat = selectedXI.BAT.length;
    const bowl = selectedXI.BOWL.length;
    const all = selectedXI.ALL.length;

    const setStat = (id, val, min, max) => {
        const el = document.getElementById(id);
        const isValid = max ? val <= max : val >= min;
        el.className = `stat-pill ${isValid ? 'valid' : 'invalid'}`;
        el.innerHTML = `<b>${val}${max ? '/'+max : ''}</b> ${el.innerText.split(' ').slice(1).join(' ')}`;
    };

    setStat('stat-count', total, 11, 11); // Must be exactly 11
    setStat('stat-foreign', foreign, 0, (activeRules.maxForeignXI || 4)); // Using minForeignXI variable as max limit based on previous discussion
    setStat('stat-wk', wk, activeRules.minWK || 1);
    setStat('stat-bat', bat, activeRules.minBat || 3);
    setStat('stat-bowl', bowl, activeRules.minBowl || 3);
    setStat('stat-all', all, activeRules.minAll || 1);

    // 2. UPDATE BUTTON
    const btn = document.getElementById("submitXIBtn");
    if(btn) {
        btn.innerText = total === 11 ? "Submit XI (Ready)" : `Select ${11 - total} more`;
        btn.disabled = total !== 11;
        btn.style.opacity = total === 11 ? "1" : "0.5";
    }
    
    // Show Save Button if not empty
    const saveBtn = document.getElementById("saveXIBtn");
    if(saveBtn) total > 0 ? saveBtn.classList.remove("hidden") : saveBtn.classList.add("hidden");

    // 3. RENDER PITCH
    renderPitch();
}

function renderPitch() {
    const container = document.getElementById("xiCardTarget");
    // Clear only player elements, keep background
    container.innerHTML = "";

    // Helper to create pitch row
    const createRow = (players) => {
        const row = document.createElement("div");
        row.className = "pitch-row";
        players.forEach(p => {
            const pDiv = document.createElement("div");
            pDiv.className = "pitch-player-icon";
            pDiv.innerHTML = `
                <div class="pp-img ${p.foreign ? 'is-foreign' : ''}">
                    ${p.name.charAt(0)}
                </div>
                <div class="pp-name">${getShortName(p.name)}</div>
            `;
            row.appendChild(pDiv);
        });
        return row;
    };

    // Render in logical cricket order: WK -> BAT -> ALL -> BOWL
    if(selectedXI.WK.length) container.appendChild(createRow(selectedXI.WK));
    if(selectedXI.BAT.length) container.appendChild(createRow(selectedXI.BAT));
    if(selectedXI.ALL.length) container.appendChild(createRow(selectedXI.ALL));
    if(selectedXI.BOWL.length) container.appendChild(createRow(selectedXI.BOWL));
}

function getShortName(fullName) {
    const parts = fullName.split(" ");
    if(parts.length === 1) return parts[0];
    return parts[parts.length - 1]; // Return last name
}

// --- DREAM11 PITCH RENDERER ---
/* ================= TEAM SHEET RENDERING LOGIC ================= */
function updateXIPreview() {
    const count = countTotalXI();
    const btn = document.getElementById("submitXIBtn");
    const saveBtn = document.getElementById("saveXIBtn");
    const placeholder = document.getElementById("xiPlaceholder");
    const card = document.getElementById("xiCardTarget");
    const content = document.getElementById("sheetContent");
    const countLabel = document.getElementById("sheetCount");
    const teamTitle = document.getElementById("sheetTeamName");

    // 1. Button Logic
    if(btn) {
        btn.innerText = `Submit XI (${count}/11)`;
        btn.disabled = count !== 11;
        btn.style.background = count === 11 ? "var(--success)" : "";
        btn.style.color = count === 11 ? "#000" : "#fff";
    }

    // 2. Toggle Placeholder vs Card
    if (count === 0) {
        placeholder.classList.remove("hidden");
        card.classList.add("hidden");
        if(saveBtn) saveBtn.classList.add("hidden");
        return; 
    } else {
        placeholder.classList.add("hidden");
        card.classList.remove("hidden");
        if(saveBtn) saveBtn.classList.remove("hidden");
    }

    // 3. Render Card Content (Pills)
    if(teamTitle) teamTitle.innerText = myTeam ? `${myTeam} XI` : "MY TEAM";
    if(countLabel) countLabel.innerText = `${count}/11 Players`;
    
    content.innerHTML = "";

    // Specific Order for "Cricket Sheet" feel
    const renderOrder = ['WK', 'BAT', 'ALL', 'BOWL'];
    
    renderOrder.forEach(roleKey => {
        const players = selectedXI[roleKey];
        if(players && players.length > 0) {
            const row = document.createElement("div");
            row.className = "sheet-role-group";
            
            players.forEach(p => {
                const pill = document.createElement("div");
                pill.className = `sheet-player-pill ${p.foreign ? 'foreign' : ''}`;
                const icon = p.foreign ? "✈️" : "";
                pill.innerHTML = `<span>${p.name} ${icon}</span> <small>${p.rating}</small>`;
                row.appendChild(pill);
            });
            content.appendChild(row);
        }
    });
}

window.downloadSheetPNG = function() {
    const el = document.getElementById('xiCardTarget');
    // Temporarily remove transform/scaling if any for better capture
    html2canvas(el, { 
        backgroundColor: null, 
        scale: 3,
        useCORS: true 
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `My_Playing_XI.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

window.submitXI = function() {
    if(countTotalXI() !== 11) return;
    if(confirm("Submit Playing XI? This is final.")) {
        socket.emit("submitXI", { xi: selectedXI });
    }
};

socket.on("submitResult", (res) => {
    document.getElementById("submitXIBtn").classList.add("hidden");
    const status = document.getElementById("xiStatus");
    status.innerHTML = `
        <div style="padding:20px; text-align:center; border:1px solid ${res.disqualified ? 'red' : 'green'}; background:rgba(0,0,0,0.3); border-radius:10px; margin-top:20px;">
            <h2 style="color:${res.disqualified ? 'red' : 'green'}">${res.disqualified ? 'DISQUALIFIED' : 'QUALIFIED'}</h2>
            <p>Rating: <b>${res.rating}</b></p>
            <p>${res.disqualified ? res.reason : "Waiting for results..."}</p>
        </div>`;
});
socket.on("leaderboard", (board) => {
    // 1. Update Full Screen Table
    const tbody = document.getElementById("leaderboardBody");
    if(tbody) {
        tbody.innerHTML = "";
        board.forEach((t, i) => {
            const tr = document.createElement("tr");
            tr.className = "clickable";
            tr.innerHTML = `
                <td>#${i+1}</td>
                <td style="color:${TEAM_COLORS[t.team] || 'white'}; font-weight:bold;">${t.team}</td>
                <td>${t.rating}</td>
                <td>${t.disqualified ? '❌' : '✔️'}</td>
                <td>₹${t.purse} Cr</td>
                <td><button onclick='openSquadView(${JSON.stringify(t)})' class="secondary-btn" style="padding:2px 8px; font-size:0.7rem;">👁️</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 2. Update Mini-Leaderboard (The one we just added back)
  /*  const mini = document.getElementById("leaderboardBox");
    if(mini) {
        mini.innerHTML = "<h4 style='margin:0 0 10px 0; color:#aaa; text-transform:uppercase; font-size:0.8rem;'>🔴 Live Standings</h4>";
        
        if(board.length === 0) {
            mini.innerHTML += "<div style='color:#666; font-style:italic;'>No submissions yet...</div>";
        }

        board.forEach((t, i) => {
            mini.innerHTML += `
                <div>
                    <span>#${i+1} ${t.team}</span>
                    <span>${t.rating}</span>
                </div>`;
        });
    }*/
});
/* ================= SHARED RENDERER (CREATIVE CARD) ================= */
function generateCreativeCardHTML(teamName, players, rating, count) {
    if(!players || players.length === 0) return `<div class="sheet-empty">No Players</div>`;

    // Group Roles
    const roles = { WK: [], BAT: [], ALL: [], BOWL: [] };
    players.forEach(p => {
        if(p.role === "BAT") roles.BAT.push(p);
        else if(p.role === "WK") roles.WK.push(p);
        else if(p.role === "ALL") roles.ALL.push(p);
        else roles.BOWL.push(p); // Catch-all for bowlers
    });

    // Build HTML
    let html = `
    <div id="generatedCard" class="team-sheet-card">
        <div class="sheet-header">
            <h2 class="sheet-title">${teamName}</h2>
            <div class="sheet-subtitle">OFFICIAL PLAYING XI</div>
            <div style="margin-top:5px; color:#4ade80; font-weight:bold;">Rating: ${rating}</div>
        </div>
        <div id="sheetContent">`;

    // Render Groups
    ['WK', 'BAT', 'ALL', 'BOWL'].forEach(role => {
        if (roles[role].length > 0) {
            html += `<div class="sheet-role-group">`;
            roles[role].forEach(p => {
                html += `
                <div class="sheet-player-pill ${p.foreign ? 'foreign' : ''}">
                    <span>${p.name} ${p.foreign ? '✈️' : ''}</span> 
                    <small>⭐${p.rating}</small>
                </div>`;
            });
            html += `</div>`;
        }
    });

    html += `</div>
        <div class="sheet-footer">
            <span>IPL AUCTION LIVE</span>
            <span>${count}/11 Selected</span>
        </div>
    </div>`;

    return html;
}


function openSquadView(data) {
    const overlay = document.getElementById("squadViewOverlay");
    const container = document.getElementById("squadCaptureArea");
    
    // Use the shared renderer
    container.innerHTML = generateCreativeCardHTML(
        data.team, 
        data.xi, 
        data.rating, 
        data.xi ? data.xi.length : 0
    );

    overlay.classList.remove("hidden");
}

window.downloadLeaderboardPNG = function() {
    const el = document.getElementById('generatedCard'); // Target the card inside
    html2canvas(el, { backgroundColor: null, scale: 3 }).then(canvas => {
        const a = document.createElement('a');
        a.download = `Squad_Card.png`;
        a.href = canvas.toDataURL();
        a.click();
    });
}

function showScreen(id){
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}






