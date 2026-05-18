import {
    onAuthStateChanged,
    sendPasswordResetEmail,
    signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { handleLogin } from "../../shared/auth.js";
import Swal from "sweetalert2";
import { toastError, toastSuccess } from "./alerts.js";
import { logAudit } from "./audit.js";

const pageLogin = document.getElementById("page-login");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const forgotPassword = document.getElementById("forgot-password");

const LOCK_KEY = "tt_admin_login_lock";
const ADMIN_ROLE_CACHE_KEY = "tt_admin_role";
const ADMIN_AUTH_NOTICE_KEY = "tt_admin_auth_notice";
const UNAUTHORIZED_ADMIN_MESSAGE =
    "Unauthorized admin access. Please sign in with an approved admin account.";

function normalizeAdminRole(role) {
    const value = String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (["moderator", "barangay", "barangay_admin"].includes(value)) {
        return "admin";
    }
    if (value === "police_admin") return "police";
    return value;
}

function isAllowedAdminRole(role) {
    return ["admin", "police"].includes(normalizeAdminRole(role));
}

function cacheAdminRole(role) {
    const normalized = normalizeAdminRole(role);
    if (isAllowedAdminRole(normalized)) {
        localStorage.setItem(ADMIN_ROLE_CACHE_KEY, normalized);
    } else {
        localStorage.removeItem(ADMIN_ROLE_CACHE_KEY);
    }
    document.documentElement.classList.toggle(
        "admin-role-police",
        normalized === "police",
    );
}

async function loadLoginAdminProfile(user) {
    if (!user?.uid) return null;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return null;
    return {
        id: snap.id,
        ...snap.data(),
        role: normalizeAdminRole(snap.data()?.role),
    };
}

async function requireAdminLogin(user) {
    try {
        const profile = await loadLoginAdminProfile(user);
        if (!isAllowedAdminRole(profile?.role)) {
            throw new Error(UNAUTHORIZED_ADMIN_MESSAGE);
        }
        cacheAdminRole(profile.role);
        return profile;
    } catch (err) {
        cacheAdminRole(null);
        try {
            await signOut(auth);
        } catch (signOutErr) {
            console.warn("[login] unauthorized sign out failed", signOutErr);
        }
        throw err;
    }
}

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

function getEmailValue() {
    return document.getElementById("email")?.value.trim() || "";
}

function showPendingAuthNotice() {
    try {
        const message = sessionStorage.getItem(ADMIN_AUTH_NOTICE_KEY);
        if (!message) return;
        sessionStorage.removeItem(ADMIN_AUTH_NOTICE_KEY);
        loginError.textContent = message;
        toastError(message);
    } catch {}
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getLoginErrorMessage(err) {
    const credentialErrorCodes = new Set([
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-credential",
    ]);

    if (credentialErrorCodes.has(err?.code)) {
        return "Invalid email or password.";
    }

    return err?.message ?? "Login failed";
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            await requireAdminLogin(user);
            window.location.replace("dashboard.html");
        } catch (err) {
            const msg = err?.message || UNAUTHORIZED_ADMIN_MESSAGE;
            loginError.textContent = msg;
            toastError(msg);
            pageLogin.hidden = false;
        }
        return;
    }
    cacheAdminRole(null);
    pageLogin.hidden = false;
    showPendingAuthNotice();
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
        const result = await handleLogin(email, password);
        await requireAdminLogin(auth.currentUser || result?.user);
        clearLock();
        await toastSuccess("Signed in");
        // Best-effort audit log
        // eslint-disable-next-line no-void
        void logAudit("auth.login", { email });
        window.location.replace("dashboard.html");
    } catch (err) {
        const msg = getLoginErrorMessage(err);
        console.warn("[login] sign-in failed", {
            code: err?.code || "(no code)",
            email,
        });
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

forgotPassword?.addEventListener("click", async () => {
    loginError.textContent = "";

    const currentEmail = getEmailValue();
    const result = await Swal.fire({
        title: "Reset password",
        text: "Enter your admin email and we will send password reset instructions.",
        input: "email",
        inputValue: currentEmail,
        inputPlaceholder: "sample@gmail.com",
        confirmButtonText: "Send reset link",
        showCancelButton: true,
        confirmButtonColor: "#ef4444",
        inputValidator: (value) => {
            const email = String(value || "").trim();
            if (!email) return "Email is required.";
            if (!isValidEmail(email)) return "Enter a valid email address.";
            return null;
        },
    });

    if (!result.isConfirmed) return;

    const email = String(result.value || "").trim();
    forgotPassword.disabled = true;

    try {
        await sendPasswordResetEmail(auth, email);
        await toastSuccess("Password reset email sent");
        loginError.textContent =
            "Password reset instructions were sent if this email has an account.";
    } catch (err) {
        console.warn("[login] password reset failed", {
            code: err?.code || "(no code)",
            email,
        });

        const msg =
            err?.code === "auth/invalid-email"
                ? "Enter a valid email address."
                : err?.code === "auth/too-many-requests"
                ? "Too many reset requests. Please try again later."
                : "Failed to send password reset email.";

        loginError.textContent = msg;
        toastError(msg);
    } finally {
        forgotPassword.disabled = false;
    }
});
