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
/* ========= 1. INITIALIZATION & NAVIGATION ======== */
/* ================================================= */

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

    // --- 2. URL & SESSION HANDLING ---
    const path = window.location.pathname;
    const urlCode = path.startsWith('/room/') ? path.split('/')[2] : null;

    const sRoom = sessionStorage.getItem('ipl_room');
    const sUser = sessionStorage.getItem('ipl_user');
    const sTeam = sessionStorage.getItem('ipl_team');

    // SCENARIO A: Reconnecting
    if (sUser && sRoom && (!urlCode || urlCode === sRoom)) {
        console.log("🔄 Reconnecting...");
        username = sUser;
        roomCode = sRoom;
        if(sTeam) myTeam = sTeam;
        
        updateBrowserURL(sRoom);
        
        socket.emit('reconnectUser', { roomId: sRoom, username: sUser, team: sTeam });
        
        document.getElementById('landing').classList.add('hidden');
        document.getElementById('auth').classList.add('hidden');
        document.getElementById('auctionUI').classList.remove('hidden');
    }
    // SCENARIO B: Visiting Link
    else if (urlCode) {
        console.log("🔗 Shared Link Detected:", urlCode);
        document.getElementById("landing").classList.add("hidden");
        document.getElementById("auth").classList.remove("hidden");
        switchAuthTab('join');
        document.getElementById('code').value = urlCode;
        document.getElementById('code').style.borderColor = "var(--primary)";
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
    if (data.auctionEnded) {
        const savedRoom = sessionStorage.getItem('ipl_room');
        if (savedRoom === data.roomCode) {
            roomCode = data.roomCode;
            if(data.squads) allSquads = data.squads;
            if(data.rules) activeRules = data.rules;
            
            setupAuctionScreen();
            showScreen("playingXI");
            document.body.style.overflow = "auto";
            socket.emit("getMySquad"); 
            updateRulesUI();
        } else {
            alert("⚠️ The Auction has ended. Returning to Main Screen.");
            sessionStorage.clear();
            window.location.href = "/";
        }
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
    alert("👑 You are now the Host!");
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
            minForeignXI: Number(document.getElementById("maxForeignXI").value)
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
        socket.emit("bid");
    };
}

