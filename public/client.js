const socket = io();
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
let rtmLeftByTeam = {}; // RTM count per team (when rules.rtmEnabled)
let activeRules = {};
let selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
let lastTickSecond = null;
let teamOwners = {};
let isMuted = false;
let currentBid = 0;

// --- POPUP WINDOW STATE ---
let remainingSets = [];
let viewSetWindow = null;
let squadWindow = null;
let selectedSquadTeam = null;
let unsoldList = [];
let soldUnsoldTab = "sold";
// --- CONFIG ---
const TEAM_COLORS = {
    CSK: "#facc15", MI: "#38bdf8", RCB: "#dc2626", KKR: "#a855f7",
    RR: "#fb7185", DC: "#60a5fa", SRH: "#fb923c", PBKS: "#ef4444",
    GT: "#0ea5e9", LSG: "#22c55e"
};
// --- SOUNDS (shared AudioContext for mobile – resume on first interaction) ---
const soundTick = new Audio("/sounds/beep.mp3");
let sharedAudioCtx = null;
function getAudioContext() {
    if (isMuted) return null;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
            sharedAudioCtx = new Ctx();
        }
        if (sharedAudioCtx.state === "suspended") {
            sharedAudioCtx.resume();
        }
        return sharedAudioCtx;
    } catch (_) { return null; }
}
function unlockAudioOnInteraction() {
    getAudioContext();
}
function playTimerBeep() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
    } catch (_) { safePlay(soundTick); }
}
function playUnsoldSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.frequency.setValueAtTime(392, ctx.currentTime);
        osc.frequency.setValueAtTime(349, ctx.currentTime + 0.08);
        osc.frequency.setValueAtTime(294, ctx.currentTime + 0.16);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
    } catch (_) { safePlay(soundTick); }
}
function playBidSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
    } catch (_) { safePlay(soundTick); }
}
function playSoldSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(392, ctx.currentTime);
        osc.frequency.setValueAtTime(523, ctx.currentTime + 0.06);
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch (_) { safePlay(soundTick); }
}
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
    if (window.location.pathname !== newPath) {
        window.history.pushState({ page: state, room: roomCode }, pageTitle, newPath);
        document.title = pageTitle;
    }
}
// When first showing summary after auction end: push home then summary so Back from summary goes to main
function pushSummaryWithHomeBack() {
    if (!roomCode) return;
    window.history.pushState({ page: 'home' }, 'Main', '/');
    window.history.pushState({ page: 'summary', room: roomCode }, `Summary - ${roomCode}`, `/room/${roomCode}/summary`);
    document.title = `Summary - ${roomCode}`;
}
// Handle Browser "Back" Button: leaderboard -> summary, summary -> main (home)
// When on summary and user presses back: show exit confirm popup; Cancel = stay on summary, Confirm = go to main
window.onpopstate = async function(event) {
    if (event.state) {
        if (event.state.page === 'home') {
            const summaryEl = document.getElementById('postAuctionSummary');
            const wasOnSummary = summaryEl && !summaryEl.classList.contains('hidden');
            if (wasOnSummary && roomCode) {
                const yes = await showConfirm("Are you sure you want to exit to the Main Menu?", "EXIT GAME?", "🏠");
                if (!yes) {
                    history.pushState({ page: 'summary', room: roomCode }, `Summary - ${roomCode}`, `/room/${roomCode}/summary`);
                    return;
                }
            }
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            document.getElementById('landing').classList.remove('hidden');
            document.title = 'IPL Live Auction';
        } else if (event.state.page === 'summary') showScreen('postAuctionSummary', false);
        else if (event.state.page === 'leaderboard') showScreen('leaderboard', false);
        else if (event.state.page === 'xi') showScreen('playingXI', false);
        else showScreen('auctionUI', false);
    } else {
        window.location.href = "/";
    }
};
/* ================================================= */
/* ========= 1. INITIALIZATION & NAVIGATION ======== */
/* ================================================= */
// ✅ FIX: Safe Play Function to prevent crashes
function safePlay(audioObj) {
    if (!audioObj || isMuted) return; // 🛑 CHECK MUTE STATE HERE
    
    audioObj.currentTime = 0;
    const playPromise = audioObj.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            // console.warn("Audio blocked:", error);
        });
    }
}

// Unlock AudioContext on first user interaction (mobile)
function onceUnlockAudio() {
    unlockAudioOnInteraction();
    document.removeEventListener("click", onceUnlockAudio);
    document.removeEventListener("touchstart", onceUnlockAudio);
}
document.addEventListener("click", onceUnlockAudio, { passive: true });
document.addEventListener("touchstart", onceUnlockAudio, { passive: true });

/* ================================================= */
/* 🖱️ EVENT LISTENERS SETUP                          */
/* ================================================= */
function setupEventListeners() {
    const enterBtn = document.getElementById("enterBtn");
    const createBtn = document.getElementById("createBtn");
    const joinBtn = document.getElementById("joinBtn");
    const usernameInput = document.getElementById("username");

    if (usernameInput) {
        const saved = localStorage.getItem("ipl_user") || sessionStorage.getItem("ipl_user");
        if (saved) usernameInput.value = saved;
    }

    function goToAuth() {
        const landing = document.getElementById("landing");
        const auth = document.getElementById("auth");
        if (landing) landing.classList.add("hidden");
        if (auth) auth.classList.remove("hidden");
        document.body.style.overflow = "hidden";
        if (typeof switchAuthTab === "function") switchAuthTab("join");
        if (usernameInput) {
            const saved = localStorage.getItem("ipl_user") || sessionStorage.getItem("ipl_user");
            if (saved) usernameInput.value = saved;
        }
        if (window.location.pathname !== "/room") {
            window.history.pushState({ page: "room" }, "Join Room", "/room");
        }
    }
    document.addEventListener("ipl-enter-arena", goToAuth);
    if (enterBtn) enterBtn.addEventListener("click", goToAuth);


    // 2. Create Room Button
    if (createBtn) {
        createBtn.onclick = (e) => {
            if (e) e.preventDefault();
            const uName = usernameInput.value.trim();
            const isPublic = document.getElementById('isPublicRoom').checked;

            if (!uName) return alert("Please enter your name!");
            const datasetIdInput = document.getElementById('selectedSetId');
            const datasetId = datasetIdInput ? datasetIdInput.value : "ipl2026";
            if (datasetId === 'custom' && (!window.__customSelectedPlayers || window.__customSelectedPlayers.length === 0)) {
                if (typeof showPopup === 'function') {
                    showPopup("Select a custom player pool first. Click CUSTOM, then choose \"Show available players\" or \"Upload your own player pool\", pick players, and Confirm Set.", "No pool selected", "⚠️", true);
                } else {
                    alert("No pool selected. Please select a custom player pool first.");
                }
                return;
            }
            // Visual Feedback
            createBtn.innerText = "Creating...";
            createBtn.disabled = true;

            username = uName;
            sessionStorage.setItem('ipl_user', username);
            localStorage.setItem('ipl_user', username);
            
            // Emit creation event with selected dataset
         //  const datasetIdInput = document.getElementById('selectedSetId');
           //const datasetId = datasetIdInput ? datasetIdInput.value : "ipl2026";
            
            socket.emit("createRoom", { user: username, isPublic: isPublic, datasetId });
        };
    }

    // 3. Join Room Button
    if (joinBtn) {
        const doJoin = (e) => {
            if (e) e.preventDefault();
            const rCode = document.getElementById('code').value.trim().toUpperCase();
            const uName = document.getElementById('username').value.trim();

            if (rCode === "1234") {
                openGodModeSetup();
                return;
            }
            if (!uName) return alert("Please enter your name!");
            if (!rCode) return alert("Please enter a Room Code!");
            if (rCode.length !== 5) return alert("Room Code must be 5 characters!");

            joinBtn.innerText = "Joining...";
            joinBtn.disabled = true;
            username = uName;
            roomCode = rCode;
            sessionStorage.setItem('ipl_room', roomCode);
            sessionStorage.setItem('ipl_user', username);
            localStorage.setItem('ipl_user', username);
            console.log(`🚀 Sending join request: ${username} -> ${roomCode}`);
            socket.emit("joinRoom", { roomCode, user: username });
        };
        joinBtn.onclick = doJoin;
        const codeInput = document.getElementById('code');
        if (codeInput) codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doJoin(e); } });
    }
}

