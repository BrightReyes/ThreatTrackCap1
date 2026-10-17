import {
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
} from "firebase/auth";
import primaryApp, { db } from "../../shared/firebase.js";
import { toastError, toastSuccess } from "./alerts.js";
import { getBarangayNameById } from "../../shared/barangays.js";
import { getSubstationNameById } from "../../shared/substations.js";

const LIST_LIMIT = 200;
const EDIT_ROLES_FOR_CREATE = ["user", "admin", "police", "head_police"];
const EDIT_STATUSES_FOR_CREATE = ["active", "inactive", "suspended"];
const MIN_PASSWORD_LENGTH = 6;
const PAGE_SIZE = 15;

/** @type {import('firebase/firestore').QueryDocumentSnapshot[]} */
let allDocs = [];
let usersRealtimeUnsub = null;
let toolbarBound = false;
let addUserBound = false;
let searchDebounceTimer = null;
let currentPage = 1;
let activeQuickFilter = "all";

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

function formatJoined(data) {
    const ts = data.createdAt;
    if (ts && typeof ts.toDate === "function") {
        try {
            return ts.toDate().toLocaleDateString(undefined, {
                dateStyle: "short",
            });
        } catch {
            return "—";
        }
    }
    return "—";
}

function formatDateTime(ts) {
    if (ts && typeof ts.toDate === "function") {
        try {
            return ts.toDate().toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            });
        } catch {
            return "—";
        }
    }
    if (typeof ts === "string" && ts) {
        const parsed = new Date(ts);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            });
        }
    }
    return "—";
}

function displayName(d) {
    const fn = (d.firstName || "").trim();
    const ln = (d.lastName || "").trim();
    const parts = [fn, ln].filter(Boolean);
    return parts.length ? parts.join(" ") : "—";
}

function roleBadgeClass(role) {
    const r = normalizeRole(role);
    if (r === "admin") return "incidents-badge incidents-badge--role-admin";
    if (r === "police" || r === "head_police") return "incidents-badge incidents-badge--role-police";
    return "incidents-badge incidents-badge--role-user";
}

function humanizeRole(role) {
    const normalized = normalizeRole(role);
    if (normalized === "admin") return "Barangay Admin";
    if (normalized === "police") return "Police Admin";
    if (normalized === "head_police") return "Head Police Admin";
    return String(normalized)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function userStatus(data) {
    const raw = String(data.status || "").trim().toLowerCase();
    if (raw) return raw;
    if (data.disabled === true) return "inactive";
    if (data.suspended === true) return "suspended";
    return "active";
}

function statusBadgeClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active") return "users-status users-status--active";
    if (s === "suspended") return "users-status users-status--suspended";
    return "users-status users-status--inactive";
}

