import {
    collection,
    deleteDoc,
    deleteField,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { initAdminPage, getCurrentAdminRole, getCurrentAdminBarangayId } from "./admin-auth.js";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";
import { logAudit } from "./audit.js";
import { getBarangayNameById } from "../../shared/barangays.js";

const PAGE_SIZE = 10;

let deletedIncidents = [];
let deletedNotifications = [];
let allDeletedRecords = [];
let currentSearch = "";
let currentTypeFilter = "all";
let currentPage = 1;
let currentDetailItem = null;
let unsubscribeIncidents = null;
let unsubscribeNotifications = null;

/* ==========================================================================
   Human-Readable Code & User Resolvers (No Raw Hashes or UIDs)
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
    if (!userId || userId === "all" || userId === "broadcast") return "Public Citizen";
    if (userId === "police") return "Police Officers";
    let hash = 0;
    const s = String(userId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `User #${String(hash).padStart(4, "0")}`;
}

function humanizeType(type) {
    const val = String(type || "").toLowerCase();
    if (val.includes("sos")) return "Emergency SOS Alert";
    if (val.includes("fire")) return "Fire Alarm Incident";
    if (val.includes("medical") || val.includes("health")) return "Medical Emergency";
    if (val.includes("crime") || val.includes("theft")) return "Crime Incident";
    if (val.includes("response")) return "Police Response Notice";
    if (val.includes("resolved") || val.includes("done")) return "Resolved Report";
    if (val.includes("weather") || val.includes("hazard")) return "Weather Advisory";
    if (val.includes("broadcast")) return "Public Safety Notice";
    return "General Emergency Record";
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

function formatFullPHT(ts) {
    if (!ts) return "—";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "—";

    return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(d);
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
    return formatFullPHT(ts);
}

/* ==========================================================================
   Filter & Combine Engine
   ========================================================================== */
function combineAndSortRecords() {
    allDeletedRecords = [...deletedIncidents, ...deletedNotifications].sort((a, b) => {
        const timeA = a.deletedAt?.toMillis ? a.deletedAt.toMillis() : (a.deletedAt ? new Date(a.deletedAt).getTime() : 0);
        const timeB = b.deletedAt?.toMillis ? b.deletedAt.toMillis() : (b.deletedAt ? new Date(b.deletedAt).getTime() : 0);
        return timeB - timeA;
    });
}

function filterRecords() {
    return allDeletedRecords.filter((item) => {
        // 1. Type Filter
        if (currentTypeFilter !== "all" && item.recordType !== currentTypeFilter) {
            return false;
        }

        // 2. Search query filter
        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            const title = String(item.title || item.type || "").toLowerCase();
            const desc = String(item.description || item.body || "").toLowerCase();
            const user = String(item.userDisplay || "").toLowerCase();
            const code = String(item.code || "").toLowerCase();
            const bgy = String(item.barangayName || "").toLowerCase();

            const matches =
                title.includes(q) ||
                desc.includes(q) ||
                user.includes(q) ||
                code.includes(q) ||
                bgy.includes(q);

            if (!matches) return false;
        }

        return true;
    });
}

/* ==========================================================================
   DOM Render Engine
   ========================================================================== */
function updateTelemetryStats() {
    const totalEl = document.getElementById("stat-total-deleted");
    const incEl = document.getElementById("stat-deleted-incidents");
    const notifEl = document.getElementById("stat-deleted-notifications");

    if (totalEl) totalEl.textContent = String(allDeletedRecords.length);
    if (incEl) incEl.textContent = String(deletedIncidents.length);
    if (notifEl) notifEl.textContent = String(deletedNotifications.length);
}