window.onload = async () => {
    // Check if user was on auctionUI screen (from sessionStorage)
    const savedRoom = sessionStorage.getItem('ipl_room');
    const savedUser = sessionStorage.getItem('ipl_user');
    const savedTeam = sessionStorage.getItem('ipl_team');
    
    if (savedRoom && savedUser) {
        roomCode = savedRoom;
        username = savedUser;
        if (savedTeam) myTeam = savedTeam;
        
        // Try to restore previous feed/chat for this room
        restoreChatFromSession();
        
        // Check if we're on auctionUI path (not just /room)
        const path = window.location.pathname;
        const parts = path.split('/');
        const isOnAuctionPath = parts[1] === 'room' && parts[2] && parts.length <= 3; // /room/CODE or /room/CODE/xi etc
        
        if (isOnAuctionPath) {
            // User is reconnecting to auctionUI - show popup
            isReconnecting = true;
            reconnectionPopupShown = true;
            showPopup("Reconnecting to your auction room...", "RECONNECTING", "🔄");
        }
    }
    
    // 1. Check URL for Room Code
    const path = window.location.pathname;
    const parts = path.split('/');
    const urlCode = (parts[1] === 'room' && parts[2]) ? parts[2].toUpperCase() : null;
    // 2. SETUP LISTENERS (Buttons)
    setupEventListeners(); // (Move your existing btn onclicks here)
    // 3. IF URL HAS CODE -> CHECK DATABASE
    if (urlCode) {
        try {
            // Show loading state
            document.getElementById("landing").innerHTML = "<h2 style='color:white; text-align:center; margin-top:20%'>Loading Room...</h2>";
            // Fetch from Server API
            const response = await fetch(`/api/room/${urlCode}`);
            const result = await response.json();
            // SCENARIO A: ROOM NOT FOUND
            if (!result.exists) {
                alert("❌ Room Expired or Invalid");
                window.location.href = "/";
                return;
            }
            // SCENARIO B: AUCTION ENDED (Show Summary Directly)
           // --- UPDATED: window.onload (Force Leaderboard Data Load for Archived Rooms) ---
// Inside window.onload, in SCENARIO B: AUCTION ENDED
if (!result.active) {
    console.log("📜 Loading Archived Room Data...");
    
    // 1. Populate Global Variables
    allSquads = result.data.squads || {};
    teamPurse = result.data.purses || {};
    teamOwners = result.data.owners || {};
    activeRules = result.data.rules || {};
    roomCode = urlCode;
    
    // 🔴 FIX: Force Leaderboard Data Load
    socket.emit("getAuctionState"); // This will trigger socket.on("leaderboard") with archived data
    
    // 2. Setup UI
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("auctionUI").classList.add("hidden");
    
    // 3. Render Summary and set history so Back goes to main
    document.getElementById("postAuctionSummary").classList.remove("hidden");
    renderPostAuctionSummary();
    pushSummaryWithHomeBack();
    return;
}
            // SCENARIO C: AUCTION LIVE (Proceed to Login)
            console.log("Room Active, proceeding to login...");
            document.getElementById("landing").classList.add("hidden");
            document.getElementById("auth").classList.remove("hidden");
            switchAuthTab('join');
            document.getElementById('code').value = urlCode;
        } catch (err) {
            console.error("API Error:", err);
            // Fallback to normal flow if API fails
            document.getElementById("landing").classList.remove("hidden");
        }
        socket.emit("getAuctionState");
    socket.emit("getSquads");
    } else {
        // No code in URL -> Show Landing Page
        document.getElementById("landing").classList.remove("hidden");
    }
    // 4. Fetch Public Rooms (Background)
    socket.emit('getPublicRooms');
    // --- 1. SETUP EVENT LISTENERS (Enter Arena is handled by ipl-enter-arena from Vite landing) ---
    const createBtn = document.getElementById("createBtn");
    const joinBtn = document.getElementById("joinBtn");
    const usernameInput = document.getElementById("username");
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
            localStorage.setItem('ipl_user', username);
           // const datasetIdInput = document.getElementById('selectedSetId');
            //const datasetId = datasetIdInput ? datasetIdInput.value : 'ipl2026';
            socket.emit("createRoom", { user: username, isPublic: isPublic, datasetId });
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
            localStorage.setItem('ipl_user', username);
          
            console.log(`🚀 Sending join request: ${username} -> ${roomCode}`);
            socket.emit("joinRoom", { roomCode, user: username });
        };
    }
    // Format: /room/CODE/SUBPAGE
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
    document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab' + (tab === 'join' ? 'Join' : 'Create')).classList.add('active');
    if (tab === 'create') {
        document.getElementById('createSection').classList.remove('hidden');
        document.getElementById('joinSection').classList.add('hidden');
    } else {
        document.getElementById('createSection').classList.add('hidden');
        document.getElementById('joinSection').classList.remove('hidden');
        socket.emit('getPublicRooms');
    }
};
// --- 1. EXIT TO HOME (Fixes Reconnect Loop) ---
window.exitToHome = function() {
    if(confirm("Return to Main Screen?")) {
        // Critical: Clear session to stop auto-reconnect
        sessionStorage.clear();
        window.location.href = "/";
    }
};
// --- 2. BACK FROM LEADERBOARD: go to summary (replace state so summary back -> main)
window.goBackFromLeaderboard = function() {
    if (roomCode && window.location.pathname === `/room/${roomCode}/leaderboard`) {
        renderPostAuctionSummary();
        showScreen('postAuctionSummary', false);
        window.history.replaceState({ page: 'summary', room: roomCode }, `Summary - ${roomCode}`, `/room/${roomCode}/summary`);
        document.title = `Summary - ${roomCode}`;
        return;
    }
    if (myTeam && document.getElementById('playingXI') && !document.getElementById('playingXI').classList.contains('hidden')) {
        showScreen('playingXI');
        return;
    }
    renderPostAuctionSummary();
    showScreen('postAuctionSummary', false);
};
window.shareRoomLink = async function() {
    const url = window.location.href;
    const shareData = {
        title: 'LIVE Auction',
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
                div.innerHTML = `<span class="r-name" title="Room: ${r.id}">${r.poolName || r.id}</span> <span class="r-count">👤 ${r.count}</span>`;
                div.onclick = () => { document.getElementById('code').value = r.id; };
                box.appendChild(div);
            });
        }
    };
    render(waiting, "⏳ Waiting to Start", "waiting");
    render(live, "📌 Ongoing Auctions", "live");
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

    // Hide RTM row when Legends pool is selected (Legends = no RTM)
    const datasetInput = document.getElementById("selectedSetId");
    const activeDataset = datasetInput ? datasetInput.value : "ipl2026";
    const rtmRow = document.querySelector(".rule-row-rtm");
    const rtmCountRow = document.getElementById("rtmCountRow");
    if (rtmRow) rtmRow.style.display = activeDataset === "legends" ? "none" : "";
    if (rtmCountRow) rtmCountRow.style.display = activeDataset === "legends" ? "none" : (document.getElementById("rtmEnabled").checked ? "flex" : "none");

    if (activeDataset === "custom" && Array.isArray(window.__customSelectedPlayers) && window.__customSelectedPlayers.length > 0) {
        socket.emit("saveCustomSet", window.__customSelectedPlayers);
    }
});
/* ================= ROOM STATE LOGIC ================= */
/* ================= ROOM STATE LOGIC (FIXED) ================= */
socket.on("joinedRoom", (data) => {
    console.log("Room Data:", data);
    unsoldList = [];

    const idOverlay = document.getElementById("identityVerifyOverlay");
    if (idOverlay) idOverlay.classList.add("hidden");

    // 1. SYNC GLOBAL STATE (or partial update when updateOnly)
    if (data.updateOnly) {
        if (data.roomCode) roomCode = data.roomCode;
        if (data.teamOwners !== undefined) teamOwners = data.teamOwners;
        if (data.availableTeams !== undefined) renderEmbeddedTeams(data.availableTeams);
        return;
    }
    roomCode = data.roomCode;
    sessionStorage.setItem('ipl_room', roomCode);
    if(data.rules) activeRules = data.rules;
    if(data.squads) allSquads = data.squads;
    if(data.teamOwners) teamOwners = data.teamOwners;
    if(data.purses) teamPurse = data.purses;
    if(data.rtmLeft) rtmLeftByTeam = data.rtmLeft;
    isHost = data.isHost;
    gameStarted = data.auctionStarted;

    if (data.yourTeam !== undefined) {
        myTeam = data.yourTeam;
        if(myTeam) sessionStorage.setItem('ipl_team', myTeam);
        else sessionStorage.removeItem('ipl_team');
    }

    // 2. ROUTING LOGIC (REFRESH HANDLER)
    if (data.auctionEnded || data.ended) {
        if (!myTeam) {
            // Spectator -> Summary
            pushSummaryWithHomeBack();
            renderPostAuctionSummary();
            showScreen("postAuctionSummary", false);
        } else {
            // Player -> Check Submission
            const leaderboard = data.leaderboard || [];
            const myEntry = leaderboard.find(t => t.team === myTeam);
            const hasXI = myEntry && myEntry.xi && (Array.isArray(myEntry.xi) ? myEntry.xi.length > 0 : Object.keys(myEntry.xi).length > 0);

            if (hasXI) {
                showScreen("leaderboard");
                socket.emit("getAuctionState");
            } else {
                showScreen("playingXI");
                socket.emit("getMySquad");
            }
        }
    } else {
        // Auction Live Logic
        if (myTeam) {
            updateHeaderNotice();
            if (!gameStarted) {
                const container = document.getElementById("teamSelectionMain");
                if (container) {
                    const teamColor = TEAM_COLORS[myTeam] || "#fff";
                    container.innerHTML = `
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; animation: popIn 0.3s ease;">
                            <h2 style="color:var(--primary); margin:0 0 2px 0; font-size:0.85rem;">YOU SELECTED</h2>
                            <h1 style="font-size:2rem; margin:0; line-height:1; color:${teamColor}; text-shadow:0 0 12px rgba(0,0,0,0.5);">${myTeam}</h1>
                            <p style="color:#4ade80; font-weight:bold; margin:2px 0 0 0; font-size:0.75rem;">✅ OWNER CONFIRMED</p>
                            <div style="background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:8px; width:100%; margin-top:8px;">
                                <div style="color:#64748b; font-size:0.65rem; font-weight:700; letter-spacing:1px; margin-bottom:2px;">ROOM CODE</div>
                                <div onclick="copyRoomCode()" style="font-family:monospace; font-size:1.1rem; font-weight:700; color:#fff; cursor:pointer; letter-spacing:2px;">
                                    ${roomCode} <span style="font-size:0.85rem; opacity:0.5;">📋</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
                setGamePhase("TEAM_SELECT");
            } else {
                setGamePhase("AUCTION");
            }
        } else {
            setGamePhase("TEAM_SELECT");
        }
    }

    // 3. UI CLEANUP
    setupAuctionScreen();
    updateAdminButtons(data.auctionStarted);
    renderEmbeddedTeams(data.availableTeams || []);
    isReconnecting = false;
    reconnectionPopupShown = false;
    toggleCustomPopup(false);
    
    if (data.auctionStarted && !data.auctionEnded) socket.emit("getAuctionState");
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
    const buttons = document.querySelectorAll('.cc-tab-btn');
    buttons.forEach(b => {
        b.classList.remove('active');
        if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
    });
    // B. Show View
    document.querySelectorAll('.cc-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    // C. Trigger Data Refresh if needed
    if (tabName === 'squads') {
        // Always prefer my current team when opening Squads tab
        if (myTeam) selectedSquadTeam = myTeam;
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
    // 1. Switch Screens
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("auctionUI").classList.remove("hidden");
    
    // 2. Lock Scroll
    document.body.style.overflow = "hidden";

    // 3. Set Room Code (The Fix for "ID ---")
    const codeEl = document.getElementById("roomCodeText");
    if(codeEl) codeEl.innerText = roomCode; // Use the global 'roomCode' variable

    // 4. Update URL
    updateBrowserURL(roomCode);

    // 5. Fetch Initial Data
    socket.emit("getAuctionState");
    socket.emit("checkAdmin");
    socket.emit("getSquads");
    forceAuctionTileTransparency();

}

socket.on("error", msg => {
    if (godModeFetchPending && document.getElementById("godPanel") && !document.getElementById("godPanel").classList.contains("hidden")) {
        godModeFetchPending = false;
        const notFoundEl = document.getElementById("godRoomNotFound");
        if (notFoundEl) { notFoundEl.classList.remove("hidden"); notFoundEl.textContent = msg || "Room not found"; }
        return;
    }
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

// ================= IDENTITY VERIFICATION (SAME NAME JOIN) =================
socket.on("identityChallenge", ({ code, name, roomCode, expiresIn }) => {
    const overlay = document.getElementById("identityVerifyOverlay");
    const nameEl = document.getElementById("verifyName");
    const btnYes = document.getElementById("btnVerifyYes");
    const btnNo = document.getElementById("btnVerifyNo");

    if (!overlay || !btnYes || !btnNo) return;

    if (nameEl) nameEl.textContent = name;
    overlay.classList.remove("hidden");

    // Replace previous handlers
    const yesClone = btnYes.cloneNode(true);
    const noClone = btnNo.cloneNode(true);
    btnYes.parentNode.replaceChild(yesClone, btnYes);
    btnNo.parentNode.replaceChild(noClone, btnNo);

    let dismissed = false;
    const hideOverlay = () => {
        if (dismissed) return;
        dismissed = true;
        overlay.classList.add("hidden");
    };

    yesClone.onclick = () => {
        const entered = prompt(`Type this 3‑digit code to confirm: ${code}`);
        if (!entered) return;
        socket.emit("identityResponse", { roomCode, name, code: entered });
        hideOverlay();
    };

    noClone.onclick = () => {
        hideOverlay();
    };

    // Auto-hide after the provided expiry (10s)
    setTimeout(hideOverlay, (expiresIn || 10) * 1000);
});

// New device: waiting / failure handling
socket.on("identityPending", ({ roomCode, name }) => {
    showPopup(`Another device is already using the name "${name}".\n\nWaiting for confirmation on that device...`, "VERIFYING IDENTITY", "🔐");
});
// 1. OLD DEVICE: Shows the Code
socket.on("identityShowCode", ({ code, name }) => {
    // Re-use your existing overlay or creating a custom simple one
    showPopup(
        `A new device is trying to join as "${name}".\n\nYour Verification Code is:\n\n👉 ${code} 👈\n\nEnter this on the new device.`, 
        "SECURITY ALERT", 
        "🛡️"
    );
});

// 2. NEW DEVICE: Asks for Input
socket.on("identityInputRequired", ({ roomCode, name }) => {
    toggleCustomPopup(false);

    const overlay = document.getElementById("identityVerifyOverlay");
    overlay.classList.remove("hidden");

    function closeAndGoHome() {
        overlay.classList.add("hidden");
        overlay.innerHTML = "";
        sessionStorage.removeItem("ipl_room");
        sessionStorage.removeItem("ipl_team");
        window.location.href = "/";
    }

    overlay.innerHTML = `
        <div class="glass rules-card identity-verify-card">
            <button type="button" class="identity-verify-close" aria-label="Close">×</button>
            <h2 style="color: #facc15; margin-bottom:10px;">🔐 Verification</h2>
            <p style="color:#ccc; font-size:0.9rem;">
                Check your other device for the 3-digit code.
            </p>
            <input type="number" id="verifyInput" placeholder="000" class="identity-verify-input" maxlength="3">
            <button id="btnSubmitCode" class="primary-btn" style="width:100%;">VERIFY & JOIN</button>
        </div>
    `;

    const closeBtn = overlay.querySelector(".identity-verify-close");
    if (closeBtn) closeBtn.onclick = closeAndGoHome;

    document.getElementById("btnSubmitCode").onclick = () => {
        const code = document.getElementById("verifyInput").value;
        if (code.length > 0) {
            socket.emit("verifyIdentityCode", { roomCode, name, code });
            overlay.innerHTML = `<div style="color:white;">Verifying...</div>`;
        }
    };
});

// 3. Close overlay instruction for Old Device
socket.on("identityDismiss", () => {
    toggleCustomPopup(false);
});

socket.on("identityFailed", ({ reason }) => {
    toggleCustomPopup(false);
    let msg = "Identity verification failed.";
    if (reason === "timeout") msg = "Identity verification timed out. Please try again.";
    if (reason === "invalid") msg = "Incorrect code. You cannot join with this name.";
    showPopup(msg, "ACCESS DENIED", "❌", true);
    // Send this new tab back to the landing page
    sessionStorage.removeItem("ipl_room");
    window.location.href = "/";
});
// --- RECONNECTION & STATE HANDLING ---
let isReconnecting = false;
let reconnectionPopupShown = false;

socket.on('connect', () => {
    // If we have session data, try to reconnect user to room
    if (username && roomCode) {
        // Check if we're on auctionUI screen (manual refresh or long absence)
        const auctionUI = document.getElementById("auctionUI");
        const isOnAuctionScreen = auctionUI && !auctionUI.classList.contains("hidden");
        
        if (isOnAuctionScreen && !reconnectionPopupShown) {
            // Show reconnecting popup
            isReconnecting = true;
            reconnectionPopupShown = true;
            showPopup("Reconnecting to your auction room...", "RECONNECTING", "🔄");
        }
        
        console.log("🔄 Reconnecting...");
        socket.emit('reconnectUser', { roomId: roomCode, username: username });
        // Request immediate state update to check if auction ended
        socket.emit("getAuctionState"); 
    }
});

// Show a soft "reconnecting" popup when socket drops
socket.on('disconnect', () => {
    if (roomCode) {
        const auctionUI = document.getElementById("auctionUI");
        const isOnAuctionScreen = auctionUI && !auctionUI.classList.contains("hidden");
        if (isOnAuctionScreen) {
            reconnectionPopupShown = false; // Reset so it shows again on reconnect
            showPopup("Trying to reconnect to your auction room...", "RECONNECTING", "🔄");
        }
    }
});

// When user returns to the tab/screen, ask server for a fresh snapshot
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && roomCode) {
        const auctionUI = document.getElementById("auctionUI");
        const isOnAuctionScreen = auctionUI && !auctionUI.classList.contains("hidden");
        if (isOnAuctionScreen) {
            // Show reconnecting popup if coming back after long time
            if (!reconnectionPopupShown) {
                isReconnecting = true;
                reconnectionPopupShown = true;
                showPopup("Reconnecting to your auction room...", "RECONNECTING", "🔄");
            }
            socket.emit("getAuctionState");
        }
    }
});

// REPLACE your existing renderEmbeddedTeams function with this:
function renderEmbeddedTeams(teams) {
    const box = document.getElementById("embeddedTeamList");
    const container = document.getElementById("teamSelectionMain"); // Get the main card
    
    if(!box || !container) return;
    
    box.innerHTML = "";
    
    // --- 1. RENDER TEAM BUTTONS (Standard View) ---
    if(!myTeam) {
        // If game started, allow spectator mode (full width button)
        if(gameStarted) {
             const specBtn = document.createElement("div");
             specBtn.innerHTML = `<button class="secondary-btn" style="width:100%; padding:8px; font-size:0.85rem; border-style:dashed;" onclick="setGamePhase('AUCTION')">👀 Watch as Spectator</button>`;
             box.appendChild(specBtn);
        }

        if(!teams || teams.length === 0) {
            box.innerHTML += `<div style="text-align:center; color:#94a3b8; padding:10px; font-size:0.85rem; grid-column:1/-1;">All teams taken!</div>`;
            return;
        }

        // Create buttons directly in grid (no wrapper div)
        teams.sort().forEach(team => {
            const btn = document.createElement("button");
            btn.innerText = team;
            btn.className = "team-btn";
            btn.style.setProperty("--team-color", TEAM_COLORS[team] || "#94a3b8");
            
            // --- ON CLICK: SWAP CONTENT (Don't Hide) ---
            btn.onclick = () => {
                myTeam = team;
                sessionStorage.setItem('ipl_team', team);
                socket.emit("selectTeam", { team, user: username });

                // Hide late join button once a team is picked from header join
                const lateJoinBtn = document.getElementById("lateJoinBtn");
                if (lateJoinBtn) lateJoinBtn.classList.add("hidden");

                // 🟢 FIX: Replace the WHOLE container content to keep size stable (530×177px tile)
                container.innerHTML = `
                    <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; animation: popIn 0.3s ease;">
                        <h2 style="color:var(--primary); margin:0 0 2px 0; font-size:0.85rem;">YOU SELECTED</h2>
                        <h1 style="font-size:2rem; margin:0; line-height:1; color:${TEAM_COLORS[team] || '#fff'}; text-shadow:0 0 12px rgba(0,0,0,0.5);">${team}</h1>
                        <p style="color:#4ade80; font-weight:bold; margin:2px 0 0 0; font-size:0.75rem;">✅ OWNER CONFIRMED</p>

                        <div style="background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:8px; width:100%; margin-top:8px;">
                            <div style="color:#64748b; font-size:0.65rem; font-weight:700; letter-spacing:1px; margin-bottom:2px;">ROOM CODE</div>
                            <div onclick="copyRoomCode()" style="font-family:monospace; font-size:1.1rem; font-weight:700; color:#fff; cursor:pointer; letter-spacing:2px;">
                                ${roomCode} <span style="font-size:0.85rem; opacity:0.5;">📋</span>
                            </div>
                        </div>

                        <div style="margin-top:6px; color:#94a3b8; font-size:0.7rem; font-style:italic;">
                            ${isHost ? "You are the Host. Press ▶ in header to start." : "Waiting for Host to start auction..."}
                        </div>
                    </div>
                `;
                
                updateHeaderNotice();
            };
            box.appendChild(btn);
        });
    }
}


// In socket.on("teamPicked", ...): Replace the entire block with this
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
        if(gameStarted) {
            document.getElementById("teamSelectionMain").classList.add("hidden");
            setGamePhase("AUCTION");
        } // else: Do NOT hide - Keep custom "YOU SELECTED" screen with waiting message
        updateHeaderNotice();
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
socket.on("youAreSpectator", () => {
    if (typeof showPopup === "function") showPopup("You are a spectator now. You can watch the auction but no longer have a team.", "SPECTATOR", "👁️");
    else alert("You are a spectator now.");
});
// Save Rules
const saveRulesBtn = document.getElementById("saveRules");
if(saveRulesBtn) {
    saveRulesBtn.onclick = () => {
        socket.emit("setRules", {
            minSquadSize: Number(document.getElementById("minSquadSize").value) || 18,
            maxPlayers: Number(document.getElementById("maxPlayers").value) || 24,
            maxForeign: Number(document.getElementById("maxForeign").value),
            purse: Number(document.getElementById("purse").value),
            minBat: Number(document.getElementById("minBat").value),
            minAll: Number(document.getElementById("minAll").value),
            minBowl: Number(document.getElementById("minBowl").value),
            minSpin: Number(document.getElementById("minSpin").value),
            minWK: Number(document.getElementById("minWK").value),
            maxForeignXI: Number(document.getElementById("maxForeignXI").value),
            rtmEnabled: document.getElementById("rtmEnabled").checked,
            rtmPerTeam: Number(document.getElementById("rtmPerTeam").value) || 2
        });
    };
}
// RTM toggle: show/hide RTMs per team input
(function() {
    const rtmCb = document.getElementById("rtmEnabled");
    const rtmRow = document.getElementById("rtmCountRow");
    const rtmLabel = rtmCb && rtmCb.closest(".rule-row-rtm");
    if (rtmCb && rtmRow) {
        rtmCb.addEventListener("change", function() {
            rtmRow.style.display = this.checked ? "flex" : "none";
            if (rtmLabel) {
                const t = rtmLabel.querySelector(".label-text");
                if (t) t.textContent = this.checked ? "Yes" : "No";
            }
        });
    }
})();
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
const togglePauseBtn = document.getElementById("togglePauseBtn");
if(togglePauseBtn) {
    togglePauseBtn.onclick = () => {
        socket.emit("adminAction", "togglePause");
    };
}

// Update function to change icon state (no emoji, just visual animation)
function updatePauseIcon(isPaused) {
    const btn = document.getElementById("togglePauseBtn");
    if(!btn) return;
    
    if(isPaused) {
        btn.textContent = "▶";
        btn.title = "Resume";
        btn.classList.add("is-paused");
    } else {
        btn.textContent = "⏸";
        btn.title = "Pause";
        btn.classList.remove("is-paused");
    }
}

socket.on("auctionStarted", () => {
    auctionLive = true;
    auctionPaused = false;
    gameStarted = true;
  
    if (myTeam) updateHeaderNotice();
    setGamePhase("AUCTION");
    updateAdminButtons(true);
});
socket.on("auctionState", (state) => {
    // Check if we're reconnecting and auction has ended
    if (isReconnecting && state.ended) {
        isReconnecting = false;
        reconnectionPopupShown = false;
        toggleCustomPopup(false); // Hide reconnecting popup
        
        // Route based on player status
        if (myTeam) {
            // Player has a team -> Go to XI page
            showScreen("playingXI");
            socket.emit("getMySquad");
            updateURL('xi');
        } else {
            // Spectator -> Go to Summary (push home so Back goes to main)
            setTimeout(() => {
                pushSummaryWithHomeBack();
                renderPostAuctionSummary();
                showScreen("postAuctionSummary", false);
            }, 300);
        }
        return;
    }
    
    // If reconnecting and auction is still active, hide popup
    if (isReconnecting && !state.ended) {
        isReconnecting = false;
        reconnectionPopupShown = false;
        toggleCustomPopup(false);
    }
    
    // 1. Sync Globals
    auctionLive = state.live;
    auctionPaused = state.paused;
    lastBidTeam = state.lastBidTeam;

    // 2. IMMEDIATE UI UPDATE
    if (state.player) {
        currentPlayer = state.player;
        currentBid = state.bid;
        // Show the card
        document.getElementById("auctionCard").classList.remove("hidden");
        // Update texts
        updatePlayerCard(state.player, state.bid);
        updateBidButton({ bid: state.bid, player: state.player });
    } else {
        if (state.bid != null) currentBid = state.bid;
        updateBidButton({ bid: currentBid, player: currentPlayer });
    }

    // 3. Update Bidder Badge
    const badge = document.getElementById('currentBidder');
    if (state.lastBidTeam) {
        badge.classList.remove('hidden');
        document.getElementById('bidderName').innerText = state.lastBidTeam;
        badge.style.backgroundColor = TEAM_COLORS[state.lastBidTeam] || "#22c55e";
    }
    
    updatePauseIcon(state.paused);
    updatePauseBadge(state.paused);
});

// Handle pause/resume events — always refresh bid button so everyone's UI stays in sync
socket.on("auctionPaused", () => {
    auctionPaused = true;
    updatePauseIcon(true);
    updatePauseBadge(true);
    updateBidButton({ bid: currentBid, player: currentPlayer });
});

socket.on("auctionResumed", () => {
    auctionPaused = false;
    updatePauseIcon(false);
    updatePauseBadge(false);
    updateBidButton({ bid: currentBid, player: currentPlayer });
});
// Add this function to force transparency in JS (run after showing auctionCard)
function forceAuctionTileTransparency() {
    const auctionCard = document.getElementById("auctionCard");
    const topRow = document.querySelector(".ac-top-row");
    const botRow = document.querySelector(".ac-bot-row");

    if (auctionCard) {
        auctionCard.style.background = "transparent";
        auctionCard.style.backdropFilter = "none";
        auctionCard.style.webkitBackdropFilter = "none";
        auctionCard.style.boxShadow = "none";
        auctionCard.style.borderColor = "rgba(255, 255, 255, 0.15)";
    }
    if (topRow) {
        topRow.style.background = "transparent";
        topRow.style.backdropFilter = "none";
        topRow.style.webkitBackdropFilter = "none";
        topRow.style.borderBottomColor = "rgba(255, 255, 255, 0.1)";
    }
    if (botRow) {
        botRow.style.background = "transparent";
        botRow.style.backdropFilter = "none";
        botRow.style.webkitBackdropFilter = "none";
        botRow.style.borderBottomColor = "rgba(255, 255, 255, 0.1)";
    }
}

// Call this in setupAuctionScreen() at the end
// Inside setupAuctionScreen function, add:

// Also call it in setGamePhase("AUCTION") to re-apply when switching
// Inside setGamePhase function, in "AUCTION" case:
socket.on("newPlayer", d => {
    currentPlayer = d.player; // Store globally
    auctionLive = true;
    auctionPaused = false;
    lastBidTeam = null;
    lastTickSecond = null;
    const overlay = document.getElementById('resultOverlay');
    if(overlay) {
        overlay.classList.remove("active");
        overlay.classList.add("hidden");
        overlay.innerHTML = ""; // Clear content
    }
    const rtmOl = document.getElementById("rtmOverlay");
    if (rtmOl) { rtmOl.classList.add("hidden"); rtmOl.classList.remove("active"); }
    document.getElementById('resultOverlay').classList.add('hidden');
    document.getElementById('currentBidder').classList.add('hidden');
    const auctionCard = document.getElementById("auctionCard");
    if(auctionCard) {
        auctionCard.classList.remove("pulse");
        auctionCard.classList.remove("blur-content"); // Remove blur when overlay is hidden
    }
  
    updatePlayerCard(d.player, d.bid);
    updateBidButton({ bid: d.bid, player: d.player});
    const timerEl = document.getElementById("timer");
    if (timerEl) {
        if (timerAnimId) { cancelAnimationFrame(timerAnimId); timerAnimId = null; }
        timerEl.classList.remove("two-digit");
        timerEl.style.setProperty("--timer-progress", "0");
        timerEl.style.setProperty("--timer-color", "#22c55e");
        timerEl.style.color = "#22c55e";
    }
});
// --- UPDATED: Render Player Card with Badges ---
function updatePlayerCard(player, bid) {
    const nameEl = document.getElementById("playerName");
    const bidEl = document.getElementById("bid");

    if (nameEl) {
        nameEl.innerText = player.name;
        // Text sizing logic
        const len = player.name.length;
        nameEl.style.fontSize = "1.8rem"; 
        if (len > 18) nameEl.style.fontSize = "1.1rem";
        else if (len > 12) nameEl.style.fontSize = "1.4rem";
    }

    if (bidEl) {
        bidEl.innerText = `₹${bid.toFixed(2)} Cr`;
        currentBid = bid;
    }

    // Render the Meta Badges
    renderPlayerMeta(player);
}

// --- Renders Role/Rating, then badge (pteam when not paused, "⏸ PAUSED" when paused), then purse ---
function renderPlayerMeta(player) {
    const metaEl = document.getElementById("playerMeta");
    if (!metaEl) return;

    const r = player.role;
    const color = (r==="BAT"?"#facc15" : r.includes("BOWL")?"#38bdf8" : r==="ALL"?"#a855f7" : r==="WK"?"#fb923c" : "#ccc");
    const pteam = (player.pteam && String(player.pteam).trim() !== "") ? String(player.pteam).trim() : "--";
    const badgeText = auctionPaused ? "⏸ PAUSED" : pteam;
    const badgeVisibleClass = auctionPaused ? "visible" : "";

    metaEl.innerHTML = `
        <div class="meta-badge-premium" style="color: ${color} !important;">
            ${player.role} • ⭐${player.rating}
        </div>
        <div id="pausedBadge" class="meta-badge-paused ${badgeVisibleClass}">${badgeText}</div>
        <span id="bidPurseText" class="meta-purse-text">₹0.00 Cr</span>
    `;
}

// --- Toggle Paused Badge: text = pteam when not paused, "⏸ PAUSED" when paused; .visible = red/pulse style ---
function updatePauseBadge(isPaused) {
    auctionPaused = isPaused;
    const badge = document.getElementById("pausedBadge");
    if (!badge) return;
    const pteam = (currentPlayer && currentPlayer.pteam && String(currentPlayer.pteam).trim() !== "")
        ? String(currentPlayer.pteam).trim() : "--";
    badge.textContent = isPaused ? "⏸ PAUSED" : pteam;
    if (isPaused) badge.classList.add("visible");
    else badge.classList.remove("visible");
}


let timerAnimId = null;
let timerAnimStart = 0;
let timerAnimFrom = 0;
let timerAnimTo = 0;
let timerAnimColor = "#22c55e";
function animateTimerProgress(timerEl, from, to, color, durationMs) {
    if (timerAnimId) cancelAnimationFrame(timerAnimId);
    timerAnimFrom = from;
    timerAnimTo = to;
    timerAnimColor = color;
    timerAnimStart = performance.now();
    const step = (now) => {
        const elapsed = now - timerAnimStart;
        const t = Math.min(elapsed / durationMs, 1);
        const eased = t; // linear
        const p = timerAnimFrom + (timerAnimTo - timerAnimFrom) * eased;
        if (timerEl) timerEl.style.setProperty("--timer-progress", String(p));
        if (t < 1) timerAnimId = requestAnimationFrame(step);
    };
    timerAnimId = requestAnimationFrame(step);
}
socket.on("timer", t => {
    const timerEl = document.getElementById("timer");
    if (timerEl) {
        timerEl.innerText = "" + t;
        timerEl.classList.toggle("two-digit", t === 10);
        const targetProgress = Math.min(100, ((11 - t) / 10) * 100);
        const currentProgress = parseFloat(timerEl.style.getPropertyValue("--timer-progress")) || 0;
        const color = t > 7 ? "#22c55e" : t > 4 ? "#f59e0b" : "#ef4444";
        timerEl.style.setProperty("--timer-color", color);
        timerEl.style.color = color;
        animateTimerProgress(timerEl, currentProgress, targetProgress, color, 1000);
    }
    if (auctionLive && !auctionPaused && t <= 3 && t > 0 && t !== lastTickSecond) {
        lastTickSecond = t;
        playTimerBeep();
    }
});
const bidBtn = document.getElementById("bidBtn");
if(bidBtn) {
    bidBtn.onclick = () => {
        unlockAudioOnInteraction();
        if(!myTeam) return alert("Select a team first!");
        if(bidBtn.disabled) return;
        socket.emit("bid");
    };
}
socket.on("bidUpdate", data => {
    playBidSound();
    currentBid = data.bid;
    document.getElementById("bid").innerText = `₹${data.bid.toFixed(2)} Cr`;
    lastBidTeam = data.team;

    const badge = document.getElementById('currentBidder');
    badge.classList.remove('hidden');
    document.getElementById('bidderName').innerText = data.team;
    badge.style.backgroundColor = TEAM_COLORS[data.team] || "#22c55e";

    // 🔴 CONDITIONAL BLINK LOGIC (Team Color Border Flash)
    if (data.team === myTeam) {
        const card = document.getElementById("auctionCard");
        const teamColor = TEAM_COLORS[myTeam] || "#4ade80";
        
        // Convert hex to rgba for shadow
        const hex = teamColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
        
        // Remove any existing pulse classes
        card.classList.remove("pulse-green", "pulse-team");
        
        // Set custom team color for pulse
        card.style.setProperty('--pulse-color', teamColor);
        card.style.setProperty('--pulse-shadow', shadowColor);
        
        void card.offsetWidth; // Force Reflow
        card.classList.add("pulse-team"); // Add team-colored pulse
        
        // Remove after animation so it can trigger again
        setTimeout(() => {
            card.classList.remove("pulse-team");
            card.style.removeProperty('--pulse-color');
            card.style.removeProperty('--pulse-shadow');
        }, 500);
    }

    updateBidButton({ bid: data.bid, player: currentPlayer });
});



function updateBidButton(state) {
    const btn = document.getElementById("bidBtn");
    const btnText = document.getElementById("btnIncText");
    const purseEl = document.getElementById("bidPurseText");
    const mySquad = allSquads[myTeam] || [];

    if (purseEl) {
        const purse = myTeam && teamPurse[myTeam] !== undefined ? teamPurse[myTeam] : 0;
        purseEl.textContent = `₹${purse.toFixed(2)} Cr`;
        purseEl.style.display = myTeam ? "inline" : "none";
    }

    let bidVal = state ? (state.bid || 0) : 0;
    const currentBid = Math.round(bidVal * 100) / 100;
    const increment =
        currentBid < 1  ? 0.05 :
        currentBid < 5  ? 0.10 :
        currentBid < 10 ? 0.20 :
        currentBid < 20 ? 0.25 :
        1.0;

    function setButtonState(disabled, subText) {
        if (btn) btn.disabled = disabled;
        if (btnText) {
            btnText.innerText = subText;
            btnText.style.fontSize = disabled && subText ? "0.7rem" : "0.75rem";
            btnText.style.opacity = disabled && subText ? "1" : "0.8";
        }
    }

    if (!myTeam || !auctionLive || auctionPaused) { setButtonState(true, ""); return; }
    if (lastBidTeam === myTeam) { setButtonState(true, ""); return; }

    const nextBid = bidVal + increment;
    if (teamPurse && teamPurse[myTeam] !== undefined && teamPurse[myTeam] < nextBid) {
        setButtonState(true, "Not enough purse"); return;
    }
    if (activeRules.maxPlayers && mySquad.length >= activeRules.maxPlayers) {
        setButtonState(true, "Squad full"); return;
    }
    if (state.player && state.player.foreign) {
        const fCount = mySquad.filter(p => p.foreign).length;
        if (activeRules.maxForeign && fCount >= activeRules.maxForeign) {
            setButtonState(true, "Overseas full"); return;
        }
    }

    setButtonState(false, `+ ${increment.toFixed(2)} Cr`);
}


socket.on("sold", d => {
    playSoldSound();
    showResultStamp("SOLD", `TO ${d.team}`, TEAM_COLORS[d.team], false);
    if(d.purse) teamPurse = d.purse;
    updateHeaderNotice();
    updateBidButton({ bid: currentBid, player: currentPlayer });

    if(document.getElementById('view-squads') && !document.getElementById('view-squads').classList.contains('hidden')) {
        if(selectedSquadTeam === d.team) viewEmbeddedSquad(selectedSquadTeam);
    }
    updateSoldUnsoldPopupIfOpen();
    // Append premium sold tile to feed
const chat = document.getElementById("chat");
if (chat && d.player && d.team && d.price != null) {
    const teamColor = TEAM_COLORS[d.team] || "#94a3b8";
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const playerName = d.player.name || "";
    
    const div = document.createElement("div");
    div.className = "premium-sold-tile";
    
    // Using a more structured innerHTML for better CSS targeting
    div.innerHTML = `
        <div class="tile-glow" style="background: ${teamColor}33"></div>
        <div class="tile-content">
            <div class="tile-left">
                <div class="icon-wrapper" style="border-color: ${teamColor}">
                    <span class="premium-icon">🏆</span>
                </div>
                <div class="tile-details">
                    <span class="player-name">${esc(playerName)}</span>
                    <span class="sale-info">Sold to <b style="color:${teamColor}">${esc(d.team)}</b></span>
                </div>
            </div>
            <div class="tile-right">
                <div class="price-tag">₹${Number(d.price).toFixed(2)} Cr</div>
                <button type="button" class="btn-premium-save">
                    <span class="btn-text">Save Card</span>
                    <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </button>
            </div>
        </div>
    `;

    const btn = div.querySelector(".btn-premium-save");
    if (btn) {
        const playerData = { 
            name: playerName, 
            role: d.player.role || "", 
            rating: d.player.rating != null ? d.player.rating : 0, 
            foreign: !!d.player.foreign 
        };

        btn.onclick = function() {
            btn.classList.add("loading");
            openPlayerProfile(playerData, d.team, d.price);

            // Wait for DOM to render the card
            setTimeout(() => {
                const overlay = document.getElementById("playerCardOverlay");
                const card = overlay?.querySelector(".pc-card");

                if (card && typeof html2canvas !== "undefined") {
                    html2canvas(card, { 
                        backgroundColor: null, 
                        scale: 3, // Higher scale = Higher quality
                        useCORS: true 
                    }).then(canvas => {
                        const a = document.createElement("a");
                        a.download = `${playerName.replace(/\s+/g, "_")}_Exclusive_Card.png`;
                        a.href = canvas.toDataURL("image/png");
                        a.click();
                        
                        btn.classList.remove("loading");
                        overlay.remove();
                    });
                } else {
                    btn.classList.remove("loading");
                    if (overlay) overlay.remove();
                }
            }, 400);
        };
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    cleanChatMessages();
    saveChatToSession();
}

});
socket.on("unsold", (data) => {
    playUnsoldSound();
    if (data && data.player) unsoldList.push(data.player);
    showResultStamp("UNSOLD", "PASSED IN", "#f43f5e", true);
    updateSoldUnsoldPopupIfOpen();
});

function getSoldListFromSquads() {
    const out = [];
    if (!allSquads || typeof allSquads !== "object") return out;
    for (const [team, players] of Object.entries(allSquads)) {
        if (!Array.isArray(players)) continue;
        players.forEach(p => {
            out.push({ player: p, team, price: p.price != null ? p.price : 0 });
        });
    }
    out.sort((a, b) => (b.price || 0) - (a.price || 0));
    return out;
}
function renderSoldUnsoldList() {
    const listEl = document.getElementById("soldUnsoldList");
    const soldBadge = document.getElementById("soldCountBadge");
    const unsoldBadge = document.getElementById("unsoldCountBadge");
    if (!listEl) return;
    const sold = getSoldListFromSquads();
    if (soldBadge) soldBadge.textContent = String(sold.length);
    if (unsoldBadge) unsoldBadge.textContent = String(unsoldList.length);
    if (soldUnsoldTab === "sold") {
        if (sold.length === 0) {
            listEl.innerHTML = '<div style="padding:20px; color:#64748b; text-align:center;">No sold players yet</div>';
            return;
        }
        listEl.innerHTML = sold.map(({ player, team, price }) => {
            const teamColor = TEAM_COLORS[team] || "#64748b";
            const rtmBadge = player.rtm ? '<span class="rtm-badge">RTM</span>' : "";
            return `<div class="sold-unsold-row">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#e2e8f0;">${player.name || ""}</div>
                    <div style="font-size:0.75rem; color:#94a3b8;">${player.role || ""}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="color:#facc15; font-weight:700;">₹${(price || 0).toFixed(2)} Cr</span>
                    <span class="team-badge" style="background:${teamColor}20; color:${teamColor};">${team}</span>
                    ${rtmBadge}
                </div>
            </div>`;
        }).join("");
    } else {
        if (unsoldList.length === 0) {
            listEl.innerHTML = '<div style="padding:20px; color:#64748b; text-align:center;">No unsold players yet</div>';
            return;
        }
        listEl.innerHTML = unsoldList.map(p => `
            <div class="sold-unsold-row">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#e2e8f0;">${p.name || ""}</div>
                    <div style="font-size:0.75rem; color:#94a3b8;">${p.role || ""}${p.pteam ? " • RTM: " + p.pteam : ""}</div>
                </div>
            </div>
        `).join("");
    }
}
function updateSoldUnsoldPopupIfOpen() {
    const overlay = document.getElementById("soldUnsoldOverlay");
    if (overlay && !overlay.classList.contains("hidden")) {
        renderSoldUnsoldList();
    }
}
window.toggleSoldUnsoldPopup = function() {
    const overlay = document.getElementById("soldUnsoldOverlay");
    if (!overlay) return;
    if (overlay.classList.contains("hidden")) {
        overlay.classList.remove("hidden");
        renderSoldUnsoldList();
    } else {
        overlay.classList.add("hidden");
    }
};
window.closeSoldUnsoldPopup = function() {
    document.getElementById("soldUnsoldOverlay")?.classList.add("hidden");
};
window.switchSoldUnsoldTab = function(tab) {
    soldUnsoldTab = tab;
    document.querySelectorAll(".sold-unsold-tab").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    renderSoldUnsoldList();
};

function showResultStamp(title, detail, color, isUnsold) {
    const rtmOl = document.getElementById("rtmOverlay");
    if (rtmOl) { rtmOl.classList.add("hidden"); rtmOl.classList.remove("active"); }
    const btn = document.getElementById("bidBtn");
    if(btn) btn.disabled = true;

    const overlay = document.getElementById('resultOverlay');
    if(!overlay) return;

    overlay.innerHTML = `
        <div class="premium-fullcard">
            <div class="pf-title" style="color:${color};">${title}</div>
            <div class="pf-detail">${detail}</div>
        </div>
    `;

    overlay.classList.remove("hidden");
    overlay.classList.add("active");
    
    const auctionCard = document.getElementById("auctionCard");
    if(auctionCard) auctionCard.classList.add("blur-content");
    
    setTimeout(() => {
        if(auctionCard) auctionCard.classList.remove("blur-content");
    }, 2000);
}

// --- RTM (Right to Match) overlay and popups ---
socket.on("rtmOverlay", ({ show }) => {
    const rtmOl = document.getElementById("rtmOverlay");
    const resOl = document.getElementById("resultOverlay");
    if (!rtmOl) return;
    if (show) {
        if (resOl) { resOl.classList.add("hidden"); resOl.classList.remove("active"); }
        rtmOl.classList.remove("hidden");
        rtmOl.classList.add("active");
    } else {
        rtmOl.classList.add("hidden");
        rtmOl.classList.remove("active");
        if (rtmOfferTimerId) clearInterval(rtmOfferTimerId);
        rtmOfferTimerId = null;
        rtmOfferData = null;
        document.getElementById("rtmOfferOverlay")?.classList.add("hidden");
        document.getElementById("rtmBuyerChoiceOverlay")?.classList.add("hidden");
    }
});

let rtmOfferData = null;
let rtmOfferTimerId = null;

socket.on("rtmOffer", ({ player, soldToTeam, soldPrice, timer: timerSec }) => {
    rtmOfferData = { player, soldToTeam, soldPrice };
    const ol = document.getElementById("rtmOfferOverlay");
    const playerEl = document.getElementById("rtmOfferPlayer");
    const yesNo = document.getElementById("rtmOfferYesNo");
    const amountRow = document.getElementById("rtmOfferAmountRow");
    const amountIn = document.getElementById("rtmOfferAmount");
    const timerEl = document.getElementById("rtmOfferTimer");
    if (!ol || !playerEl) return;
    playerEl.textContent = `${player.name} sold to ${soldToTeam} at ₹${soldPrice.toFixed(2)} Cr`;
    yesNo.style.display = "flex";
    amountRow.style.display = "none";
    if (amountIn) amountIn.value = "";
    if (timerEl) timerEl.textContent = "";
    ol.classList.remove("hidden");

    const hideRtmOffer = () => {
        if (rtmOfferTimerId) clearInterval(rtmOfferTimerId);
        rtmOfferTimerId = null;
        rtmOfferData = null;
        ol.classList.add("hidden");
    };

    document.getElementById("rtmOfferNo").onclick = () => {
        socket.emit("rtmReject");
        hideRtmOffer();
    };

    document.getElementById("rtmOfferYes").onclick = () => {
        yesNo.style.display = "none";
        amountRow.style.display = "block";
        if (amountIn) amountIn.placeholder = `Min ${(soldPrice + 0.05).toFixed(2)}`;
        let sec = timerSec ?? 15;
        if (timerEl) timerEl.textContent = sec + "s";
        if (rtmOfferTimerId) clearInterval(rtmOfferTimerId);
        rtmOfferTimerId = setInterval(() => {
            sec--;
            if (timerEl) timerEl.textContent = sec + "s";
            if (sec <= 0) {
                clearInterval(rtmOfferTimerId);
                rtmOfferTimerId = null;
                socket.emit("rtmReject");
                hideRtmOffer();
            }
        }, 1000);
    };

    document.getElementById("rtmOfferSubmit").onclick = () => {
        if (!rtmOfferData) return;
        const amt = Number(document.getElementById("rtmOfferAmount").value);
        const purse = myTeam && teamPurse[myTeam] !== undefined ? teamPurse[myTeam] : 0;
        if (isNaN(amt) || amt <= rtmOfferData.soldPrice || amt > purse) {
            alert("Amount must be more than sold price and within your purse.");
            return;
        }
        socket.emit("rtmAccept", { amount: amt });
        hideRtmOffer();
    };
});

socket.on("rtmBuyerChoice", ({ player, rtmPrice, rtmTeam }) => {
    const ol = document.getElementById("rtmBuyerChoiceOverlay");
    const textEl = document.getElementById("rtmBuyerChoiceText");
    if (!ol || !textEl) return;
    textEl.textContent = `Will you want ${player.name} at ₹${rtmPrice.toFixed(2)} Cr? Yes = you keep him at this price, No = ${rtmTeam} gets him.`;
    ol.classList.remove("hidden");

    const hide = () => ol.classList.add("hidden");

    document.getElementById("rtmBuyerYes").onclick = () => {
        socket.emit("rtmBuyerAccept");
        hide();
    };
    document.getElementById("rtmBuyerNo").onclick = () => {
        socket.emit("rtmBuyerReject");
        hide();
    };
});
/* ================================================= */
/* =========== 5. LOGS & CHAT (IMPROVED) =========== */
/* ================================================= */
// Chat / feed tracking
let chatLogCount = 0; // Track number of log messages in chat

// Custom dataset builder (in-memory selection before room is created)
let customAllPlayers = [];
let customSelectedIndexes = new Set();

// Persist current chat HTML to sessionStorage so feed survives full refresh
function saveChatToSession() {
    try {
        const chat = document.getElementById("chat");
        if (!chat || !roomCode) return;
        const key = `ipl_chat_${roomCode}`;
        sessionStorage.setItem(key, chat.innerHTML);
    } catch (e) {
        console.warn("saveChatToSession failed", e);
    }
}

// Restore chat HTML from sessionStorage (called on load / reconnect)
function restoreChatFromSession() {
    try {
        const chat = document.getElementById("chat");
        if (!chat || !roomCode) return;
        const key = `ipl_chat_${roomCode}`;
        const html = sessionStorage.getItem(key);
        if (html) {
            chat.innerHTML = html;
        }
    } catch (e) {
        console.warn("restoreChatFromSession failed", e);
    }
}

// Helper: Clean chat to maintain limits (max 5 logs, max 25 total)
function cleanChatMessages() {
    const chat = document.getElementById("chat");
    if(!chat) return;
    
    const messages = Array.from(chat.children);
    const logs = messages.filter(m => m.classList.contains('log-message'));
    const chats = messages.filter(m => !m.classList.contains('log-message'));
    
    // Remove excess logs (keep only latest 5)
    while(logs.length > 5) {
        const oldestLog = logs.shift();
        if(oldestLog && oldestLog.parentNode) oldestLog.parentNode.removeChild(oldestLog);
    }
    
    // Remove excess total messages (keep max 25 total)
    const allMessages = Array.from(chat.children);
    while(allMessages.length > 25) {
        const oldest = allMessages.shift();
        if(oldest && oldest.parentNode) {
            oldest.parentNode.removeChild(oldest);
            if(oldest.classList.contains('log-message')) chatLogCount--;
        }
    }
}

// 1. CHAT UPDATE (Newest at Bottom)
socket.on("chatUpdate", d => {
    const chat = document.getElementById("chat");
    if(!chat) return;

    const isMe = (d.user === username);
    const msgId = d.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const reactions = d.reactions || {};

    const div = document.createElement("div");
    div.className = `chat-msg ${isMe ? 'mine' : 'others'}`;
    div.dataset.msgId = msgId;
    div.dataset.reactions = JSON.stringify(reactions);

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12:false });
    const color = TEAM_COLORS[d.team] || '#aaa';
    const sortedReactions = Object.entries(reactions).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const reactionsBadgeHtml = sortedReactions.length
        ? `<span class="chat-msg-reaction-badge">${sortedReactions.map(([emoji, count]) => `${emoji} ${count}`).join("  ")}</span>`
        : "";

    div.innerHTML = `
        <div class="chat-msg-reactions"><span data-emoji="👍" title="Like">👍</span><span data-emoji="👏" title="Clap">👏</span><span data-emoji="😂" title="Laugh">😂</span><span data-emoji="❤️" title="Love">❤️</span><span data-emoji="🔥" title="Fire">🔥</span></div>
        <div class="chat-meta" style="color:${color}">
            <span class="chat-meta-inline">${d.team} &bull; ${d.user || 'Player'}</span>
        </div>
        <div class="chat-text" style="color:#eee;">${d.msg}${reactionsBadgeHtml ? reactionsBadgeHtml : ""}</div>
    `;
    div.style.borderLeftColor = color;

    (function setupReactable(el, mid) {
        function updateReactionsDisplay(rx) {
            const r = rx || {};
            const sorted = Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 3);
            const txt = el.querySelector(".chat-text");
            if (!txt) return;
            let badge = el.querySelector(".chat-msg-reaction-badge");
            if (sorted.length === 0) {
                if (badge) badge.remove();
                return;
            }
            const badgeHtml = `<span class="chat-msg-reaction-badge">${sorted.map(([emoji, count]) => `${emoji} ${count}`).join("  ")}</span>`;
            if (badge) badge.outerHTML = badgeHtml; else txt.insertAdjacentHTML("beforeend", badgeHtml);
        }
        el.querySelector(".chat-msg-reactions")?.addEventListener("click", function(e) {
            e.stopPropagation();
            const span = e.target.closest("span[data-emoji]");
            if (!span) return;
            const emoji = span.getAttribute("data-emoji");
            socket.emit("chatReaction", { msgId: mid, emoji });
            el.classList.remove("reactable-hold");
        });
        let holdTimer = null;
        el.addEventListener("pointerdown", function(e) {
            if (e.button !== 0) return;
            holdTimer = setTimeout(function() {
                holdTimer = null;
                el.classList.add("reactable-hold");
                el.dataset.reactableJustOpened = "1";
            }, 500);
        });
        el.addEventListener("pointerup", function() { if (holdTimer) clearTimeout(holdTimer); });
        el.addEventListener("pointerleave", function() { if (holdTimer) clearTimeout(holdTimer); });
        el.addEventListener("click", function closeReactions() {
            if (!el.classList.contains("reactable-hold")) return;
            if (el.dataset.reactableJustOpened) { delete el.dataset.reactableJustOpened; return; }
            el.classList.remove("reactable-hold");
        });
    })(div, msgId);

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    cleanChatMessages();
    saveChatToSession();
});
socket.on("chatReactionUpdate", ({ msgId, reactions }) => {
    const chat = document.getElementById("chat");
    if(!chat || !msgId) return;
    const el = chat.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    el.dataset.reactions = JSON.stringify(reactions || {});
    const sorted = Object.entries(reactions || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const txt = el.querySelector(".chat-text");
    if (!txt) return;
    let badge = el.querySelector(".chat-msg-reaction-badge");
    if (sorted.length === 0) {
        if (badge) badge.remove();
        return;
    }
    const badgeHtml = `<span class="chat-msg-reaction-badge">${sorted.map(([emoji, count]) => `${emoji} ${count}`).join("  ")}</span>`;
    if (badge) badge.outerHTML = badgeHtml; else txt.insertAdjacentHTML("beforeend", badgeHtml);
});

// 2. LOG UPDATE (Merged into Chat, Max 5 logs)
socket.on("logUpdate", msg => {
    const chat = document.getElementById("chat");
    if(!chat) return;
    
    const div = document.createElement("div");
    div.className = "chat-msg log-message"; // Special class for log messages
    chatLogCount++;
    
    // Simple Timestamp + Message (styled like log - compact)
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div class="chat-meta log-meta" style="color:#fbbf24; opacity:0.8;">${time}</div>
        <div class="chat-text log-text" style="color:#94a3b8;">${msg}</div>
    `;
    
    // Style log messages differently (no team color border)
    div.style.borderLeftColor = "rgba(251,191,36,0.3)";
    div.style.background = "rgba(0,0,0,0.2)";
    
    // Append to chat (not separate log)
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    
    // Clean to maintain limits (max 5 logs, max 25 total)
    cleanChatMessages();
    // Persist feed so it survives full page refresh
    saveChatToSession();
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
    container.innerHTML = teams.map(t => {
        const teamColor = TEAM_COLORS[t] || '#facc15';
        return `<button onclick="viewEmbeddedSquad('${t}')"
         class="h-team-btn ${t === selectedSquadTeam ? 'active' : ''}"
         style="${t === selectedSquadTeam ? `--team-color: ${teamColor};` : ''}">
         ${t}
         </button>`;
    }).join("");
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
    // 4. INJECT HTML (Dashboard View with faded logo watermark)
    const logoUrl = `/logos/${team}.png`;
    box.innerHTML = `
        <div id="squad-display-container" style="position:relative; --team-logo: url('${logoUrl}');">
            <div class="squad-watermark"></div>
            <div class="squad-header-compact">
                <h2 style="color:${teamColor}; margin:0;">${team}</h2>
                <div style="display:flex; justify-content:space-between; margin-top:5px; color:#aaa; font-size:0.9rem;">
                    <span>:<span style="color:#fff">${owner}</span></span>
                    <span style="color:#4ade80; font-weight:bold;">₹${purse.toFixed(2)} Cr</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.8rem;">
                    <span style="color:#ccc;">𐀪 : ${squad.length} | <strong>OS: ${foreignCount}</strong>${activeRules.rtmEnabled ? ` | <strong title="RTMs left for this team">RTM: ${(rtmLeftByTeam[team] != null && rtmLeftByTeam[team] !== '') ? rtmLeftByTeam[team] : (activeRules.rtmPerTeam != null ? activeRules.rtmPerTeam : 0)}</strong>` : ''}</span>
                    <button onclick="downloadSquadImage()" style="cursor:pointer; background:#222; border:1px solid #444; color:#facc15; padding:4px 10px; border-radius:4px;">
                        [⇩]
                    </button>
                </div>
            </div>
            <div id="view-squad-list" class="compact-list"></div>
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
    const container = document.getElementById("squad-display-container");
    if(!container) {
        alert("Squad view not available");
        return;
    }
    
    const teamName = selectedSquadTeam || "Squad";
    html2canvas(container, {
        backgroundColor: "#1e1e1e",
        scale: 2,
        useCORS: true,
        logging: false
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${teamName}_Squad.png`;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).catch(err => {
        console.error("Download failed:", err);
        alert("Failed to download squad image");
    });
};
// ==========================================
// UTILS: PLAYER CARDS & IMAGES
// ==========================================
function loadPlayerImage(imgEl, playerName) {
    if(!playerName) return;
    const raw = playerName.trim();
   
    const upperUnderscore = raw.toUpperCase().replace(/\s+/g, '_'); // Fixed: Added definition
    const candidates = [
        `/players/${upperUnderscore}.png`, // VIRAT_KOHLI.png
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
    const headerLabel = (team === "Unsold" && playerData.pteam) ? `RTM: ${playerData.pteam}` : team;

    const html = `
    <div id="playerCardOverlay" class="player-card-overlay" onclick="closePlayerCard(event)">
        <div class="pc-card compact" data-team="${team}" onclick="event.stopPropagation()">
            <div class="pc-bg-layer"></div>
            <div class="pc-content">
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center; z-index:10;">
                    <span style="font-weight:bold; color:rgba(255,255,255,0.5); font-size:0.9rem;">${headerLabel}</span>
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
                <div class="pc-price-tag pc-price-tag-inline" style="color:${teamColor}">${amount}</div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const imgEl = document.getElementById('activeCardImg');
    requestAnimationFrame(() => { loadPlayerImage(imgEl, playerData.name); });
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
window.viewSetPlayer = function(name, role, rating, isForeign, pteam) {
    const playerData = {
        name: name,
        role: role,
        rating: rating,
        foreign: isForeign,
        pteam: (pteam && String(pteam).trim() && String(pteam).trim() !== '--') ? String(pteam).trim() : null
    };
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
                ${activeSet.players.map(p => {
                    const pteam = (p.pteam && String(p.pteam).trim()) ? String(p.pteam).trim() : '--';
                    const esc = (s) => String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                    return `
                    <div class="set-player-row active-p"
                         style="cursor: pointer;"
                         onclick="viewSetPlayer('${esc(p.name)}', '${p.role}', ${p.rating}, ${p.foreign}, '${esc(pteam)}')">
                        <span>${p.name}</span>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="sp-role">${p.role}</span>
                            <span class="sp-rating">⭐ ${p.rating}</span>
                            <span class="set-pteam-badge" title="Previous team / RTM">${pteam}</span>
                        </div>
                    </div>
                `;
                }).join("")}
                ${activeSet.players.length===0 ? '<div style="padding:10px; color:#666; text-align:center;">Set Finished</div>' : ''}
            </div>
    `;
    // Upcoming Sets
    if(remainingSets.length > 1) {
        remainingSets.slice(1).forEach(set => {
            html += `
                <h2 class="set-title">📦 ${set.name} (${set.players.length})</h2>
                <div style="opacity: 0.6;">
                    ${set.players.map(p => {
                        const pteam = (p.pteam && String(p.pteam).trim()) ? String(p.pteam).trim() : '--';
                        const esc = (s) => String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                        return `
                        <div class="set-player-row"
                             style="cursor: pointer;"
                             onclick="viewSetPlayer('${esc(p.name)}', '${p.role}', ${p.rating}, ${p.foreign}, '${esc(pteam)}')">
                            <span>${p.name}</span>
                            <div style="display:flex; align-items:center; gap:6px;"><span class="sp-role">${p.role}</span><span class="set-pteam-badge">${pteam}</span></div>
                        </div>
                    `;
                    }).join("")}
                </div>
            `;
        });
    }
    html += `</div>`;
    container.innerHTML = html;
}
// --- SQUADS DATA ---
// --- UPDATED: Socket Listener for Squad Data ---
socket.on("squadData", data => {
    const squads = data && data.squads ? data.squads : data;
    const rtmLeft = data && data.rtmLeft ? data.rtmLeft : {};
    allSquads = squads;
    rtmLeftByTeam = rtmLeft;

    const squadView = document.getElementById('view-squads');
    if (squadView && !squadView.classList.contains('hidden') && selectedSquadTeam) {
        viewEmbeddedSquad(selectedSquadTeam);
    }
    updateSoldUnsoldPopupIfOpen();
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
            endBtn.style.display = ""; // Let CSS handle display
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
            endBtn.style.display = ""; // Let CSS handle display via .hidden class
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
// ==========================================
// 🛠️ ATTACH BUTTON LISTENERS (ROBUST FIX)
// ==========================================
function attachAdminListeners() {
    // Helper to safely add click listener
    const add = (id, action) => {
        const btn = document.getElementById(id);
        if(btn) btn.onclick = () => socket.emit("adminAction", action);
    };

    add("startBtn", "start");
    add("togglePauseBtn", "togglePause");
    const skipBtn = document.getElementById("skipBtn");
    if (skipBtn) {
        skipBtn.onclick = () => {
            if (lastBidTeam != null) {
                const tip = document.createElement("div");
                tip.className = "skip-tip-popup";
                tip.textContent = "already a bid placed!";
                tip.style.cssText = "position:fixed; left:50%; top:55px; transform:translateX(-50%); padding:8px 12px; background:rgba(239,68,68,0.85); color:#fff; font-size:0.75rem; white-space:nowrap; border-radius:8px; z-index:10001; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.4);";
                document.body.appendChild(tip);
                setTimeout(() => { tip.remove(); }, 500);
                return;
            }
            socket.emit("adminAction", "skip");
        };
    }
    
    // 🟢 FIX: Custom Popup for SKIP SET
    const skipSetBtn = document.getElementById("skipSetBtn");
    if(skipSetBtn) {
        // Remove any inline onclick from HTML first to avoid double firing
        skipSetBtn.onclick = async () => {
            const confirmed = await showConfirm(
                "This will skip the current set. All remaining players in this set will be marked as UNSOLD.\n\nContinue?", 
                "SKIP ENTIRE SET?", 
                "ᯓ➤"
            );
            
            if(confirmed) {
                socket.emit("adminAction", "skipSet");
            }
        };
    }

    // 🟢 FIX: Custom Popup for END GAME
    const endBtn = document.getElementById("endBtn"); 
    if(endBtn) {
        // Remove inline onclick="admin('end')" from HTML if present
        endBtn.onclick = async () => {
            const confirmed = await showConfirm(
                "This will end the auction permanently and generate final summaries.\n\nAre you sure?", 
                "END AUCTION?", 
                "🛑"
            );
            
            if(confirmed) {
                socket.emit("adminAction", "end");
            }
        };
    }
}


// CALL THIS ON LOAD
document.addEventListener("DOMContentLoaded", () => {
    initLandingAnimations();
    initSquadTabs();
    attachAdminListeners(); // 🔴 RUN THIS
});

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
        // Hide "Join" button in header because we are ON the join screen
        if(lateJoinBtn) lateJoinBtn.classList.add("hidden");
    } 
    else if (phase === "AUCTION") {
        if(teamCard) teamCard.classList.add("hidden");
        if(auctionCard) auctionCard.classList.remove("hidden");
        // Show "Join" button in header if I am a spectator
        if(lateJoinBtn && !myTeam) lateJoinBtn.classList.remove("hidden");
        forceAuctionTileTransparency();
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
window.toggleUserList = function(ev) {
    if (ev) ev.stopPropagation();
    const list = document.getElementById("userListDropdown");
    const btn = document.querySelector(".count-pill-btn");
    if (!list || !btn) return;
    const isOpening = list.classList.contains("hidden");
    list.classList.toggle("hidden");
    document.removeEventListener('click', closeUserListOutside);
    if (isOpening) {
        setTimeout(function() {
            document.addEventListener('click', closeUserListOutside);
        }, 0);
    }
};
function closeUserListOutside(e) {
    const list = document.getElementById("userListDropdown");
    const btn = document.querySelector(".count-pill-btn");
    if (!list || !btn) return;
    if (!list.contains(e.target) && !btn.contains(e.target)) {
        list.classList.add("hidden");
        document.removeEventListener('click', closeUserListOutside);
    }
}
function updateHeaderNotice() {
    const headerBadge = document.getElementById("headerTeamBadge");
    const headerName = document.getElementById("headerTeamName");
    
    if (!myTeam) {
        if(headerBadge) headerBadge.classList.add("hidden");
        return;
    }

    if(headerBadge) {
        headerBadge.classList.remove("hidden");
        headerName.innerText = myTeam;
        const color = TEAM_COLORS[myTeam] || '#fff';
        // Transparent badge with team-colored border + text
        headerBadge.style.background = "transparent";
        headerBadge.style.border = `1px solid ${color}`;
        headerBadge.style.color = color;
    }
}

window.showRules = function() {
    socket.emit("getAuctionState");
    document.getElementById('viewRulesOverlay').classList.remove('hidden');
    updateRulesUI();
};
function updateRulesUI() {
    if(!activeRules) return;
    const r = activeRules;
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
    set('pop_viewPurse', r.purse);
    const minSq = r.minSquadSize != null ? r.minSquadSize : 18;
    const maxSq = r.maxPlayers != null ? r.maxPlayers : 24;
    set('pop_viewSquadSize', `${minSq}–${maxSq}`);
    set('pop_viewForeign', r.maxForeign);
    const rtmBox = document.getElementById('pop_viewRtmBox');
    const rtmVal = document.getElementById('pop_viewRtm');
    if (rtmBox && rtmVal) {
        if (r.rtmEnabled) {
            rtmBox.style.display = 'block';
            rtmVal.innerText = r.rtmPerTeam != null ? r.rtmPerTeam : 2;
        } else {
            rtmBox.style.display = 'none';
        }
    }
    set('pop_viewBat', r.minBat);
    set('pop_viewBowl', r.minBowl);
    set('pop_viewWK', r.minWK);
    set('pop_viewAR', r.minAll);
    set('pop_viewSpin', r.minSpin);
    set('pop_viewForeignXI', r.maxForeignXI);

    set('viewPurse', r.purse);
    set('viewSquadSize', `${minSq}–${maxSq}`);
    set('viewForeign', r.maxForeign);
}
function showScreen(id, updateHistory = true) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
    if (id === "auctionUI") unlockAudioOnInteraction();

    if (!updateHistory) return;
    if (id === 'leaderboard') {
        socket.emit("getAuctionState");
        updateURL('leaderboard');
    } else if (id === 'playingXI') {
        updateURL('xi');
    } else if (id === 'postAuctionSummary') {
        updateURL('summary');
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
  gameStarted = true;
    auctionLive = false;
    // Ensure we have the latest data
    socket.emit("getAuctionState");
    socket.emit("getSquads");
    if (myTeam) {
        // I am a Player: Go to Submit XI
        showScreen("playingXI");
        socket.emit("getMySquad");
    } else {
        // I am a Spectator: Go to Summary (push home so Back goes to main)
        setTimeout(() => {
            pushSummaryWithHomeBack();
            renderPostAuctionSummary();
            showScreen("postAuctionSummary", false);
        }, 500);
    }
});
// --- 2. RENDER SELECTION LIST (FIXED) ---
socket.on("mySquad", ({ squad, rules }) => {
    // 1. Sync Rules
    if(rules) activeRules = rules;
    if(typeof updateRulesUI === 'function') updateRulesUI();

    // 2. Get DOM Elements
    const container = document.getElementById("mySquadList");
    const statusDiv = document.getElementById("xiStatus");
    const submitBtn = document.getElementById("submitXIBtn");
    const saveBtn = document.getElementById("saveXIBtn");
    const placeholder = document.getElementById("xiPlaceholder");
    const cardWrapper = document.getElementById("xiCardWrapper");
    const xiButtonRow = document.getElementById("xiButtonRow");

    // Keep the status box pinned BELOW the sticky button row.
    // (Uses CSS var so it works on all devices/font sizes.)
    if (xiButtonRow) {
        document.documentElement.style.setProperty('--xiButtonRowHeight', `${xiButtonRow.offsetHeight}px`);
    }

    // Safety Check
    if(!container || !squad) return;

    // 3. DISQUALIFICATION CHECK (min squad size from rules)
    const minSquadSize = (activeRules && activeRules.minSquadSize != null) ? activeRules.minSquadSize : 11;
    if (squad.length < minSquadSize) {
        // Hide Selection UI
        container.innerHTML = ""; 
        if(placeholder) placeholder.classList.add("hidden");
        if(cardWrapper) cardWrapper.classList.add("hidden");
        if(submitBtn) submitBtn.classList.add("hidden"); 
        if(saveBtn) saveBtn.classList.add("hidden");
        
        const xiButtonRow = document.getElementById("xiButtonRow");
        if(xiButtonRow) xiButtonRow.classList.add("hidden");

        if(statusDiv) {
            statusDiv.classList.remove("hidden");
            statusDiv.innerHTML = `
                <div style="text-align:center; padding:30px; background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:12px; margin-top:20px;">
                    <h2 style="color:#ef4444; margin:0 0 10px 0; font-size:1.8rem;">❌ DISQUALIFIED</h2>
                    <p style="color:#fff; margin:0 0 5px 0; font-size:1.1rem;">
                        Squad Size: <b style="color:#fca5a5;">${squad.length}/${minSquadSize}</b>
                    </p>
                    <p style="font-size:0.9rem; color:#ccc; margin-bottom:20px;">
                        You need at least ${minSquadSize} players to form a team.
                    </p>
                    <button onclick="showScreen('leaderboard')" class="primary-btn" style="width:100%; max-width:250px;">
                        🏆 View Leaderboard
                    </button>
                </div>
            `;
        }
        return;
    }

    // 4. NORMAL STATE (Reset & Render)
    
    // Reset Data
    selectedXI = { WK: [], BAT: [], ALL: [], BOWL: [] };
    
    // Reset UI visibility
    container.innerHTML = "";
    if(statusDiv) { statusDiv.innerHTML = ""; statusDiv.classList.add("hidden"); }
    if(submitBtn) {
        submitBtn.classList.remove("hidden");
        submitBtn.disabled = true; // Disabled until 11 selected
        submitBtn.innerText = "Submit XI (0/11)";
    }
    if(placeholder) placeholder.classList.remove("hidden");
    if(cardWrapper) cardWrapper.classList.add("hidden");

    // 5. Build Grid
    const grid = document.createElement("div");
    grid.className = "xi-select-container";
    
    // Define Roles
    const roleGroups = { WK: "Wicket Keepers", BAT: "Batsmen", ALL: "All Rounders", BOWL: "Bowlers" };
    
    Object.keys(roleGroups).forEach(key => {
        // Filter Logic
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

            // Player Buttons
            players.forEach(p => {
                const btn = document.createElement("div");
                btn.className = "xi-player-btn";
                // Create unique ID for toggle logic
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
    
    // Update the visual card (it will be empty initially)
    if(typeof updateXIPreview === 'function') updateXIPreview();
});

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
    if(statusDiv) { statusDiv.innerHTML = ""; statusDiv.classList.add("hidden"); }
    updateXIPreview();
}
// --- 5. SUBMIT LOGIC (FIXED) ---
// All validation feedback shown in xiStatus only (no popups). Server returns disqualified + reason.
window.submitXI = function() {
    const totalSelected = countTotalXI();
    const statusDiv = document.getElementById("xiStatus");
    if (totalSelected !== 11) {
        if (statusDiv) {
            statusDiv.classList.remove("hidden");
            statusDiv.setAttribute("data-source", "preview");
            statusDiv.innerHTML = `
            <div class="status-box" style="padding:20px; text-align:center; border:1px solid #ef4444; background:#0f172a; border-radius:12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
                <h2 style="margin:0 0 5px 0; font-size:1.4rem; color:#ef4444;">❌ Select 11 players</h2>
                <p style="margin-top:8px; color:#fca5a5; font-size:0.9rem;">Please select exactly 11 players (${totalSelected}/11).</p>
            </div>`;
        }
        return;
    }

    const btn = document.getElementById("submitXIBtn");
    if (btn) { btn.disabled = true; btn.innerText = "Submitting..."; }

    socket.emit("submitXI", { team: myTeam, xi: selectedXI });

    setTimeout(() => {
        socket.emit("getAuctionState");
        socket.emit("getSquads");
    }, 500);
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
// --- UPDATED: updateXIPreview (Use Fantasy Card for Matching Image) ---
function updateXIPreview() {
    const count = countTotalXI();
    const container = document.getElementById('xiCardWrapper'); // Wrapper div in HTML
    
    if(container) {
        // 🔴 FIX: Use generateFantasyCardHTML to match the popup's "same image"
        container.innerHTML = generateFantasyCardHTML(myTeam || "MY TEAM", selectedXI, null, count, true);
        container.classList.remove('hidden');
    }
    // UI State (rest remains the same)
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
    const statusDiv = document.getElementById("xiStatus");
    const r = activeRules || { maxForeignXI: 4, minWK: 1, minBat: 3, minBowl: 3, minAll: 1, minSpin: 0 };
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

    /* When 11 selected, show criteria status in xiStatus (only if not already showing submit result) */
    if (statusDiv && statusDiv.getAttribute("data-source") === "result") return;
    const count = all.length;
    if (count !== 11) {
        if (statusDiv && statusDiv.getAttribute("data-source") === "preview") {
            statusDiv.innerHTML = "";
            statusDiv.classList.add("hidden");
            statusDiv.removeAttribute("data-source");
        }
        return;
    }
    const reasons = [];
    if (foreign > (r.maxForeignXI || 4)) reasons.push(`Max ${r.maxForeignXI || 4} overseas in XI (you have ${foreign})`);
    if (selectedXI.WK.length < r.minWK) reasons.push(`Need min ${r.minWK} Wicket Keeper(s)`);
    if (selectedXI.BAT.length < r.minBat) reasons.push(`Need min ${r.minBat} Batsmen`);
    if (selectedXI.ALL.length < r.minAll) reasons.push(`Need min ${r.minAll} All-Rounder(s)`);
    if (selectedXI.BOWL.length < r.minBowl) reasons.push(`Need min ${r.minBowl} Bowler(s)`);
    if ((r.minSpin || 0) > 0 && spinCount < r.minSpin) reasons.push(`Need min ${r.minSpin} Spinner(s). Current: ${spinCount}`);
    statusDiv.classList.remove("hidden");
    statusDiv.setAttribute("data-source", "preview");
    if (reasons.length > 0) {
        statusDiv.innerHTML = `
        <div class="status-box" style="padding:20px; text-align:center; border:1px solid #ef4444; background:#0f172a; border-radius:12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <h2 style="margin:0 0 5px 0; font-size:1.4rem; color:#ef4444;">❌ Criteria not met</h2>
            <div style="margin-top:8px; color:#fca5a5; font-size:0.85rem; background:rgba(239,68,68,0.1); padding:8px; border-radius:6px;">
                ${reasons.map(rs => rs).join("<br>")}
            </div>
            <p style="margin-top:12px; color:#94a3b8; font-size:0.8rem;">Adjust your XI to meet requirements, then Submit.</p>
        </div>`;
    } else {
        statusDiv.innerHTML = `
        <div class="status-box" style="padding:20px; text-align:center; border:1px solid #22c55e; background:#0f172a; border-radius:12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <h2 style="margin:0 0 5px 0; font-size:1.4rem; color:#22c55e;">✅ Criteria met</h2>
            <p style="margin-top:8px; color:#94a3b8; font-size:0.9rem;">Ready to submit your Playing XI.</p>
        </div>`;
    }
}
// --- 5. SUBMIT ---
window.resetXISelection = function() {
    if(confirm("Reset Selection?")) {
        // 1. Clear Data
        selectedXI = { WK: [], BAT: [], ALL: [], BOWL: [] };
        
        // 2. Clear Visual Selection in the List
        document.querySelectorAll('.xi-player-btn').forEach(b => b.classList.remove('picked'));
        
        // 3. Reset Button State
        const submitBtn = document.getElementById('submitXIBtn');
        const saveBtn = document.getElementById('saveXIBtn');
        const statusDiv = document.getElementById("xiStatus");
        const listDiv = document.getElementById("mySquadList"); // The list container

        if(submitBtn) {
             submitBtn.disabled = false;
             submitBtn.innerText = "Submit XI (0/11)";
             submitBtn.classList.remove('hidden');
             submitBtn.style.background = ""; 
        }
        
        if(saveBtn) saveBtn.classList.add('hidden');
        
        // 4. Clear Status & Unhide List
        if(statusDiv) { statusDiv.innerHTML = ""; statusDiv.classList.add("hidden"); statusDiv.removeAttribute("data-source"); }
        if(listDiv) listDiv.classList.remove("hidden"); // Show players again

        // 5. Reset Card View
        document.getElementById('xiCardWrapper').classList.add('hidden');
        document.getElementById('xiPlaceholder').classList.remove('hidden');
        
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
// --- UPDATED: socket.on("submitResult") - Render Status Inline ---
socket.on("submitResult", (res) => {
    const btn = document.getElementById("submitXIBtn");
    const status = document.getElementById("xiStatus");
    const listDiv = document.getElementById("mySquadList");
    const xiButtonRow = document.getElementById("xiButtonRow");

    if (xiButtonRow) {
        document.documentElement.style.setProperty('--xiButtonRowHeight', `${xiButtonRow.offsetHeight}px`);
    }

    if(status) {
        status.classList.remove("hidden");
        status.setAttribute("data-source", "result");
        status.innerHTML = `
        <div class="status-box" style="padding:20px; text-align:center; border:1px solid ${res.disqualified ? '#ef4444' : '#22c55e'}; background:#0f172a; border-radius:12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            
            <h2 style="margin:0 0 5px 0; font-size:1.4rem; color:${res.disqualified ? '#ef4444' : '#22c55e'}">
                ${res.disqualified ? '❌ DISQUALIFIED' : '✅ APPROVED'}
            </h2>
            
            <div style="font-size:0.9rem; color:#ccc;">RATING: <b style="color:#fff; font-size:1.1rem;">${res.rating}</b></div>
            
            ${res.disqualified ? `<div style="margin-top:8px; color:#fca5a5; font-size:0.85rem; background:rgba(239,68,68,0.1); padding:8px; border-radius:6px;">Reason: ${res.reason}</div>` : ''}
            
            <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
                ${res.disqualified 
                    ? `<button onclick="editTeam()" class="secondary-btn" style="border-color:#ef4444; color:#ef4444; padding:8px 20px;">✏️ Edit</button>` 
                    : ''
                }
                <button onclick="showScreen('leaderboard')" class="primary-btn xi-leaderboard-btn">🏆 Leaderboard</button>
            </div>
        </div>`;
    }

    // 🔴 HIDE THE PLAYER LIST AFTER SUBMIT (Approved or Disqualified)
    if(listDiv) listDiv.classList.add("hidden");
    
    // Hide button row when disqualified
    if (res.disqualified && xiButtonRow) {
        xiButtonRow.classList.add("hidden");
    }

    if (!res.disqualified) {
        if(btn) btn.classList.add("hidden");
        document.getElementById("saveXIBtn").classList.remove("hidden");
        
        socket.emit("getAuctionState"); 
    }
});

// Update Edit Function to show list again
window.editTeam = function() {
    const btn = document.getElementById('submitXIBtn');
    const statusBox = document.getElementById("xiStatus");
    const saveBtn = document.getElementById("saveXIBtn");
    const listDiv = document.getElementById("mySquadList");
    const xiButtonRow = document.getElementById("xiButtonRow"); // Select the row

    // Clear result state so updateStatsBar can show criteria preview again
    if (statusBox) {
        statusBox.removeAttribute("data-source");
        statusBox.innerHTML = "";
        statusBox.classList.add("hidden");
    }

    // 1. Show the entire button container row
    if (xiButtonRow) {
        xiButtonRow.classList.remove('hidden');
        xiButtonRow.style.display = "flex"; 
    }

    // 2. Restore Submit Button state
    if (btn) {
        btn.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = `Update XI (${countTotalXI()}/11)`;
        btn.style.background = "var(--success)"; // Keep it prominent
        btn.style.color = "#000";
    }

    // 3. Clear result messages and hide "Save Image"
    if (statusBox) { statusBox.innerHTML = ""; statusBox.classList.add("hidden"); }
    if (saveBtn) saveBtn.classList.add('hidden');
    
    // 4. Show the player selection list again
    if(listDiv) listDiv.classList.remove("hidden");

    // 5. Re-enable interaction on player buttons
    document.querySelectorAll('.xi-player-btn').forEach(b => {
        b.style.pointerEvents = "auto";
        b.style.opacity = "1";
    });

    updateXIPreview();
};

// --- LEADERBOARD POPUP LOGIC ---
let currentPopupData = null;


window.switchPopupView = function(mode) {
    const btnXI = document.getElementById('btnShowXI');
    const btnFull = document.getElementById('btnShowFull');

    // Toggle Active Classes
    if(mode === 'XI') {
        btnXI.classList.add('active');
        btnFull.classList.remove('active');
    } else {
        btnFull.classList.add('active');
        btnXI.classList.remove('active');
    }

    renderPopupContent(mode);
}

// --- 3. RENDER CONTENT (The Core Fix) ---
function renderPopupContent(mode) {
    const container = document.getElementById("squadCaptureArea");
    if(!container || !currentPopupData) return;

    const d = currentPopupData;
    const fullSquad = allSquads[d.team] || []; 
    const safePurse = Number(d.purse || teamPurse[d.team] || 0);
    const footer = document.getElementById("popupDownloadFooter");

    container.innerHTML = "";

    if (mode === 'XI') {
        const hasValidXI = !!d.xi && (
            (Array.isArray(d.xi) && d.xi.length > 0) ||
            (!Array.isArray(d.xi) && (
                (d.xi.WK && d.xi.WK.length > 0) ||
                (d.xi.BAT && d.xi.BAT.length > 0) ||
                (d.xi.ALL && d.xi.ALL.length > 0) ||
                (d.xi.BOWL && d.xi.BOWL.length > 0)
            ))
        );

        // 📸 Only visible for Playing XI (and only if XI exists)
        if (footer) footer.classList.toggle("hidden", !hasValidXI);

        if (hasValidXI) {
             // 🔴 USE generateFantasyCardHTML (The image generator from Submit page)
             // We pass 'false' at the end so it doesn't use the 'generatedCard' ID which might conflict
             container.innerHTML = generateFantasyCardHTML(d.team, d.xi, d.rating, 11, false);
        } else {
             container.innerHTML = `
                <div style="text-align:center; padding:40px; color:#94a3b8; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
                    <div style="font-size:3rem; margin-bottom:10px; opacity:0.5;">🏏</div>
                    <h3 style="margin:0; color:#fff;">XI Not Available</h3>
                    <p style="font-size:0.9rem;">${d.team} hasn't submitted a Playing XI yet.</p>
                </div>`;
        }
    } else {
        // Full Squad View
        // 📸 Hide download bar for FULL squad (more space + no capture)
        if (footer) footer.classList.add("hidden");
        container.innerHTML = generateFullSquadHTML(d.team, fullSquad, safePurse, "Manager", true);
    }
}
// --- 4. DATASET SELECTION HELPER ---
// --- 4. DATASET SELECTION HELPER ---
window.selectDataset = function(id, el) {
    const hidden = document.getElementById('selectedSetId');
    if (hidden) hidden.value = id;

    // Visually update selection
    document.querySelectorAll('.dataset-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    // If host chooses CUSTOM, open the builder overlay
    if (id === "custom") {
        if (typeof openCustomBuilder === "function") {
            openCustomBuilder();
        }
    }
};

// ================= CUSTOM BUILDER LOGIC =================
// Open overlay and load players (from custom.js if present, else players.js pool)
window.openCustomBuilder = async function() {
    const overlay = document.getElementById("customBuilderOverlay");
    const listBox = document.getElementById("customPlayerList");
    const countEl = document.getElementById("customCount");

    if (!overlay || !listBox) return;

    overlay.classList.remove("hidden");
    listBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Loading Database...</div>';
    if (countEl) countEl.textContent = "0";
    customSelectedIndexes.clear();

    try {
        // Try dedicated custom pool first, then fallback to default players
        let res = await fetch("/api/players/custom");
        if (!res.ok) {
            res = await fetch("/api/players");
        }
        const json = await res.json();
        customAllPlayers = json.players || [];
        const autoSelectEl = document.getElementById("autoSelectPoolToggle");
        if (autoSelectEl && autoSelectEl.checked && customAllPlayers.length > 0) {
            let namesToSelect = [];
            try {
                const mixedRes = await fetch("/api/players/mixed");
                if (mixedRes.ok) {
                    const mixedJson = await mixedRes.json();
                    namesToSelect = (mixedJson.players || []).map(pp => (pp.name || "").trim().toLowerCase());
                }
                if (namesToSelect.length === 0) {
                    const defaultRes = await fetch("/api/players");
                    if (defaultRes.ok) {
                        const defaultJson = await defaultRes.json();
                        namesToSelect = (defaultJson.players || []).map(pp => (pp.name || "").trim().toLowerCase());
                    }
                }
            } catch (_) { /* ignore */ }
            if (namesToSelect.length > 0) {
                customAllPlayers.forEach((p, i) => {
                    if (namesToSelect.includes((p.name || "").trim().toLowerCase())) customSelectedIndexes.add(i);
                });
            }
            if (customSelectedIndexes.size === 0) {
                const toSelect = Math.min(18, customAllPlayers.length);
                for (let i = 0; i < toSelect; i++) customSelectedIndexes.add(i);
            }
            if (countEl) countEl.textContent = String(customSelectedIndexes.size);
        }
        renderCustomPlayerList();
    } catch (e) {
        console.warn("Failed to load custom players", e);
        listBox.innerHTML = '<div style="text-align:center; padding:20px; color:#f87171;">Failed to load players.</div>';
    }
};

window.toggleAutoSelectPool = function() {
    // Auto select and Ratings are independent.
    const autoEl = document.getElementById("autoSelectPoolToggle");
    const overlay = document.getElementById("customBuilderOverlay");
    if (!autoEl || !overlay || overlay.classList.contains("hidden") || !customAllPlayers.length) return;
    if (!autoEl.checked) return;
    (async function() {
        let namesToSelect = [];
        try {
            const mixedRes = await fetch("/api/players/mixed");
            if (mixedRes.ok) {
                const mixedJson = await mixedRes.json();
                namesToSelect = (mixedJson.players || []).map(pp => (pp.name || "").trim().toLowerCase());
            }
            if (namesToSelect.length === 0) {
                const defaultRes = await fetch("/api/players");
                if (defaultRes.ok) {
                    const defaultJson = await defaultRes.json();
                    namesToSelect = (defaultJson.players || []).map(pp => (pp.name || "").trim().toLowerCase());
                }
            }
        } catch (_) { /* ignore */ }
        customSelectedIndexes.clear();
        if (namesToSelect.length > 0) {
            customAllPlayers.forEach((p, i) => {
                if (namesToSelect.includes((p.name || "").trim().toLowerCase())) customSelectedIndexes.add(i);
            });
        }
        if (customSelectedIndexes.size === 0) {
            const toSelect = Math.min(18, customAllPlayers.length);
            for (let i = 0; i < toSelect; i++) customSelectedIndexes.add(i);
        }
        const countEl = document.getElementById("customCount");
        if (countEl) countEl.textContent = String(customSelectedIndexes.size);
        renderCustomPlayerList();
    })();
}

window.closeCustomBuilder = function() {
    const overlay = document.getElementById("customBuilderOverlay");
    if (overlay) overlay.classList.add("hidden");
        customBuilderBackToChoice();

    // Deselect CUSTOM BUILDER dataset card in auth section
       // When × is clicked: deselect Custom card and switch to IPL 2026 (label shows "IPL 2026 pool selected")
    const hidden = document.getElementById("selectedSetId");
    if (hidden && hidden.value === "custom") {
        hidden.value = "ipl2026";
        window.__customSelectedPlayers = null;
        syncDatasetCardActive();
        updatePoolSelectedLabel();
    }
};

function renderCustomPlayerList() {
    const listBox = document.getElementById("customPlayerList");
    const searchInput = document.getElementById("customSearch");
    const roleFilter = document.getElementById("customRoleFilter");
    const useRatingsToggle = document.getElementById("useRatingsToggle");

    if (!listBox) return;

    const term = (searchInput?.value || "").trim().toLowerCase();
    const role = (roleFilter?.value || "").trim();

    const rows = customAllPlayers
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => {
            if (role && p.role !== role) return false;
            const country = p.country || (p.foreign ? "Overseas" : "India");
            const haystack = `${p.name} ${country}`.toLowerCase();
            if (!term) return true;
            return haystack.includes(term);
        });

    if (rows.length === 0) {
        listBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No players match your filters.</div>';
        return;
    }

    const showRatings = useRatingsToggle && useRatingsToggle.checked;

    listBox.innerHTML = rows.map(({ p, idx }) => {
        const selected = customSelectedIndexes.has(idx);
        const country = p.country || (p.foreign ? "Overseas" : "India");
        const ratingVal = p.rating != null ? (typeof p.rating === "number" ? p.rating.toFixed(1) : String(p.rating)) : "";
        const ratingBlock = showRatings
            ? `<span style="display:inline-flex; align-items:center; gap:4px;"><span style="color:#facc15;">⭐</span><input type="number" step="0.1" min="0" max="10" value="${ratingVal}" data-idx="${idx}" onchange="handleRatingChange(${idx}, this.value)" style="width:48px; padding:2px 4px; background:rgba(255,255,255,0.08); border:1px solid #334155; border-radius:4px; color:#facc15; font-size:0.8rem; text-align:center;" /></span>`
            : "";
        return `
            <div class="custom-player-row ${selected ? "selected" : ""}" data-idx="${idx}" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.2); gap:8px;">
                <div style="flex:1; min-width:0;">
                    <div style="font-size:0.9rem; color:#e5e7eb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                    <div style="font-size:0.75rem; color:#9ca3af;">${p.role} • ${country}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${ratingBlock}
                    <button type="button"
                        class="secondary-btn"
                        style="width:32px; height:32px; padding:0; font-size:1rem; border-color:${selected ? "#22c55e" : "#4b5563"}; color:${selected ? "#22c55e" : "#e5e7eb"}; background:#020617;"
                        onclick="toggleCustomSelect(${idx})">
                        ${selected ? "✓" : "+"}
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

window.handleRatingChange = function(idx, value) {
    const num = parseFloat(value);
    if (customAllPlayers[idx] != null && !Number.isNaN(num)) {
        customAllPlayers[idx].rating = Math.min(10, Math.max(0, num));
    }
};

window.toggleCustomSelect = function(idx) {
    if (customSelectedIndexes.has(idx)) {
        customSelectedIndexes.delete(idx);
    } else {
        customSelectedIndexes.add(idx);
    }

    const countEl = document.getElementById("customCount");
    if (countEl) countEl.textContent = String(customSelectedIndexes.size);

    // Re-render to refresh button state / highlighting
    renderCustomPlayerList();
};

window.filterCustomList = function() {
    renderCustomPlayerList();
};

window.toggleRatingVisibility = function() {
    renderCustomPlayerList();
};

// Persist current selection for use after room is created
window.saveCustomSet = async function() {
    if (customSelectedIndexes.size === 0) {
        showPopup("Please select at least one player for your custom set.", "NO PLAYERS SELECTED", "⚠️", true);
        return;
    }

    const confirmed = await showConfirm(
        "Are you sure you want to lock this custom player pool for your auction?\n\nYou cannot change it after starting the auction.",
        "LOCK CUSTOM SET?",
        "✅"
    );
    if (!confirmed) return;

    // Build selected player list
    const selected = [];
    customAllPlayers.forEach((p, idx) => {
        if (customSelectedIndexes.has(idx)) selected.push(p);
    });

    // Store globally so we can send to server once room is created
    window.__customSelectedPlayers = selected;

    closeCustomBuilder();
};
// --- FIX: LEADERBOARD DOWNLOAD BUTTON ---
window.downloadPopupCard = function() {
    if (!currentPopupData || !currentPopupData.team) return;
    // Check which tab is active
    if (document.getElementById('btnShowXI').classList.contains('active')) {
         // Download Playing XI (Capture the div)
         const el = document.getElementById('squadCaptureArea').firstElementChild;
         if (!el || el.id === 'squadCaptureArea') return;
         html2canvas(el, { backgroundColor: "#020617", scale: 3 }).then(c => {
             const a = document.createElement('a');
             a.download = `${currentPopupData.team}_XI.png`;
             a.href = c.toDataURL();
             a.click();
         });
    } else {
        // Full Squad download hidden by UI (no-op)
        return;
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
// --- GLOBAL STORE FOR LEADERBOARD DATA ---
let globalLeaderboardData = []; 
socket.on("leaderboard", (board) => {
    globalLeaderboardData = board; 
    
    const tbody = document.getElementById("leaderboardBody");
    if(tbody) {
        tbody.innerHTML = "";
        board.forEach((t, i) => {
            const tr = document.createElement("tr");
            
            // 🔴 LOGIC: Status Icons
            let statusHtml = '<span class="lb-status-icon lb-dash">-</span>';
            
            if (t.disqualified) {
                statusHtml = `<span class="lb-status-icon lb-cross" title="Disqualified">❌</span>`;
            } 
            // Check if XI exists and has players (valid submission)
            else if (
                t.xi && (
                    (Array.isArray(t.xi) && t.xi.length > 0) ||
                    (!Array.isArray(t.xi) && (t.xi.BAT?.length > 0 || t.xi.WK?.length > 0))
                )
            ) {
                statusHtml = `<span class="lb-status-icon lb-tick">✅</span>`;
            }
            const displayRating = t.disqualified ? 0 : (t.rating != null ? t.rating : 0);

            tr.innerHTML = `
                <td>#${i+1}</td>
                <td>
                    <div class="lb-team-name" style="color:${TEAM_COLORS[t.team] || '#fff'}">${t.team}</div>
                </td>
                <td class="lb-rating">⭐ ${t.rating}</td>
                <td class="lb-rating">⭐ ${displayRating}</td>
                <td style="font-family:monospace; color:#ccc;">₹${Number(t.purse).toFixed(2)}</td>
                <td>${statusHtml}</td>
                <td style="text-align:center;">
                    <button onclick="openSquadView('${t.team}')" class="lb-view-btn" title="View Squad">👁️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
});


// --- UPDATED OPEN POPUP LOGIC ---
function openSquadView(teamName) {
    // 1. Find data in the global store
    const data = globalLeaderboardData.find(t => t.team === teamName);
    if (!data) return alert("Data not found for " + teamName);

    currentPopupData = data;
    const overlay = document.getElementById("squadViewOverlay");
    
    // 2. Logic: If they have an XI submitted, show XI tab first. Else Full Squad.
    const hasXI = !!data.xi && (
        (Array.isArray(data.xi) && data.xi.length > 0) ||
        (!Array.isArray(data.xi) && Object.keys(data.xi).length > 0)
    );
    const initialMode = hasXI ? 'XI' : 'FULL';
    
    switchPopupView(initialMode);
    
    overlay.classList.remove("hidden");
}

// ==========================================
// 💎 PREMIUM SQUAD GENERATOR V3 (Final)
// ==========================================

function generateFullSquadHTML(teamName, squad, purse, owner, isPopup = false) {
    // 1. Data Setup
    const foreignCount = squad.filter(p => p.foreign).length;
    const teamColor = TEAM_COLORS[teamName] || '#facc15'; 
    const logoUrl = `/logos/${teamName}.png`;

    // 2. Name Shortener Helper (Trip Name Logic)
    // Converts "Virat Kohli" -> "V. Kohli" if length > 14 chars
    const formatPlayerName = (name) => {
        if (!name) return "";
        // Threshold: 14 characters
        if (name.length > 14) {
            const parts = name.split(' ');
            if (parts.length > 1) {
                // Return "V. Kohli" format
                return parts[0].charAt(0) + '. ' + parts.slice(1).join(' ');
            }
        }
        return name;
    };

    // 3. Categorize
    const cat = { WK: [], BAT: [], ALL: [], BOWL: [] };
    squad.forEach(p => {
        let r = p.role;
        if (['PACE', 'SPIN'].includes(r)) r = 'BOWL';
        if (cat[r]) cat[r].push(p); else cat.BOWL.push(p);
    });

    // 4. Render Rows with Badges
    const renderRows = (list) => {
        if (!list || list.length === 0) return '<div class="empty-slot">-</div>';
        
        return list.map(p => {
            const safeName = p.name.replace(/'/g, "\\'");
            // Apply shortening logic specifically for the badge
            const displayName = formatPlayerName(p.name);

            return `
            <div class="p-row" onclick="viewPlayerFromCard('${safeName}', '${p.role}', ${p.rating}, ${p.foreign}, ${p.price}, '${teamName}')">
                
                <div class="player-badge">
                    ${p.foreign ? '<span class="p-plane">✈</span>' : ''}
                    <span class="p-name-text" title="${p.name}">${displayName}</span>
                </div>
            </div>`;
        }).join('');
    };

    // 5. Return HTML
    // Note: Inline style defines the CSS variables for color and logo
    return `
    <div class="premium-squad-card ${isPopup ? 'narrow-view' : ''}" 
         style="--team-color: ${teamColor}; --watermark-url: url('${logoUrl}');">
        
        <div class="prem-watermark"></div>
        
        <div class="prem-header">
            <h1 class="prem-title">${teamName}</h1>
            <div class="prem-meta">FULL SQUAD • ${owner || '—'}</div>
            
            <div class="prem-stats">
                <div class="stat-badge">💰 ₹${purse.toFixed(2)} Cr</div>
                <div class="stat-badge">👥 ${squad.length} / ${(typeof activeRules !== 'undefined' && activeRules && activeRules.maxPlayers != null) ? activeRules.maxPlayers : 25}</div>
                <div class="stat-badge">✈️ ${foreignCount} OS</div>
            </div>
        </div>

        <div class="prem-body">
            <div class="prem-col">
                <div class="col-title">Wicket Keepers</div>
                ${renderRows(cat.WK)}
            </div>
            
            <div class="prem-col">
                <div class="col-title">Batters</div>
                ${renderRows(cat.BAT)}
            </div>

            <div class="prem-col">
                <div class="col-title">All Rounders</div>
                ${renderRows(cat.ALL)}
            </div>

            <div class="prem-col">
                <div class="col-title">Bowlers</div>
                ${renderRows(cat.BOWL)}
            </div>
        </div>

        <div class="prem-footer">
            LIVE AUCTION • OFFICIAL SQUAD CARD
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
    const upperUnderscore = playerName.trim().toUpperCase().replace(/\s+/g, '_');
    const candidates = [
        // A. YOUR SPECIFIC FORMAT (All Caps Name + Underscore + .png)
        `/players/${upperUnderscore}.png`, // VIRAT_KOHLI.png
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
// --- UPDATED: Open Player Card (price below stat-row; Unsold shows RTM: pteam) ---
window.openPlayerProfile = function(playerData, teamName, price) {
    const existing = document.getElementById('playerCardOverlay');
    if(existing) existing.remove();
    const team = teamName || "Unsold";
    const amount = price ? `₹${price.toFixed(2)} Cr` : "---";
    const teamColor = TEAM_COLORS[team] || "#64748b";
    const headerLabel = (team === "Unsold" && playerData.pteam) ? `RTM: ${playerData.pteam}` : team;

    const html = `
    <div id="playerCardOverlay" class="player-card-overlay" onclick="closePlayerCard(event)">
        <div class="pc-card compact" data-team="${team}" onclick="event.stopPropagation()">
            <div class="pc-bg-layer"></div>
            <div class="pc-content">
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center; z-index:10;">
                    <span style="font-weight:bold; color:rgba(255,255,255,0.5); font-size:0.9rem;">${headerLabel}</span>
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
                <div class="pc-price-tag pc-price-tag-inline" style="color:${teamColor}">${amount}</div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const imgEl = document.getElementById('activeCardImg');
    requestAnimationFrame(() => { loadPlayerImage(imgEl, playerData.name); });
};
window.closePlayerCard = function(e) {
    if(e.target.id === 'playerCardOverlay') e.target.remove();
}
// --- POST AUCTION SUMMARY PAGE LOGIC ---
/* ================================================= */
/* 🏁 POST AUCTION SUMMARY LOGIC */
/* ================================================= */
/* ================================================= */
/* 🏁 POST AUCTION SUMMARY LOGIC */
/* ================================================= */
function renderPostAuctionSummary() {
    const list = document.getElementById("summaryList");
    if(!list) return;
   
    // RETRY LOGIC: If squads aren't loaded, try again in 500ms
    // This prevents the "Undefined" error if the user lands here directly
  if (!allSquads || Object.keys(allSquads).length === 0) {
        list.innerHTML = "<div style='text-align:center; color:#94a3b8; padding:30px; font-family:monospace;'>fetching historical data...</div>";
        // Retry logic is less critical now, but kept for safety
        setTimeout(renderPostAuctionSummary, 1000);
        return;
    }
    list.innerHTML = "";
    const teams = Object.keys(allSquads).sort();
    teams.forEach(team => {
        const squad = allSquads[team];
        const purse = teamPurse[team] || 0;
        const owner = (teamOwners[team] || "").trim() || "—";
        const teamColor = TEAM_COLORS[team] || "#fff";
        // 1. Create Wrapper
        const item = document.createElement("div");
        item.className = "summary-item";
        // 2. Create Header
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
                <button class="sum-expand-btn">▼</button>
            </div>
        `;
        // 3. Create Content (The Full Squad Card)
       const content = document.createElement("div");
content.className = "summary-content hidden";
// Pass true here as well to ensure it fits in the accordion dropdown
content.innerHTML = generateFullSquadHTML(team, squad, purse, owner, true);
        header.onclick = () => {
            const isHidden = content.classList.contains("hidden");
           
            // Close all others first
            document.querySelectorAll('.summary-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.sum-expand-btn').forEach(b => b.innerText = "▼");
           
            // Open clicked one
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
// --- EXIT TO HOME: uses showConfirm (defined later) for consistent popup ---
/* ================================================= */
/* ============== GOD MODE (ADMIN) ================= */
/* ================================================= */
let godTargetRoom = "";
let godModeFetchPending = false;
function openGodModeSetup() {
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("godPanel").classList.remove("hidden");
    document.body.classList.add("god-panel-open");
    const notFound = document.getElementById("godRoomNotFound");
    if (notFound) notFound.classList.add("hidden");
}
window.connectGodMode = function() {
    const inputEl = document.getElementById("godTargetInput");
    if (!inputEl) return;
    const target = (inputEl.value || "").trim().toUpperCase();
    if (!target) {
        alert("Enter Room Code");
        return;
    }
    if (typeof socket === "undefined" || !socket.connected) {
        alert("Not connected. Please wait and try again.");
        return;
    }
    const notFoundEl = document.getElementById("godRoomNotFound");
    if (notFoundEl) notFoundEl.classList.add("hidden");
    godTargetRoom = target;
    godModeFetchPending = true;
    socket.emit("godModeFetch", godTargetRoom);
};
document.getElementById("godAccessBtn")?.addEventListener("click", connectGodMode);
let lastGodModeData = { sets: [], teams: [], activeTeams: [] };
socket.on("godModeData", ({ sets, teams, activeTeams }) => {
    godModeFetchPending = false;
    lastGodModeData = { sets, teams, activeTeams: activeTeams || [] };
    document.getElementById("godRoomNotFound")?.classList.add("hidden");
    document.getElementById("godLogin").classList.add("hidden");
    document.getElementById("godContent").classList.remove("hidden");
    const searchEl = document.getElementById("godSearchInput");
    if (searchEl) searchEl.value = "";
    renderGodList(sets, teams, activeTeams);
    const searchInput = document.getElementById("godSearchInput");
    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        searchInput.addEventListener("input", () => filterGodList());
    }
});
function filterGodList() {
    const term = (document.getElementById("godSearchInput")?.value || "").trim().toLowerCase();
    const { sets, teams, activeTeams } = lastGodModeData;
    if (!term) {
        renderGodList(sets, teams, activeTeams);
        return;
    }
    const filtered = sets.map(set => set.filter(p => p.name.toLowerCase().includes(term) || (p.role && p.role.toLowerCase().includes(term)))).filter(s => s.length > 0);
    renderGodList(filtered, teams, activeTeams);
}
socket.on("godModeSuccess", (msg) => {
    // Flash success and refresh data
    const list = document.getElementById("godPlayerList");
    // Simple visual feedback
    list.style.opacity = "0.5";
    setTimeout(() => list.style.opacity = "1", 200);
  
    socket.emit("godModeFetch", godTargetRoom);
});
function renderGodList(sets, teams, activeTeams) {
    const list = document.getElementById("godPlayerList");
    list.innerHTML = "";
    const teamOptions = (activeTeams && activeTeams.length > 0 ? activeTeams : (teams || []).slice()).sort();
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
    // Direct assignment - No confirmation popup
    socket.emit("godModeAssign", {
        roomCode: godTargetRoom,
        player: { name: playerName },
        team: teamName
    });
    // Optional: Visual feedback to know it worked
    const btn = event.target; // Get the button that was clicked
    if(btn) {
        const originalText = btn.innerText;
        btn.innerText = "✓";
        setTimeout(() => btn.innerText = originalText, 1000);
    }
};
window.copyRoomCode = async function() {
    // Get code from global variable or text
    const code = roomCode || document.getElementById("roomCodeText").innerText;
    const url = window.location.href;
    
    // Share Data
    const shareData = {
        title: 'IPL Auction Live',
        text: `Join my IPL Auction room! Code: ${code}`,
        url: url
    };

    // Try Native Share first (Mobile)
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback to Clipboard (PC)
            await navigator.clipboard.writeText(url);
            
            // Visual Feedback in the Header Badge
            const badge = document.getElementById("roomCodeText");
            const original = badge.innerText;
            badge.innerText = "COPIED!";
            badge.style.color = "#4ade80";
            
            setTimeout(() => {
                badge.innerText = original;
                badge.style.color = "var(--primary)";
            }, 1500);
        }
    } catch (err) {
        console.error("Share failed:", err);
    }
};

// ==========================================
// LANDING PAGE ANIMATIONS
// ==========================================

function initLandingAnimations() {
    const reveals = document.querySelectorAll('.reveal');

    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        const elementVisible = 100; // Trigger distance

        reveals.forEach((reveal) => {
            const elementTop = reveal.getBoundingClientRect().top;
            if (elementTop < windowHeight - elementVisible) {
                reveal.classList.add('active');
            }
        });
    };

    // Attach listener to the specific scrolling container
    const landingSection = document.getElementById('landing');
    if (landingSection) {
        landingSection.addEventListener('scroll', revealOnScroll);
        // Trigger once on load
        revealOnScroll();
    }
}
// Add this helper function
function smartTrimName(fullName) {
    if (!fullName) return "";
    // Threshold: If longer than 13 chars, trim it
    if (fullName.length <= 13) return fullName;

    const parts = fullName.split(' ');
    if (parts.length > 1) {
        // "Suryakumar Yadav" -> "S. Yadav"
        return parts[0].charAt(0) + ". " + parts.slice(1).join(" ");
    }
    return fullName; // Single long name (e.g. "Venkatapathy")
}


// Call this when the page loads
document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById('starback-canvas');
    if (canvas) {
        new Starback(canvas, {
            type: 'dot',
            quantity: 100,
            direction: 225,
            backgroundColor: ['#0f172a', '#1e1b4b'], // Your Deep Navy/Indigo colors
            randomOpacity: true,
            starSize: [0, 2],
            speed: 0.5
        });
    }
});
/* ================================================= */
/* 🌌 UNIVERSAL DARK PARTICLE ANIMATION              */
/* ================================================= */

(function initParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let w, h;
    
    // Reduce particle count on mobile for performance
    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 50 : 110; 
    const connectionDist = isMobile ? 100 : 140; // Connect distance
    const mouseDist = 150; // Mouse interaction distance

    const particles = [];
    const mouse = { x: -9999, y: -9999 };

    // Resize Handler
    const resize = () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Mouse Handler
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
        mouse.x = -9999;
        mouse.y = -9999;
    });

    // Particle Class
    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * w;
            this.y = Math.random() * h;
            this.vx = (Math.random() - 0.5) * 0.5; // Slow horizontal drift
            this.vy = (Math.random() - 0.5) * 0.5; // Slow vertical drift
            this.size = Math.random() * 2 + 0.5;
            // Random blue/purple/white hues for "Space" look
            const hue = Math.random() > 0.5 ? 230 : 260; // Indigo or Purple
            this.color = `hsla(${hue}, 80%, 70%, ${Math.random() * 0.3 + 0.1})`;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Bounce off edges (or wrap around)
            if (this.x < 0 || this.x > w) this.vx *= -1;
            if (this.y < 0 || this.y > h) this.vy *= -1;

            // Mouse interaction (Push away gently)
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < mouseDist) {
                const forceDirectionX = dx / dist;
                const forceDirectionY = dy / dist;
                const force = (mouseDist - dist) / mouseDist;
                const directionX = forceDirectionX * force * 0.6;
                const directionY = forceDirectionY * force * 0.6;
                this.x -= directionX;
                this.y -= directionY;
            }
        }
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Initialize
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    // Animation Loop
    function animate() {
        ctx.clearRect(0, 0, w, h);
        
        // Loop particles
        particles.forEach((p, index) => {
            p.update();
            p.draw();

            // Draw Lines to neighbors
            for (let j = index; j < particles.length; j++) {
                const p2 = particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < connectionDist) {
                    ctx.beginPath();
                    // Fade line based on distance
                    const opacity = 1 - (dist / connectionDist);
                    ctx.strokeStyle = `rgba(100, 116, 139, ${opacity * 0.15})`; // Slate color lines
                    ctx.lineWidth = 1;
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
            
            // Draw Line to Mouse
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 150) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(99, 102, 241, ${0.2 - dist/1500})`; // Indigo glow to mouse
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.stroke();
            }
        });

        requestAnimationFrame(animate);
    }

    animate();
})();


// 2. Navigation Handler (updateHistory=false used by onpopstate to avoid pushing duplicate state)
window.showScreen = function(screenId, updateHistory = true) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove("hidden");

    if (!updateHistory) return;
    if (screenId === 'leaderboard') {
        socket.emit("getAuctionState");
        updateURL('leaderboard');
    } else if (screenId === 'playingXI') {
        updateURL('xi');
    } else if (screenId === 'postAuctionSummary') {
        updateURL('summary');
    }
};

// 3. Reset Handler (Optional but useful)
window.resetXISelection = function() {
    if(confirm("Clear all selected players?")) {
        selectedXI = { WK: [], BAT: [], ALL: [], BOWL: [] };
        document.querySelectorAll('.xi-player-btn').forEach(b => b.classList.remove('picked'));
        
        // Reset Button
        const btn = document.getElementById('submitXIBtn');
        if(btn) {
             btn.disabled = false;
             btn.innerText = "Submit XI (0/11)";
        }

        // Clear Status + show list again
        const statusDiv = document.getElementById("xiStatus");
        const listDiv = document.getElementById("mySquadList");
        if(statusDiv) { statusDiv.innerHTML = ""; statusDiv.classList.add("hidden"); }
        if(listDiv) listDiv.classList.remove("hidden");
        
        // Hide Card/Save
        document.getElementById('xiCardWrapper').classList.add('hidden');
        document.getElementById('xiPlaceholder').classList.remove('hidden');
        
        updateXIPreview();
    }
};
/* ================================================= */
/* 💎 CUSTOM POPUP SYSTEM LOGIC (ADAPTER)            */
/* ================================================= */

// 1. Core Toggle Logic
function toggleCustomPopup(show) {
    const el = document.getElementById('customPopup');
    if(show) {
        el.classList.remove('hidden');
        requestAnimationFrame(() => el.classList.add('active'));
    } else {
        el.classList.remove('active');
        setTimeout(() => el.classList.add('hidden'), 200);
    }
}

// 2. Promise-Based Confirm (Replacing confirm())
window.showConfirm = function(message, title = "CONFIRMATION", icon = "⚠️") {
    return new Promise((resolve) => {
        const titleEl = document.getElementById('cpTitle');
        const msgEl = document.getElementById('cpMessage');
        const iconEl = document.getElementById('cpIcon');
        const okBtn = document.getElementById('cpBtnOk');
        const cancelBtn = document.getElementById('cpBtnCancel');

        titleEl.innerText = title;
        msgEl.innerHTML = message.replace(/\n/g, '<br>'); // Support line breaks
        iconEl.innerText = icon;
        
        cancelBtn.classList.remove('hidden');
        okBtn.innerText = "CONFIRM";
        
        // Remove old listeners to prevent stacking
        const newOk = okBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

        newOk.addEventListener('click', () => { toggleCustomPopup(false); resolve(true); });
        newCancel.addEventListener('click', () => { toggleCustomPopup(false); resolve(false); });

        toggleCustomPopup(true);
    });
};

// 3. Simple Popup (Replacing alert())
window.showPopup = function(message, title = "NOTICE", icon = "ℹ️", isError = false) {
    const titleEl = document.getElementById('cpTitle');
    const msgEl = document.getElementById('cpMessage');
    const iconEl = document.getElementById('cpIcon');
    const okBtn = document.getElementById('cpBtnOk');
    const cancelBtn = document.getElementById('cpBtnCancel');

    titleEl.innerText = title;
    titleEl.style.color = isError ? "#ef4444" : "#fff";
    msgEl.innerText = message;
    iconEl.innerText = icon;

    // Hide Cancel button for alerts
    cancelBtn.classList.add('hidden');
    okBtn.innerText = "OK";

    // Clean listeners
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    
    newOk.addEventListener('click', () => toggleCustomPopup(false));
    toggleCustomPopup(true);
};

/* ================================================= */
/* 🔄 OVERRIDE EXISTING FUNCTIONS (ADAPTATION)       */
/* ================================================= */

// Override Browser Alert (Catch-all)
window.alert = (msg) => showPopup(msg);

// 1. Redefine Exit To Home
window.exitToHome = async function() {
    const yes = await showConfirm("Are you sure you want to exit to the Main Menu?", "EXIT GAME?", "🏠");
    if (yes) {
        sessionStorage.clear();
        window.location.href = "/";
    }
};

// 2. Redefine Reset XI
window.resetXISelection = async function() {
    const yes = await showConfirm("Clear all selected players from your Playing XI?", "RESET SELECTION?", "↻");
    if(yes) {
        selectedXI = { WK: [], BAT: [], ALL: [], BOWL: [] };
        document.querySelectorAll('.xi-player-btn').forEach(b => b.classList.remove('picked'));
        
        const btn = document.getElementById('submitXIBtn');
        const saveBtn = document.getElementById('saveXIBtn');
        const statusDiv = document.getElementById("xiStatus");
        const listDiv = document.getElementById("mySquadList");

        if(btn) {
             btn.disabled = false;
             btn.innerText = "Submit XI (0/11)";
             btn.classList.remove('hidden');
             btn.style.background = ""; 
        }
        if(saveBtn) saveBtn.classList.add('hidden');
        if(statusDiv) { statusDiv.innerHTML = ""; statusDiv.classList.add("hidden"); }
        if(listDiv) listDiv.classList.remove("hidden");
        document.getElementById('xiCardWrapper').classList.add('hidden');
        document.getElementById('xiPlaceholder').classList.remove('hidden');
        
        updateXIPreview();
    }
};

// 3. Redefine Admin Button Logic
window.admin = async function(action) {
    if(action === 'end') {
        const yes = await showConfirm("This will end the auction permanently and generate summaries.\n\nAre you sure?", "END AUCTION?", "🛑");
        if(!yes) return;
    }
    socket.emit("adminAction", action);
};

// 4. Redefine Skip Set Button Logic (must be re-attached)
if(skipSetBtn) {
    skipSetBtn.onclick = async () => {
        const yes = await showConfirm("Skip this entire set? All remaining players will be marked Unsold.", "SKIP SET?", "⏩");
        if(yes) socket.emit("adminAction", "skipSet");
    };
}

// 5. Redefine Leave Button Logic
if (leaveBtn) {
    leaveBtn.onclick = async () => {
        const yes = await showConfirm("You will lose your spot immediately.\n\nDo you want to leave?", "LEAVE ROOM?", "🏃");
        if (yes) {
            sessionStorage.clear();
            socket.disconnect();
            window.location.href = "/";
        }
    };
}

// 6. Redefine Error Handler
socket.off("error"); // Remove old listener
socket.on("error", msg => {
    // Handle "Room not found" specifically
    if(msg.includes("not found") || msg.includes("closed") || msg.includes("expired")) {
        showPopup(msg, "CONNECTION ERROR", "❌", true);
        setTimeout(() => {
            sessionStorage.clear();
            window.location.href = "/";
        }, 2000); // Give user 2 seconds to read
    } else {
        showPopup(msg, "ERROR", "⚠️", true);
    }
});
window.toggleMute = function() {
    isMuted = !isMuted;
    const btn = document.getElementById("toggleMuteBtn");
    const unmutedEl = document.getElementById("soundIconUnmuted");
    const mutedEl = document.getElementById("soundIconMuted");
    if (isMuted) {
        btn.classList.add("muted");
        btn.title = "Unmute";
        if (unmutedEl) unmutedEl.classList.add("hidden");
        if (mutedEl) mutedEl.classList.remove("hidden");
    } else {
        btn.classList.remove("muted");
        btn.title = "Mute";
        if (unmutedEl) unmutedEl.classList.remove("hidden");
        if (mutedEl) mutedEl.classList.add("hidden");
    }
};
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
    // Add this inside updateRulesUI or refreshGlobalUI
    socket.emit("getAuctionState"); // Ensures leaderboard data is requested

}
