import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../shared/firebase.js";
import { handleLogin } from "../../shared/auth.js";
import Swal from "sweetalert2";
import { toastError, toastSuccess } from "./alerts.js";
import { logAudit } from "./audit.js";

const pageLogin = document.getElementById("page-login");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");

const LOCK_KEY = "tt_admin_login_lock";

function getLockState() {
    try {
        const raw = localStorage.getItem(LOCK_KEY);
        if (!raw) return { failed: 0, lockedUntil: 0 };
        const parsed = JSON.parse(raw);
        return {
            failed: Number(parsed.failed) || 0,
            lockedUntil: Number(parsed.lockedUntil) || 0,
        };
    } catch {
        return { failed: 0, lockedUntil: 0 };
    }
}

function setLockState(next) {
    try {
        localStorage.setItem(
            LOCK_KEY,
            JSON.stringify({
                failed: Number(next.failed) || 0,
                lockedUntil: Number(next.lockedUntil) || 0,
            }),
        );
    } catch {}
}

function clearLock() {
    setLockState({ failed: 0, lockedUntil: 0 });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.replace("dashboard.html");
        return;
    }
    pageLogin.hidden = false;
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const lock = getLockState();
    const now = Date.now();
    if (lock.lockedUntil && now < lock.lockedUntil) {
        const mins = Math.ceil((lock.lockedUntil - now) / 60000);
        const msg = `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
        loginError.textContent = msg;
        toastError(msg);
        return;
    }

    loginSubmit.disabled = true;
    loginSubmit.innerHTML = `<span class="btn-loader"></span>`;
    try {
        await handleLogin(email, password);
        clearLock();
        await toastSuccess("Signed in");
        // Best-effort audit log
        // eslint-disable-next-line no-void
        void logAudit("auth.login", { email });
        window.location.replace("dashboard.html");
    } catch (err) {
        const msg = err?.message ?? "Login failed";
        loginError.textContent = msg;
        toastError(msg);

        // Basic lockout policy (default 5 attempts / 10 minutes)
        const next = getLockState();
        next.failed += 1;
        const MAX = 5;
        const LOCK_MINS = 10;
        if (next.failed >= MAX) {
            next.failed = 0;
            next.lockedUntil = Date.now() + LOCK_MINS * 60_000;
            const lockMsg = `Too many failed attempts. Locked for ${LOCK_MINS} minutes.`;
            loginError.textContent = lockMsg;
            toastError(lockMsg);
        }
        setLockState(next);

        // Optional: show a nicer modal for network errors
        if (String(msg).toLowerCase().includes("network")) {
            Swal.fire({
                icon: "error",
                title: "Network error",
                text: msg,
            });
        }
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Login";
    }
});
