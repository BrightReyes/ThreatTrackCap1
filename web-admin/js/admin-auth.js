import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "../../shared/firebase.js";
import {
    refreshSidebarSystemName,
    applyCachedSidebarSystemName,
} from "./admin-branding.js";
import { doc, getDoc } from "firebase/firestore";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";
import { logAudit } from "./audit.js";
import { startAdminPriorityAlerts } from "./admin-sos-alerts.js";

// Apply cached system name immediately on script load
applyCachedSidebarSystemName();

const DASHBOARD_CLOCK_TZ = "Asia/Manila";

function startAdminClock() {
    const timeEl = document.getElementById("dashboard-clock-time");
    const dateEl = document.getElementById("dashboard-clock-date");
    if (!timeEl || !dateEl) return;

    const tick = () => {
        const now = new Date();
        timeEl.textContent = new Intl.DateTimeFormat("en-PH", {
            timeZone: DASHBOARD_CLOCK_TZ,
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        }).format(now);
        dateEl.textContent = new Intl.DateTimeFormat("en-PH", {
            timeZone: DASHBOARD_CLOCK_TZ,
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        }).format(now);
    };

    tick();
    window.setInterval(tick, 1000);
}

/**
 * Shared admin layout: auth gate, user email, sign out, sidebar (# links only blocked).
 * @param {{ pageId: string; onReady?: (user: import('firebase/auth').User) => void }} options
 */
export function initAdminPage({ pageId, onReady }) {
    const page = document.getElementById(pageId);
    const userEmail = document.getElementById("user-email");
    const btnSignout = document.getElementById("btn-signout");
    let timeoutId = null;
    let lastActivity = Date.now();
    let timeoutMs = null;

    async function loadSessionTimeoutMs() {
        try {
            const snap = await getDoc(doc(db, "settings", "system"));
            if (!snap.exists()) return null;
            const mins = Number(
                snap.data()?.securitySettings?.sessionTimeoutMinutes,
            );
            if (!Number.isFinite(mins) || mins <= 0) return null;
            return mins * 60_000;
        } catch (err) {
            console.warn("[admin-auth] settings load failed", err);
            return null;
        }
    }

    function bumpActivity() {
        lastActivity = Date.now();
    }

    async function startInactivityTimer() {
        timeoutMs = await loadSessionTimeoutMs();
        if (!timeoutMs) return;

        const events = [
            "mousemove",
            "keydown",
            "click",
            "scroll",
            "touchstart",
        ];
        events.forEach((ev) =>
            window.addEventListener(ev, bumpActivity, { passive: true }),
        );

        const tick = async () => {
            if (!timeoutMs) return;
            const idle = Date.now() - lastActivity;
            if (idle >= timeoutMs) {
                try {
                    // eslint-disable-next-line no-void
                    void logAudit("auth.session_timeout", {
                        timeoutMinutes: Math.round(timeoutMs / 60_000),
                    });
                } catch {}
                try {
                    await signOut(auth);
                } catch {}
                toastError("Session timed out due to inactivity");
                window.location.replace("login.html");
                return;
            }
            timeoutId = window.setTimeout(tick, 15_000);
        };
        timeoutId = window.setTimeout(tick, 15_000);
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace("login.html");
            return;
        }
        if (userEmail) {
            userEmail.textContent = user.email ?? "";
            userEmail.title = user.email ?? "";
        }
        // Apply cached system name immediately
        applyCachedSidebarSystemName();
        // Load latest from Firestore
        await refreshSidebarSystemName();
        initSidebarToggle();
        if (page) page.hidden = false;
        // eslint-disable-next-line no-void
        void startInactivityTimer();
        startAdminClock();
        startAdminPriorityAlerts();
        if (typeof onReady === "function") onReady(user);
    });

    function applyInitialSidebarState(collapsed) {
        const html = document.documentElement;
        if (collapsed) {
            html.classList.add("sidebar-collapsed-initial");
        } else {
            html.classList.remove("sidebar-collapsed-initial");
        }
    }

    function initSidebarToggle() {
        const sidebar = document.querySelector(".admin-dashboard__sidebar");
        const toggleBtn = document.getElementById("sidebar-toggle");
        const toggleIcon = document.querySelector(".sidebar-toggle__icon");
        const hasLogoImg = document.querySelector(".sidebar-toggle__logo-img");

        if (!sidebar || !toggleBtn || !toggleIcon || !hasLogoImg) return;

        const isCollapsed =
            localStorage.getItem("sidebar-collapsed") === "true";
        if (isCollapsed) {
            sidebar.classList.add("admin-dashboard__sidebar--collapsed");
        }
        applyInitialSidebarState(isCollapsed);

        function updateToggleState(collapsed) {
            toggleBtn.setAttribute("aria-pressed", String(collapsed));
            toggleBtn.setAttribute(
                "aria-label",
                collapsed ? "Expand sidebar" : "Collapse sidebar",
            );
            toggleIcon.textContent = collapsed ? "menu" : "close";
        }

        updateToggleState(isCollapsed);

        if (
            document.documentElement.classList.contains(
                "sidebar-collapsed-initial",
            )
        ) {
            window.requestAnimationFrame(() => {
                document.documentElement.classList.remove(
                    "sidebar-collapsed-initial",
                );
            });
        }

        toggleBtn.addEventListener("click", () => {
            const isCurrentlyCollapsed = sidebar.classList.contains(
                "admin-dashboard__sidebar--collapsed",
            );
            const nextState = !isCurrentlyCollapsed;
            sidebar.classList.toggle("admin-dashboard__sidebar--collapsed");
            localStorage.setItem("sidebar-collapsed", nextState);
            updateToggleState(nextState);
        });
    }

    btnSignout?.addEventListener("click", async () => {
        const ok = await confirmDanger({
            title: "Sign out?",
            text: "You will be returned to the login page.",
            confirmText: "Sign out",
        });
        if (!ok) return;
        try {
            await signOut(auth);
            toastSuccess("Signed out");
            // eslint-disable-next-line no-void
            void logAudit("auth.logout", {});
            window.location.replace("login.html");
        } catch (err) {
            console.error("[admin-auth] sign out", err);
            toastError(err?.message || "Failed to sign out");
        }
    });

    document.querySelectorAll(".sidebar__link").forEach((link) => {
        const href = link.getAttribute("href");
        if (!href || href === "#") {
            link.addEventListener("click", (e) => e.preventDefault());
        }
    });
}
