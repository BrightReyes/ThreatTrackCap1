import { onAuthStateChanged, signOut } from "firebase/auth";
import { findNearestCoveredBarangay, getBarangayNameById } from "../../shared/barangays.js";
import { findNearestCoveredSubstation, getSubstationNameById } from "../../shared/substations.js";
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
const ADMIN_ROLE_CACHE_KEY = "tt_admin_role";
const ADMIN_BARANGAY_ID_CACHE_KEY = "tt_admin_barangay_id";
const ADMIN_BARANGAY_NAME_CACHE_KEY = "tt_admin_barangay_name";
const ADMIN_SUBSTATION_ID_CACHE_KEY = "tt_admin_substation_id";
const ADMIN_SUBSTATION_NAME_CACHE_KEY = "tt_admin_substation_name";
const ADMIN_AUTH_NOTICE_KEY = "tt_admin_auth_notice";
const ADMIN_SESSION_STORAGE_PREFIXES = ["tt_hotspot_ai_plan:"];
const UNAUTHORIZED_ADMIN_MESSAGE =
    "Unauthorized admin access. Please sign in with an approved admin account.";

function clearAdminSessionCaches() {
    try {
        Object.keys(sessionStorage)
            .filter((key) =>
                ADMIN_SESSION_STORAGE_PREFIXES.some((prefix) =>
                    key.startsWith(prefix),
                ),
            )
            .forEach((key) => sessionStorage.removeItem(key));
    } catch (err) {
        console.warn("[admin-auth] session cache clear failed", err);
    }
}

function applyCachedAdminRole() {
    const role = normalizeAdminRole(localStorage.getItem(ADMIN_ROLE_CACHE_KEY));
    document.documentElement.classList.toggle(
        "admin-role-police",
        role === "police",
    );
}

function cacheAdminRole(role) {
    const normalized = normalizeAdminRole(role);
    if (normalized) {
        localStorage.setItem(ADMIN_ROLE_CACHE_KEY, normalized);
    } else {
        localStorage.removeItem(ADMIN_ROLE_CACHE_KEY);
    }
    document.documentElement.classList.toggle(
        "admin-role-police",
        normalized === "police",
    );
}

export function normalizeAdminRole(role) {
    const value = String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (["head_police", "hq_police", "police_chief", "head_admin"].includes(value)) {
        return "head_police";
    }
    if (["moderator", "barangay", "barangay_admin"].includes(value)) {
        return "admin";
    }
    if (["police", "police_admin", "substation_police", "substation"].includes(value)) {
        return "police";
    }
    return value;
}

export function isHeadPoliceAdminRole(role) {
    return normalizeAdminRole(role) === "head_police";
}

export function isSubstationPoliceAdminRole(role) {
    return normalizeAdminRole(role) === "police";
}

export function isPoliceAdminRole(role) {
    const r = normalizeAdminRole(role);
    return r === "police" || r === "head_police";
}

export function isAllowedAdminRole(role) {
    return ["admin", "police", "head_police"].includes(normalizeAdminRole(role));
}

/**
 * Returns the current active admin role ("admin" | "police" | "user").
 *
 * @returns {string}
 */
export function getCurrentAdminRole() {
    try {
        return normalizeAdminRole(
            localStorage.getItem(ADMIN_ROLE_CACHE_KEY)
        ) || "admin";
    } catch {
        return "admin";
    }
}

/**
 * Returns the current Barangay Admin's assigned barangayId (e.g. "balangkas", "mapulang_lupa").
 * Returns null if the user is a Police Admin or has no specific assigned jurisdiction.
 *
 * @returns {string | null}
 */
export function getCurrentAdminBarangayId() {
    try {
        const val = localStorage.getItem(ADMIN_BARANGAY_ID_CACHE_KEY);
        return val ? String(val).trim().toLowerCase() : null;
    } catch {
        return null;
    }
}

/**
 * Returns the human-readable name of the admin's assigned barangay (e.g. "Balangkas").
 *
 * @returns {string | null}
 */
export function getCurrentAdminBarangayName() {
    try {
        return localStorage.getItem(ADMIN_BARANGAY_NAME_CACHE_KEY) || null;
    } catch {
        return null;
    }
}

/**
 * Returns the current Substation Police Admin's assigned substationId (e.g. "balangkas_substation").
 *
 * @returns {string | null}
 */
export function getCurrentAdminSubstationId() {
    try {
        const val = localStorage.getItem(ADMIN_SUBSTATION_ID_CACHE_KEY);
        return val ? String(val).trim().toLowerCase() : null;
    } catch {
        return null;
    }
}

/**
 * Returns the human-readable name of the admin's assigned substation.
 *
 * @returns {string | null}
 */