function humanizeStatus(status) {
    return String(status || "inactive")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeRole(role) {
    const value = String(role || "user")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (["moderator", "barangay", "barangay_admin"].includes(value)) {
        return "admin";
    }
    if (["head_police", "head_police_admin", "police_head"].includes(value)) {
        return "head_police";
    }
    if (value === "police_admin") return "police";
    return value;
}

function norm(s) {
    return String(s ?? "")
        .toLowerCase()
        .trim();
}

export function isUserVerified(d) {
    if (!d) return false;
    return Boolean(
        d.isVerified === true ||
        d.emailVerified === true ||
        String(d.verificationStatus || "").toLowerCase() === "approved",
    );
}

export function verifiedBadgeHtml(isVerified) {
    if (isVerified) {
        return `<span class="users-verified-badge users-verified-badge--yes" title="Verified Gmail (Can send reports)"><span class="material-symbols-outlined" aria-hidden="true">verified</span>Verified</span>`;
    }
    return `<span class="users-verified-badge users-verified-badge--no" title="Unverified Gmail"><span class="material-symbols-outlined" aria-hidden="true">help_outline</span>Unverified</span>`;
}

export function formatUserSystemId(userId) {
    if (!userId) return "";
    let hash = 0;
    const s = String(userId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `#${String(hash).padStart(4, "0")}`;
}

function buildRow(docSnap, index) {
    const id = docSnap.id;
    const d = docSnap.data();
    const email = d.email || "—";
    const name = displayName(d);
    const baseRole = humanizeRole(d.role);
    const assignedLocation =
        d.role === "admin" && (d.barangayName || d.barangayId)
            ? ` (${getBarangayNameById(d.barangayId) || d.barangayName})`
            : d.role === "police" && (d.substationName || d.substationId)
            ? ` (${getSubstationNameById(d.substationId) || d.substationName})`
            : d.role === "head_police"
            ? " (HQ Command)"
            : "";
    const fullRole = `${baseRole}${assignedLocation}`;
    const roleLabel = baseRole;
    const joined = formatJoined(d);
    const status = userStatus(d);
    const isVerified = isUserVerified(d);
    const isCitizen = normalizeRole(d.role) === "user";
    const verifiedCell = isCitizen
        ? verifiedBadgeHtml(isVerified)
        : '<span style="color: #94a3b8; font-weight: 500;">—</span>';

    return `<tr class="incidents-table__row--clickable" data-user-id="${escapeAttr(id)}" tabindex="0" role="button" aria-label="View profile for ${escapeAttr(name)}">
    <td class="users-table__index">${index + 1}</td>
    <td class="users-table__name">
      <div class="users-table__name-wrap">
        <span>${escapeHtml(name)}</span>
        <span class="users-table__sys-id" title="System ID for incident cross-referencing">${escapeHtml(formatUserSystemId(id))}</span>
      </div>
    </td>
    <td class="incidents-table__desc" title="${escapeAttr(email)}">${escapeHtml(email)}</td>
    <td><span class="${roleBadgeClass(d.role)}" title="${escapeAttr(fullRole)}">${escapeHtml(roleLabel)}</span></td>
    <td>${verifiedCell}</td>
    <td><span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span></td>
    <td style="text-align: right;">
      <button type="button" class="users-more-btn" title="View profile" aria-label="View profile for ${escapeAttr(name)}">
        <span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>
      </button>
    </td>
  </tr>`;
}

function docMatchesSearch(docSnap, q) {
    if (!q) return true;
    const d = docSnap.data();
    const email = norm(d.email);
    const fn = norm(d.firstName);
    const ln = norm(d.lastName);
    const full = norm(`${d.firstName || ""} ${d.lastName || ""}`);
    const uid = norm(docSnap.id);
    const sysId = norm(formatUserSystemId(docSnap.id));
    const sysDigits = sysId.replace("#", "");
    return (
        email.includes(q) ||
        fn.includes(q) ||
        ln.includes(q) ||
        full.includes(q) ||
        uid.includes(q) ||
        sysId.includes(q) ||
        sysDigits.includes(q)
    );
}

function docMatchesRole(docSnap, roleVal) {
    if (!roleVal || roleVal === "all") return true;
    const r = norm(normalizeRole(docSnap.data().role || "user"));
    return r === norm(roleVal);
}

function docMatchesStatus(docSnap, statusVal) {
    if (!statusVal || statusVal === "all") return true;
    const s = userStatus(docSnap.data());
    return s === norm(statusVal);
}

function docMatchesQuickFilter(docSnap, filterVal) {
    if (!filterVal || filterVal === "all") return true;
    const r = normalizeRole(docSnap.data().role || "user");
    if (filterVal === "admin") return r === "admin";
    if (filterVal === "police") return r === "police" || r === "head_police";
    if (filterVal === "user") return r === "user";
    return true;
}

function getFilterValues() {
    const searchEl = document.getElementById("users-search");
    const roleEl = document.getElementById("users-filter-role");
    const statusEl = document.getElementById("users-filter-status");
    return {
        search: norm(searchEl?.value || ""),
        role: roleEl?.value || "all",
        status: statusEl?.value || "all",
    };
}

function filterDocs() {
    const { search, role, status } = getFilterValues();
    return allDocs.filter(
        (docSnap) =>
            docMatchesSearch(docSnap, search) &&
            docMatchesRole(docSnap, role) &&
            docMatchesStatus(docSnap, status) &&
            docMatchesQuickFilter(docSnap, activeQuickFilter),
    );
}

function updateUserStats() {
    const totalEl = document.getElementById("users-stat-total");
    const adminEl = document.getElementById("users-stat-admin");
    const policeEl = document.getElementById("users-stat-police");
    const usersEl = document.getElementById("users-stat-users");
    const counts = allDocs.reduce(
        (acc, docSnap) => {
            const role = normalizeRole(docSnap.data().role);
            acc.total += 1;
            if (role === "admin") acc.admin += 1;
            else if (role === "police" || role === "head_police") acc.police += 1;
            else acc.users += 1;
            return acc;
        },
        { total: 0, admin: 0, police: 0, users: 0, pending: 0 },
    );

    if (totalEl) totalEl.textContent = String(counts.total);
    if (adminEl) adminEl.textContent = String(counts.admin);
    if (policeEl) policeEl.textContent = String(counts.police);
    if (usersEl) usersEl.textContent = String(counts.users);
}

function populateRoleSelect() {
    const roleSel = document.getElementById("users-filter-role");
    if (!roleSel) return;

    const current = roleSel.value;
    const roles = new Set();
    allDocs.forEach((docSnap) => {
        const r = docSnap.data().role;
        roles.add(normalizeRole(r));
    });

    const order = ["admin", "police", "user"];
    const sorted = [...roles].sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    roleSel.innerHTML =
        '<option value="all">All roles</option>' +
        sorted
            .map(
                (r) =>
                    `<option value="${escapeAttr(r)}">${escapeHtml(humanizeRole(r))}</option>`,
            )
            .join("");

    if ([...roleSel.options].some((o) => o.value === current)) {
        roleSel.value = current;
    }
}

function syncFilterUI() {
    // Stat cards highlight
    const cardTotal = document.getElementById("card-stat-total");
    const cardAdmin = document.getElementById("card-stat-admin");
    const cardPolice = document.getElementById("card-stat-police");
    const cardUsers = document.getElementById("card-stat-users");

    cardTotal?.classList.toggle("stat-card--filter-active", activeQuickFilter === "all");
    cardAdmin?.classList.toggle("stat-card--filter-active-high", activeQuickFilter === "admin");
    cardPolice?.classList.toggle("stat-card--filter-active-pending", activeQuickFilter === "police");
    cardUsers?.classList.toggle("stat-card--filter-active-resolved", activeQuickFilter === "user");

    // Update filter pill in table header
    const filterPill = document.getElementById("users-filter-pill");
    const searchEl = document.getElementById("users-search");
    const roleEl = document.getElementById("users-filter-role");
    const statusEl = document.getElementById("users-filter-status");
    const isFiltered =
        activeQuickFilter !== "all" ||
        Boolean(searchEl?.value?.trim()) ||
        (roleEl && roleEl.value !== "all") ||
        (statusEl && statusEl.value !== "all");

    if (filterPill) {
        filterPill.hidden = !isFiltered;
        if (activeQuickFilter !== "all") {
            const labels = {
                admin: "Barangay Admins",
                police: "Police Admins",
                user: "Citizen Users",
            };
            filterPill.textContent = labels[activeQuickFilter] || "Filtered";
        } else {
            filterPill.textContent = "Filtered";
        }
    }

    // Update search clear button
    const searchClear = document.getElementById("users-search-clear");
    if (searchClear && searchEl) {
        searchClear.hidden = !searchEl.value.trim();
    }
}

function clampPage(page, totalPages) {
    return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function renderPagination(totalItems, totalPages) {
    const pagination = document.getElementById("users-pagination");
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
        <p class="incidents-pagination__meta">Showing ${start}-${end} of ${totalItems}</p>
        <div class="incidents-pagination__actions">
            <button type="button" class="incidents-pagination__btn" data-page-action="prev"${currentPage === 1 ? " disabled" : ""}>Previous</button>
            <span class="incidents-pagination__page">Page ${currentPage} of ${totalPages}</span>
            <button type="button" class="incidents-pagination__btn" data-page-action="next"${currentPage === totalPages ? " disabled" : ""}>Next</button>
        </div>
    `;
}

function renderFilteredTable() {
    const tbody = document.getElementById("users-tbody");
    const meta = document.getElementById("users-count");
    if (!tbody) return;

    syncFilterUI();

    const filtered = filterDocs();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    currentPage = clampPage(currentPage, totalPages);

    if (!allDocs.length) {
        tbody.innerHTML =
            '<tr class="incidents-table__empty"><td colspan="7">No users registered yet.</td></tr>';
        if (meta) meta.textContent = "0 users";
        renderPagination(0, 1);
        return;
    }

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr class="incidents-table__empty">
                <td colspan="7">
                    <div style="padding: 28px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="font-size: 38px; color: #94a3b8;">person_search</span>
                        <div style="font-size: 0.96rem; font-weight: 750; color: #334155;">No users match your search or filters</div>
                        <p style="margin: 0; font-size: 0.82rem; color: #64748b;">Try adjusting your keywords, changing role/status, or resetting filters.</p>
                        <button type="button" id="users-empty-reset" class="incidents-filter-reset" style="margin-top: 8px;">
                            <span class="material-symbols-outlined" style="font-size: 15px;">restart_alt</span>
                            <span>Reset all filters</span>
                        </button>
                    </div>
                </td>
            </tr>`;
        if (meta) {
            meta.textContent = `0 of ${allDocs.length} shown (filtered)`;
        }
        renderPagination(0, 1);
        return;
    }

    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageDocs = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    tbody.innerHTML = pageDocs
        .map((docSnap, index) => buildRow(docSnap, pageStart + index))
        .join("");

    renderPagination(filtered.length, totalPages);

    if (meta) {
        const total = allDocs.length;
        const shown = pageDocs.length;
        const suffix =
            filtered.length < total
                ? ` (${filtered.length} of ${total} filtered)`
                : ` (${total} loaded)`;
        meta.textContent =
            `${shown} user${shown === 1 ? "" : "s"}${suffix}` +
            (total >= LIST_LIMIT ? ` — max ${LIST_LIMIT} loaded` : "");
    }
}

function verificationStatus(data) {
    return String(data.status || "pending").toLowerCase();
}

function getVerificationUser(id) {
    return verificationUsers.get(id) || null;
}

function buildVerificationCard(docSnap) {
    const id = docSnap.id;
    const data = docSnap.data();
    const user = getVerificationUser(id);
    const name = user ? displayName(user) : "Unmatched user";
    const email = data.email || user?.email || "—";
    const phone = user?.phoneNumber || "—";
    const barangay = user?.barangay || "—";
    const submitted = formatDateTime(data.submittedAt);
    const status = humanizeStatus(verificationStatus(data));
    const idImageUrl = data.idImageUrl || "";
    const selfieImageUrl = data.selfieImageUrl || "";

    return `<article class="users-verification-card" data-verification-user-id="${escapeAttr(id)}">
    <div class="users-verification-card__main">
      <div class="users-verification-card__top">
        <div>
          <h3 class="users-verification-card__name">${escapeHtml(name)}</h3>
          <p class="users-verification-card__email">${escapeHtml(email)}</p>
        </div>
        <span class="users-status users-status--pending">${escapeHtml(status)}</span>
      </div>
      <div class="users-verification-card__grid">
        <div class="users-verification-field">
          <span>ID type</span>
          <strong title="${escapeAttr(data.idType || "—")}">${escapeHtml(data.idType || "—")}</strong>
        </div>
        <div class="users-verification-field">
          <span>Barangay</span>
          <strong title="${escapeAttr(barangay)}">${escapeHtml(barangay)}</strong>
        </div>
        <div class="users-verification-field">
          <span>Phone</span>
          <strong title="${escapeAttr(phone)}">${escapeHtml(phone)}</strong>
        </div>
        <div class="users-verification-field">
          <span>Submitted</span>
          <strong title="${escapeAttr(submitted)}">${escapeHtml(submitted)}</strong>
        </div>
        <div class="users-verification-field">
          <span>User ID</span>
          <strong title="${escapeAttr(id)}">${escapeHtml(id)}</strong>
        </div>
        <div class="users-verification-field">
          <span>Consent</span>
          <strong>${data.consentAccepted === true ? "Accepted" : "Missing"}</strong>
        </div>
      </div>
      <div class="users-verification-card__links">
        ${
            idImageUrl
                ? `<a class="users-verification-link" href="${escapeAttr(idImageUrl)}" target="_blank" rel="noopener noreferrer">
            <span class="material-symbols-outlined" aria-hidden="true">badge</span>
            View valid ID
          </a>`
                : ""
        }
        ${
            selfieImageUrl
                ? `<a class="users-verification-link" href="${escapeAttr(selfieImageUrl)}" target="_blank" rel="noopener noreferrer">
            <span class="material-symbols-outlined" aria-hidden="true">face</span>
            View selfie
          </a>`
                : ""
        }
      </div>
    </div>
    <div class="users-verification-card__actions">
      <button type="button" class="users-verification-btn users-verification-btn--approve" data-verification-action="approve" data-user-id="${escapeAttr(id)}">
        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        Approve
      </button>
      <button type="button" class="users-verification-btn users-verification-btn--reject" data-verification-action="reject" data-user-id="${escapeAttr(id)}">
        <span class="material-symbols-outlined" aria-hidden="true">cancel</span>
        Reject
      </button>
    </div>
  </article>`;
}

function renderVerificationList() {
    const list = document.getElementById("users-verification-list");
    const meta = document.getElementById("users-verification-count");
    if (!list) return;

    if (verificationLoadError) {
        if (meta) meta.textContent = "Verification queue unavailable";
        list.innerHTML = `<div class="users-verification-empty">${escapeHtml(
            verificationLoadError,
        )}</div>`;
        return;
    }

    const pending = verificationDocs.filter((docSnap) => {
        const status = verificationStatus(docSnap.data());
        const user = getVerificationUser(docSnap.id);
        return (
            status === "pending" ||
            userStatus(user || {}) === "pending_verification"
        );
    });

    if (meta) {
        meta.textContent = `${pending.length} account${pending.length === 1 ? "" : "s"} waiting`;
    }

    if (!pending.length) {
        list.innerHTML =
            '<div class="users-verification-empty">No accounts are waiting for verification.</div>';
        return;
    }

    list.innerHTML = pending
        .map((docSnap) => buildVerificationCard(docSnap))
        .join("");
}

async function setVerificationDecision(userId, decision) {
    const isApprove = decision === "approve";
    const reason = isApprove
        ? ""
        : window.prompt(
              "Reason for rejection:",
              "ID photo is unclear or does not match the profile.",
          );

    if (!isApprove && reason === null) return;

    const buttons = [
        ...document.querySelectorAll(
            `[data-user-id="${CSS.escape(userId)}"][data-verification-action]`,
        ),
    ];
    buttons.forEach((btn) => {
        btn.disabled = true;
    });

    try {
        await updateDoc(doc(db, "userVerifications", userId), {
            status: isApprove ? "approved" : "rejected",
            reviewedAt: serverTimestamp(),
            rejectionReason: reason || "",
        });

        await updateDoc(doc(db, "users", userId), {
            accountStatus: isApprove ? "active" : "rejected",
            verificationStatus: isApprove ? "approved" : "rejected",
            isVerified: isApprove,
            emailVerified: isApprove,
            falseReportAcknowledged: isApprove ? true : false,
            falseReportAcknowledgedAt: serverTimestamp(),
            verificationReviewedAt: serverTimestamp(),
            rejectionReason: reason || "",
            status: isApprove ? "active" : "inactive",
        });

        toastSuccess(isApprove ? "Account approved" : "Verification rejected");
        await loadUsersTable();
    } catch (err) {
        console.error("[users] verification decision", err);
        toastError(err?.message || "Failed to update verification");
        buttons.forEach((btn) => {
            btn.disabled = false;
        });
    }
}

function bindVerificationActions() {
    if (verificationActionsBound) return;
    verificationActionsBound = true;

    document.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-verification-action]");
        if (!btn) return;

        const userId = btn.dataset.userId;
        const action = btn.dataset.verificationAction;
        if (!userId || !["approve", "reject"].includes(action)) return;

        setVerificationDecision(userId, action);
    });
}

