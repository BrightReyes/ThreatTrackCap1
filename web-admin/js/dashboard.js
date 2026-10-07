import { initAdminPage } from "./admin-auth.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import { initAdminMap } from "./admin-map.js";
import { loadAdminStats } from "./admin-stats.js";
import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";

const DASHBOARD_CLOCK_TZ = "Asia/Manila";
const DASHBOARD_ACTIVITY_LIMIT = 1;

function firstNameFromProfile(profile, user) {
    const fromProfile = String(profile?.firstName || "").trim();
    if (fromProfile) return fromProfile;

    const displayFirst = String(user?.displayName || "")
        .trim()
        .split(/\s+/)[0];
    if (displayFirst) return displayFirst;

    const emailFirst = String(user?.email || "").split("@")[0].trim();
    return emailFirst || "Admin";
}

function updateDashboardWelcome(user, profile) {
    const title = document.querySelector(
        "#page-dashboard .admin-dashboard__title",
    );
    if (!title) return;
    title.textContent = `Welcome ${firstNameFromProfile(profile, user)}`;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function humanize(str) {
    if (!str) return "—";
    return String(str)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toIncidentDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === "function") {
        try {
            return ts.toDate();
        } catch {
            return null;
        }
    }
    if (ts instanceof Date) return ts;
    if (typeof ts === "number") {
        return new Date(ts < 1e11 ? ts * 1000 : ts);
    }
    if (typeof ts === "string") {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

function getPHTDayKey(date) {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: DASHBOARD_CLOCK_TZ,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

function formatIncidentTime(date) {
    if (!date) return "—";
    try {
        return new Intl.DateTimeFormat("en-PH", {
            timeZone: DASHBOARD_CLOCK_TZ,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(date);
    } catch {
        return "—";
    }
}

function extractIncidentLocation(d) {
    const explicit =
        d.location?.street ||
        d.street ||
        d.location?.address ||
        d.address ||
        d.barangay ||
        d.area ||
        d.district ||
        d.locationName ||
        d.location?.barangay ||
        d.location?.area;
    if (explicit) return String(explicit).trim();

    const lat = Number(d.location?.latitude);
    const lng = Number(d.location?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    }
    return "Valenzuela City";
}

function formatActivityTimestamp(at) {
    if (at && typeof at.toDate === "function") {
        try {
            return at.toDate().toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
            });
        } catch {
            return "—";
        }
    }
    return "—";
}

/**
 * Real-time listener for Today's Reports requiring attention (pending / under_review).
 * Sits directly above the Incident Map as the primary attention layer.
 */
function startTodayReportsListener() {
    const container = document.getElementById("today-reports-container");
    const badge = document.getElementById("today-reports-badge");
    if (!container) return () => {};

    const renderEmpty = () => {
        if (badge) {
            badge.textContent = "0 requiring attention";
            badge.classList.remove("today-reports__badge--active");
        }
        container.innerHTML = `
            <div class="today-reports__empty" role="status">
                <span class="material-symbols-outlined today-reports__empty-icon" aria-hidden="true">task_alt</span>
                <div class="today-reports__empty-text">
                    <strong>You're all caught up</strong>
                    <p>No reports currently require attention today.</p>
                </div>
            </div>
        `;
    };

    const renderList = (items) => {
        if (badge) {
            badge.textContent = `${items.length} requiring attention`;
            badge.classList.add("today-reports__badge--active");
        }

        const cardsHtml = items
            .map((item) => {
                const id = item.id;
                const d = item.data;
                const sevRaw = String(d.severity || "medium").toLowerCase();
                const sev = ["high", "medium", "low"].includes(sevRaw) ? sevRaw : "medium";
                const typeText = escapeHtml(humanize(d.type || d.incidentType || "Incident"));
                const locText = escapeHtml(extractIncidentLocation(d));
                const timeText = escapeHtml(formatIncidentTime(item.date));
                const isSos = d.isSOSReport === true;
                const statusLabel = d.status === "pending" ? "Pending" : "Under Review";

                return `
                    <div class="today-report-item today-report-item--${sev}">
                        <div class="today-report-item__left">
                            <span class="today-report-severity-dot today-report-severity-dot--${sev}" aria-label="${sev} severity"></span>
                            <div class="today-report-item__info">
                                <div class="today-report-item__top">
                                    <span class="today-report-item__type">${typeText}</span>
                                    ${isSos ? '<span class="today-report-sos-tag">SOS</span>' : ""}
                                    <span class="today-report-status-tag">${escapeHtml(statusLabel)}</span>
                                </div>
                                <div class="today-report-item__meta">
                                    <span class="today-report-item__loc" title="${locText}">${locText}</span>
                                    <span class="today-report-meta-sep" aria-hidden="true">·</span>
                                    <time class="today-report-item__time">${timeText}</time>
                                </div>
                            </div>
                        </div>
                        <a href="incidents.html?incidentId=${encodeURIComponent(id)}" class="today-report-action-btn" title="Review incident details">
                            <span>Review</span>
                            <span class="material-symbols-outlined" style="font-size:14px;" aria-hidden="true">arrow_forward</span>
                        </a>
                    </div>
                `;
            })
            .join("");

        container.innerHTML = `<div class="today-reports__list" role="feed" aria-label="Unresolved reports from today">${cardsHtml}</div>`;
    };

    const q = query(
        collection(db, "incidents"),
        where("status", "in", ["pending", "under_review"]),
    );

    return onSnapshot(
        q,
        (snap) => {
            const todayKey = getPHTDayKey(new Date());
            const items = [];

            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const date = toIncidentDate(data.timestamp ?? data.reportedAt);
                if (!date) return;

                if (getPHTDayKey(date) === todayKey) {
                    items.push({
                        id: docSnap.id,
                        data,
                        date,
                    });
                }
            });

            items.sort((a, b) => b.date.getTime() - a.date.getTime());

            if (items.length === 0) {
                renderEmpty();
            } else {
                renderList(items);
            }
        },
        (err) => {
            console.error("[dashboard] today reports listener error:", err);
            renderEmpty();
        },
    );
}

/** Live latest audit log only (Firestore rules: admin/moderator read). */
function startDashboardActivityListener() {
    const list = document.getElementById("dashboard-activity-list");
    if (!list) return;

    const render = (html) => {
        list.innerHTML = html;
    };

    const q = query(
        collection(db, "audit_logs"),
        orderBy("at", "desc"),
        limit(DASHBOARD_ACTIVITY_LIMIT),
    );

    onSnapshot(
        q,
        (snap) => {
            if (snap.empty) {
                render(
                    '<li class="admin-dashboard__activity-item muted" role="status">No recent activity yet.</li>',
                );
                return;
            }
            const d = snap.docs[0].data() || {};
            const action = String(d.action || "unknown").trim() || "unknown";
            const who = String(d.email || d.uid || "—").trim();
            const when = formatActivityTimestamp(d.at);
            render(
                `<li class="admin-dashboard__activity-item">
          <span class="admin-dashboard__activity-action">${escapeHtml(action)}</span>
          <span class="admin-dashboard__activity-detail">${escapeHtml(who)} · ${escapeHtml(when)}</span>
        </li>`,
            );
        },
        (err) => {
            console.error("[dashboard] activity listener", err);
            const msg =
                err?.code === "permission-denied"
                    ? "Activity is available to admins and moderators only."
                    : err?.message || "Could not load activity.";
            render(
                `<li class="admin-dashboard__activity-item muted" role="alert">${escapeHtml(msg)}</li>`,
            );
        },
    );
}

function startDashboardClock() {
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

function bindCardNavigation(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", () => {
        window.location.href = url;
    });
    el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.location.href = url;
        }
    });
}

initAdminPage({
    pageId: "page-dashboard",
    onReady(user, profile) {
        updateDashboardWelcome(user, profile);
        initAdminCustomSelects(document.getElementById("page-dashboard"));
        startDashboardClock();
        startTodayReportsListener();
        startDashboardActivityListener();
        requestAnimationFrame(() => {
            setTimeout(initAdminMap, 50);
            loadAdminStats().catch((err) =>
                console.error("[dashboard] stats", err),
            );
        });
    },
});

bindCardNavigation("card-open-incidents", "incidents.html?filter=open");
bindCardNavigation("card-reports-24h", "incidents.html?filter=24h");
bindCardNavigation("card-sos-alerts", "incidents.html?filter=sos");
bindCardNavigation("card-pending-review", "incidents.html?filter=pending");
bindCardNavigation("card-users", "users.html");
bindCardNavigation("card-total-incidents", "incidents.html");