socket.on("bidUpdate", data => {
    if (typeof soundBid !== 'undefined') {
        soundBid.currentTime = 0; 
        soundBid.play().catch(()=>{});
    }
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
        // Simple client-side check, server does real check
        const nextBid = (state.bid || 0) + 0.05; 
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
    updateHeaderNotice();
    // Refresh squad view if open in tabs
    if(document.getElementById('tab-squads') && document.getElementById('tab-squads').classList.contains('active')) {
        viewEmbeddedSquad(selectedSquadTeam);
    }
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
/* =========== 5. LOGS, CHAT & COMMAND CENTER ====== */
/* ================================================= */

socket.on("chatUpdate", d => {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.innerHTML = `<b style="color:${TEAM_COLORS[d.team] || '#aaa'}">${d.team} (${d.user})</b>: ${d.msg}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    if(chat.children.length > 20) chat.removeChild(chat.firstChild);
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
    if (log.children.length > 20) log.removeChild(log.firstChild);
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

window.viewEmbeddedSquad = function(team) {
    selectedSquadTeam = team;
    
    document.querySelectorAll('.h-team-btn').forEach(b => b.classList.remove('active'));
    Array.from(document.querySelectorAll('.h-team-btn')).find(b => b.innerText === team)?.classList.add('active');

    const box = document.getElementById("embeddedSquadView");
    const squad = allSquads[team] || [];
    const purse = teamPurse[team] || 0;
    const owner = teamOwners[team] ? teamOwners[team] : "Available";
    box.innerHTML = `
        <div style="text-align:center; padding-bottom:10px; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <h2 style="margin:0; color:${TEAM_COLORS[team] || '#fff'}">${team}</h2>
            <div style="font-size:0.8rem; color:#aaa;">Manager: <span style="color:#fff;">${owner}</span></div>
            <div style="font-size:1.1rem; margin-top:5px; font-weight:bold;">
                Purse: <span style="color:#4ade80;">₹${purse.toFixed(2)} Cr</span> 
                <span style="color:#666;">|</span> 
                Players: ${squad.length}
            </div>
        </div>
        <div id="sq-list-content"></div>
    `;

    const content = document.getElementById("sq-list-content");
    const roles = { BAT: [], WK: [], ALL: [], BOWL: [] };
    
    squad.forEach(p => { 
        if(p.role === "BAT") roles.BAT.push(p);
        else if(p.role === "WK") roles.WK.push(p);
        else if(p.role === "ALL") roles.ALL.push(p);
        else roles.BOWL.push(p);
    });

    Object.keys(roles).forEach(r => {
        if(roles[r].length > 0) {
            const h = document.createElement("h4");
            h.innerText = r;
            h.style.color = "#facc15";
            h.style.margin = "10px 0 5px 0";
            h.style.fontSize = "0.8rem";
            content.appendChild(h);

            roles[r].forEach(p => {
                const row = document.createElement("div");
                row.className = "sq-row";
                row.innerHTML = `
                    <span>${p.name} <small style="color:#666">⭐${p.rating}</small></span>
                    <span style="color:#4ade80; font-weight:bold;">₹${p.price.toFixed(2)}</span>
                `;
                content.appendChild(row);
            });
        }
    });
};

/* ================================================= */
/* =========== 6. POPUPS (SETS, RULES, ADMIN) ====== */
/* ================================================= */
/* ================================================= */
/* ========= 4. SETS & SQUAD VIEWING =============== */
/* ================================================= */

// --- A. UPCOMING SETS LOGIC ---
let isSetsViewOpen = false;

socket.on("setUpdate", data => {
    remainingSets = data; 
    // If the view is currently open, refresh it live to show changes immediately
    if(isSetsViewOpen){
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

function renderSetsPanel() {
    const container = document.getElementById("panel-sets");
    if(!container || !remainingSets.length) return;

    const activeSet = remainingSets[0];

    // Build the HTML for Active Set + Upcoming Sets
    let html = `
        <div style="padding:10px;">
            <h2 class="set-title active">🔥 ${activeSet.name} (${activeSet.players.length})</h2>
            <div>
                ${activeSet.players.map(p => `
                    <div class="set-player-row active-p">
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

    // Append Upcoming Sets
    if(remainingSets.length > 1) {
        remainingSets.slice(1).forEach(set => {
            html += `
                <h2 class="set-title">📦 ${set.name} (${set.players.length})</h2>
                <div style="opacity: 0.6;">
                    ${set.players.map(p => `
                        <div class="set-player-row">
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
socket.on("squadData", squads => {
    allSquads = squads;
    // Refresh embedded view if active
    if(document.getElementById('tab-squads').classList.contains('active')) {
        viewEmbeddedSquad(selectedSquadTeam);
    }
});

// --- ADMIN ---
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
    if (!myTeam) {
        document.getElementById("noticeTeam").innerText = "SPECTATOR";
        document.getElementById("noticePurse").innerText = "";
        return;
    }
    const purse = teamPurse[myTeam] !== undefined ? teamPurse[myTeam] : 0;
    document.getElementById("noticeTeam").innerText = myTeam;
    document.getElementById("noticeTeam").style.color = TEAM_COLORS[myTeam] || "white";
    document.getElementById("noticePurse").innerText = `₹${purse.toFixed(2)} Cr`;
    document.getElementById("noticePurse").style.color = "#4ade80"; 
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

function showScreen(id){
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}

/* ================================================= */
/* ========= 8. PLAYING XI & LEADERBOARD =========== */
/* ================================================= */

socket.on("auctionEnded", () => {
    showScreen("playingXI");
    document.body.style.overflow = "auto"; 
    socket.emit("getMySquad");
});

socket.on("mySquad", ({ squad, rules }) => {
    if(rules) {
        activeRules = rules;
        updateRulesUI();
    }

    selectedXI = { BAT: [], BOWL: [], WK: [], ALL: [] };
    const container = document.getElementById("mySquadList");
    if(!container || !squad) return;
    
    container.innerHTML = "";
    
    const grid = document.createElement("div");
    grid.className = "xi-select-container";

    const roles = { WK: "Wicket Keepers", BAT: "Batsmen", ALL: "All Rounders", BOWL: "Bowlers" };

    Object.keys(roles).forEach(key => {
        const players = squad.filter(p => {
            if(key === "BOWL") return (p.role === "PACE" || p.role === "SPIN" || p.role === "BOWL");
            return p.role === key;
        });

        if(players.length > 0) {
            const title = document.createElement("div");
            title.className = "role-group-title";
            title.innerText = roles[key];
            grid.appendChild(title);

            players.forEach(p => {
                const btn = document.createElement("div");
                btn.className = "xi-player-btn";
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
        list.splice(idx, 1);
        btnElement.classList.remove("picked");
    } else {
        if(countTotalXI() >= 11) return alert("Squad full (11/11)");
        list.push(p);
        btnElement.classList.add("picked");
    }
    updateXIPreview();
}

function countTotalXI() {
    return Object.values(selectedXI).reduce((acc, arr) => acc + arr.length, 0);
}

function updateXIPreview() {
    const count = countTotalXI();
    const btn = document.getElementById("submitXIBtn");
    const saveBtn = document.getElementById("saveXIBtn");
    const placeholder = document.getElementById("xiPlaceholder");
    const card = document.getElementById("xiCardTarget");
    const content = document.getElementById("sheetContent");
    const countLabel = document.getElementById("sheetCount");
    const teamTitle = document.getElementById("sheetTeamName");

    // --- LIVE STATS BAR ---
    const statsBar = document.getElementById("xiStatsBar");
    if(statsBar) {
        const foreign = Object.values(selectedXI).flat().filter(p => p.foreign).length;
        const wk = selectedXI.WK.length;
        const bat = selectedXI.BAT.length;
        const bowl = selectedXI.BOWL.length;
        const all = selectedXI.ALL.length;

        const createBadge = (label, current, limit, isMax = false) => {
            const isValid = isMax ? current <= limit : current >= limit;
            const statusClass = isValid ? 'valid' : '';
            const errorClass = (isMax && !isValid) ? 'invalid' : '';
            return `<div class="xi-rule-badge ${statusClass} ${errorClass}">${label} <b>${current}/${limit}</b></div>`;
        };

        statsBar.innerHTML = `
            ${createBadge("✈️ Foreign", foreign, activeRules.minForeignXI || 4, true)}
            ${createBadge("🧤 WK", wk, activeRules.minWK || 1)}
            ${createBadge("🏏 BAT", bat, activeRules.minBat || 3)}
            ${createBadge("👟 ALL", all, activeRules.minAll || 1)}
            ${createBadge("🥎 BOWL", bowl, activeRules.minBowl || 3)}
        `;
    }

    if(btn) {
        btn.innerText = `Submit XI (${count}/11)`;
        btn.disabled = count !== 11;
        btn.style.background = count === 11 ? "var(--success)" : "";
        btn.style.color = count === 11 ? "#000" : "#fff";
    }

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

    if(teamTitle) teamTitle.innerText = myTeam ? `${myTeam} XI` : "MY TEAM";
    if(countLabel) countLabel.innerText = `${count}/11 Players`;
    
    content.innerHTML = "";
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
                pill.innerHTML = `<span>${p.name} ${icon}</span> <small>⭐${p.rating}</small>`;
                row.appendChild(pill);
            });
            content.appendChild(row);
        }
    });
}

window.downloadSheetPNG = function() {
    const el = document.getElementById('xiCardTarget');
    html2canvas(el, { backgroundColor: null, scale: 3, useCORS: true }).then(canvas => {
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
});

function generateCreativeCardHTML(teamName, players, rating, count) {
    if(!players || players.length === 0) return `<div class="sheet-empty">No Players</div>`;

    const roles = { WK: [], BAT: [], ALL: [], BOWL: [] };
    players.forEach(p => {
        if(p.role === "BAT") roles.BAT.push(p);
        else if(p.role === "WK") roles.WK.push(p);
        else if(p.role === "ALL") roles.ALL.push(p);
        else roles.BOWL.push(p); 
    });

    let html = `
    <div id="generatedCard" class="team-sheet-card">
        <div class="sheet-header">
            <h2 class="sheet-title">${teamName}</h2>
            <div class="sheet-subtitle">OFFICIAL PLAYING XI</div>
            <div style="margin-top:5px; color:#4ade80; font-weight:bold;">Rating: ${rating}</div>
        </div>
        <div id="sheetContent">`;

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
    
    container.innerHTML = generateCreativeCardHTML(
        data.team, 
        data.xi, 
        data.rating, 
        data.xi ? data.xi.length : 0
    );

    overlay.classList.remove("hidden");
}

window.downloadLeaderboardPNG = function() {
    const el = document.getElementById('generatedCard');
    html2canvas(el, { backgroundColor: null, scale: 3 }).then(canvas => {
        const a = document.createElement('a');
        a.download = `Squad_Card.png`;
        a.href = canvas.toDataURL();
        a.click();
    });
}

/* ================= GLOBAL REFRESH LOGIC ================= */
/* ================= GLOBAL REFRESH LOGIC ================= */
function refreshGlobalUI() {
    // 1. Re-render Team Selection Buttons (to hide taken teams)
    // We assume 'renderEmbeddedTeams' uses the latest data we have.
    // If we need fresh data, we can ask server, but usually local state is enough if updated correctly.
    const currentTab = document.querySelector('.info-tab-btn.active');
    
    // 2. Refresh Squad View if it's currently open
    // This updates "Manager: Available" to "Manager: [Name]" instantly
    if(currentTab && currentTab.id === 'tab-squads' && selectedSquadTeam) {
        viewEmbeddedSquad(selectedSquadTeam);
    }

    // 3. Refresh Team Buttons if on selection screen
    // We need to know which teams are remaining. 
    // Usually 'teamPicked' updates this, but we can trigger a re-render if needed.
    
    // 4. Update Header
    updateHeaderNotice();
}