function bindToolbar() {
    if (toolbarBound) return;
    toolbarBound = true;

    const searchEl = document.getElementById("users-search");
    const searchClear = document.getElementById("users-search-clear");
    const roleEl = document.getElementById("users-filter-role");
    const statusEl = document.getElementById("users-filter-status");
    const resetBtn = document.getElementById("users-filter-reset");

    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get("search");
    if (searchParam && searchEl) {
        searchEl.value = searchParam;
    }

    const rerender = () => {
        currentPage = 1;
        renderFilteredTable();
    };

    searchEl?.addEventListener("input", () => {
        if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = window.setTimeout(rerender, 200);
    });
    searchEl?.addEventListener("search", rerender);

    searchClear?.addEventListener("click", () => {
        if (searchEl) {
            searchEl.value = "";
            searchEl.focus();
        }
        rerender();
    });

    roleEl?.addEventListener("change", rerender);
    statusEl?.addEventListener("change", rerender);

    const resetAllFilters = () => {
        if (searchEl) searchEl.value = "";
        if (roleEl) roleEl.value = "all";
        if (statusEl) statusEl.value = "all";
        activeQuickFilter = "all";
        rerender();
    };

    resetBtn?.addEventListener("click", resetAllFilters);

    // Empty state reset button click
    document.getElementById("users-tbody")?.addEventListener("click", (e) => {
        if (e.target.closest("#users-empty-reset")) {
            resetAllFilters();
        }
    });

    // Stat card click to quick-filter
    document.querySelector(".incidents-stats")?.addEventListener("click", (e) => {
        const card = e.target.closest("[data-stat-filter]");
        if (!card) return;
        const filterVal = card.getAttribute("data-stat-filter");
        if (activeQuickFilter === filterVal) {
            activeQuickFilter = "all";
        } else {
            activeQuickFilter = filterVal || "all";
        }
        rerender();
    });

    // Keyboard accessibility for stat cards
    document.querySelector(".incidents-stats")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            const card = e.target.closest("[data-stat-filter]");
            if (card) {
                e.preventDefault();
                card.click();
            }
        }
    });

    // Pagination click delegation
    document
        .getElementById("users-pagination")
        ?.addEventListener("click", (event) => {
            const btn = event.target.closest("[data-page-action]");
            if (!btn || btn.disabled) return;
            const action = btn.getAttribute("data-page-action");
            currentPage += action === "next" ? 1 : -1;
            renderFilteredTable();
        });
}

