import {
    addDoc,
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";
import { logAudit } from "./audit.js";
import {
    getCurrentAdminBarangayId,
    getCurrentAdminBarangayName,
    getCurrentAdminRole,
} from "./admin-auth.js";
import { getBarangayNameById } from "../../shared/barangays.js";

const LIST_LIMIT = 200;
const PAGE_SIZE = 10;

let allDocs = [];
let currentSearch = "";
let currentStatusFilter = "all";
let currentTypeFilter = "all";
let currentDetailDoc = null;
let isEventsBound = false;
let unsubscribeNotifications = null;
let currentPage = 1;

/* ==========================================================================
   Human-Readable Code & Name Resolvers (No Raw Hashes or UIDs)
   ========================================================================== */
function formatIncidentCode(docId) {
    if (!docId) return "";
    let hash = 0;
    const s = String(docId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `#${String(hash).padStart(4, "0")}`;
}

function formatUserSystemId(userId) {
    if (!userId) return "";
    let hash = 0;
    const s = String(userId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `#${String(hash).padStart(4, "0")}`;
}

function formatUserDisplay(userId) {
    if (!userId || userId === "all" || userId === "broadcast") return "Everyone in the City";
    if (userId === "police") return "Police Officers Only";
    return `User ID ${formatUserSystemId(userId)}`;
}

/* ==========================================================================
   Everyday English Translation Helpers
   ========================================================================== */
function humanizeType(type) {
    const val = String(type || "").toLowerCase();
    if (val.includes("sos")) return "Emergency SOS Alert";
    if (val.includes("response")) return "Police & Help Update";
    if (val.includes("resolved") || val.includes("done")) return "Incident Resolved";
    if (val.includes("reject")) return "Report Declined";
    if (val.includes("weather") || val.includes("hazard")) return "Weather Advisory";
    if (val.includes("broadcast") || val.includes("advisory")) return "Public Safety Notice";
    if (val.includes("police")) return "Police Notice";
    if (val.includes("incident")) return "Incident Update";
    return "General Notice";
}

function humanizePriority(priority, severity) {
    const p = String(priority || severity || "").toLowerCase();
    if (p === "critical" || p === "urgent") return "Urgent";
    if (p === "high") return "Important";
    if (p === "medium") return "Medium Priority";
    if (p === "low") return "Low Priority";
    return "Normal";
}

function escapeHtml(text) {
    if (text == null || text === "") return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

function formatRelative(ts) {
    if (!ts) return "—";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "—";

    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return "Just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;

    return d.toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatFullPHT(ts) {
    if (!ts) return "—";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "—";

    return (
        d.toLocaleString("en-PH", {
            timeZone: "Asia/Manila",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        }) + " PHT"
    );
}

function iconForType(type, priority) {
    const val = String(type || "").toLowerCase();
    const pri = String(priority || "").toLowerCase();
    if (val.includes("sos") || pri === "critical") return "crisis_alert";
    if (val.includes("resolved") || val.includes("done")) return "task_alt";
    if (val.includes("urgent")) return "emergency_home";
    if (val.includes("response")) return "local_police";
    if (val.includes("weather") || val.includes("hazard")) return "thunderstorm";
    if (val.includes("broadcast") || val.includes("advisory")) return "campaign";
    if (val.includes("reject")) return "cancel";
    if (val.includes("incident")) return "warning";
    return "notifications";
}

function getCardModifierClass(data) {
    const isRead = Boolean(data.readAt);
    if (isRead) return "notification-card--read";

    const pri = String(data.priority || data.severity || "").toLowerCase();
    const typ = String(data.type || "").toLowerCase();
    if (typ.includes("sos") || pri === "critical") return "notification-card--sos";
    if (pri === "high" || typ.includes("urgent")) return "notification-card--urgent";
    if (typ.includes("resolved") || typ.includes("done")) return "notification-card--resolved";
    if (typ.includes("response")) return "notification-card--response";
    if (typ.includes("broadcast") || typ.includes("advisory") || typ.includes("weather")) return "notification-card--advisory";

    return "";
}

/* ==========================================================================
   Build Single Notification Card HTML (Using Friendly Names)
   ========================================================================== */
function buildCard(docSnap) {
    const id = docSnap.id;
    const d = docSnap.data() || {};
    const isRead = Boolean(d.readAt);
    const modClass = getCardModifierClass(d);
    const icon = iconForType(d.type, d.priority || d.severity);
    const title = d.title || "Alert Notice";
    const body = d.body || "No message content provided.";
    const timeRel = formatRelative(d.sentAt || d.timestamp);
    const timeFull = formatFullPHT(d.sentAt || d.timestamp);
    const typeLabel = humanizeType(d.type);
    const priorityLabel = humanizePriority(d.priority, d.severity);
    const barangay = d.barangayName || (d.barangayId ? getBarangayNameById(d.barangayId) : "");
    const incidentId = d.incidentId || "";
    const incidentCode = incidentId ? formatIncidentCode(incidentId) : "";

    // Clean User ID for citizen privacy (never show personal names or raw 28-char UIDs)
    const userDisplay = formatUserDisplay(d.userId);

    const isUrgent =
        String(d.priority || d.severity || "").toLowerCase() === "critical" ||
        String(d.type || "").toLowerCase().includes("sos");
    const isResolved =
        String(d.type || "").toLowerCase().includes("resolved") ||
        String(d.type || "").toLowerCase().includes("done");

    return `
    <article
        class="notification-card ${modClass}"
        data-notification-id="${escapeAttr(id)}"
        tabindex="0"
        role="button"
        aria-label="View alert: ${escapeAttr(title)}"
    >
        <!-- Selection Checkbox -->
        <label class="notification-card__select" title="Select alert" onclick="event.stopPropagation();">
            <input type="checkbox" class="notification-select" value="${escapeAttr(id)}" aria-label="Select alert" />
        </label>

        <!-- Icon Wrap -->
        <div class="notification-card__icon-wrap" aria-hidden="true">
            <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
        </div>

        <!-- Main Content -->
        <div class="notification-card__content">
            <div class="notification-card__header">
                <div class="notification-card__title-row">
                    ${!isRead ? '<span class="notification-beacon" title="Unread alert"></span>' : ""}
                    <h3 class="notification-card__title">${escapeHtml(title)}</h3>
                    <span class="notification-pill ${isUrgent ? "notification-pill--critical" : isResolved ? "notification-pill--resolved" : "notification-pill--type"}">${escapeHtml(typeLabel)}</span>
                    <span class="notification-pill ${isUrgent ? "notification-pill--high" : "notification-pill--user"}">${escapeHtml(priorityLabel)}</span>
                </div>
                <time class="notification-card__time" title="${escapeAttr(timeFull)}">${escapeHtml(timeRel)}</time>
            </div>

            <p class="notification-card__body">${escapeHtml(body)}</p>

            <div class="notification-card__meta">
                ${
                    barangay
                        ? `<span class="notification-pill notification-pill--barangay" title="Barangay: ${escapeAttr(barangay)}">
                            <span class="material-symbols-outlined" style="font-size: 14px;">location_on</span>
                            <span>Barangay ${escapeHtml(barangay)}</span>
                           </span>`
                        : `<span class="notification-pill notification-pill--barangay">
                            <span class="material-symbols-outlined" style="font-size: 14px;">location_city</span>
                            <span>All Barangays</span>
                           </span>`
                }
                <span class="notification-pill notification-pill--user" title="Recipient: ${escapeAttr(userDisplay)}">
                    <span class="material-symbols-outlined" style="font-size: 14px;">person</span>
                    <span>${escapeHtml(userDisplay)}</span>
                </span>
                ${
                    incidentId
                        ? `<a href="incidents.html?id=${encodeURIComponent(incidentId)}" class="notification-pill notification-pill--incident" title="View linked report" onclick="event.stopPropagation();">
                            <span class="material-symbols-outlined" style="font-size: 14px;">assignment</span>
                            <span>Report ${escapeHtml(incidentCode)}</span>
                           </a>`
                        : ""
                }
                <span class="notification-pill ${isRead ? "notification-pill--read" : "notification-pill--unread"}">
                    <span class="material-symbols-outlined" style="font-size: 14px;">${isRead ? "done" : "mark_email_unread"}</span>
                    <span>${isRead ? "Read" : "Unread"}</span>
                </span>

                <!-- Quick Action Buttons -->
                <div class="notification-card__actions" onclick="event.stopPropagation();">
                    <button
                        type="button"
                        class="notification-action-btn"
                        data-action="toggle-read"
                        title="${isRead ? "Mark as unread" : "Mark as read"}"
                        aria-label="${isRead ? "Mark as unread" : "Mark as read"}"
                    >
                        <span class="material-symbols-outlined">${isRead ? "mark_email_unread" : "done_all"}</span>
                    </button>
                    <button
                        type="button"
                        class="notification-action-btn"
                        data-action="view-detail"
                        title="View alert details"
                        aria-label="View alert details"
                    >
                        <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button
                        type="button"
                        class="notification-action-btn notification-action-btn--danger"
                        data-action="delete"
                        title="Delete alert"
                        aria-label="Delete alert"
                    >
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        </div>
    </article>`;
}

/* ==========================================================================
   Filter & Render Engine
   ========================================================================== */
function filterDocs() {
    return allDocs.filter((docSnap) => {
        const d = docSnap.data() || {};
        if (d.archivedAt) return false;

        // 1. Status Filter
        const isRead = Boolean(d.readAt);
        const isUrgent =
            String(d.priority || d.severity || "").toLowerCase() === "critical" ||
            String(d.type || "").toLowerCase().includes("sos");

        if (currentStatusFilter === "unread" && isRead) return false;
        if (currentStatusFilter === "read" && !isRead) return false;
        if (currentStatusFilter === "urgent" && !isUrgent) return false;

        // 2. Category / Type Filter
        if (currentTypeFilter !== "all") {
            const typ = String(d.type || "").toLowerCase();
            if (currentTypeFilter === "sos" && !typ.includes("sos") && String(d.priority).toLowerCase() !== "critical") return false;
            if (currentTypeFilter === "response_update" && !typ.includes("response")) return false;
            if (currentTypeFilter === "resolved" && !typ.includes("resolved") && !typ.includes("done")) return false;
            if (currentTypeFilter === "report_rejected" && !typ.includes("reject")) return false;
            if (currentTypeFilter === "broadcast" && !typ.includes("broadcast") && !typ.includes("advisory") && !typ.includes("weather")) return false;
            if (currentTypeFilter === "police" && !typ.includes("police")) return false;
        }

        // 3. Search Filter
        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            const title = String(d.title || "").toLowerCase();
            const body = String(d.body || "").toLowerCase();
            const userId = String(d.userId || "").toLowerCase();
            const userDisplay = formatUserDisplay(d.userId).toLowerCase();
            const barangay = String(d.barangayName || "").toLowerCase();
            const incidentId = String(d.incidentId || "").toLowerCase();
            const incidentCode = formatIncidentCode(d.incidentId).toLowerCase();

            const matches =
                title.includes(q) ||
                body.includes(q) ||
                userId.includes(q) ||
                userDisplay.includes(q) ||
                barangay.includes(q) ||
                incidentId.includes(q) ||
                incidentCode.includes(q);
            if (!matches) return false;
        }

        return true;
    });
}

function updateTelemetryStats() {
    const total = allDocs.length;
    const unread = allDocs.filter((d) => !d.data()?.readAt).length;
    const read = total - unread;
    const urgent = allDocs.filter((d) => {
        const data = d.data() || {};
        return (
            String(data.priority || data.severity || "").toLowerCase() === "critical" ||
            String(data.type || "").toLowerCase().includes("sos")
        );
    }).length;

    const totalEl = document.getElementById("notifications-total-stat");
    const unreadEl = document.getElementById("notifications-unread-stat");
    const urgentEl = document.getElementById("notifications-urgent-stat");
    const readEl = document.getElementById("notifications-read-stat");

    if (totalEl) totalEl.textContent = String(total);
    if (unreadEl) unreadEl.textContent = String(unread);
    if (urgentEl) urgentEl.textContent = String(urgent);
    if (readEl) readEl.textContent = String(read);
}

function syncActiveCardHighlight() {
    document.querySelectorAll(".notifications-panel--metrics .stat-card").forEach((card) => {
        const filterVal = card.getAttribute("data-filter");
        card.classList.toggle("stat-card--active", filterVal === currentStatusFilter);
    });
}

function clampPage(page, totalPages) {
    if (totalPages < 1) return 1;
    return Math.max(1, Math.min(page, totalPages));
}

function renderPagination(totalItems, totalPages) {
    const pagination = document.getElementById("notifications-pagination");
    if (!pagination) return;

    if (totalItems <= PAGE_SIZE) {
        pagination.hidden = true;
        pagination.innerHTML = "";
        return;
    }

    pagination.hidden = false;
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(start + PAGE_SIZE - 1, totalItems);

    pagination.innerHTML = `
        <p class="incidents-pagination__meta">Showing ${start}–${end} of ${totalItems} alerts</p>
        <div class="incidents-pagination__actions">
            <button type="button" class="incidents-pagination__btn" data-page-action="prev" ${currentPage === 1 ? "disabled" : ""} aria-label="Previous page">
                <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">chevron_left</span>
                <span>Previous</span>
            </button>
            <span class="incidents-pagination__page">Page ${currentPage} of ${totalPages}</span>
            <button type="button" class="incidents-pagination__btn" data-page-action="next" ${currentPage === totalPages ? "disabled" : ""} aria-label="Next page">
                <span>Next</span>
                <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">chevron_right</span>
            </button>
        </div>
    `;
}

function renderNotifications() {
    const list = document.getElementById("notifications-list");
    const countMeta = document.getElementById("notifications-count");
    if (!list) return;

    updateTelemetryStats();
    syncActiveCardHighlight();

    const filtered = filterDocs();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    currentPage = clampPage(currentPage, totalPages);

    if (!allDocs.length) {
        list.innerHTML = `
            <div class="notifications-empty">
                <span class="material-symbols-outlined notifications-empty__icon">notifications_off</span>
                <p class="notifications-empty__title">No alert records found</p>
                <p class="notifications-empty__sub">New emergency notifications and citizen updates will appear here in real-time.</p>
            </div>`;
        if (countMeta) countMeta.textContent = "0 alerts";
        renderPagination(0, 1);
        syncBulkControls();
        return;
    }

    if (!filtered.length) {
        list.innerHTML = `
            <div class="notifications-empty">
                <span class="material-symbols-outlined notifications-empty__icon">search_off</span>
                <p class="notifications-empty__title">No alerts match what you searched for</p>
                <p class="notifications-empty__sub">Try clearing your search words or choosing All Statuses.</p>
                <button type="button" id="btn-empty-reset" class="notification-btn notification-btn--secondary" style="margin-top: 8px;">
                    <span class="material-symbols-outlined">restart_alt</span>
                    <span>Show All Alerts</span>
                </button>
            </div>`;
        if (countMeta) countMeta.textContent = `0 of ${allDocs.length} shown (filtered)`;

        document.getElementById("btn-empty-reset")?.addEventListener("click", () => {
            currentSearch = "";
            currentStatusFilter = "all";
            currentTypeFilter = "all";
            currentPage = 1;
            const searchInput = document.getElementById("notifications-search");
            const statusSelect = document.getElementById("notifications-filter-status");
            const typeSelect = document.getElementById("notifications-filter-type");
            if (searchInput) searchInput.value = "";
            if (statusSelect) statusSelect.value = "all";
            if (typeSelect) typeSelect.value = "all";
            renderNotifications();
        });

        renderPagination(0, 1);
        syncBulkControls();
        return;
    }

    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageDocs = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    list.innerHTML = pageDocs.map((docSnap) => buildCard(docSnap)).join("");

    if (countMeta) {
        const count = filtered.length;
        const total = allDocs.length;
        countMeta.textContent =
            count < total
                ? `${count} of ${total} shown (filtered)`
                : `${total} alert${total === 1 ? "" : "s"} loaded`;
    }

    renderPagination(filtered.length, totalPages);
    syncBulkControls();
}

/* ==========================================================================
   Bulk Selection Engine
   ========================================================================== */
function syncBulkControls() {
    const list = document.getElementById("notifications-list");
    const bulkBar = document.getElementById("notifications-bulk-bar");
    const selectAll = document.getElementById("notifications-select-all");
    const selectedCount = document.getElementById("notifications-selected-count");
    const archiveBtn = document.getElementById("notifications-archive-selected");
    const deleteBtn = document.getElementById("notifications-delete-selected");
    const modeBtn = document.getElementById("notifications-select-mode");

    const boxes = Array.from(list?.querySelectorAll(".notification-select") || []);
    const checked = boxes.filter((b) => b.checked);
    const count = checked.length;
    const isSelecting = list?.classList.contains("notifications-list--selecting");

    if (bulkBar) bulkBar.classList.toggle("is-visible", Boolean(isSelecting));
    if (selectedCount) selectedCount.textContent = `(${count} selected)`;
    if (archiveBtn) archiveBtn.disabled = !isSelecting || count === 0;
    if (deleteBtn) deleteBtn.disabled = !isSelecting || count === 0;
    if (modeBtn) modeBtn.disabled = boxes.length === 0;

    if (selectAll) {
        selectAll.checked = boxes.length > 0 && count === boxes.length;
        selectAll.indeterminate = count > 0 && count < boxes.length;
    }
}

function getSelectedIds() {
    const list = document.getElementById("notifications-list");
    return Array.from(list?.querySelectorAll(".notification-select:checked") || [])
        .map((cb) => cb.value)
        .filter(Boolean);
}

/* ==========================================================================
   Modals: Detail Inspector & Composer
   ========================================================================== */
async function openDetailModal(docSnap) {
    currentDetailDoc = docSnap;
    const d = docSnap.data() || {};
    const id = docSnap.id;

    const modal = document.getElementById("notification-detail-modal");
    if (!modal) return;

    const isRead = Boolean(d.readAt);
    const titleEl = document.getElementById("detail-modal-title");
    const bodyEl = document.getElementById("detail-modal-body");
    const typeEl = document.getElementById("detail-modal-type");
    const priEl = document.getElementById("detail-modal-priority");
    const userEl = document.getElementById("detail-modal-user");
    const bgyEl = document.getElementById("detail-modal-barangay");
    const sentEl = document.getElementById("detail-modal-sent");
    const statEl = document.getElementById("detail-modal-status");
    const toggleBtn = document.getElementById("detail-modal-toggle-text");
    const incidentWrap = document.getElementById("detail-modal-incident-wrap");
    const incidentText = document.getElementById("detail-modal-incident-text");
    const incidentLink = document.getElementById("detail-modal-incident-link");

    if (titleEl) titleEl.textContent = d.title || "Alert Details";
    if (bodyEl) bodyEl.textContent = d.body || "No message body provided.";
    if (typeEl) typeEl.textContent = humanizeType(d.type);
    if (priEl) priEl.textContent = humanizePriority(d.priority, d.severity);

    // For citizen privacy, display clean User ID (e.g. "User #1024") instead of personal real names
    if (userEl) {
        userEl.textContent = formatUserDisplay(d.userId);
    }

    if (bgyEl) {
        const bName = d.barangayName || (d.barangayId ? getBarangayNameById(d.barangayId) : "");
        bgyEl.textContent = bName ? `Barangay ${bName}` : "All Barangays";
    }

    if (sentEl) sentEl.textContent = formatFullPHT(d.sentAt || d.timestamp);
    if (statEl) statEl.textContent = isRead ? `Opened & Read (${formatFullPHT(d.readAt)})` : "Not opened yet (Unread)";
    if (toggleBtn) toggleBtn.textContent = isRead ? "Mark as Unread" : "Mark as Read";

    if (incidentWrap && incidentText && incidentLink) {
        if (d.incidentId) {
            incidentWrap.style.display = "block";
            const incCode = formatIncidentCode(d.incidentId);
            incidentText.textContent = `Incident Report ${incCode}`;
            incidentLink.href = `incidents.html?id=${encodeURIComponent(d.incidentId)}`;
        } else {
            incidentWrap.style.display = "none";
        }
    }

    modal.hidden = false;
}

function closeDetailModal() {
    const modal = document.getElementById("notification-detail-modal");
    if (modal) modal.hidden = true;
    currentDetailDoc = null;
}

function openComposeModal() {
    const modal = document.getElementById("notification-compose-modal");
    const form = document.getElementById("compose-notification-form");
    if (!modal) return;

    if (form) form.reset();
    const charCounter = document.getElementById("compose-char-count");
    if (charCounter) charCounter.textContent = "0";

    const userWrap = document.getElementById("compose-user-wrap");
    const bgyWrap = document.getElementById("compose-barangay-wrap");
    if (userWrap) userWrap.style.display = "none";
    if (bgyWrap) bgyWrap.style.display = "block";

    modal.hidden = false;
}

function closeComposeModal() {
    const modal = document.getElementById("notification-compose-modal");
    if (modal) modal.hidden = true;
}

/* ==========================================================================
   Dispatch New Notification (Composer Submission)
   ========================================================================== */
async function handleComposeSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById("compose-modal-submit");

    const titleInput = document.getElementById("compose-title");
    const typeSelect = document.getElementById("compose-type");
    const prioritySelect = document.getElementById("compose-priority");
    const audienceSelect = document.getElementById("compose-audience");
    const barangaySelect = document.getElementById("compose-barangay");
    const userInput = document.getElementById("compose-user-id");
    const bodyTextarea = document.getElementById("compose-body");

    const title = titleInput?.value.trim() || "";
    const type = typeSelect?.value || "broadcast";
    const priority = prioritySelect?.value || "normal";
    const audience = audienceSelect?.value || "all";
    const barangayId = barangaySelect?.value || "";
    const barangayName = barangayId ? getBarangayNameById(barangayId) || humanizeType(barangayId) : "";
    const directUserId = userInput?.value.trim() || "";
    const body = bodyTextarea?.value.trim() || "";

    if (!title) {
        toastError("Please enter a title for the alert.");
        titleInput?.focus();
        return;
    }

    if (!body) {
        toastError("Please enter your message for the alert.");
        bodyTextarea?.focus();
        return;
    }

    if (audience === "direct" && !directUserId) {
        toastError("Please enter the citizen's email or account ID.");
        userInput?.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined refresh-spin">progress_activity</span><span>Sending alert…</span>';
    }

    try {
        const payload = {
            title,
            body,
            type,
            priority,
            severity: priority,
            audience: audience === "police" ? "police" : "all",
            sentAt: serverTimestamp(),
            timestamp: serverTimestamp(),
            readAt: null,
            sender: {
                role: getCurrentAdminRole() || "admin",
                barangayName: getCurrentAdminBarangayName() || "HQ",
            },
        };

        if (audience === "direct") {
            payload.userId = directUserId;
        }

        if (barangayId) {
            payload.barangayId = barangayId;
            payload.barangayName = barangayName;
        }

        const docRef = await addDoc(collection(db, "notifications"), payload);

        await logAudit("notification_broadcast_dispatched", {
            notificationId: docRef.id,
            title,
            type,
            priority,
            audience,
            barangay: barangayName || "all",
        });

        toastSuccess("Alert sent out successfully!");
        closeComposeModal();

        // Refresh feed to show new alert
        await loadNotificationsTable(true);
    } catch (err) {
        console.error("[notifications] compose error", err);
        toastError(err?.message || "Could not send the alert. Please try again.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined">send</span><span>Send Alert Now</span>';
        }
    }
}

/* ==========================================================================
   Action Handlers (Mark Read, Archive, Delete)
   ========================================================================== */
async function handleToggleRead(id) {
    const docSnap = allDocs.find((d) => d.id === id);
    if (!docSnap) return;

    const currentlyRead = Boolean(docSnap.data()?.readAt);
    try {
        if (currentlyRead) {
            await updateDoc(doc(db, "notifications", id), { readAt: deleteField() });
            toastSuccess("Marked as unread");
        } else {
            await updateDoc(doc(db, "notifications", id), { readAt: serverTimestamp() });
            toastSuccess("Marked as read");
        }
        await loadNotificationsTable(true);
    } catch (err) {
        console.error("[notifications] toggle-read", err);
        toastError("Could not update status");
    }
}

async function handleMarkAllRead() {
    const unreadDocs = filterDocs().filter((d) => !d.data()?.readAt);
    if (!unreadDocs.length) {
        toastSuccess("All shown alerts are already marked as read!");
        return;
    }

    const ok = await confirmDanger({
        title: "Mark all as read?",
        text: `This will mark ${unreadDocs.length} shown alert(s) as read.`,
        confirmText: "Mark All Read",
    });
    if (!ok) return;

    const markBtn = document.getElementById("btn-mark-all-read");
    if (markBtn) markBtn.disabled = true;

    try {
        const batch = writeBatch(db);
        unreadDocs.forEach((d) => {
            batch.update(doc(db, "notifications", d.id), {
                readAt: serverTimestamp(),
            });
        });
        await batch.commit();

        toastSuccess(`${unreadDocs.length} alert(s) marked as read!`);
        await loadNotificationsTable(true);
    } catch (err) {
        console.error("[notifications] mark all read error", err);
        toastError("Could not mark alerts as read.");
    } finally {
        if (markBtn) markBtn.disabled = false;
    }
}

async function handleDeleteSingle(id) {
    const ok = await confirmDanger({
        title: "Delete this alert?",
        text: "This will permanently remove this alert record.",
        confirmText: "Delete",
    });
    if (!ok) return;

    try {
        await deleteDoc(doc(db, "notifications", id));
        toastSuccess("Alert deleted");
        allDocs = allDocs.filter((d) => d.id !== id);
        renderNotifications();
        closeDetailModal();
    } catch (err) {
        console.error("[notifications] delete single", err);
        toastError("Could not delete alert");
    }
}

async function handleArchiveSingle(id) {
    try {
        await updateDoc(doc(db, "notifications", id), {
            archivedAt: serverTimestamp(),
        });
        toastSuccess("Alert archived");
        allDocs = allDocs.filter((d) => d.id !== id);
        renderNotifications();
        closeDetailModal();
    } catch (err) {
        console.error("[notifications] archive single", err);
        toastError("Could not archive alert");
    }
}

/* ==========================================================================
   Event Listeners Binding
   ========================================================================== */
function bindGlobalEvents() {
    if (isEventsBound) return;
    isEventsBound = true;

    // 1. Search Input
    const searchInput = document.getElementById("notifications-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearch = e.target.value.trim();
            currentPage = 1;
            renderNotifications();
        });
    }

    // 2. Status Select Filter
    const statusSelect = document.getElementById("notifications-filter-status");
    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
            currentStatusFilter = e.target.value;
            currentPage = 1;
            renderNotifications();
        });
    }

    // 3. Category Select Filter
    const typeSelect = document.getElementById("notifications-filter-type");
    if (typeSelect) {
        typeSelect.addEventListener("change", (e) => {
            currentTypeFilter = e.target.value;
            currentPage = 1;
            renderNotifications();
        });
    }

    // 4. Interactive KPI Cards Click
    document.querySelectorAll(".notifications-panel--metrics .stat-card").forEach((card) => {
        card.addEventListener("click", () => {
            const filterVal = card.getAttribute("data-filter") || "all";
            currentStatusFilter = filterVal;
            currentPage = 1;
            if (statusSelect) {
                statusSelect.value = filterVal === "urgent" ? "all" : filterVal;
            }
            renderNotifications();
        });
    });

    // 5. Compose Modal Triggers
    document.getElementById("btn-compose-notification")?.addEventListener("click", openComposeModal);
    document.getElementById("compose-modal-close")?.addEventListener("click", closeComposeModal);
    document.getElementById("compose-modal-cancel")?.addEventListener("click", closeComposeModal);
    document.getElementById("compose-notification-form")?.addEventListener("submit", handleComposeSubmit);

    // Audience selection toggle in composer
    document.getElementById("compose-audience")?.addEventListener("change", (e) => {
        const val = e.target.value;
        const userWrap = document.getElementById("compose-user-wrap");
        const bgyWrap = document.getElementById("compose-barangay-wrap");
        if (userWrap) userWrap.style.display = val === "direct" ? "block" : "none";
        if (bgyWrap) bgyWrap.style.display = val === "direct" ? "none" : "block";
    });

    // Character counter for message body
    document.getElementById("compose-body")?.addEventListener("input", (e) => {
        const count = e.target.value.length;
        const countEl = document.getElementById("compose-char-count");
        if (countEl) countEl.textContent = String(count);
    });

    // 6. Detail Modal Close
    document.getElementById("detail-modal-close")?.addEventListener("click", closeDetailModal);
    document.getElementById("notification-detail-modal")?.addEventListener("click", (e) => {
        if (e.target.id === "notification-detail-modal") closeDetailModal();
    });
    document.getElementById("notification-compose-modal")?.addEventListener("click", (e) => {
        if (e.target.id === "notification-compose-modal") closeComposeModal();
    });

    // Detail Modal Actions
    document.getElementById("detail-modal-toggle-read")?.addEventListener("click", () => {
        if (currentDetailDoc) handleToggleRead(currentDetailDoc.id);
    });
    document.getElementById("detail-modal-archive")?.addEventListener("click", () => {
        if (currentDetailDoc) handleArchiveSingle(currentDetailDoc.id);
    });
    document.getElementById("detail-modal-delete")?.addEventListener("click", () => {
        if (currentDetailDoc) handleDeleteSingle(currentDetailDoc.id);
    });

    // 7. Mark All Read
    document.getElementById("btn-mark-all-read")?.addEventListener("click", handleMarkAllRead);

    // 8. Refresh Button
    const refreshBtn = document.getElementById("btn-notifications-refresh");
    const refreshIcon = document.getElementById("refresh-icon");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            if (refreshIcon) refreshIcon.classList.add("refresh-spin");
            refreshBtn.disabled = true;
            try {
                await loadNotificationsTable(true);
                toastSuccess("Alert feed refreshed");
            } catch (err) {
                toastError("Could not refresh alerts");
            } finally {
                if (refreshIcon) refreshIcon.classList.remove("refresh-spin");
                refreshBtn.disabled = false;
            }
        });
    }

    // 9. Batch Select Mode Toggle
    const selectModeBtn = document.getElementById("notifications-select-mode");
    const list = document.getElementById("notifications-list");
    if (selectModeBtn && list) {
        selectModeBtn.addEventListener("click", () => {
            const next = !list.classList.contains("notifications-list--selecting");
            list.classList.toggle("notifications-list--selecting", next);
            selectModeBtn.classList.toggle("notification-btn--active", next);
            selectModeBtn.setAttribute("aria-pressed", String(next));
            if (!next) {
                list.querySelectorAll(".notification-select").forEach((cb) => (cb.checked = false));
            }
            syncBulkControls();
        });
    }

    // 10. Select All Checkbox
    document.getElementById("notifications-select-all")?.addEventListener("change", (e) => {
        const checked = Boolean(e.target.checked);
        list?.querySelectorAll(".notification-select").forEach((cb) => {
            cb.checked = checked;
        });
        syncBulkControls();
    });

    // 11. Bulk Archive Selected
    document.getElementById("notifications-archive-selected")?.addEventListener("click", async () => {
        const ids = getSelectedIds();
        if (!ids.length) return;

        try {
            const batch = writeBatch(db);
            ids.forEach((id) => {
                batch.update(doc(db, "notifications", id), {
                    archivedAt: serverTimestamp(),
                });
            });
            await batch.commit();

            toastSuccess(`${ids.length} alert(s) archived`);
            allDocs = allDocs.filter((d) => !ids.includes(d.id));
            renderNotifications();
        } catch (err) {
            console.error("[notifications] bulk archive error", err);
            toastError("Could not archive selected alerts");
        }
    });

    // 12. Bulk Delete Selected
    document.getElementById("notifications-delete-selected")?.addEventListener("click", async () => {
        const ids = getSelectedIds();
        if (!ids.length) return;

        const ok = await confirmDanger({
            title: `Delete ${ids.length} alert(s)?`,
            text: "This will permanently remove the selected alerts.",
            confirmText: "Delete",
        });
        if (!ok) return;

        try {
            await Promise.all(ids.map((id) => deleteDoc(doc(db, "notifications", id))));
            toastSuccess(`${ids.length} alert(s) deleted`);
            allDocs = allDocs.filter((d) => !ids.includes(d.id));
            renderNotifications();
        } catch (err) {
            console.error("[notifications] bulk delete error", err);
            toastError("Could not delete selected alerts");
        }
    });

    // 13. Card Click Delegation
    list?.addEventListener("click", (e) => {
        // Individual checkbox change
        if (e.target.matches(".notification-select")) {
            syncBulkControls();
            return;
        }

        // Action button clicks inside card
        const actionBtn = e.target.closest("button[data-action]");
        const card = e.target.closest(".notification-card");
        const id = card?.getAttribute("data-notification-id");
        if (!id) return;

        const docSnap = allDocs.find((d) => d.id === id);

        if (actionBtn) {
            const action = actionBtn.getAttribute("data-action");
            if (action === "toggle-read") {
                handleToggleRead(id);
                return;
            }
            if (action === "view-detail" && docSnap) {
                openDetailModal(docSnap);
                return;
            }
            if (action === "delete") {
                handleDeleteSingle(id);
                return;
            }
        }

        // Clicking anywhere else on card opens detail modal
        if (docSnap && !e.target.closest(".notification-card__select")) {
            openDetailModal(docSnap);
        }
    });

    // 14. Pagination Navigation
    document.getElementById("notifications-pagination")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-page-action]");
        if (!btn || btn.disabled) return;
        const action = btn.getAttribute("data-page-action");
        const filtered = filterDocs();
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;

        if (action === "prev" && currentPage > 1) {
            currentPage -= 1;
            renderNotifications();
            document.getElementById("notifications-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (action === "next" && currentPage < totalPages) {
            currentPage += 1;
            renderNotifications();
            document.getElementById("notifications-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
}

/* ==========================================================================
   Main Data Fetcher
   ========================================================================== */
export async function loadNotificationsTable(isSilent = false) {
    const list = document.getElementById("notifications-list");
    const countMeta = document.getElementById("notifications-count");

    if (!isSilent && list && allDocs.length === 0) {
        list.innerHTML = `
            <div class="notifications-empty">
                <span class="material-symbols-outlined notifications-empty__icon refresh-spin">progress_activity</span>
                <p class="notifications-empty__title">Loading alerts…</p>
                <p class="notifications-empty__sub">Connecting to real-time notification stream…</p>
            </div>`;
    }
    if (!isSilent && countMeta && allDocs.length === 0) countMeta.textContent = "Connecting dispatches…";

    bindGlobalEvents();

    // Prevent duplicate listeners and memory leaks (Edge Case 3)
    if (typeof unsubscribeNotifications === "function") {
        unsubscribeNotifications();
        unsubscribeNotifications = null;
    }

    const q = query(
        collection(db, "notifications"),
        orderBy("sentAt", "desc"),
        limit(LIST_LIMIT),
    );

    const currentRole = getCurrentAdminRole();
    const adminBarangayId = getCurrentAdminBarangayId();

    unsubscribeNotifications = onSnapshot(
        q,
        (snap) => {
            // Edge Case 4: Preserve checked checkboxes during live snapshot updates
            const prevSelectedIds = new Set(getSelectedIds());

            allDocs = snap.docs.filter((docSnap) => {
                const d = docSnap.data();
                if (d?.archivedAt) return false;

                // Role-based notification filtering:
                const audience = String(d?.audience || "").toLowerCase().trim();
                if (audience === "police" && currentRole !== "police") return false;
                if (audience === "barangay" && currentRole === "police") return false;

                // Jurisdiction filtering for Barangay Admin
                if (currentRole !== "police" && adminBarangayId && d?.barangayId) {
                    if (String(d.barangayId).toLowerCase() !== adminBarangayId.toLowerCase()) return false;
                }

                return true;
            });

            renderNotifications();

            // Restore checkbox selection
            if (prevSelectedIds.size > 0) {
                list?.querySelectorAll(".notification-select").forEach((cb) => {
                    if (prevSelectedIds.has(cb.value)) {
                        cb.checked = true;
                    }
                });
                syncBulkControls();
            }

            // Keep open detail modal synced with live data
            if (currentDetailDoc) {
                const updatedDoc = allDocs.find((d) => d.id === currentDetailDoc.id);
                if (updatedDoc) {
                    currentDetailDoc = updatedDoc;
                    const d = updatedDoc.data() || {};
                    const isRead = Boolean(d.readAt);
                    const statEl = document.getElementById("detail-modal-status");
                    const toggleBtn = document.getElementById("detail-modal-toggle-text");
                    if (statEl) {
                        statEl.textContent = isRead
                            ? `Opened & Read (${formatFullPHT(d.readAt)})`
                            : "Not opened yet (Unread)";
                    }
                    if (toggleBtn) {
                        toggleBtn.textContent = isRead ? "Mark as Unread" : "Mark as Read";
                    }
                }
            }
        },
        (err) => {
            console.error("[notifications] real-time snapshot error", err);
            toastError("Real-time alert connection lost. Retrying…");
        }
    );
}

// Clean up listener when navigating away or closing window
window.addEventListener("beforeunload", () => {
    if (typeof unsubscribeNotifications === "function") {
        unsubscribeNotifications();
        unsubscribeNotifications = null;
    }
});
