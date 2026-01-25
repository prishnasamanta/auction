/* ================================================= */
/* ============= GLOBAL SETUP & STATE ============== */
/* ================================================= */
const socket = io();
// --- GAME STATE ---
let username = "";
let roomCode = "";
let myTeam = null;
let isHost = false;
let auctionLive = false;
let auctionPaused = false;
let gameStarted = false;
let lastBidTeam = null;
let teamPurse = {};
let allSquads = {};
let activeRules = {};
let selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
let lastTickSecond = null;
let teamOwners = {};
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
/* 🌐 URL ROUTING & NAVIGATION MANAGER */
/* ================================================= */
// Updates the browser URL bar without reloading
function updateURL(state) {
    if (!roomCode) return;
    let newPath = `/room/${roomCode}`;
    let pageTitle = `IPL Auction - ${roomCode}`;
    if (state === 'summary') {
        newPath += '/summary';
        pageTitle = `Summary - ${roomCode}`;
    } else if (state === 'leaderboard') {
        newPath += '/leaderboard';
        pageTitle = `Leaderboard - ${roomCode}`;
    } else if (state === 'xi') {
        newPath += '/xi';
        pageTitle = `Select XI - ${roomCode}`;
    }
    // Push to history only if it changed
    if (window.location.pathname !== newPath) {
        window.history.pushState({ page: state, room: roomCode }, pageTitle, newPath);
        document.title = pageTitle;
    }
}
// Handle Browser "Back" Button
window.onpopstate = function(event) {
    if (event.state) {
        // Route based on history state
        if (event.state.page === 'summary') showScreen('postAuctionSummary', false);
        else if (event.state.page === 'leaderboard') showScreen('leaderboard', false);
        else if (event.state.page === 'xi') showScreen('playingXI', false);
        else showScreen('auctionUI', false);
    } else {
        // Fallback
        window.location.href = "/";
    }
};
/* ================================================= */
/* ========= 1. INITIALIZATION & NAVIGATION ======== */
/* ================================================= */
// ✅ FIX: Safe Play Function to prevent crashes
function safePlay(audioObj) {
    if (!audioObj) return;
    // Reset time to start (allows rapid re-play)
    audioObj.currentTime = 0;
   
    // Attempt to play, catch errors silently if user hasn't interacted yet
    const playPromise = audioObj.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Audio blocked (User interaction needed):", error);
        });
    }
}
window.onload = () => {
    // --- 1. SETUP EVENT LISTENERS ---
    const enterBtn = document.getElementById("enterBtn");
    const createBtn = document.getElementById("createBtn");
    const joinBtn = document.getElementById("joinBtn");
    const usernameInput = document.getElementById("username");
    if(enterBtn) {
        enterBtn.onclick = () => {
            document.getElementById("landing").classList.add("hidden");
            document.getElementById("auth").classList.remove("hidden");
            switchAuthTab('join');
        };
    }
    if(createBtn) {
        createBtn.onclick = (e) => {
            if(e) e.preventDefault();
            const uName = usernameInput.value.trim();
            const isPublic = document.getElementById('isPublicRoom').checked;
            if(!uName) return alert("Please enter your name!");
           
            // Visual Feedback
            createBtn.innerText = "Creating...";
            createBtn.disabled = true;
            username = uName;
            sessionStorage.setItem('ipl_user', username);
            socket.emit("createRoom", { user: username, isPublic: isPublic });
        };
    }
    if(joinBtn) {
        joinBtn.onclick = (e) => {
            if(e) e.preventDefault();
            const rCode = document.getElementById('code').value.trim().toUpperCase();
            const uName = document.getElementById('username').value.trim();
            // --- GOD MODE TRAP ---
            if (rCode === "112233") {
                openGodModeSetup();
                return;
            }
            if(!uName) return alert("Please enter your name!");
            if(!rCode) return alert("Please enter a Room Code!");
            if(rCode.length !== 5) return alert("Room Code must be 5 characters!");
           
            // Visual Feedback
            joinBtn.innerText = "Joining...";
            joinBtn.disabled = true;
            username = uName;
            roomCode = rCode;
            sessionStorage.setItem('ipl_room', roomCode);
            sessionStorage.setItem('ipl_user', username);
           
            console.log(`🚀 Sending join request: ${username} -> ${roomCode}`);
            socket.emit("joinRoom", { roomCode, user: username });
        };
    }
const path = window.location.pathname;
    const parts = path.split('/');
    // Format: /room/CODE/SUBPAGE
    const urlCode = (parts[1] === 'room' && parts[2]) ? parts[2].toUpperCase() : null;
    const subPage = (parts[1] === 'room' && parts[3]) ? parts[3].toLowerCase() : null;
    const sRoom = sessionStorage.getItem('ipl_room');
    const sUser = sessionStorage.getItem('ipl_user');
   
    // SCENARIO A: Reconnecting (Session Valid)
    if (sUser && sRoom && (!urlCode || urlCode === sRoom)) {
        // ... (Keep existing reconnect logic) ...
        socket.emit('reconnectUser', { roomId: sRoom, username: sUser });
       
        // If deep link exists during reconnect, restore it
        if (subPage) sessionStorage.setItem('redirect_target', subPage);
    }
    // SCENARIO B: Visiting Link (New User)
    else if (urlCode) {
        console.log("🔗 Deep Link Detected:", urlCode);
       
        document.getElementById("landing").classList.add("hidden");
        document.getElementById("auth").classList.remove("hidden");
        switchAuthTab('join');
        document.getElementById('code').value = urlCode;
       
        // Store target to redirect AFTER login
        if (subPage) {
            sessionStorage.setItem('redirect_target', subPage);
        }
    }
    // 3. Fetch Public Rooms
    socket.emit('getPublicRooms');
};
function updateBrowserURL(code) {
    const newUrl = `/room/${code}`;
    if (window.location.pathname !== newUrl) {
        window.history.pushState({ path: newUrl }, '', newUrl);
    }
}
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
        window.location.href = "/";
    }
}
window.shareRoomLink = async function() {
    const url = window.location.href;
    const shareData = {
        title: 'IPL Auction Live',
        text: `Join my IPL Auction room! Code: ${roomCode}`,
        url: url
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(url);
            const btn = document.getElementById('shareBtn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<span style="color:#4ade80; font-size:0.8rem; font-weight:bold;">COPIED!</span>`;
            setTimeout(() => btn.innerHTML = originalHTML, 2000);
        }
    } catch (err) { console.error("Share failed:", err); }
};
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
/* ============= 2. ROOM STATE LOGIC =============== */
/* ================================================= */
socket.on("roomCreated", code => {
    roomCode = code;
    sessionStorage.setItem('ipl_room', code);
    setupAuctionScreen();
    document.getElementById("rulesScreen").classList.remove("hidden");
    updateBrowserURL(code);
});
/* ================= ROOM STATE LOGIC ================= */
socket.on("joinedRoom", (data) => {
    console.log("Room Data:", data);
    // --- 1. SILENT AUTO-REFRESH (Update Data Only) ---
    if (data.updateOnly) {
        // Update Owners
        if(data.teamOwners) teamOwners = data.teamOwners;
       
        // KICK DETECTION: If my team is suddenly in the "Available" list, I timed out.
        if (myTeam && data.availableTeams && data.availableTeams.includes(myTeam)) {
             alert("⚠️ You were disconnected for too long. You are now a Spectator.");
             sessionStorage.removeItem('ipl_team');
             myTeam = null;
             updateHeaderNotice();
             // Switch view based on game state
             if(gameStarted) setGamePhase("AUCTION");
             else setGamePhase("TEAM_SELECT");
        }
        // Update Team Buttons (for everyone)
        if(data.availableTeams) renderEmbeddedTeams(data.availableTeams);
        // Refresh Squad View if currently open in the tab
        if(document.getElementById('tab-squads') && document.getElementById('tab-squads').classList.contains('active')) {
            viewEmbeddedSquad(selectedSquadTeam);
        }
        return; // Stop here, do not re-render whole page
    }
    // --- 2. SYNC TEAM WITH SERVER (On Connect/Reconnect) ---
    // If server says my team is different from what I thought (e.g. I timed out while away), update it.
    if (data.yourTeam !== undefined) {
        if (data.yourTeam === null && myTeam !== null) {
            // I was downgraded to spectator
            alert("⚠️ You were disconnected for too long. You are now a Spectator.");
            sessionStorage.removeItem('ipl_team');
            myTeam = null;
        } else {
            myTeam = data.yourTeam;
            if(myTeam) sessionStorage.setItem('ipl_team', myTeam);
        }
    }
    // --- 3. LOAD HISTORY (Chat/Logs) ---
    if (data.history) {
        const chatBox = document.getElementById("chat");
        const logBox = document.getElementById("log");
        if(chatBox) chatBox.innerHTML = "";
        if(logBox) logBox.innerHTML = "";
       
        if(chatBox && data.history.chat) {
            data.history.chat.forEach(m => {
                const div = document.createElement("div");
                div.innerHTML = `<b style="color:${TEAM_COLORS[m.team] || '#aaa'}">${m.team} (${m.user})</b>: ${m.msg}`;
                chatBox.appendChild(div);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        }
       
        if(logBox && data.history.logs) {
            data.history.logs.forEach(m => {
                const div = document.createElement("div");
                div.className = "log-item";
                div.innerText = m;
                logBox.appendChild(div);
            });
            logBox.scrollTop = logBox.scrollHeight;
        }
    }
    // --- 4. SAVE METADATA ---
    if (data.teamOwners) teamOwners = data.teamOwners;
    if (data.purses) teamPurse = data.purses;
   
    // --- 5. CHECK: HAS AUCTION ENDED? ---
   // Inside socket.on("joinedRoom", ...)
if (data.auctionEnded) {
        setupAuctionScreen(); // Prepare UI
       
        // Check for specific deep link target
        const target = sessionStorage.getItem('redirect_target');
       
        if (target === 'summary') {
            renderPostAuctionSummary();
            showScreen("postAuctionSummary");
        }
        else if (target === 'leaderboard') {
            showScreen("leaderboard");
        }
        else {
            // Default Logic
            if (myTeam) {
                showScreen("playingXI");
                socket.emit("getMySquad");
            } else {
                renderPostAuctionSummary();
                showScreen("postAuctionSummary");
            }
        }
       
        // Clear redirection so it doesn't persist forever
        sessionStorage.removeItem('redirect_target');
        return;
    }
    // --- 6. STANDARD SETUP ---
    roomCode = data.roomCode;
    sessionStorage.setItem('ipl_room', roomCode);
   
    if(data.rules) activeRules = data.rules;
    if(data.squads) allSquads = data.squads;
    isHost = data.isHost;
    gameStarted = data.auctionStarted;
   
    setupAuctionScreen();
    // Render Teams
    if (data.availableTeams) {
        renderEmbeddedTeams(data.availableTeams);
    }
    // Determine Screen Phase
    if (data.auctionStarted) {
        if (!myTeam && data.availableTeams && data.availableTeams.length > 0) {
            setGamePhase("TEAM_SELECT");
        } else {
            setGamePhase("AUCTION");
            updateHeaderNotice();
        }
    } else {
        setGamePhase("TEAM_SELECT");
        if (myTeam) {
             document.getElementById("embeddedTeamList").classList.add("hidden");
             document.getElementById("waitingForHostMsg").classList.remove("hidden");
             updateHeaderNotice();
        }
    }
   
    updateAdminButtons(data.auctionStarted);
   
    // Auto-Refresh Squad Window if open
    if(squadWindow && !squadWindow.closed) {
        socket.emit("getSquads");
    }
});
/* ================= USER LIST LOGIC (UPDATED PILL) ================= */
let userListInterval = null; // Global interval for the timer
socket.on("roomUsersUpdate", (data) => {
    // Handle both old format (array) and new format (object) for safety
    const users = Array.isArray(data) ? data : data.users;
    // --- 1. UPDATE BADGE (Unique Active Players / Total Teams) ---
    const countEl = document.getElementById("liveUserCount");
    if (countEl) {
        // A. Calculate Total Distinct Teams Taken
        const distinctTeams = new Set();
        users.forEach(u => {
            if (u.team) distinctTeams.add(u.team);
        });
        const totalTeamsTaken = distinctTeams.size;
        // B. Calculate Active Unique Players (Has Team AND Green Dot)
        const activeOwners = new Set();
        users.forEach(u => {
            // Must have a team (excludes spectators)
            // Must not be away or kicked (Green dot logic)
            if (u.team && u.status !== 'away' && u.status !== 'kicked') {
                activeOwners.add(u.name); // Using Name to deduplicate devices
            }
        });
        const activeUniqueCount = activeOwners.size;
        // C. Render
        countEl.innerText = `${activeUniqueCount} / ${totalTeamsTaken}`;
        // D. Color Logic
        if (totalTeamsTaken > 0) {
            if (activeUniqueCount === 0) {
                countEl.style.color = "#ef4444"; // Red (All active players gone)
            } else if (activeUniqueCount === totalTeamsTaken) {
                countEl.style.color = "#4ade80"; // Green (Everyone is here)
            } else {
                countEl.style.color = "#fbbf24"; // Yellow (Some missing)
            }
        } else {
            countEl.style.color = ""; // Default
        }
    }
    const box = document.getElementById("userListContent");
    if (!box) return;
    if (userListInterval) clearInterval(userListInterval);
    box.innerHTML = "";
    // ... (Host Detection Logic) ...
    const me = users.find(u => u.name === username);
    if (me && me.isHost && !isHost) {
        isHost = true;
        updateAdminButtons(gameStarted);
        alert("🜲 You are now the Host!");
    }
    // ... (Sort Logic) ...
    users.sort((a, b) => {
        if (a.name === username) return -1;
        if (a.isHost) return -1;
        if (a.status === 'kicked' && b.status !== 'kicked') return 1;
        if (a.team && !b.team) return -1;
        if (!a.team && b.team) return 1;
        return a.name.localeCompare(b.name);
    });
    const GRACE_PERIOD_MS = 90000;
    // ... (Render Logic) ...
    users.forEach(u => {
        const isMe = u.name === username;
        let statusColor = '#22c55e';
        if (u.status === 'away') statusColor = '#eab308';
        if (u.status === 'kicked') statusColor = '#ef4444';
        const statusShadow = (u.status === 'away' || u.status === 'kicked') ? 'none' : `0 0 8px ${statusColor}`;
       
        let extraInfoHTML = "";
        if (u.status === 'away' && u.disconnectTime) {
            const targetTime = u.disconnectTime + GRACE_PERIOD_MS;
            extraInfoHTML = `<span class="away-timer" data-target="${targetTime}">...</span>`;
        }
       
        const crownHTML = u.isHost ? `<span title="Host" style="margin-right:4px;">🜲</span>` : ``;
       
        let badgeHTML = u.team
            ? `<span class="ul-team" style="color:${TEAM_COLORS[u.team] || '#fbbf24'}">${u.team}</span>`
            : `<span style="opacity:0.5; font-size:0.7rem;">Spectator</span>`;
        const div = document.createElement("div");
        div.className = "ul-item";
        div.innerHTML = `
            <div class="ul-name" style="color:${u.status === 'kicked' ? '#64748b' : '#fff'};">
                <span class="ul-dot" style="background:${statusColor}; box-shadow:${statusShadow};"></span>
                ${crownHTML}
                ${u.name} ${isMe ? '(You)' : ''}
                ${extraInfoHTML}
            </div>
            ${badgeHTML}
        `;
        box.appendChild(div);
    });
    // ... (Interval Logic for timers) ...
    userListInterval = setInterval(() => {
        const timers = document.querySelectorAll('.away-timer');
        if (timers.length === 0) return;
        const now = Date.now();
        timers.forEach(span => {
            const target = parseInt(span.getAttribute('data-target'));
            const diff = target - now;
            if (diff <= 0) span.innerText = "0:00";
            else {
                const totalSec = Math.floor(diff / 1000);
                const m = Math.floor(totalSec / 60);
                const s = totalSec % 60;
                span.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
            }
        });
    }, 1000);
    refreshGlobalUI();
});
// --- FEED LOGIC ---
// --- COMMAND CENTER LOGIC ---
// --- FEED LOGIC ---
// --- COMMAND CENTER LOGIC ---
// 1. Switch Tabs (Sets / Feed / Squads)
window.switchCcTab = function(tabName) {
    // A. Update Buttons
    const buttons = document.querySelectorAll('.cc-tab-btn');
    buttons.forEach(b => {
        b.classList.remove('active');
        if(b.innerText.toLowerCase().includes(tabName)) b.classList.add('active');
    });
    // B. Show View
    document.querySelectorAll('.cc-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    // C. Trigger Data Refresh if needed
    if (tabName === 'squads') {
        if(typeof renderSquadTabs === 'function') renderSquadTabs();
        socket.emit("getSquads");
    }
    if (tabName === 'sets') {
        if(typeof renderSetsPanel === 'function') renderSetsPanel();
    }
};
// 2. Expand Toggle (Arrow)
window.toggleCcExpand = function() {
    const box = document.getElementById('commandCenter');
    const btn = document.getElementById('ccExpandBtn');
   
    box.classList.toggle('expanded');
   
    if(box.classList.contains('expanded')) {
        btn.innerText = "▲";
    } else {
        btn.innerText = "▼";
    }
};
// 3. Initialize Feed as Active
// (Optional: Call this on load if it doesn't default correctly)
// switchCcTab('feed');
function setupAuctionScreen() {
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("auctionUI").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    document.getElementById("roomCodeBar").classList.remove("hidden");
    document.getElementById("roomCodeText").innerText = roomCode;
    document.getElementById("shareBtn").classList.remove("hidden");
    updateBrowserURL(roomCode);
    socket.emit("getAuctionState");
    socket.emit("checkAdmin");
    socket.emit("getSquads");
}
socket.on("error", msg => {
    alert("❌ " + msg);
    if(msg.includes("not found") || msg.includes("closed") || msg.includes("expired")) {
        sessionStorage.clear();
        window.location.href = "/";
    }
});
socket.on("forceHome", (msg) => {
    alert("⚠️ " + msg + " Returning to Main Screen.");
    sessionStorage.clear();
    window.location.href = "/";
});
/* ================================================= */
/* ========= 3. TEAM SELECTION & SETUP ============= */
/* ================================================= */
function renderEmbeddedTeams(teams) {
    const box = document.getElementById("embeddedTeamList");
    if(!box) return;
    box.innerHTML = "";
   
    if(teams.length === 0) {
        box.innerHTML = "<p style='color:#ccc; padding:20px;'>All teams taken! You are a spectator.</p>";
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
    teams.sort().forEach(team => {
        const btn = document.createElement("button");
        btn.innerText = team;
        btn.className = "team-btn";
        btn.style.setProperty("--team-color", TEAM_COLORS[team] || "#94a3b8");
       
        btn.onclick = () => {
            myTeam = team;
            sessionStorage.setItem('ipl_team', team);
            socket.emit("selectTeam", { team, user: username });
           
            if(gameStarted) {
                setGamePhase("AUCTION");
                updateHeaderNotice();
            } else {
                document.getElementById("embeddedTeamList").classList.add("hidden");
                document.getElementById("waitingForHostMsg").classList.remove("hidden");
                updateHeaderNotice();
            }
           
            const lateBtn = document.getElementById("lateJoinBtn");
            if(lateBtn) lateBtn.classList.add("hidden");
        };
        box.appendChild(btn);
    });
   
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
socket.on("teamPicked", ({ team, user, remaining }) => {
    // 1. UPDATE OWNERS LIST IMMEDIATELY
    if (team && user) {
        teamOwners[team] = user; // <--- This fixes the Squad View "Available" bug
    } else if (team === null) {
        // Team was freed (user left/kicked)
        socket.emit("getAuctionState");
    }
    // 2. Logic for ME
    if(myTeam === team) {
        document.getElementById("teamSelectionMain").classList.add("hidden");
        if(gameStarted) {
            setGamePhase("AUCTION");
        } else {
            document.getElementById("waitingForHostMsg").classList.remove("hidden");
        }
        updateHeaderNotice();
        const lateBtn = document.getElementById("lateJoinBtn");
        if(lateBtn) lateBtn.classList.add("hidden");
    }
    // 3. Logic for OTHERS (Update buttons)
    if(!myTeam) {
        renderEmbeddedTeams(remaining);
        // Show join button if spectators exist
        const lateBtn = document.getElementById("lateJoinBtn");
        if (gameStarted && remaining.length > 0) {
            lateBtn.classList.remove("hidden");
        }
    }
    // 4. FORCE UI REFRESH
    refreshGlobalUI();
});
socket.on("adminPromoted", () => {
    isHost = true;
    updateAdminButtons(gameStarted);
    alert("🜲 You are now the Host!");
});
// Save Rules
const saveRulesBtn = document.getElementById("saveRules");
if(saveRulesBtn) {
    saveRulesBtn.onclick = () => {
        socket.emit("setRules", {
            maxPlayers: Number(document.getElementById("maxPlayers").value),
            maxForeign: Number(document.getElementById("maxForeign").value),
            purse: Number(document.getElementById("purse").value),
            minBat: Number(document.getElementById("minBat").value),
            minAll: Number(document.getElementById("minAll").value),
            minBowl: Number(document.getElementById("minBowl").value),
            minSpin: Number(document.getElementById("minSpin").value),
            minWK: Number(document.getElementById("minWK").value),
            maxForeignXI: Number(document.getElementById("maxForeignXI").value)
        });
    };
}
socket.on("rulesUpdated", data => {
    activeRules = data.rules;
    document.getElementById("rulesScreen").classList.add("hidden");
    setGamePhase("TEAM_SELECT");
    renderEmbeddedTeams(data.teams);
    updateAdminButtons(false);
    updateRulesUI();
});
/* ================================================= */
/* ============ 4. AUCTION GAMEPLAY ================ */
/* ================================================= */
socket.on("auctionStarted", () => {
    auctionLive = true;
    auctionPaused = false;
    gameStarted = true;
   
    if (myTeam) updateHeaderNotice();
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
    currentPlayer = d.player; // Store globally
    auctionLive = true;
    auctionPaused = false;
    lastBidTeam = null;
    lastTickSecond = null;
   
    document.getElementById('resultOverlay').classList.add('hidden');
    document.getElementById('currentBidder').classList.add('hidden');
    document.getElementById("auctionCard").classList.remove("pulse");
   
    updatePlayerCard(d.player, d.bid);
    updateBidButton({ bid: d.bid, player: d.player});
});
function updatePlayerCard(player, bid) {
    // 1. Update Name (Big Text)
    const nameEl = document.getElementById("playerName");
    if(nameEl) nameEl.innerText = player.name;
    // 2. Update Meta (Center Item: Role & Rating)
    const metaEl = document.getElementById("playerMeta");
    if(metaEl) {
        // Format: "BAT • ⭐85"
        metaEl.innerText = `${player.role} • ⭐${player.rating}`;
       
        // Optional: Color code the Role
        if(player.role === "BAT") metaEl.style.color = "#facc15"; // Yellow
        else if(player.role === "BOWL" || player.role === "PACE" || player.role === "SPIN") metaEl.style.color = "#38bdf8"; // Blue
        else if(player.role === "ALL") metaEl.style.color = "#a855f7"; // Purple
        else if(player.role === "WK") metaEl.style.color = "#fb923c"; // Orange
        else metaEl.style.color = "#cbd5e1"; // Default
    }
    // 3. Update Bid Amount
    const bidEl = document.getElementById("bid");
    if(bidEl) bidEl.innerText = `₹${bid.toFixed(2)} Cr`;
}
socket.on("timer", t => {
    document.getElementById("timer").innerText = "" + t;
    if(auctionLive && !auctionPaused && t <= 3 && t > 0 && t !== lastTickSecond) {
        lastTickSecond = t;
        safePlay(soundTick);
    }
});
const bidBtn = document.getElementById("bidBtn");
if(bidBtn) {
    bidBtn.onclick = () => {
        if(!myTeam) return alert("Select a team first!");
        if(bidBtn.disabled) return;
        socket.emit("bid");
    };
}
socket.on("bidUpdate", data => {
    safePlay(soundBid);
   
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
    updateBidButton({ bid: data.bid, player: currentPlayer });
});
function updateBidButton(state) {
    // 1. Basic Checks (Team, Auction Live, Paused)
    if(!myTeam || !auctionLive || auctionPaused) {
        bidBtn.disabled = true;
        return;
    }
    // 2. Prevent Self-Bidding
    if(lastBidTeam === myTeam) {
        bidBtn.disabled = true;
        return;
    }
    // 3. PURSE CHECK
    if(state && teamPurse && teamPurse[myTeam] !== undefined) {
        const nextBid = (state.bid || 0) + 0.05;
        if(teamPurse[myTeam] < nextBid) {
            bidBtn.disabled = true;
            return; // Not enough money
        }
    }
    // --- NEW LOGIC START ---
    // Get my current squad
    const mySquad = allSquads[myTeam] || [];
   
    // 4. MAX SQUAD SIZE CHECK
    // (activeRules.maxPlayers is set in the Rules Popup)
    if (activeRules.maxPlayers && mySquad.length >= activeRules.maxPlayers) {
        bidBtn.disabled = true;
        return; // Squad Full
    }
    // 5. MAX FOREIGNERS CHECK
    // We need to know if the CURRENT player on auction is foreign.
    // The 'state' object usually has the player details.
    // Assuming state.player exists and has a 'foreign' boolean property.
    if (state.player && state.player.foreign) {
        const currentForeignCount = mySquad.filter(p => p.foreign).length;
        if (activeRules.maxForeign && currentForeignCount >= activeRules.maxForeign) {
            bidBtn.disabled = true;
            return; // Foreign Limit Reached
        }
    }
    // --- NEW LOGIC END ---
    // If all checks pass, enable button
    bidBtn.disabled = false;
}
socket.on("sold", d => {
    safePlay(soundHammer);
    showResultStamp("SOLD", `TO ${d.team}`, TEAM_COLORS[d.team], false);
    if(d.purse) teamPurse = d.purse;
    updateHeaderNotice();
   
    // FIX: Live update without tab switch
    const currentTab = document.querySelector('.cc-tab-btn.active');
    // If we are in Squads tab AND looking at the team that just bought OR looking at 'Available'
    if(document.getElementById('view-squads') && !document.getElementById('view-squads').classList.contains('hidden')) {
        if(selectedSquadTeam === d.team) {
            viewEmbeddedSquad(selectedSquadTeam);
        }
    }
});
socket.on("unsold", () => {
safePlay(soundUnsold);
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
/* =========== 5. LOGS, CHAT & COMMAND CENTER ====== */
/* ================================================= */
/* ================================================= */
/* =========== 5. LOGS & CHAT (IMPROVED) =========== */
/* ================================================= */
// 1. CHAT UPDATE (Newest at Bottom)
socket.on("chatUpdate", d => {
    const chat = document.getElementById("chat");
    if(!chat) return;
    const isMe = (d.user === username); // Check if I sent it
    const div = document.createElement("div");
   
    // Distinguish between MY messages and OTHERS
    div.className = `chat-msg ${isMe ? 'mine' : 'others'}`;
   
    // Nice Formatting
    div.innerHTML = `
        <div class="chat-header" style="color:${TEAM_COLORS[d.team] || '#94a3b8'}">
            ${isMe ? 'You' : d.team + ' (' + d.user + ')'}
        </div>
        <div class="chat-bubble">
            ${d.msg}
        </div>
    `;
    chat.appendChild(div);
    // AUTO SCROLL TO BOTTOM
    // We use a slight timeout to ensure the DOM has rendered the new height
    setTimeout(() => {
        chat.scrollTop = chat.scrollHeight;
    }, 50);
    // Limit history to 50 messages to save memory
    if(chat.children.length > 50) chat.removeChild(chat.firstChild);
});
// 2. LOG UPDATE (Newest at TOP - Fixed)
// --- UPDATED LOGIC: Latest at Bottom, Max 3 Items ---
socket.on("logUpdate", msg => {
    const log = document.getElementById("log");
    if(!log) return;
    const div = document.createElement("div");
    div.className = "log-item";
   
    // Simple Timestamp + Message
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<span style="color:var(--gold); margin-right:5px;">${time}</span> ${msg}`;
   
    // 1. APPEND (Add to bottom)
    log.appendChild(div);
    // 2. SCROLL TO BOTTOM (Show latest)
    log.scrollTop = log.scrollHeight;
    // 3. LIMIT TO 3 ITEMS
    while (log.children.length > 3) {
        log.removeChild(log.firstChild); // Remove oldest from top
    }
});
// 3. SEND FUNCTION
window.sendChat = function() {
    const msgInput = document.getElementById("msg");
    const text = msgInput.value.trim();
    if(!text) return;
   
    socket.emit("chat", { user: username, team: myTeam || "Spectator", msg: text });
    msgInput.value = "";
    msgInput.focus(); // Keep keyboard open
};
// 4. ENTER KEY LISTENER
// Run this once when the page loads
document.addEventListener("DOMContentLoaded", () => {
    const msgInput = document.getElementById("msg");
    if(msgInput) {
        msgInput.addEventListener("keypress", function(event) {
            // If the user presses the "Enter" key on the keyboard
            if (event.key === "Enter") {
                event.preventDefault(); // Cancel the default action
                sendChat(); // Trigger the button element with a click
            }
        });
    }
});
// --- COMMAND CENTER LOGIC ---
window.switchInfoTab = function(tabName) {
    document.querySelectorAll('.info-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById('panel-feed').classList.add('hidden');
    document.getElementById('panel-squads').classList.add('hidden');
   
    const target = document.getElementById(`panel-${tabName}`);
    if(target) {
        target.classList.remove('hidden');
        target.style.display = "flex";
    }
    if (tabName === 'squads') {
        renderSquadTabs();
    }
};
function renderSquadTabs() {
    const container = document.getElementById("squadTabList");
    if(!container) return;
   
    const teams = Object.keys(allSquads).sort();
   
    if (!selectedSquadTeam && myTeam) selectedSquadTeam = myTeam;
    if (!selectedSquadTeam && teams.length > 0) selectedSquadTeam = teams[0];
    container.innerHTML = teams.map(t =>
        `<button onclick="viewEmbeddedSquad('${t}')"
         class="h-team-btn ${t === selectedSquadTeam ? 'active' : ''}">
         ${t}
         </button>`
    ).join("");
    if(selectedSquadTeam) viewEmbeddedSquad(selectedSquadTeam);
}
/* =========================================
   2. INITIALIZATION LOGIC
   (Creates the buttons inside your empty HTML div)
   ========================================= */
function initSquadTabs() {
    const tabContainer = document.getElementById('squadTabList');
    if (!tabContainer) return; // Safety check
    tabContainer.innerHTML = ''; // Clear any existing buttons
    // Create a button for each team in TEAM_COLORS
    Object.keys(TEAM_COLORS).forEach(team => {
        const btn = document.createElement('button');
        btn.innerText = team;
        btn.className = 'h-team-btn'; // Class for styling
       
        // When clicked, run the view function
        btn.onclick = () => viewEmbeddedSquad(team);
       
        tabContainer.appendChild(btn);
    });
}
/* =========================================
   3. MAIN VIEW LOGIC
   (Renders the selected team's details)
   ========================================= */
window.viewEmbeddedSquad = function(team) {
    selectedSquadTeam = team;
    // 1. Tab Logic
    document.querySelectorAll('.h-team-btn').forEach(b => b.classList.remove('active'));
    Array.from(document.querySelectorAll('.h-team-btn')).find(b => b.innerText === team)?.classList.add('active');
    // 2. Data
    const box = document.getElementById("embeddedSquadView");
    const squad = allSquads[team] || [];
    const purse = teamPurse[team] || 0;
    const owner = teamOwners[team] || "Available";
    const foreignCount = squad.filter(p => p.foreign).length;
    const teamColor = TEAM_COLORS[team] || '#fff';
    // 3. Categorize
    const cat = { WK: [], BAT: [], ALL: [], BOWL: [] };
    squad.forEach(p => {
        if(cat[p.role]) cat[p.role].push(p);
        else cat.BOWL.push(p);
    });
    // --- HELPER: Generate "Pro" Player Rows ---
    const generateProCardHTML = (players) => {
        return players.map(p => `
            <div class="pro-player-card" style="border-left-color:${teamColor}">
                <div class="pp-left">
                    <span class="pp-name">
                        ${p.foreign ? '<span class="foreign-icon">✈️</span>' : ''} ${p.name}
                    </span>
                </div>
                <div class="pp-right" style="text-align:right;">
                    <span class="pp-price">₹${p.price.toFixed(2)}</span>
                    <span class="pp-rating" style="color:#888; font-size:0.75rem;">⭐${p.rating}</span>
                </div>
            </div>
        `).join('');
    };
    // 4. INJECT HTML (Dashboard View + Hidden Professional Card)
    box.innerHTML = `
        <div id="squad-display-container">
            <div class="squad-header-compact">
                <h2 style="color:${teamColor}; margin:0;">${team}</h2>
                <div style="display:flex; justify-content:space-between; margin-top:5px; color:#aaa; font-size:0.9rem;">
                    <span>Mgr: <span style="color:#fff">${owner}</span></span>
                    <span style="color:#4ade80; font-weight:bold;">₹${purse.toFixed(2)} Cr</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.8rem;">
                    <span style="color:#ccc;">𐀪 : ${squad.length} | <strong>OS: ${foreignCount}</strong></span>
                    <button onclick="downloadSquadImage()" style="cursor:pointer; background:#222; border:1px solid #444; color:#facc15; padding:4px 10px; border-radius:4px;">
                        <i class="fas fa-download"></i> [⇩]
                    </button>
                </div>
            </div>
            <div id="view-squad-list" class="compact-list"></div>
        </div>
        <div id="squad-card-capture">
            <div class="capture-bg-watermark" style="background-image: url('/logos/${team}.png');"></div>
           
            <div class="pro-header">
                <div class="pro-team-info">
                    <h1 style="background: linear-gradient(to bottom, #fff, ${teamColor}); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${team}</h1>
                    <h3>${owner}</h3>
                </div>
                <div class="pro-header-stats">
                    <div class="stat-box">
                        <div class="stat-label">Purse Remaining</div>
                        <div class="stat-val" style="color:#4ade80;">₹${purse.toFixed(2)} <small style="font-size:1rem;">Cr</small></div>
                    </div>
                    <div style="color:#aaa; font-size:0.9rem; letter-spacing:1px; margin-top:5px;">
                        SQUAD SIZE: <strong style="color:#fff;">${squad.length}</strong> &nbsp;|&nbsp; OVERSEAS: <strong style="color:#fff;">${foreignCount}</strong>
                    </div>
                </div>
            </div>
            <div class="pro-body">
                <div class="pro-col">
                    <div class="pro-col-header" style="border-color:${teamColor}; color:${teamColor};">🖑 WICKET KEEPERS</div>
                    ${generateProCardHTML(cat.WK)}
                </div>
                <div class="pro-col">
                    <div class="pro-col-header" style="border-color:${teamColor}; color:${teamColor};">➘ BATTERS</div>
                    ${generateProCardHTML(cat.BAT)}
                </div>
                <div class="pro-col">
                    <div class="pro-col-header" style="border-color:${teamColor}; color:${teamColor};">☄ ALL ROUNDERS</div>
                    ${generateProCardHTML(cat.ALL)}
                </div>
                <div class="pro-col">
                    <div class="pro-col-header" style="border-color:${teamColor}; color:${teamColor};">⚾︎ BOWLERS</div>
                    ${generateProCardHTML(cat.BOWL)}
                </div>
            </div>
            <div class="pro-footer">
                Official Auction Summary • Generated by AuctionDashboard
            </div>
        </div>
    `;
    // 5. Populate Visible List (Same as before)
    const viewList = document.getElementById("view-squad-list");
    ['WK', 'BAT', 'ALL', 'BOWL'].forEach(r => {
        if(cat[r].length > 0) {
            const h = document.createElement("div");
            h.className = "role-header";
            h.innerText = r;
            viewList.appendChild(h);
            cat[r].forEach(p => {
                const row = document.createElement("div");
                row.className = "sq-row";
                row.innerHTML = `<span>${p.foreign ? '✈️' : ''} ${p.name}</span><span style="color:#4ade80;">₹${p.price.toFixed(2)}</span>`;
                row.onclick = () => { if(window.openPlayerProfile) window.openPlayerProfile(p, team, p.price); };
                viewList.appendChild(row);
            });
        }
    });
};
window.downloadSquadImage = function() {
    const element = document.getElementById("squad-card-capture");
    const teamName = selectedSquadTeam || "Squad";
    html2canvas(element, {
        width: 1200,
        height: 1200,
        windowWidth: 1200,
        windowHeight: 1200,
        scrollX: 0,
        scrollY: 0,
        scale: 2, // High Quality Export
        useCORS: true,
        backgroundColor: "#111111", // Matches the dark theme base
        letterRendering: 1
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${teamName}_Official_Card.png`;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
};
// ==========================================
// UTILS: PLAYER CARDS & IMAGES
// ==========================================
function loadPlayerImage(imgEl, playerName) {
    if(!playerName) return;
    const raw = playerName.trim();
    const noSpace = raw.replace(/\s+/g, '');
    const withUnderscore = raw.replace(/\s+/g, '_');
    const upperUnderscore = withUnderscore.toUpperCase();
    const candidates = [
        `/players/${upperUnderscore}.png`, // VIRAT_KOHLI.png
        `/players/${noSpace}.png`, // ViratKohli.png
        `/players/${raw}.png`, // Virat Kohli.png
        "https://resources.premierleague.com/premierleague/photos/players/250x250/Photo-Missing.png" // Fallback
    ];
    let attempt = 0;
    function tryNext() {
        if (attempt >= candidates.length) {
            imgEl.src = candidates[candidates.length - 1];
            return;
        }
        imgEl.src = candidates[attempt];
        imgEl.onerror = function() {
            attempt++;
            tryNext();
        };
    }
    tryNext();
}
window.openPlayerProfile = function(playerData, teamName, price) {
    const existing = document.getElementById('playerCardOverlay');
    if(existing) existing.remove();
    const team = teamName || "Unsold";
    const amount = price ? `₹${price.toFixed(2)} Cr` : "---";
    const teamColor = TEAM_COLORS[team] || "#64748b";
   
    const html = `
    <div id="playerCardOverlay" class="player-card-overlay" onclick="closePlayerCard(event)">
        <div class="pc-card compact" data-team="${team}" onclick="event.stopPropagation()">
            <div class="pc-bg-layer"></div>
            <div class="pc-content">
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center; z-index:10;">
                    <span style="font-weight:bold; color:rgba(255,255,255,0.5); font-size:0.9rem;">${team}</span>
                    <button onclick="document.getElementById('playerCardOverlay').remove()" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">✕</button>
                </div>
               
                <div class="pc-img-box" style="border-color:${teamColor}">
                    <img id="activeCardImg" class="pc-img" alt="${playerData.name}">
                </div>
                <div class="pc-info">
                    <div class="pc-name">${playerData.name}</div>
                    <div class="pc-role">${playerData.foreign ? '✈️' : ''} ${playerData.role}</div>
                </div>
                <div class="pc-stat-row">
                    <div class="pc-stat">
                        <span class="pc-stat-lbl">RATING</span>
                        <span class="pc-stat-val">⭐${playerData.rating}</span>
                    </div>
                     <div class="pc-stat">
                        <span class="pc-stat-lbl">STATUS</span>
                        <span class="pc-stat-val" style="color:${price ? '#4ade80' : '#fff'}">${price ? 'SOLD' : 'UPCOMING'}</span>
                    </div>
                </div>
                <div class="pc-price-tag" style="color:${teamColor}">${amount}</div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const imgEl = document.getElementById('activeCardImg');
    loadPlayerImage(imgEl, playerData.name);
};
window.closePlayerCard = function(e) {
    if(e.target.id === 'playerCardOverlay') e.target.remove();
}
/* =========================================
   5. EXECUTE ON LOAD
   ========================================= */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize the buttons
    initSquadTabs();
    let startTeam = "CSK";
    if (typeof myTeam !== 'undefined' && myTeam) {
        startTeam = myTeam;
    } else if (typeof userTeam !== 'undefined' && userTeam) {
        startTeam = userTeam;
    }
    // 3. Open that team's view
    if (allSquads[startTeam] || teamPurse[startTeam]) {
        viewEmbeddedSquad(startTeam);
    } else {
        // Safety fallback: just open the first team in the list
        const firstTeam = Object.keys(TEAM_COLORS)[0];
        viewEmbeddedSquad(firstTeam);
    }
});
/* ================================================= */
/* =========== 6. POPUPS (SETS, RULES, ADMIN) ====== */
/* ================================================= */
/* ================================================= */
/* ========= 4. SETS & SQUAD VIEWING =============== */
/* ================================================= */
// --- A. UPCOMING SETS LOGIC ---
let isSetsViewOpen = false;
// --- UPDATED: Set Update Listener (Fixes Live Refresh) ---
socket.on("setUpdate", data => {
    remainingSets = data;
   
    // Check if the panel is visible, if so, re-render immediately
    const setsPanel = document.getElementById("panel-sets");
    // We check if the panel exists and does NOT have the 'hidden' class
    if(setsPanel && !document.getElementById("view-sets").classList.contains('hidden')){
        renderSetsPanel();
    }
});
// Toggle between Normal View and Sets View
window.toggleSetsView = function() {
    const btn = document.getElementById("toggleSetsBtn");
    const setsPanel = document.getElementById("panel-sets");
    const tabs = document.getElementById("commandTabs");
   
    // Panels to hide/show
    const feedPanel = document.getElementById("panel-feed");
    const squadsPanel = document.getElementById("panel-squads");
    // Toggle State
    isSetsViewOpen = !isSetsViewOpen;
    if (isSetsViewOpen) {
        // --- CHECK IF DATA EXISTS ---
        if(!remainingSets || remainingSets.length === 0){
            alert("No sets available yet.");
            isSetsViewOpen = false; // Reset state
            return;
        }
        // --- SWITCH TO SETS VIEW ---
        btn.innerText = "❌ Close Sets View";
        btn.style.borderColor = "var(--accent)";
        btn.style.color = "var(--accent)";
       
        // Hide normal tabs content & nav bar
        if(feedPanel) feedPanel.classList.add("hidden");
        if(squadsPanel) squadsPanel.classList.add("hidden");
        if(tabs) tabs.classList.add("hidden");
       
        // Show Sets Panel
        if(setsPanel) {
            setsPanel.classList.remove("hidden");
            renderSetsPanel();
        }
       
    } else {
        // --- CLOSE SETS VIEW (Back to Normal) ---
        btn.innerText = "📦 View Upcoming Sets";
        btn.style.borderColor = "var(--gold)";
        btn.style.color = "var(--gold)";
        if(setsPanel) setsPanel.classList.add("hidden");
        if(tabs) tabs.classList.remove("hidden");
       
        // Restore the "Feed" tab by default so the UI isn't empty
        switchInfoTab('feed');
    }
};
// --- HELPER: Handle clicks from the Squad Sheet ---
window.viewPlayerFromCard = function(name, role, rating, isForeign, price, teamName) {
    // Reconstruct the player object expected by openPlayerProfile
    const playerObj = {
        name: name,
        role: role,
        rating: rating,
        foreign: isForeign
    };
   
    // Call the existing profile opener
    openPlayerProfile(playerObj, teamName, price);
};
// --- HELPER: Click Handler for Set Players ---
window.viewSetPlayer = function(name, role, rating, isForeign) {
    // Construct the player object needed by the profile card
    const playerData = {
        name: name,
        role: role,
        rating: rating,
        foreign: isForeign
    };
    // Open profile with no team (null) and no price (null) -> "Normal Background"
    openPlayerProfile(playerData, null, null);
};
function renderSetsPanel() {
    const container = document.getElementById("panel-sets");
    if(!container || !remainingSets.length) return;
    const activeSet = remainingSets[0];
    // Updated HTML: Added onclick and cursor:pointer
    let html = `
        <div style="padding:10px;">
            <h2 class="set-title active">🔥 ${activeSet.name} (${activeSet.players.length})</h2>
            <div>
                ${activeSet.players.map(p => `
                    <div class="set-player-row active-p"
                         style="cursor: pointer;"
                         onclick="viewSetPlayer('${p.name}', '${p.role}', ${p.rating}, ${p.foreign})">
                        <span>${p.name}</span>
                        <div>
                            <span class="sp-role">${p.role}</span>
                            <span class="sp-rating">⭐ ${p.rating}</span>
                        </div>
                    </div>
                `).join("")}
                ${activeSet.players.length===0 ? '<div style="padding:10px; color:#666; text-align:center;">Set Finished</div>' : ''}
            </div>
    `;
    // Upcoming Sets
    if(remainingSets.length > 1) {
        remainingSets.slice(1).forEach(set => {
            html += `
                <h2 class="set-title">📦 ${set.name} (${set.players.length})</h2>
                <div style="opacity: 0.6;">
                    ${set.players.map(p => `
                        <div class="set-player-row"
                             style="cursor: pointer;"
                             onclick="viewSetPlayer('${p.name}', '${p.role}', ${p.rating}, ${p.foreign})">
                            <span>${p.name}</span>
                            <div><span class="sp-role">${p.role}</span></div>
                        </div>
                    `).join("")}
                </div>
            `;
        });
    }
    html += `</div>`;
    container.innerHTML = html;
}
// --- SQUADS DATA ---
// --- UPDATED: Socket Listener for Squad Data ---
socket.on("squadData", squads => {
    allSquads = squads; // Update global variable
   
    // LIVE REFRESH: If the "Squads" tab is currently open, refresh it immediately.
    const squadView = document.getElementById('view-squads');
    if (squadView && !squadView.classList.contains('hidden')) {
        // Only refresh if we have a selected team
        if(selectedSquadTeam) {
            viewEmbeddedSquad(selectedSquadTeam);
        }
    }
});
// --- ADMIN ---
/* ================= UPDATED ADMIN & LEAVE LOGIC ================= */
// 1. Logic for the NEW Leave Button (Non-Hosts)
const leaveBtn = document.getElementById("leaveBtn");
if (leaveBtn) {
    leaveBtn.onclick = () => {
        if (confirm("⚠️ LEAVE AUCTION?\n\nYou will lose your spot immediately and be marked as 'Away'.\nDo you want to continue?")) {
            // 1. Clear Local Session Data
            sessionStorage.clear();
           
            // 2. Force Socket Disconnect (Server marks you as 'Away' -> 'Kicked')
            socket.disconnect();
           
            // 3. Redirect to Main Screen
            window.location.href = "/";
        }
    };
}
// 2. Updated Visibility Logic
function updateAdminButtons(isStarted) {
    const adminPanel = document.getElementById("adminControls");
    const leaveBtn = document.getElementById("leaveBtn");
    const endBtn = document.getElementById("endBtn");
    const startBtn = document.getElementById("startBtn");
    // All controls (Pause, Skip, etc.)
    const controls = document.querySelectorAll("#togglePauseBtn, #skipBtn, #skipSetBtn");
    if (!adminPanel) return;
    // --- CASE 1: YOU ARE HOST ---
    if (isHost) {
        adminPanel.classList.remove("hidden");
       
        // Host never sees "Leave", they must End the game
        if(leaveBtn) leaveBtn.classList.add("hidden");
       
        // Show "End" button for Host
        if(endBtn) {
            endBtn.classList.remove("hidden");
            endBtn.style.display = "inline-block"; // Force display
        }
        if (!isStarted) {
            // Pre-Game: Show Start
            if (startBtn) startBtn.classList.remove("hidden");
            controls.forEach(b => b.classList.add("hidden"));
        } else {
            // In-Game: Hide Start, Show Controls
            if (startBtn) startBtn.classList.add("hidden");
            controls.forEach(b => b.classList.remove("hidden"));
        }
    }
    // --- CASE 2: YOU ARE A PLAYER/SPECTATOR ---
    else {
        // STRICTLY HIDE END BUTTON & CONTROLS
        if(endBtn) {
            endBtn.classList.add("hidden");
            endBtn.style.setProperty("display", "none", "important"); // CSS Override
        }
        if (startBtn) startBtn.classList.add("hidden");
        controls.forEach(b => b.classList.add("hidden"));
        // HANDLE LEAVE BUTTON
        // Only show if I have a team (Player) -> Hide if I am just watching (Spectator)
        if (myTeam && leaveBtn) {
            adminPanel.classList.remove("hidden"); // Panel must be visible for the button
            leaveBtn.classList.remove("hidden");
        } else {
            // Spectators see no admin panel at all
            adminPanel.classList.add("hidden");
        }
    }
}
// 3. Existing Admin Event Listeners (Kept Intact)
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
// Optional: If you have an End Button in HTML
const endBtn = document.getElementById("endBtn");
if(endBtn) endBtn.onclick = () => window.admin('end');
/* ================================================= */
/* ========= 7. UTILS & HELPERS ==================== */
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
window.toggleUserList = function() {
    const list = document.getElementById("userListDropdown");
    list.classList.toggle("hidden");
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
function updateHeaderNotice() {
    // 1. Handle Spectator Mode
    if (!myTeam) {
        const teamEl = document.getElementById("noticeTeam");
        const purseEl = document.getElementById("noticePurse");
       
        if(teamEl) {
            teamEl.innerText = "SPECTATOR";
            teamEl.style.color = "#94a3b8"; // Muted gray
        }
        if(purseEl) {
            purseEl.innerText = ""; // Hide purse for spectators
        }
        return;
    }
    // 2. Handle Team Owner Mode
    const purse = teamPurse[myTeam] !== undefined ? teamPurse[myTeam] : 0;
    const teamEl = document.getElementById("noticeTeam");
    const purseEl = document.getElementById("noticePurse");
    if(teamEl) {
        teamEl.innerText = myTeam;
        // Use the team color for the name
        teamEl.style.color = TEAM_COLORS[myTeam] || "white";
        // Optional: Add a text shadow for better visibility
        teamEl.style.textShadow = `0 0 10px ${TEAM_COLORS[myTeam] || 'rgba(0,0,0,0)'}`;
    }
    if(purseEl) {
        purseEl.innerText = `₹${purse.toFixed(2)} Cr`;
        purseEl.style.color = "#4ade80"; // Keep Green for money
    }
}
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
    set('pop_viewForeignXI', r.maxForeignXI);
   
    set('viewPurse', r.purse);
    set('viewSquadSize', r.maxPlayers);
    set('viewForeign', r.maxForeign);
}
function showScreen(id, updateHistory = true) {
    // 1. Hide all screens
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
   
    // 2. Show target screen
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
    // 3. Update URL (Routing)
    // We pass false to updateHistory when using Back Button to avoid loop
    if (updateHistory) {
        if (id === 'postAuctionSummary') updateURL('summary');
        else if (id === 'leaderboard') updateURL('leaderboard');
        else if (id === 'playingXI') updateURL('xi');
        else if (id === 'auctionUI') updateURL('auction');
    }
}
/* ================================================= */
/* ========= 8. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */
// --- 1. SETUP & STATE ---
// We use an object to track selection by role so we can sort the card (WK -> BAT -> ALL -> BOWL)
/* ================================================= */
/* ========= 8. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */
/* ================================================= */
/* ========= 8. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */
/* ================================================= */
/* ========= 8. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */
/* ================================================= */
/* ========= 8. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */
socket.on("auctionEnded", () => {
    // Enable scrolling
    document.body.style.overflow = "auto";
   
    // Ensure we have the latest data
    socket.emit("getAuctionState");
    socket.emit("getSquads");
    if (myTeam) {
        // I am a Player: Go to Submit XI
        showScreen("playingXI");
        socket.emit("getMySquad");
    } else {
        // I am a Spectator: Go to Summary
        setTimeout(() => {
            renderPostAuctionSummary();
            showScreen("postAuctionSummary");
        }, 500); // Small delay to ensure data arrives
    }
});
// --- 2. RENDER SELECTION LIST (FIXED) ---
socket.on("mySquad", ({ squad, rules }) => {
    if(rules) activeRules = rules;
    updateRulesUI();
    // Reset Selection
    selectedXI = { WK: [], BAT: [], ALL: [], BOWL: [] };
   
    const container = document.getElementById("mySquadList");
    if(!container || !squad) return;
    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "xi-select-container";
    // Standard Cricket Role Order
    const roleGroups = { WK: "Wicket Keepers", BAT: "Batsmen", ALL: "All Rounders", BOWL: "Bowlers" };
    Object.keys(roleGroups).forEach(key => {
        // Filter players (Combine Pace/Spin into Bowl)
        const players = squad.filter(p => {
            if(key === "BOWL") return ["PACE", "SPIN", "BOWL"].includes(p.role);
            return p.role === key;
        });
        if(players.length > 0) {
            // Group Title
            const title = document.createElement("div");
            title.className = "role-group-title";
            title.innerText = roleGroups[key];
            grid.appendChild(title);
            // Player Selection Buttons
            players.forEach(p => {
                const btn = document.createElement("div");
                btn.className = "xi-player-btn";
                btn.id = `sel-btn-${p.name.replace(/[^a-zA-Z0-9]/g, '')}`;
                btn.innerHTML = `
                    <div style="font-weight:bold;">${p.name} ${p.foreign ? '✈️' : ''}</div>
                    <div style="font-size:0.75rem; color:#aaa;">⭐${p.rating} • ₹${p.price}</div>
                `;
                btn.onclick = () => togglePlayerXI(p, btn, key);
                grid.appendChild(btn);
            });
        }
    });
    container.appendChild(grid);
    updateXIPreview();
});
// --- 3. TOGGLE PLAYERS ---
// --- 3. TOGGLE PLAYERS (FIXED BUTTON LOGIC) ---
// --- 3. TOGGLE PLAYERS (FIXED BUTTON RESET) ---
function togglePlayerXI(p, btnElement, roleKey) {
    const list = selectedXI[roleKey];
    const index = list.findIndex(x => x.name === p.name);
    if(index > -1) {
        list.splice(index, 1);
        btnElement.classList.remove("picked");
    } else {
        if(countTotalXI() >= 11) return alert("Playing XI is Full (11/11).");
        list.push(p);
        btnElement.classList.add("picked");
    }
    // RESET BUTTON STATE: If user changes anything, allow them to submit again
    const submitBtn = document.getElementById('submitXIBtn');
    const saveBtn = document.getElementById('saveXIBtn');
   
    if(submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = `Submit XI (${countTotalXI()}/11)`;
        submitBtn.classList.remove('hidden'); // Show button
        submitBtn.style.background = ""; // Reset color
    }
    if(saveBtn) saveBtn.classList.add('hidden'); // Hide save until submitted
    // Hide previous status message
    const statusDiv = document.getElementById("xiStatus");
    if(statusDiv) statusDiv.innerHTML = "";
    updateXIPreview();
}
// --- 5. SUBMIT LOGIC (FIXED) ---
window.submitXI = function() {
    if(countTotalXI() !== 11) return alert("Please select exactly 11 players.");
   
    // Send the Object structure: { WK: [...], BAT: [...] }
    const payload = selectedXI;
    const btn = document.getElementById("submitXIBtn");
    if(btn) { btn.disabled = true; btn.innerText = "Submitting..."; }
    // Send 'team' explicitly to prevent server silent fail
    socket.emit("submitXI", { team: myTeam, xi: payload });
};
function countTotalXI() {
    return selectedXI.WK.length + selectedXI.BAT.length + selectedXI.ALL.length + selectedXI.BOWL.length;
}
// --- 4. RENDER PREVIEW CARD (FANTASY STYLE COMPACT) ---
// Shared function for both Preview & Leaderboard to ensure they match
function generateFantasyCardHTML(teamName, xiData, rating, count, isPreview = false) {
    const logoUrl = `/logos/${teamName}.png`;
    let grouped = { WK: [], BAT: [], ALL: [], BOWL: [] };
   
    if (Array.isArray(xiData)) {
        xiData.forEach(p => {
            let r = p.role;
            if (['PACE', 'SPIN'].includes(r)) r = 'BOWL';
            if (grouped[r]) grouped[r].push(p);
        });
    } else {
        grouped = xiData;
    }
    const roles = ['WK', 'BAT', 'ALL', 'BOWL'];
    let rowsHTML = '';
    roles.forEach(r => {
        const players = grouped[r];
        if (players && players.length > 0) {
            rowsHTML += `
            <div class="fantasy-row">
                <div class="fantasy-role-label">${r}</div>
                <div class="fantasy-player-row">
                    ${players.map(p => {
                        // Truncate Name Logic
                        let displayName = p.name;
                        if (displayName.length > 12) {
                            const parts = displayName.split(' ');
                            if (parts.length > 1) displayName = parts[0][0] + ". " + parts.slice(1).join(" ");
                        }
                       
                        return `
                        <div class="fantasy-player-pill ${p.foreign ? 'foreign' : ''}">
                            <div class="fp-name" title="${p.name}">${displayName}</div>
                            <div class="fp-sub">${p.foreign ? '✈️ ' : ''}⭐${p.rating}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }
    });
    return `
    <div id="${isPreview ? 'xiCardTarget' : 'generatedCard'}" class="fantasy-card" style="--team-logo: url('${logoUrl}');">
        <div class="fantasy-header">
            <h2 class="fantasy-title">${teamName}</h2>
            ${rating ? `<div class="fantasy-rating">RATING: ${rating}</div>` : '<div class="fantasy-subtitle">OFFICIAL XI</div>'}
        </div>
        <div class="fantasy-body">
            ${rowsHTML || '<div style="text-align:center; padding:20px; color:#666;">Select players...</div>'}
        </div>
        <div class="fantasy-footer">
            <span>IPL AUCTION LIVE</span>
            <span>${count}/11</span>
        </div>
    </div>`;
}
// Update the preview on the page
function updateXIPreview() {
    const count = countTotalXI();
    const container = document.getElementById('xiCardWrapper'); // Wrapper div in HTML
   
    if(container) {
        container.innerHTML = generateFantasyCardHTML(myTeam || "MY TEAM", selectedXI, null, count, true);
        container.classList.remove('hidden');
    }
    // UI State
    const placeholder = document.getElementById('xiPlaceholder');
    const btn = document.getElementById('submitXIBtn');
    const saveBtn = document.getElementById('saveXIBtn');
    if (count === 0) {
        if(container) container.classList.add('hidden');
        if(placeholder) placeholder.classList.remove('hidden');
        if(saveBtn) saveBtn.classList.add('hidden');
    } else {
        if(container) container.classList.remove('hidden');
        if(placeholder) placeholder.classList.add('hidden');
        if(saveBtn) count === 11 ? saveBtn.classList.remove('hidden') : saveBtn.classList.add('hidden');
    }
    if(btn) {
        btn.innerText = count === 11 ? "Submit XI" : `Select (${count}/11)`;
        btn.disabled = count !== 11;
        btn.style.background = count === 11 ? "var(--success)" : "";
        btn.style.color = count === 11 ? "#000" : "#fff";
    }
   
    updateStatsBar();
}
function updateStatsBar() {
    const bar = document.getElementById("xiStatsBar");
    const r = activeRules || { maxForeignXI: 4, minWK: 1, minBat: 3, minBowl: 3,minAll: 1, minSpin: 0 };
    if(!bar) return;
    const all = [...selectedXI.WK, ...selectedXI.BAT, ...selectedXI.ALL, ...selectedXI.BOWL];
    const foreign = all.filter(p => p.foreign).length;
    const spinCount = selectedXI.BOWL.filter(p => p.role === "SPIN").length;
   
    const badge = (label, curr, req, isMax) => {
        const valid = isMax ? curr <= req : curr >= req;
        const color = valid ? '#4ade80' : '#f87171';
        return `<span style="border:1px solid ${color}; color:${color}; padding:3px 6px; border-radius:4px; font-size:0.7rem; background:rgba(0,0,0,0.4);">${label}: ${curr}/${req}</span>`;
    };
    bar.innerHTML = `
        ${badge("✈", foreign, r.maxForeignXI, true)}
        ${badge("🖑", selectedXI.WK.length, r.minWK)}
        ${badge("🏏", selectedXI.BAT.length, r.minBat)}
        ${badge("☄", selectedXI.ALL.length, r.minAll)}
        ${badge("🥎", selectedXI.BOWL.length, r.minBowl)}
        ${badge("🥎", spinCount, r.minSpin)}
    `;
}
// --- 5. SUBMIT ---
window.resetXISelection = function() {
    if(confirm("Reset Selection?")) {
        selectedXI = { WK: [], BAT: [], ALL: [], BOWL: [] };
        document.querySelectorAll('.xi-player-btn').forEach(b => b.classList.remove('picked'));
        updateXIPreview();
    }
};
window.downloadSheetPNG = function() {
    const el = document.getElementById('xiCardTarget');
    html2canvas(el, { backgroundColor: null, scale: 3, useCORS: true }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Playing_XI.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};
// --- 6. LEADERBOARD & RESULT ---
socket.on("submitResult", (res) => {
    const btn = document.getElementById("submitXIBtn");
    const status = document.getElementById("xiStatus");
   
    if(status) {
        status.innerHTML = `
        <div style="padding:15px; text-align:center; border:1px solid ${res.disqualified ? '#ef4444' : '#22c55e'}; background:#0f172a; border-radius:12px; margin-top:20px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <h2 style="margin:0 0 5px 0; color:${res.disqualified ? '#ef4444' : '#22c55e'}">${res.disqualified ? '❌ DISQUALIFIED' : '✅ APPROVED'}</h2>
            <div style="font-size:0.9rem; color:#ccc;">RATING: <b style="color:#fff; font-size:1.1rem;">${res.rating}</b></div>
            ${res.disqualified ? `<div style="margin-top:5px; color:#fca5a5; font-size:0.85rem;">Reason: ${res.reason}</div>` : ''}
           
            ${res.disqualified ? `<button onclick="document.getElementById('submitXIBtn').disabled=false; document.getElementById('submitXIBtn').innerText='Fix Team'; this.parentElement.remove();" style="margin-top:10px; background:#334155; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Edit</button>` : ''}
        </div>`;
    }
    if (btn && !res.disqualified) {
        btn.classList.add("hidden");
        document.getElementById("saveXIBtn").classList.remove("hidden");
    }
});
// --- LEADERBOARD POPUP LOGIC ---
let currentPopupData = null; // Store data to switch views
function openSquadView(data) {
    currentPopupData = data;
    const overlay = document.getElementById("squadViewOverlay");
   
    // Default to Playing XI view
    renderPopupContent('XI');
   
    overlay.classList.remove("hidden");
}
window.switchPopupView = function(mode) {
    // Toggle Button Styles
    const btnXI = document.getElementById('btnShowXI');
    const btnFull = document.getElementById('btnShowFull');
   
    if(mode === 'XI') {
        btnXI.classList.add('active');
        btnFull.classList.remove('active');
    } else {
        btnFull.classList.add('active');
        btnXI.classList.remove('active');
    }
   
    renderPopupContent(mode);
}
function renderPopupContent(mode) {
    const container = document.getElementById("squadCaptureArea");
    const d = currentPopupData;
    const fullSquad = allSquads[d.team] || [];
   
    // Ensure purse is a number for toFixed
    const safePurse = Number(d.purse || teamPurse[d.team] || 0);
    if (mode === 'XI') {
        container.innerHTML = generateFantasyCardHTML(d.team, d.xi, d.rating, 11, false);
        // ... (download handler)
    } else {
        // Use New 4-Column Generator
        container.innerHTML = generateFullSquadHTML(d.team, fullSquad, safePurse, "Manager");
        // ... (download handler)
    }
}
// --- FIX: LEADERBOARD DOWNLOAD BUTTON ---
window.downloadPopupCard = function() {
    if (currentPopupData && currentPopupData.team) {
        const el = document.getElementById('squadCaptureArea').firstElementChild;
        const isXI = document.getElementById('btnShowXI').classList.contains('active');
        html2canvas(el, { backgroundColor: "#020617", scale: 3 }).then(c => {
            const a = document.createElement('a');
            a.download = `${currentPopupData.team}_${isXI ? 'XI' : 'Squad'}.png`;
            a.href = c.toDataURL();
            a.click();
        });
    }
};
window.downloadLeaderboardPNG = function() {
    const el = document.getElementById('generatedCard');
    html2canvas(el, { backgroundColor: null, scale: 3 }).then(canvas => {
        const a = document.createElement('a');
        a.download = `Squad_Card.png`;
        a.href = canvas.toDataURL();
        a.click();
    });
}
socket.on("leaderboard", (board) => {
    const tbody = document.getElementById("leaderboardBody");
    if(tbody) {
        tbody.innerHTML = "";
        board.forEach((t, i) => {
            const tr = document.createElement("tr");
           
            // Status Badge
            const statusHtml = t.disqualified
                ? `<span class="lb-status-badge lb-status-disqualified">❌ DQ</span>`
                : `<span class="lb-status-badge lb-status-qualified">✅ OK</span>`;
            tr.innerHTML = `
                <td>#${i+1}</td>
                <td>
                    <div class="lb-team-name" style="color:${TEAM_COLORS[t.team] || '#fff'}">${t.team}</div>
                </td>
                <td class="lb-rating">⭐ ${t.rating}</td>
                <td style="font-family:monospace; color:#ccc;">₹${Number(t.purse).toFixed(2)}</td>
                <td>${statusHtml}</td>
                <td style="text-align:center;">
                    <button onclick='openSquadView(${JSON.stringify(t)})' class="lb-view-btn" title="View Squad">👁️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
});
// --- SHARED HELPER: GENERATE 4-COLUMN SQUAD CARD HTML ---
/* ================================================= */
/* 🛠️ SQUAD CARD UTILITIES (VIEW & DOWNLOAD) */
/* ================================================= */
// 1. SHARED HTML GENERATOR (Returns High-Res HTML String)
// 1. SHARED HTML GENERATOR (Clickable & Responsive)
function generateFullSquadHTML(teamName, squad, purse, owner) {
    const foreignCount = squad.filter(p => p.foreign).length;
    const teamColor = TEAM_COLORS[teamName] || '#fff';
    const logoUrl = `/logos/${teamName}.png`;
    const cat = { WK: [], BAT: [], ALL: [], BOWL: [] };
    squad.forEach(p => {
        let r = p.role;
        if (['PACE', 'SPIN'].includes(r)) r = 'BOWL';
        if (cat[r]) cat[r].push(p); else cat.BOWL.push(p);
    });
    const renderRows = (list) => list.map(p => {
        // Safe name for onclick
        const safeName = p.name.replace(/'/g, "\\'");
       
        return `
        <div class="pro-player-card clickable-row"
             onclick="viewPlayerFromCard('${safeName}', '${p.role}', ${p.rating}, ${p.foreign}, ${p.price}, '${teamName}')"
             style="background: rgba(255,255,255,0.05); padding: 6px; margin-bottom: 4px; border-radius: 4px; border-left: 3px solid ${teamColor}; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div class="pp-left" style="display:flex; align-items:center; gap:6px;">
                <span class="pp-name" style="font-weight: bold; color: #fff; font-size: 0.8rem;">
                    ${p.foreign ? '✈️ ' : ''}${p.name}
                </span>
                <span style="font-size:0.7rem; color:#fbbf24;">⭐${p.rating}</span>
            </div>
            <div class="pp-right">
                <span class="pp-price" style="color: #4ade80; font-size: 0.85rem;">₹${p.price.toFixed(2)}</span>
            </div>
        </div>
    `}).join('');
    return `
    <div class="team-sheet-card full-squad-mode" style="--team-logo-url: url('${logoUrl}'); width: 1000px; background-color: #020617; border: 2px solid #facc15; border-radius: 16px; position: relative; overflow: hidden; font-family: 'Exo 2', sans-serif;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60%; height: 60%; background-image: url('${logoUrl}'); background-size: contain; background-repeat: no-repeat; opacity: 0.1; filter: grayscale(100%); pointer-events: none;"></div>
        <div class="sheet-header" style="background: rgba(0,0,0,0.5); padding: 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 2;">
            <h2 class="sheet-title" style="margin: 0; font-size: 3rem; color: #fff; text-transform: uppercase;">${teamName}</h2>
            <div class="sheet-subtitle" style="color: #facc15; font-size: 1rem; letter-spacing: 3px;">FULL SQUAD • ${owner || 'Manager'}</div>
            <div style="margin-top: 10px; display: flex; justify-content: center; gap: 20px; color: #ccc; font-weight: bold;">
                <span>💰 ₹${purse.toFixed(2)} Cr</span>
                <span>👥 ${squad.length}</span>
                <span>✈️ ${foreignCount} OS</span>
            </div>
        </div>
        <div class="pro-body" style="padding: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; position: relative; z-index: 2;">
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">WK</div>
                ${renderRows(cat.WK)}
            </div>
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">BAT</div>
                ${renderRows(cat.BAT)}
            </div>
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">ALL</div>
                ${renderRows(cat.ALL)}
            </div>
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">BOWL</div>
                ${renderRows(cat.BOWL)}
            </div>
        </div>
       
        <div class="sheet-footer" style="padding: 15px; text-align: center; color: #64748b; font-size: 0.8rem; background: rgba(0,0,0,0.5);">
            OFFICIAL SQUAD • GENERATED BY AUCTION DASHBOARD
        </div>
    </div>`;
}
// Helper for Leaderboard Card (Not for selection)
function generateCreativeCardHTML(teamName, players, rating, count, fullSquad) {
    const roles = { WK: [], BAT: [], ALL: [], BOWL: [] };
    if(players) players.forEach(p => {
        let r = p.role;
        if(r === "PACE" || r === "SPIN") r = "BOWL";
        if(roles[r]) roles[r].push(p);
    });
    let html = `
    <div id="generatedCard" class="team-sheet-card" style="margin:0 auto;">
        <div class="sheet-header">
            <h2 class="sheet-title">${teamName}</h2>
            <div class="sheet-subtitle">OFFICIAL PLAYING XI</div>
            <div style="margin-top:5px; color:#4ade80;">Rating: ${rating}</div>
        </div>
        <div id="sheetContent" style="flex:1;">`;
    ['WK', 'BAT', 'ALL', 'BOWL'].forEach(role => {
        if (roles[role].length > 0) {
            html += `<div class="sheet-role-group">`;
            roles[role].forEach(p => {
                let icon = role === 'WK' ? '🧤' : (role === 'BOWL' ? '🥎' : (role === 'ALL' ? '⚡' : '🏏'));
                html += `
                <div class="sheet-player-pill ${p.foreign ? 'foreign' : ''}">
                    <span>${icon} ${p.name} ${p.foreign ? '✈️' : ''}</span>
                    <small>⭐${p.rating}</small>
                </div>`;
            });
            html += `</div>`;
        }
    });
    html += `</div><div class="sheet-footer"><span>IPL AUCTION LIVE</span><span>${count}/11 Selected</span></div></div>`;
    return html;
}
// --- NEW FUNCTION: Show Player Card Overlay ---
// --- HELPER: Smart Image Loader ---
// --- UPDATED: Smart Image Loader (Robust Version) ---
function loadPlayerImage(imgEl, playerName) {
    if(!playerName) return;
   
    // 1. Prepare Name Variations
    const raw = playerName.trim(); // "Virat Kohli"
    const upperRaw = raw.toUpperCase(); // "VIRAT KOHLI"
   
    const noSpace = raw.replace(/\s+/g, ''); // "ViratKohli"
    const upperNoSpace = noSpace.toUpperCase(); // "VIRATKOHLI"
   
    const withUnderscore = raw.replace(/\s+/g, '_'); // "Virat_Kohli"
    const upperUnderscore = withUnderscore.toUpperCase();// "VIRAT_KOHLI" <--- Matches your specific file
   
    const lower = noSpace.toLowerCase(); // "viratkohli"
    // 2. Define the Candidate List (Priority Order)
    const candidates = [
        // A. YOUR SPECIFIC FORMAT (All Caps Name + Underscore + .png)
        `/players/${upperUnderscore}.png`, // VIRAT_KOHLI.png
        `/players/${upperUnderscore}.PNG`, // VIRAT_KOHLI.PNG
        // B. Standard Formats
        `/players/${noSpace}.png`, // ViratKohli.png
        `/players/${withUnderscore}.png`, // Virat_Kohli.png
        `/players/${raw}.png`, // Virat Kohli.png
        `/players/${lower}.png`, // viratkohli.png
        // C. All Caps Extensions
        `/players/${noSpace}.PNG`, // ViratKohli.PNG
        `/players/${withUnderscore}.PNG`, // Virat_Kohli.PNG
       
        // D. JPG/JPEG Fallbacks
        `/players/${upperUnderscore}.jpg`,
        `/players/${noSpace}.jpg`
    ];
    const defaultImg = "https://resources.premierleague.com/premierleague/photos/players/250x250/Photo-Missing.png";
    // 3. Recursive Loader
    let attempt = 0;
   
    function tryNext() {
        if (attempt >= candidates.length) {
            // console.warn(`[ImgFail] Could not find image for: ${playerName}`);
            imgEl.src = defaultImg;
            return;
        }
       
        const currentSrc = candidates[attempt];
        imgEl.src = currentSrc;
       
        imgEl.onerror = function() {
            attempt++;
            tryNext();
        };
    }
    tryNext();
}
// --- UPDATED: Open Player Card ---
window.openPlayerProfile = function(playerData, teamName, price) {
    // Remove existing
    const existing = document.getElementById('playerCardOverlay');
    if(existing) existing.remove();
    const team = teamName || "Unsold";
    const amount = price ? `₹${price.toFixed(2)} Cr` : "---";
    const teamColor = TEAM_COLORS[team] || "#64748b";
   
    const html = `
    <div id="playerCardOverlay" class="player-card-overlay" onclick="closePlayerCard(event)">
        <div class="pc-card compact" data-team="${team}" onclick="event.stopPropagation()">
            <div class="pc-bg-layer"></div>
            <div class="pc-content">
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center; z-index:10;">
                    <span style="font-weight:bold; color:rgba(255,255,255,0.5); font-size:0.9rem;">${team}</span>
                    <button onclick="document.getElementById('playerCardOverlay').remove()" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">✕</button>
                </div>
               
                <div class="pc-img-box" style="border-color:${teamColor}">
                    <img id="activeCardImg" class="pc-img" alt="${playerData.name}">
                </div>
                <div class="pc-info">
                    <div class="pc-name">${playerData.name}</div>
                    <div class="pc-role">
                        ${playerData.foreign ? '✈️' : ''} ${playerData.role}
                    </div>
                </div>
                <div class="pc-stat-row">
                    <div class="pc-stat">
                        <span class="pc-stat-lbl">RATING</span>
                        <span class="pc-stat-val">⭐${playerData.rating}</span>
                    </div>
                     <div class="pc-stat">
                        <span class="pc-stat-lbl">STATUS</span>
                        <span class="pc-stat-val" style="color:${price ? '#4ade80' : '#fff'}">${price ? 'SOLD' : 'UPCOMING'}</span>
                    </div>
                </div>
                <div class="pc-price-tag" style="color:${teamColor}">
                    ${amount}
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
   
    // Trigger the smart loader
    const imgEl = document.getElementById('activeCardImg');
    loadPlayerImage(imgEl, playerData.name);
};
window.closePlayerCard = function(e) {
    if(e.target.id === 'playerCardOverlay') e.target.remove();
}
// --- POST AUCTION SUMMARY PAGE LOGIC ---
/* ================================================= */
/* 🏁 POST AUCTION SUMMARY LOGIC */
/* ================================================= */
function renderPostAuctionSummary() {
    const list = document.getElementById("summaryList");
    if(!list) return;
   
    // Safety check: wait if data isn't loaded yet
    if (!allSquads || Object.keys(allSquads).length === 0) {
        list.innerHTML = "<div style='text-align:center; color:#666; padding:20px;'>Loading results...</div>";
        setTimeout(renderPostAuctionSummary, 1000);
        return;
    }
    list.innerHTML = "";
    const teams = Object.keys(allSquads).sort();
    teams.forEach(team => {
        const squad = allSquads[team];
        const purse = teamPurse[team] || 0;
        const owner = teamOwners[team] || "Manager";
        const teamColor = TEAM_COLORS[team] || "#fff";
        // 1. Create Wrapper Card
        const item = document.createElement("div");
        item.className = "summary-item";
        // 2. Create Header (Visible Strip)
        const header = document.createElement("div");
        header.className = "summary-header";
        header.style.borderLeftColor = teamColor;
       
        header.innerHTML = `
            <div class="sum-info">
                <span class="sum-team" style="color:${teamColor}">${team}</span>
                <span class="sum-meta">
                    ${owner} • <span style="color:#4ade80">₹${purse.toFixed(2)} Cr</span> • ${squad.length} Players
                </span>
            </div>
           
            <div style="display:flex; gap:10px; align-items:center;">
                <button class="secondary-btn"
                    style="padding:4px 8px; font-size:0.7rem; border-color:#475569;"
                    onclick="event.stopPropagation(); downloadSummaryCard(this)">
                    📸 Save
                </button>
               
                <button class="sum-expand-btn">▼</button>
            </div>
        `;
        // 3. Create Content (Hidden Squad Card)
        const content = document.createElement("div");
        content.className = "summary-content hidden";
       
        // Uses the shared generator to create the 4-Column Card HTML
        content.innerHTML = generateFullSquadHTML(team, squad, purse, owner);
        // 4. Toggle Logic (Accordion)
        header.onclick = () => {
            const isHidden = content.classList.contains("hidden");
           
            // Optional: Close others for "Accordion" feel
            document.querySelectorAll('.summary-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.sum-expand-btn').forEach(b => b.innerText = "▼");
           
            if(isHidden) {
                content.classList.remove("hidden");
                header.querySelector('.sum-expand-btn').innerText = "▲";
            }
        };
        item.appendChild(header);
        item.appendChild(content);
        list.appendChild(item);
    });
}
// Override Exit Home to go to Summary if auction ended
window.exitToHome = function() {
    if (activeRules && document.getElementById("postAuctionSummary")) {
        // If coming from Playing XI screen
        showScreen("postAuctionSummary");
        renderPostAuctionSummary();
    } else if(confirm("Are you sure you want to exit?")) {
        sessionStorage.clear();
        window.location.href = "/";
    }
}
/* ================================================= */
/* ============== GOD MODE (ADMIN) ================= */
/* ================================================= */
let godTargetRoom = "";
function openGodModeSetup() {
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("godPanel").classList.remove("hidden");
}
window.connectGodMode = function() {
    const target = document.getElementById("godTargetInput").value.trim().toUpperCase();
    if(!target) return alert("Enter Target Room Code");
   
    godTargetRoom = target;
    socket.emit("godModeFetch", godTargetRoom);
};
socket.on("godModeData", ({ sets, teams }) => {
    document.getElementById("godLogin").classList.add("hidden");
    document.getElementById("godContent").classList.remove("hidden");
    renderGodList(sets, teams);
});
socket.on("godModeSuccess", (msg) => {
    // Flash success and refresh data
    const list = document.getElementById("godPlayerList");
    // Simple visual feedback
    list.style.opacity = "0.5";
    setTimeout(() => list.style.opacity = "1", 200);
   
    socket.emit("godModeFetch", godTargetRoom);
});
function renderGodList(sets, teams) {
    const list = document.getElementById("godPlayerList");
    list.innerHTML = "";
    // Sort team list for dropdown
    const teamOptions = teams.sort();
    sets.forEach(set => {
        set.forEach(player => {
            const row = document.createElement("div");
            row.className = "god-row";
            row.innerHTML = `
                <div class="g-info">
                    <div class="g-name" style="font-weight:bold; color:#fff;">${player.name}</div>
                    <div class="g-role" style="font-size:0.75rem; color:#888;">${player.role} • ⭐${player.rating}</div>
                </div>
                <div class="g-actions" style="position:relative;">
                    <button class="g-btn" onclick="toggleTeamSelect(this)" style="background:#ef4444; color:#fff; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer;">+</button>
                   
                    <div class="team-select-popup hidden" style="position:absolute; right:35px; top:-10px; background:#1e1e1e; border:1px solid #ef4444; border-radius:6px; width:100px; max-height:200px; overflow-y:auto; z-index:100; box-shadow:0 5px 15px rgba(0,0,0,0.5);">
                        ${teamOptions.map(t => `
                            <div class="ts-option"
                                 onclick="forceAssign('${player.name.replace(/'/g, "\\'")}', '${t}')"
                                 style="padding:8px; border-bottom:1px solid #333; color:#ccc; cursor:pointer; font-size:0.8rem; text-align:center;">
                                 ${t}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            list.appendChild(row);
        });
    });
}
window.toggleTeamSelect = function(btn) {
    // Close any other open popups first
    document.querySelectorAll('.team-select-popup').forEach(el => el.classList.add('hidden'));
   
    const popup = btn.nextElementSibling;
    popup.classList.toggle('hidden');
};
window.forceAssign = function(playerName, teamName) {
    if(confirm(`Force assign ${playerName} to ${teamName}?`)) {
        socket.emit("godModeAssign", {
            roomCode: godTargetRoom,
            player: { name: playerName },
            team: teamName
        });
    }
};
// --- NAVIGATION LOGIC FIXES ---
// 1. Smart Back Button for Leaderboard
window.goBackFromLeaderboard = function() {
    // If I have a team (Player), go to Selection Screen
    if (myTeam && !document.getElementById('playingXI').classList.contains('hidden')) {
        showScreen('playingXI');
    }
    // If I am Spectator OR Auction Ended, go to Summary
    else if (document.getElementById('postAuctionSummary')) {
        showScreen('postAuctionSummary');
    }
    else {
        // Fallback
        showScreen('playingXI');
    }
};
// 2. Updated HTML Generator (Adds Ratings + Fits Mobile 2x2)
function generateFullSquadHTML(teamName, squad, purse, owner) {
    const foreignCount = squad.filter(p => p.foreign).length;
    const teamColor = TEAM_COLORS[teamName] || '#fff';
    const logoUrl = `/logos/${teamName}.png`;
    // Categorize
    const cat = { WK: [], BAT: [], ALL: [], BOWL: [] };
    squad.forEach(p => {
        let r = p.role;
        if (['PACE', 'SPIN'].includes(r)) r = 'BOWL';
        if (cat[r]) cat[r].push(p); else cat.BOWL.push(p);
    });
    // Helper to render rows (NOW INCLUDES RATING ⭐)
    const renderRows = (list) => list.map(p => `
        <div class="pro-player-card" style="border-left: 3px solid ${teamColor}; background: rgba(255,255,255,0.05); padding: 5px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px;">
            <div class="pp-left" style="display:flex; align-items:center; gap:5px;">
                <span class="pp-name" style="font-weight: bold; color: #fff; font-size: 0.8rem;">
                    ${p.foreign ? '✈️ ' : ''}${p.name}
                </span>
                <span style="font-size:0.7rem; color:#fbbf24;">⭐${p.rating}</span>
            </div>
            <div class="pp-right">
                <span class="pp-price" style="color: #4ade80; font-size: 0.8rem;">₹${p.price.toFixed(2)}</span>
            </div>
        </div>
    `).join('');
    return `
    <div class="team-sheet-card full-squad-mode" style="--team-logo-url: url('${logoUrl}'); width: 1000px; background-color: #020617; border: 2px solid #facc15; border-radius: 16px; position: relative; overflow: hidden; font-family: 'Exo 2', sans-serif;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60%; height: 60%; background-image: url('${logoUrl}'); background-size: contain; background-repeat: no-repeat; opacity: 0.1; filter: grayscale(100%); pointer-events: none;"></div>
        <div class="sheet-header" style="background: rgba(0,0,0,0.5); padding: 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 2;">
            <h2 class="sheet-title" style="margin: 0; font-size: 3rem; color: #fff; text-transform: uppercase;">${teamName}</h2>
            <div class="sheet-subtitle" style="color: #facc15; font-size: 1rem; letter-spacing: 3px;">FULL SQUAD • ${owner || 'Manager'}</div>
            <div style="margin-top: 10px; display: flex; justify-content: center; gap: 20px; color: #ccc; font-weight: bold;">
                <span>💰 ₹${purse.toFixed(2)} Cr</span>
                <span>👥 ${squad.length}</span>
                <span>✈️ ${foreignCount}</span>
            </div>
        </div>
        <div class="pro-body" style="padding: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; position: relative; z-index: 2;">
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">WK</div>
                ${renderRows(cat.WK)}
            </div>
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">BAT</div>
                ${renderRows(cat.BAT)}
            </div>
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">ALL</div>
                ${renderRows(cat.ALL)}
            </div>
            <div class="pro-col">
                <div class="pro-col-header" style="color: ${teamColor}; border-bottom: 2px solid ${teamColor}; font-weight: 800; margin-bottom: 10px;">BOWL</div>
                ${renderRows(cat.BOWL)}
            </div>
        </div>
       
        <div class="sheet-footer" style="padding: 15px; text-align: center; color: #64748b; font-size: 0.8rem; background: rgba(0,0,0,0.5);">
            OFFICIAL SQUAD • GENERATED BY AUCTION DASHBOARD
        </div>
    </div>`;
}
/* ================= GLOBAL REFRESH LOGIC ================= */
/* ================= GLOBAL REFRESH LOGIC ================= */
/* ================= GLOBAL REFRESH LOGIC ================= */
function refreshGlobalUI() {
    // 1. Refresh Squad View if active
    // This updates "Manager: Available" to "Manager: [Name]" instantly if someone picks a team
    const currentTab = document.querySelector('.info-tab-btn.active');
    if(currentTab && currentTab.id === 'tab-squads' && selectedSquadTeam) {
        viewEmbeddedSquad(selectedSquadTeam);
    }
    updateHeaderNotice();
    updateAdminButtons(gameStarted);
}