export function getCurrentAdminSubstationName() {
    try {
        return localStorage.getItem(ADMIN_SUBSTATION_NAME_CACHE_KEY) || null;
    } catch {
        return null;
    }
}

/**
 * Resolves the assigned covered barangay ID for an incident report.
 * Evaluates: (1) explicit barangayId, (2) location.barangay, (3) address keywords,
 * and (4) geographic proximity via GPS coordinates (Haversine formula).
 *
 * @param {object} incidentData
 * @returns {string | null} 'balangkas' | 'mapulang_lupa' | null
 */
export function resolveIncidentBarangayId(incidentData = {}) {
    if (!incidentData) return null;

    // 1. Direct explicit property
    const directId = String(
        incidentData.barangayId || incidentData.assignedBarangayId || ""
    ).trim().toLowerCase();
    if (directId) {
        if (directId.includes("mapulang")) return "mapulang_lupa";
        if (directId.includes("balangkas")) return "balangkas";
        return directId;
    }

    // 2. Direct string field: location.barangay or incidentData.barangay
    const textBarangay = String(
        incidentData.location?.barangay || incidentData.barangay || ""
    ).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (textBarangay) {
        if (textBarangay.includes("mapulang")) return "mapulang_lupa";
        if (textBarangay.includes("balangkas")) return "balangkas";
        return textBarangay;
    }

    // 3. Address text scan
    const addressText = String(
        incidentData.location?.address || incidentData.address || ""
    ).toLowerCase();
    if (addressText.includes("mapulang")) return "mapulang_lupa";
    if (addressText.includes("balangkas")) return "balangkas";

    // 4. GPS Coordinates fallback using Haversine calculation
    const lat = Number(
        incidentData.location?.latitude ??
        incidentData.latitude ??
        incidentData.lat
    );
    const lng = Number(
        incidentData.location?.longitude ??
        incidentData.longitude ??
        incidentData.lng
    );
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const nearest = findNearestCoveredBarangay(lat, lng);
        if (nearest?.barangayId && nearest.barangayId !== "unknown") {
            return nearest.barangayId;
        }
    }

    return null;
}

/**
 * Role-Based Access Control (RBAC) jurisdiction gate.
 * Determines if the current administrator is authorized to view or manage an incident.
 *
 * Rules:
 * 1. Police Admin: Has city-wide oversight (authorized for all covered barangays).
 * 2. Barangay Admin: Authorized ONLY for reports assigned to their barangay jurisdiction.
 *
 * @param {object} incidentData - Incident document fields
 * @returns {boolean} Whether access is permitted
 */
/**
 * Resolves the assigned police substation ID for an incident report.
 * Evaluates: (1) explicit substationId, (2) substation text, (3) resolved barangay,
 * and (4) geographic proximity via GPS coordinates to nearest substation.
 *
 * @param {object} incidentData
 * @returns {string | null}
 */
export function resolveIncidentSubstationId(incidentData = {}) {
    if (!incidentData) return null;

    // 1. Direct explicit property
    const directId = String(
        incidentData.substationId || incidentData.assignedSubstationId || ""
    ).trim().toLowerCase();
    if (directId) {
        if (directId.includes("mapulang")) return "mapulang_lupa_substation";
        if (directId.includes("balangkas")) return "balangkas_substation";
        return directId;
    }

    // 2. Direct string text
    const textSubstation = String(
        incidentData.substationName || incidentData.substation || ""
    ).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (textSubstation) {
        if (textSubstation.includes("mapulang")) return "mapulang_lupa_substation";
        if (textSubstation.includes("balangkas")) return "balangkas_substation";
    }

    // 3. Fallback using incident's resolved barangay
    const bId = resolveIncidentBarangayId(incidentData);
    if (bId === "mapulang_lupa") return "mapulang_lupa_substation";
    if (bId === "balangkas") return "balangkas_substation";

    // 4. GPS Coordinates fallback using Haversine calculation to nearest covered substation
    const lat = Number(incidentData.location?.latitude ?? incidentData.latitude ?? incidentData.lat);
    const lng = Number(incidentData.location?.longitude ?? incidentData.longitude ?? incidentData.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const nearest = findNearestCoveredSubstation(lat, lng);
        if (nearest?.substationId && nearest.substationId !== "unknown") {
            return nearest.substationId;
        }
    }

    return null;
}