function createSecondaryAuth() {
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const secondaryApp = initializeApp(
        primaryApp.options,
        `user-create-${suffix}`,
    );
    return {
        app: secondaryApp,
        auth: getAuth(secondaryApp),
    };
}

function bindAddUserModal() {
    if (addUserBound) return;
    addUserBound = true;

    const openBtn = document.getElementById("users-add-new");
    const modal = document.getElementById("user-add-modal");
    const form = document.getElementById("user-add-form");
    const closeBtn = document.getElementById("user-add-modal-close");
    const cancelBtn = document.getElementById("user-add-cancel");
    const submitBtn = document.getElementById("user-add-submit");
    const feedback = document.getElementById("user-add-feedback");
    const backdrop = modal?.querySelector("[data-close-add-user-modal]");

    if (!openBtn || !modal || !form) return;

    const close = () => {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        form.reset();
        if (feedback) feedback.textContent = "";
        document.body.style.overflow = "";
        syncRoleVisibility();
    };

    const roleSelect = form.elements.role;
    const barangayWrap = form.querySelector("#user-add-barangay-wrap");
    const substationWrap = form.querySelector("#user-add-substation-wrap");
    const headPoliceNote = form.querySelector("#user-add-head-police-note");
    const citizenNote = form.querySelector("#user-add-citizen-note");

    const syncRoleVisibility = () => {
        const rawRole = roleSelect?.value || "";
        const r = rawRole ? normalizeRole(rawRole) : "";
        if (barangayWrap) barangayWrap.style.display = r === "admin" ? "block" : "none";
        if (substationWrap) substationWrap.style.display = r === "police" ? "block" : "none";
        if (headPoliceNote) headPoliceNote.style.display = r === "head_police" ? "block" : "none";
        if (citizenNote) citizenNote.style.display = r === "user" ? "block" : "none";
    };

    roleSelect?.addEventListener("change", syncRoleVisibility);
    roleSelect?.addEventListener("input", syncRoleVisibility);

    const open = () => {
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        syncRoleVisibility();
        form.querySelector("#user-add-first")?.focus();
    };

    openBtn.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const firstName = String(form.elements.firstName?.value || "").trim();
        const lastName = String(form.elements.lastName?.value || "").trim();
        const email = String(form.elements.email?.value || "")
            .trim()
            .toLowerCase();
        const rawRole = form.elements.role?.value || "";
        if (!rawRole) {
            if (feedback) feedback.textContent = "Please choose a role from the dropdown.";
            return;
        }
        const role = normalizeRole(rawRole);
        const status = String(
            form.elements.status?.value || "active",
        ).toLowerCase();
        const password = String(form.elements.password?.value || "");
        const confirmPassword = String(
            form.elements.confirmPassword?.value || "",
        );

        if (!email) {
            if (feedback) feedback.textContent = "Email address is required.";
            return;
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            if (feedback) {
                feedback.textContent = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
            }
            return;
        }

        if (password !== confirmPassword) {
            if (feedback) feedback.textContent = "Passwords do not match.";
            return;
        }

        const barangayId = String(form.elements.barangayId?.value || "").trim();
        const substationId = String(form.elements.substationId?.value || "").trim();
        const payload = {
            email,
            firstName,
            lastName,
            role: EDIT_ROLES_FOR_CREATE.includes(role) ? role : "user",
            status: EDIT_STATUSES_FOR_CREATE.includes(status)
                ? status
                : "active",
            accountStatus: status === "active" ? "active" : (status === "suspended" ? "suspended" : "inactive"),
            disabled: status === "inactive",
            suspended: status === "suspended",
            createdAt: serverTimestamp(),
            createdByAdmin: true,
            isVerified: true,
            emailVerified: true,
            verificationStatus: "approved",
            falseReportAcknowledged: true,
            falseReportAcknowledgedAt: serverTimestamp(),
            ...(role === "admin" && barangayId
                ? {
                      barangayId,
                      assignedBarangay: barangayId,
                      barangayName: getBarangayNameById(barangayId),
                  }
                : {}),
            ...(role === "police" && substationId
                ? {
                      substationId,
                      assignedSubstation: substationId,
                      substationName: getSubstationNameById(substationId),
                  }
                : {}),
            ...(role === "head_police"
                ? {
                      isHeadPolice: true,
                      jurisdictionScope: "citywide",
                  }
                : {}),
        };
        let createdAuthUser = null;
        let secondaryApp = null;

        if (feedback) feedback.textContent = "Creating account...";
        if (submitBtn) submitBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;

        try {
            const secondary = createSecondaryAuth();
            secondaryApp = secondary.app;
            const credential = await createUserWithEmailAndPassword(
                secondary.auth,
                email,
                password,
            );
            createdAuthUser = credential.user;
            const uid = createdAuthUser.uid;

            await setDoc(doc(db, "users", uid), { ...payload, uid });
            toastSuccess("User account added");
            close();
            await loadUsersTable();
        } catch (err) {
            console.error("[users] add user", err);
            if (createdAuthUser) {
                try {
                    await deleteUser(createdAuthUser);
                } catch (deleteErr) {
                    console.warn("[users] cleanup auth user failed", deleteErr);
                }
            }
            const msg = err?.message || "Failed to add user account";
            if (feedback) feedback.textContent = msg;
            toastError(msg);
        } finally {
            if (secondaryApp) {
                try {
                    await deleteApp(secondaryApp);
                } catch (deleteErr) {
                    console.warn("[users] cleanup secondary app failed", deleteErr);
                }
            }
            if (submitBtn) submitBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
        }
    });
}