function renderDeletedCards() {
    const container = document.getElementById("deleted-items-container");
    const countMeta = document.getElementById("deleted-count");
    const pagination = document.getElementById("deleted-pagination");
    const filterPill = document.getElementById("deleted-filter-pill");

    if (!container) return;

    updateTelemetryStats();

    const filtered = filterRecords();
    const totalCount = filtered.length;

    if (countMeta) {
        countMeta.textContent = `${totalCount} deleted item${totalCount === 1 ? "" : "s"}`;
    }

    if (filterPill) {
        filterPill.hidden = currentTypeFilter === "all" && !currentSearch;
    }

    if (totalCount === 0) {
        const isFiltering = currentTypeFilter !== "all" || Boolean(currentSearch);
        container.innerHTML = `
            <div class="notifications-empty">
                <span class="material-symbols-outlined notifications-empty__icon" style="color: #10b981;">verified_user</span>
                <p class="notifications-empty__title">
                    ${isFiltering ? "No matching deleted items found" : "No deleted items"}
                </p>
                <p class="notifications-empty__sub">
                    ${
                        isFiltering
                            ? "Try checking your search text or type filter."
                            : "All incident reports and alerts are currently active in the system."
                    }
                </p>
            </div>`;

        if (pagination) pagination.hidden = true;
        syncBulkControls();
        return;
    }

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, totalCount);
    const pageItems = filtered.slice(startIdx, endIdx);

    // Render cards
    container.innerHTML = pageItems
        .map((item) => {
            const isIncident = item.recordType === "incident";
            const typeLabel = isIncident ? "Incident Report" : "Notification Alert";
            const typeClass = isIncident ? "deleted-card--incident" : "deleted-card--notification";
            const pillClass = isIncident
                ? "deleted-card__type-pill--incident"
                : "deleted-card__type-pill--notification";
            const pillIcon = isIncident ? "emergency" : "notifications";

            return `
                <article
                    class="deleted-card ${typeClass}"
                    data-record-id="${escapeAttr(item.id)}"
                    data-record-type="${escapeAttr(item.recordType)}"
                >
                    <div class="deleted-card__header">
                        <div class="deleted-card__header-left">
                            <input
                                type="checkbox"
                                class="deleted-card__select"
                                value="${escapeAttr(item.compositeKey)}"
                                aria-label="Select item for recovery or purge"
                            />
                            <span class="deleted-card__type-pill ${pillClass}">
                                <span class="material-symbols-outlined" style="font-size: 13px;">${pillIcon}</span>
                                <span>${typeLabel}</span>
                            </span>
                            <span class="deleted-card__code">${escapeHtml(item.code)}</span>
                            <span class="deleted-card__deleted-time">
                                <span class="material-symbols-outlined">schedule</span>
                                <span>Deleted ${escapeHtml(formatRelative(item.deletedAt))}</span>
                            </span>
                        </div>
                    </div>

                    <div class="deleted-card__body-content">
                        <h3 class="deleted-card__title">${escapeHtml(item.title || humanizeType(item.type))}</h3>
                        <p class="deleted-card__summary">${escapeHtml(item.description || item.body || "No additional text provided.")}</p>
                    </div>

                    <div class="deleted-card__footer">
                        <div class="deleted-card__meta-pills">
                            <span class="deleted-meta-pill deleted-meta-pill--user" title="Citizen User ID">
                                <span class="material-symbols-outlined" style="font-size: 13px;">person</span>
                                <span>${escapeHtml(item.userDisplay)}</span>
                            </span>
                            ${
                                item.barangayName
                                    ? `<span class="deleted-meta-pill deleted-meta-pill--barangay">
                                        <span class="material-symbols-outlined" style="font-size: 13px;">location_on</span>
                                        <span>Barangay ${escapeHtml(item.barangayName)}</span>
                                       </span>`
                                    : ""
                            }
                        </div>

                        <div class="deleted-card__actions">
                            <button
                                type="button"
                                class="deleted-action-btn deleted-action-btn--ghost"
                                data-action="view-details"
                                title="View details"
                            >
                                <span class="material-symbols-outlined">visibility</span>
                                <span>View Details</span>
                            </button>
                            <button
                                type="button"
                                class="deleted-action-btn deleted-action-btn--restore"
                                data-action="restore"
                                title="Bring back to active list"
                            >
                                <span class="material-symbols-outlined">settings_backup_restore</span>
                                <span>Restore</span>
                            </button>
                            <button
                                type="button"
                                class="deleted-action-btn deleted-action-btn--danger"
                                data-action="purge"
                                title="Delete forever from database"
                            >
                                <span class="material-symbols-outlined">delete_forever</span>
                                <span>Delete Forever</span>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");

    // Update pagination controls
    if (pagination) {
        pagination.hidden = totalCount <= PAGE_SIZE;
        const pageInfo = document.getElementById("deleted-pagination-info");
        const pageCurrent = document.getElementById("deleted-pagination-current");
        const prevBtn = document.getElementById("btn-pagination-prev");
        const nextBtn = document.getElementById("btn-pagination-next");

        if (pageInfo) pageInfo.textContent = `Showing ${startIdx + 1}–${endIdx} of ${totalCount}`;
        if (pageCurrent) pageCurrent.textContent = `Page ${currentPage} of ${totalPages}`;
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }

    syncBulkControls();
}

/* ==========================================================================
   Bulk Selection Handling
   ========================================================================== */
function syncBulkControls() {
    const bulkBar = document.getElementById("deleted-bulk-bar");
    const selectAll = document.getElementById("deleted-select-all");
    const countEl = document.getElementById("deleted-selected-count");
    const container = document.getElementById("deleted-items-container");

    const checkboxes = Array.from(container?.querySelectorAll(".deleted-card__select") || []);
    const checked = checkboxes.filter((c) => c.checked);
    const count = checked.length;

    if (bulkBar) {
        bulkBar.hidden = count === 0;
    }

    if (countEl) {
        countEl.textContent = count > 0 ? `${count} selected` : "Select all";
    }

    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && count === checkboxes.length;
        selectAll.indeterminate = count > 0 && count < checkboxes.length;
    }
}

function getSelectedKeys() {
    const container = document.getElementById("deleted-items-container");
    return Array.from(container?.querySelectorAll(".deleted-card__select:checked") || [])
        .map((c) => c.value)
        .filter(Boolean);
}

/* ==========================================================================
   Restoration & Permanent Purge Actions
   ========================================================================== */
async function handleRestoreRecord(item) {
    const ok = await confirmDanger({
        title: "Restore this item?",
        text: `This will bring ${item.code} back to the live list right away.`,
        confirmText: "Restore",
    });
    if (!ok) return;

    try {
        const col = item.recordType === "incident" ? "incidents" : "notifications";
        const ref = doc(db, col, item.id);

        await updateDoc(ref, {
            isDeleted: deleteField(),
            deletedAt: deleteField(),
            deletedBy: deleteField(),
            deletedByEmail: deleteField(),
            restoredAt: serverTimestamp(),
            restoredBy: auth.currentUser?.uid || null,
        });

        try {
            await logAudit(`${item.recordType}_restored`, { id: item.id, code: item.code });
        } catch {}

        toastSuccess(`${item.code} is restored to the live list!`);
        closeDetailModal();
    } catch (err) {
        console.error("[recently-deleted] restore error", err);
        toastError(err?.message || "Could not restore this item. Please try again.");
    }
}

async function handlePurgeRecord(item) {
    const ok = await confirmDanger({
        title: "Delete this item forever?",
        text: `Are you sure? This will delete ${item.code} forever from the database. You will not be able to get it back.`,
        confirmText: "Delete Forever",
    });
    if (!ok) return;

    try {
        const col = item.recordType === "incident" ? "incidents" : "notifications";
        const ref = doc(db, col, item.id);

        await deleteDoc(ref);

        // [QA-FIX #6] Purging an incident also removes its evidence photo doc
        // (incident_evidence/{id}). Best effort; a missing doc is fine.
        if (item.recordType === "incident") {
            try {
                await deleteDoc(doc(db, "incident_evidence", item.id));
            } catch (evidenceErr) {
                console.warn("[recently-deleted] evidence cleanup skipped", evidenceErr);
            }
        }

        try {
            await logAudit(`${item.recordType}_permanently_purged`, { id: item.id, code: item.code });
        } catch {}

        toastSuccess(`${item.code} was deleted forever.`);
        closeDetailModal();
    } catch (err) {
        console.error("[recently-deleted] purge error", err);
        toastError(err?.message || "Could not delete this item. Please try again.");
    }
}

async function handleBulkRestore() {
    const keys = getSelectedKeys();
    if (!keys.length) return;

    const ok = await confirmDanger({
        title: `Restore ${keys.length} selected item(s)?`,
        text: "The selected items will be brought back to the live list.",
        confirmText: "Restore Selected",
    });
    if (!ok) return;

    try {
        const batch = writeBatch(db);
        const uid = auth.currentUser?.uid || null;

        keys.forEach((key) => {
            const [type, id] = key.split(":");
            const col = type === "incident" ? "incidents" : "notifications";
            batch.update(doc(db, col, id), {
                isDeleted: deleteField(),
                deletedAt: deleteField(),
                deletedBy: deleteField(),
                deletedByEmail: deleteField(),
                restoredAt: serverTimestamp(),
                restoredBy: uid,
            });
        });

        await batch.commit();

        try {
            await logAudit("records_bulk_restored", { count: keys.length, keys });
        } catch {}

        toastSuccess(`${keys.length} item(s) restored!`);
    } catch (err) {
        console.error("[recently-deleted] bulk restore error", err);
        toastError("Could not restore selected items.");
    }
}

async function handleBulkPurge() {
    const keys = getSelectedKeys();
    if (!keys.length) return;

    const ok = await confirmDanger({
        title: `Delete ${keys.length} selected item(s) forever?`,
        text: "Are you sure? This will delete the selected items forever from the database. You will not be able to get them back.",
        confirmText: "Delete Forever",
    });
    if (!ok) return;

    try {
        const batch = writeBatch(db);

        keys.forEach((key) => {
            const [type, id] = key.split(":");
            const col = type === "incident" ? "incidents" : "notifications";
            batch.delete(doc(db, col, id));
        });

        await batch.commit();

        try {
            await logAudit("records_bulk_permanently_purged", { count: keys.length, keys });
        } catch {}

        toastSuccess(`${keys.length} item(s) deleted forever.`);
    } catch (err) {
        console.error("[recently-deleted] bulk purge error", err);
        toastError("Could not delete selected items.");
    }
}

/* ==========================================================================
   Detail Modal Handling
   ========================================================================== */
function openDetailModal(item) {
    currentDetailItem = item;
    const modal = document.getElementById("deleted-detail-modal");
    if (!modal) return;

    const typeEl = document.getElementById("detail-record-type");
    const refEl = document.getElementById("detail-ref-code");
    const userEl = document.getElementById("detail-user-id");
    const bgyEl = document.getElementById("detail-barangay");
    const timeEl = document.getElementById("detail-deleted-at");
    const byEl = document.getElementById("detail-deleted-by");
    const headEl = document.getElementById("detail-headline");
    const bodyEl = document.getElementById("detail-body");
    const locWrap = document.getElementById("detail-location-wrap");
    const locText = document.getElementById("detail-location-text");

    if (typeEl) typeEl.textContent = item.recordType === "incident" ? "Incident Report" : "Notification Alert";
    if (refEl) refEl.textContent = item.code;
    if (userEl) userEl.textContent = item.userDisplay;
    if (bgyEl) bgyEl.textContent = item.barangayName ? `Barangay ${item.barangayName}` : "All Barangays";
    if (timeEl) timeEl.textContent = `${formatFullPHT(item.deletedAt)} (${formatRelative(item.deletedAt)})`;
    if (byEl) byEl.textContent = item.deletedByEmail || item.deletedBy || "System Admin";
    if (headEl) headEl.textContent = item.title || humanizeType(item.type);
    if (bodyEl) bodyEl.textContent = item.description || item.body || "No text description.";

    if (locWrap && locText) {
        if (item.location && item.location.latitude && item.location.longitude) {
            locWrap.style.display = "block";
            locText.textContent = `Lat: ${item.location.latitude}, Lng: ${item.location.longitude}`;
        } else {
            locWrap.style.display = "none";
        }
    }

    modal.hidden = false;
}

function closeDetailModal() {
    const modal = document.getElementById("deleted-detail-modal");
    if (modal) modal.hidden = true;
    currentDetailItem = null;
}

/* ==========================================================================
   Event Listeners & Toolbar Setup
   ========================================================================== */
function bindEvents() {
    // 1. Search input
    const searchInput = document.getElementById("deleted-search");
    const searchClear = document.getElementById("deleted-search-clear");
    let searchDebounce = null;

    searchInput?.addEventListener("input", (e) => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            currentSearch = e.target.value.trim();
            currentPage = 1;
            renderDeletedCards();
        }, 150);
    });

    searchClear?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        currentSearch = "";
        currentPage = 1;
        renderDeletedCards();
    });

    // 2. Type Filter Select
    const typeSelect = document.getElementById("deleted-type-filter");
    typeSelect?.addEventListener("change", (e) => {
        currentTypeFilter = e.target.value;
        currentPage = 1;
        syncFilterChips();
        renderDeletedCards();
    });

    // 3. Stat Cards as Quick Filter Chips (with mouse & keyboard navigation)
    const statCards = [
        { id: "card-stat-total", type: "all" },
        { id: "card-stat-incidents", type: "incident" },
        { id: "card-stat-notifications", type: "notification" },
    ];
    statCards.forEach(({ id, type }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", () => {
            setQuickFilter(type);
        });
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setQuickFilter(type);
            }
        });
    });

    // 4. Refresh Button
    const refreshBtn = document.getElementById("btn-refresh-vault");
    refreshBtn?.addEventListener("click", () => {
        refreshBtn.classList.add("is-refreshing");
        setTimeout(() => {
            refreshBtn.classList.remove("is-refreshing");
        }, 550);
        toastSuccess("List refreshed");
        renderDeletedCards();
    });

    // 5. Select All checkbox
    document.getElementById("deleted-select-all")?.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        const container = document.getElementById("deleted-items-container");
        container?.querySelectorAll(".deleted-card__select").forEach((cb) => {
            cb.checked = isChecked;
        });
        syncBulkControls();
    });

    // 6. Bulk action buttons
    document.getElementById("btn-bulk-restore")?.addEventListener("click", handleBulkRestore);
    document.getElementById("btn-bulk-purge")?.addEventListener("click", handleBulkPurge);

    // 7. Pagination Buttons
    document.getElementById("btn-pagination-prev")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            renderDeletedCards();
            document.getElementById("deleted-items-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    document.getElementById("btn-pagination-next")?.addEventListener("click", () => {
        const totalCount = filterRecords().length;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage += 1;
            renderDeletedCards();
            document.getElementById("deleted-items-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    // 8. Card click delegation & Action Buttons
    const container = document.getElementById("deleted-items-container");
    container?.addEventListener("click", (e) => {
        // A. If clicking directly on a checkbox, update bulk bar and stop
        if (e.target.matches(".deleted-card__select")) {
            syncBulkControls();
            return;
        }

        // B. Action buttons (View Details, Restore, Delete Forever)
        const actionBtn = e.target.closest("button[data-action]");
        if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();

            const card = actionBtn.closest(".deleted-card");
            if (!card) return;

            const id = card.getAttribute("data-record-id");
            const type = card.getAttribute("data-record-type");
            const item = allDeletedRecords.find((r) => r.id === id && r.recordType === type);
            if (!item) return;

            const action = actionBtn.getAttribute("data-action");
            if (action === "restore") {
                handleRestoreRecord(item);
            } else if (action === "purge") {
                handlePurgeRecord(item);
            } else if (action === "view-details") {
                openDetailModal(item);
            }
            return;
        }

        // C. Clicking card body opens inspector modal
        const card = e.target.closest(".deleted-card");
        if (!card) return;

        const id = card.getAttribute("data-record-id");
        const type = card.getAttribute("data-record-type");
        const item = allDeletedRecords.find((r) => r.id === id && r.recordType === type);
        if (item) {
            openDetailModal(item);
        }
    });

    // Also listen to change event on container for checkboxes
    container?.addEventListener("change", (e) => {
        if (e.target.matches(".deleted-card__select")) {
            syncBulkControls();
        }
    });

    // 9. Modal close triggers
    document.querySelectorAll("[data-close-modal]").forEach((el) => {
        el.addEventListener("click", closeDetailModal);
    });

    const modal = document.getElementById("deleted-detail-modal");
    modal?.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeDetailModal();
        }
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal && !modal.hidden) {
            closeDetailModal();
        }
    });

    // 10. Modal action buttons
    document.getElementById("detail-btn-restore")?.addEventListener("click", () => {
        if (currentDetailItem) handleRestoreRecord(currentDetailItem);
    });

    document.getElementById("detail-btn-purge")?.addEventListener("click", () => {
        if (currentDetailItem) handlePurgeRecord(currentDetailItem);
    });
}

function setQuickFilter(type) {
    currentTypeFilter = type;
    const typeSelect = document.getElementById("deleted-type-filter");
    if (typeSelect) typeSelect.value = type;
    syncFilterChips();
    currentPage = 1;
    renderDeletedCards();
}

function syncFilterChips() {
    document.querySelectorAll(".stat-card[data-filter-type]").forEach((card) => {
        const filterVal = card.getAttribute("data-filter-type");
        card.classList.toggle("stat-card--active", filterVal === currentTypeFilter);
    });
}

/* ==========================================================================
   Real-Time Data Streaming
   ========================================================================== */
function initRealtimeListeners() {
    // 1. Incidents Listener
    const incQuery = query(
        collection(db, "incidents"),
        where("isDeleted", "==", true),
    );

    unsubscribeIncidents = onSnapshot(
        incQuery,
        (snapshot) => {
            deletedIncidents = snapshot.docs.map((docSnap) => {
                const data = docSnap.data() || {};
                const bgyName = data.barangayName || (data.barangayId ? getBarangayNameById(data.barangayId) : "");
                return {
                    id: docSnap.id,
                    compositeKey: `incident:${docSnap.id}`,
                    recordType: "incident",
                    code: formatIncidentCode(docSnap.id),
                    userDisplay: formatUserSystemId(data.userId || data.reportedBy),
                    title: data.title || data.category || humanizeType(data.type),
                    description: data.description || data.details || "",
                    type: data.type || "incident",
                    barangayName: bgyName,
                    location: data.location || null,
                    deletedAt: data.deletedAt || data.timestamp || null,
                    deletedBy: data.deletedBy || null,
                    deletedByEmail: data.deletedByEmail || null,
                    raw: data,
                };
            });
            combineAndSortRecords();
            renderDeletedCards();
        },
        (err) => {
            console.error("[recently-deleted] incident snapshot error", err);
        },
    );

    // 2. Notifications Listener
    const notifQuery = query(
        collection(db, "notifications"),
        where("isDeleted", "==", true),
    );

    unsubscribeNotifications = onSnapshot(
        notifQuery,
        (snapshot) => {
            deletedNotifications = snapshot.docs.map((docSnap) => {
                const data = docSnap.data() || {};
                const bgyName = data.barangayName || (data.barangayId ? getBarangayNameById(data.barangayId) : "");
                return {
                    id: docSnap.id,
                    compositeKey: `notification:${docSnap.id}`,
                    recordType: "notification",
                    code: formatIncidentCode(docSnap.id),
                    userDisplay: formatUserSystemId(data.userId),
                    title: data.title || "Dispatched Notification Alert",
                    description: data.body || "",
                    type: data.type || "notification",
                    barangayName: bgyName,
                    deletedAt: data.deletedAt || data.sentAt || null,
                    deletedBy: data.deletedBy || null,
                    deletedByEmail: data.deletedByEmail || null,
                    raw: data,
                };
            });
            combineAndSortRecords();
            renderDeletedCards();
        },
        (err) => {
            console.error("[recently-deleted] notification snapshot error", err);
        },
    );
}

/* ==========================================================================
   Page Initialization
   ========================================================================== */
initAdminPage({
    pageId: "page-recently-deleted",
    async onReady() {
        bindEvents();
        initRealtimeListeners();
    },
});

window.addEventListener("beforeunload", () => {
    if (typeof unsubscribeIncidents === "function") unsubscribeIncidents();
    if (typeof unsubscribeNotifications === "function") unsubscribeNotifications();
});