/**
 * Role-Based Access Control (RBAC) jurisdiction gate.
 * Determines if the current administrator is authorized to view or manage an incident.
 *
 * Rules:
 * 1. Head Police Admin: Has city-wide command & oversight (authorized for all incidents).
 * 2. Substation Police Admin: Authorized ONLY for reports assigned to their substation sector.
 * 3. Barangay Admin: Authorized ONLY for reports assigned to their barangay jurisdiction.
 *
 * @param {object} incidentData - Incident document fields
 * @returns {boolean} Whether access is permitted
 */
export function hasIncidentAccess(incidentData = {}) {
    const role = getCurrentAdminRole();
    // 1. Head Police Admin has full city-wide oversight
    if (role === "head_police") return true;

    // 2. Substation Police Admin is scoped to their substation sector
    if (role === "police") {
        const currentSubstationId = getCurrentAdminSubstationId();
        if (!currentSubstationId) return true; // Unassigned fallback
        const resolvedSubstationId = resolveIncidentSubstationId(incidentData);
        if (resolvedSubstationId) {
            return resolvedSubstationId === currentSubstationId;
        }
        return false;
    }

    // 3. Barangay Admin is scoped to their barangay jurisdiction
    const currentBarangayId = getCurrentAdminBarangayId();
    if (!currentBarangayId) return true;

    const resolvedBarangayId = resolveIncidentBarangayId(incidentData);
    if (resolvedBarangayId) {
        return resolvedBarangayId === currentBarangayId;
    }

    // Strict boundary: reports without matching jurisdiction are hidden from Barangay Admin
    return false;
}

export function cacheAdminJurisdiction(profile) {
    if (!profile) {
        localStorage.removeItem(ADMIN_BARANGAY_ID_CACHE_KEY);
        localStorage.removeItem(ADMIN_BARANGAY_NAME_CACHE_KEY);
        localStorage.removeItem(ADMIN_SUBSTATION_ID_CACHE_KEY);
        localStorage.removeItem(ADMIN_SUBSTATION_NAME_CACHE_KEY);
        return;
    }
    const bId = profile.barangayId || profile.assignedBarangayId || null;
    const bName = profile.assignedBarangay || profile.barangayName || profile.barangay || null;
    if (bId) {
        localStorage.setItem(ADMIN_BARANGAY_ID_CACHE_KEY, String(bId).trim().toLowerCase());
    } else {
        localStorage.removeItem(ADMIN_BARANGAY_ID_CACHE_KEY);
    }
    if (bName) {
        localStorage.setItem(ADMIN_BARANGAY_NAME_CACHE_KEY, String(bName).trim());
    } else {
        localStorage.removeItem(ADMIN_BARANGAY_NAME_CACHE_KEY);
    }

    const sId = profile.substationId || profile.assignedSubstationId || profile.assignedSubstation || null;
    const sName = profile.substationName || profile.assignedSubstationName || null;
    if (sId) {
        localStorage.setItem(ADMIN_SUBSTATION_ID_CACHE_KEY, String(sId).trim().toLowerCase());
    } else {
        localStorage.removeItem(ADMIN_SUBSTATION_ID_CACHE_KEY);
    }
    if (sName) {
        localStorage.setItem(ADMIN_SUBSTATION_NAME_CACHE_KEY, String(sName).trim());
    } else {
        localStorage.removeItem(ADMIN_SUBSTATION_NAME_CACHE_KEY);
    }
}

function humanizeAdminRole(role) {
    const normalized = normalizeAdminRole(role);
    if (normalized === "admin") return "Barangay Admin";
    if (normalized === "police") return "Police Admin";
    if (normalized === "user") return "User";
    return "Admin";
}

async function loadAdminProfile(user) {
    if (!user?.uid) return null;
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? (snap.data() || {}) : {};

        let bId = data.barangayId || data.assignedBarangayId || null;
        if (!bId && data.assignedBarangay) bId = String(data.assignedBarangay).trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (!bId && data.barangayName) bId = String(data.barangayName).trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (!bId && data.barangay) bId = String(data.barangay).trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (bId && bId.includes("mapulang")) bId = "mapulang_lupa";
        if (bId && bId.includes("balangkas")) bId = "balangkas";

        // Fallback: Infer jurisdiction from email address if unpopulated
        const emailLower = String(user.email || data.email || "").toLowerCase();
        if (!bId) {
            if (emailLower.includes("mapulang")) bId = "mapulang_lupa";
            else if (emailLower.includes("balangkas")) bId = "balangkas";
        }
        const bName = data.assignedBarangay || data.barangayName || (bId ? getBarangayNameById(bId) : null);

        let sId = data.substationId || data.assignedSubstationId || null;
        if (!sId && data.assignedSubstation) sId = String(data.assignedSubstation).trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (!sId && data.substationName) sId = String(data.substationName).trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (sId && sId.includes("mapulang")) sId = "mapulang_lupa_substation";
        if (sId && sId.includes("balangkas")) sId = "balangkas_substation";
        const sName = data.substationName || (sId ? getSubstationNameById(sId) : null);

        return {
            id: user.uid,
            ...data,
            role: normalizeAdminRole(data.role),
            barangayId: bId,
            assignedBarangay: bName,
            barangayName: bName,
            substationId: sId,
            assignedSubstation: sName,
            substationName: sName,
        };
    } catch (err) {
        console.warn("[admin-auth] profile load failed", err);
        return null;
    }
}