async function fetchUsersQuery() {
    const byId = query(
        collection(db, "users"),
        orderBy("__name__", "asc"),
        limit(LIST_LIMIT),
    );
    try {
        const snap = await getDocs(byId);
        return snap;
    } catch (e) {
        if (e?.code !== "failed-precondition") throw e;
    }

    const byCreated = query(
        collection(db, "users"),
        orderBy("createdAt", "desc"),
        limit(LIST_LIMIT),
    );
    try {
        const snap = await getDocs(byCreated);
        return snap;
    } catch (e) {
        if (e?.code !== "failed-precondition") throw e;
    }

    const byEmail = query(
        collection(db, "users"),
        orderBy("email", "asc"),
        limit(LIST_LIMIT),
    );
    try {
        const snap = await getDocs(byEmail);
        return snap;
    } catch (e2) {
        if (e2?.code !== "failed-precondition") throw e2;
    }

    const snap = await getDocs(
        query(collection(db, "users"), limit(LIST_LIMIT)),
    );
    return snap;
}

async function fetchVerificationDocs() {
    verificationLoadError = null;
    let snap;

    try {
        snap = await getDocs(
            query(collection(db, "userVerifications"), limit(LIST_LIMIT)),
        );
    } catch (err) {
        console.warn("[users] unable to load verification queue", err);
        verificationDocs = [];
        verificationUsers = new Map();
        verificationLoadError =
            err?.code === "permission-denied"
                ? "Missing permission to read verification requests. Deploy the updated Firestore rules, then refresh this page."
                : err?.message || "Unable to load verification requests.";
        return;
    }

    verificationDocs = snap.docs;

    const userEntries = await Promise.all(
        verificationDocs.map(async (docSnap) => {
            const existing = allDocs.find((userDoc) => userDoc.id === docSnap.id);
            if (existing) return [docSnap.id, existing.data()];

            try {
                const userSnap = await getDoc(doc(db, "users", docSnap.id));
                return [docSnap.id, userSnap.exists() ? userSnap.data() : null];
            } catch (err) {
                console.warn("[users] unable to fetch verification user", err);
                return [docSnap.id, null];
            }
        }),
    );

    verificationUsers = new Map(userEntries);
}

export function loadUsersTable() {
    const tbody = document.getElementById("users-tbody");
    const meta = document.getElementById("users-count");
    if (!tbody) return Promise.resolve();

    if (usersRealtimeUnsub) {
        usersRealtimeUnsub();
        usersRealtimeUnsub = null;
    }

    tbody.innerHTML =
        '<tr class="incidents-table__empty"><td colspan="7">Loading…</td></tr>';
    if (meta) meta.textContent = "Loading…";

    bindToolbar();
    bindAddUserModal();

    return new Promise((resolve, reject) => {
        let isFirst = true;
        const q = query(collection(db, "users"), limit(LIST_LIMIT));
        usersRealtimeUnsub = onSnapshot(
            q,
            (snap) => {
                allDocs = snap.docs;
                populateRoleSelect();
                updateUserStats();
                renderFilteredTable();
                if (isFirst) {
                    isFirst = false;
                    resolve(snap);
                }
            },
            (err) => {
                console.error("[users] realtime snapshot error", err);
                if (isFirst) {
                    isFirst = false;
                    reject(err);
                }
            },
        );
    });
}
