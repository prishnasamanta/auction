/**
 * Firebase Auth (Google) — uses firebase-web-config.js, exposes sign-in helpers for client.js
 */
window.iplFirebase = { ready: false, user: null, auth: null, configOk: false, analytics: null };

function initIplFirebaseApp(cfg) {
    if (!cfg || !cfg.apiKey) {
        console.warn("[iplFirebase] Missing Firebase web config");
        window.iplFirebase.ready = true;
        document.dispatchEvent(new CustomEvent("ipl-auth-changed", { detail: { user: null } }));
        return;
    }
    if (!firebase.apps.length) {
        firebase.initializeApp(cfg);
    }
    const auth = firebase.auth();
    window.iplFirebase.auth = auth;
    window.iplFirebase.configOk = true;

    if (cfg.measurementId && typeof firebase.analytics === "function") {
        try {
            window.iplFirebase.analytics = firebase.analytics();
        } catch (_) { /* analytics optional */ }
    }

    auth.onAuthStateChanged((user) => {
        window.iplFirebase.user = user;
        window.iplFirebase.ready = true;
        document.dispatchEvent(new CustomEvent("ipl-auth-changed", { detail: { user } }));
    });
}

(function bootIplFirebase() {
    if (typeof firebase === "undefined") {
        console.warn("[iplFirebase] Firebase SDK not loaded");
        return;
    }

    const embedded = window.IPL_FIREBASE_CONFIG;
    if (embedded && embedded.apiKey) {
        initIplFirebaseApp(embedded);
        return;
    }

    fetch("/api/firebase-config")
        .then((r) => r.json())
        .then((cfg) => initIplFirebaseApp(cfg))
        .catch((err) => {
            console.warn("[iplFirebase] init failed", err);
            window.iplFirebase.ready = true;
            document.dispatchEvent(new CustomEvent("ipl-auth-changed", { detail: { user: null } }));
        });
})();

window.iplGoogleSignIn = async function () {
    if (!window.iplFirebase.configOk || !window.iplFirebase.auth) {
        throw new Error("Google sign-in is not available. Check that Firebase Auth (Google) is enabled in the console.");
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
        const result = await window.iplFirebase.auth.signInWithPopup(provider);
        return result.user;
    } catch (err) {
        if (err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request") {
            try {
                await window.iplFirebase.auth.signInWithRedirect(provider);
                return null;
            } catch (redirErr) {
                throw redirErr;
            }
        }
        throw err;
    }
};

window.iplGoogleSignOut = async function () {
    if (window.iplFirebase.auth) await window.iplFirebase.auth.signOut();
};

window.iplGetIdToken = async function () {
    const u = window.iplFirebase.user;
    if (!u) return null;
    return u.getIdToken();
};