function applySidebarRoleLabel(profile) {
    const badge = document.querySelector(".sidebar__badge");
    if (!badge) return;
    const normalizedRole = normalizeAdminRole(profile?.role);
    if (normalizedRole === "admin") {
        const barangayName = profile?.assignedBarangay || profile?.barangayName || profile?.barangay;
        badge.textContent = barangayName
            ? `Barangay Admin (${barangayName})`
            : "Barangay Admin";
    } else {
        badge.textContent = humanizeAdminRole(profile?.role);
    }
}

function applyRoleNavigation(profile) {
    const nav = document.querySelector(".sidebar__nav");
    if (!nav) return;

    cacheAdminRole(profile?.role);
    cacheAdminJurisdiction(profile);

    const operationHref = "operation.html";
    let operationLink = nav.querySelector(`.sidebar__link[href="${operationHref}"]`);
    const canUseOperations = isPoliceAdminRole(profile?.role);

    if (!canUseOperations) {
        operationLink?.remove();
        return;
    }

    if (!operationLink) {
        operationLink = document.createElement("a");
        operationLink.href = operationHref;
        operationLink.className = "sidebar__link sidebar__link--role-visible";
        operationLink.dataset.roleNav = "police";
        operationLink.innerHTML = `
            <span class="sidebar__icon material-symbols-outlined">emergency_home</span>
            <span>Operation</span>
        `;

        const analyticsLink = nav.querySelector(
            '.sidebar__link[href="analytics.html"]',
        );
        const settingsLink = nav.querySelector('.sidebar__link[href="settings.html"]');
        nav.insertBefore(operationLink, analyticsLink || settingsLink || null);
    } else {
        const analyticsLink = nav.querySelector(
            '.sidebar__link[href="analytics.html"]',
        );
        if (analyticsLink && operationLink.nextElementSibling !== analyticsLink) {
            nav.insertBefore(operationLink, analyticsLink);
        }
    }

    operationLink.classList.add("sidebar__link--role-visible");

    const currentPage = window.location.pathname.split("/").pop();
    if (currentPage === operationHref) {
        nav.querySelectorAll(".sidebar__link--active").forEach((link) => {
            link.classList.remove("sidebar__link--active");
            link.removeAttribute("aria-current");
        });
        operationLink.classList.add("sidebar__link--active");
        operationLink.setAttribute("aria-current", "page");
    }
}

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
 * @param {{ pageId: string; requirePolice?: boolean; onReady?: (user: import('firebase/auth').User, profile?: object | null) => void }} options
 */
export function initAdminPage({ pageId, requirePolice = false, onReady }) {
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
                    cacheAdminRole(null);
                    cacheAdminJurisdiction(null);
                    clearAdminSessionCaches();
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
            cacheAdminRole(null);
            cacheAdminJurisdiction(null);
            clearAdminSessionCaches();
            window.location.replace("login.html");
            return;
        }
        if (userEmail) {
            userEmail.textContent = user.email ?? "";
            userEmail.title = user.email ?? "";
        }
        const profile = await loadAdminProfile(user);
        applySidebarRoleLabel(profile);

        if (!isAllowedAdminRole(profile?.role)) {
            cacheAdminRole(null);
            cacheAdminJurisdiction(null);
            clearAdminSessionCaches();
            toastError(UNAUTHORIZED_ADMIN_MESSAGE);
            sessionStorage.setItem(
                ADMIN_AUTH_NOTICE_KEY,
                UNAUTHORIZED_ADMIN_MESSAGE,
            );
            try {
                await signOut(auth);
            } catch (err) {
                console.warn("[admin-auth] unauthorized sign out failed", err);
            }
            window.location.replace("login.html");
            return;
        }

        applyRoleNavigation(profile);

        if (requirePolice && !isPoliceAdminRole(profile?.role)) {
            toastError("Operation access is limited to police admins");
            window.location.replace("dashboard.html");
            return;
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
        if (typeof onReady === "function") onReady(user, profile);
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
            cacheAdminRole(null);
            cacheAdminJurisdiction(null);
            clearAdminSessionCaches();
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

applyCachedAdminRole();
