import {
    collection,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { toastError, toastSuccess } from "./alerts.js";

const LIST_LIMIT = 200;
const EDIT_ROLES_FOR_CREATE = ["user", "police", "admin"];
const EDIT_STATUSES_FOR_CREATE = ["active", "inactive", "suspended"];

/** @type {import('firebase/firestore').QueryDocumentSnapshot[]} */
let allDocs = [];
let toolbarBound = false;
let addUserBound = false;
let searchDebounceTimer = null;

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

function displayName(d) {
    const fn = (d.firstName || "").trim();
    const ln = (d.lastName || "").trim();
    const parts = [fn, ln].filter(Boolean);
    return parts.length ? parts.join(" ") : "—";
}

function roleBadgeClass(role) {
    const r = normalizeRole(role);
    if (r === "admin") return "incidents-badge incidents-badge--role-admin";
    if (r === "police") return "incidents-badge incidents-badge--role-police";
    return "incidents-badge incidents-badge--role-user";
}

function humanizeRole(role) {
    return String(normalizeRole(role))
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
    const value = String(role || "user").toLowerCase();
    return value === "moderator" ? "admin" : value;
}

function norm(s) {
    return String(s ?? "")
        .toLowerCase()
        .trim();
}

function buildRow(docSnap, index) {
    const id = docSnap.id;
    const d = docSnap.data();
    const email = d.email || "—";
    const name = displayName(d);
    const roleLabel = humanizeRole(d.role);
    const joined = formatJoined(d);
    const status = userStatus(d);

    return `<tr data-user-id="${escapeAttr(id)}">
    <td class="users-table__index">${index + 1}</td>
    <td class="users-table__name">${escapeHtml(name)}</td>
    <td class="incidents-table__desc" title="${escapeAttr(email)}">${escapeHtml(email)}</td>
    <td><span class="${roleBadgeClass(d.role)}">${escapeHtml(roleLabel)}</span></td>
    <td>${escapeHtml(joined)}</td>
    <td><span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span></td>
    <td>
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
    return (
        email.includes(q) ||
        fn.includes(q) ||
        ln.includes(q) ||
        full.includes(q) ||
        uid.includes(q)
    );
}

function docMatchesRole(docSnap, roleVal) {
    if (!roleVal || roleVal === "all") return true;
    const r = norm(normalizeRole(docSnap.data().role || "user"));
    return r === norm(roleVal);
}

function getFilterValues() {
    const searchEl = document.getElementById("users-search");
    const roleEl = document.getElementById("users-filter-role");
    return {
        search: norm(searchEl?.value || ""),
        role: roleEl?.value || "all",
    };
}

function filterDocs() {
    const { search, role } = getFilterValues();
    return allDocs.filter(
        (docSnap) =>
            docMatchesSearch(docSnap, search) && docMatchesRole(docSnap, role),
    );
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

function renderFilteredTable() {
    const tbody = document.getElementById("users-tbody");
    const meta = document.getElementById("users-count");
    if (!tbody) return;

    const filtered = filterDocs();

    if (!allDocs.length) {
        tbody.innerHTML =
            '<tr class="incidents-table__empty"><td colspan="7">No users yet.</td></tr>';
        if (meta) meta.textContent = "0 users";
        return;
    }

    if (!filtered.length) {
        tbody.innerHTML =
            '<tr class="incidents-table__empty"><td colspan="7">No users match your search or filter.</td></tr>';
        if (meta) {
            meta.textContent = `0 of ${allDocs.length} shown (filtered)`;
        }
        return;
    }

    tbody.innerHTML = filtered
        .map((docSnap, index) => buildRow(docSnap, index))
        .join("");

    if (meta) {
        const total = allDocs.length;
        const shown = filtered.length;
        const suffix =
            shown < total
                ? ` (${shown} of ${total} shown)`
                : ` (${total} loaded)`;
        meta.textContent =
            `${shown} user${shown === 1 ? "" : "s"}${suffix}` +
            (total >= LIST_LIMIT ? ` — max ${LIST_LIMIT} loaded` : "");
    }
}

function bindToolbar() {
    if (toolbarBound) return;
    toolbarBound = true;

    const searchEl = document.getElementById("users-search");
    const roleEl = document.getElementById("users-filter-role");

    const rerender = () => renderFilteredTable();

    searchEl?.addEventListener("input", () => {
        if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = window.setTimeout(rerender, 200);
    });
    searchEl?.addEventListener("search", rerender);
    roleEl?.addEventListener("change", rerender);
}

function generatedProfileId() {
    if (globalThis.crypto?.randomUUID)
        return `manual-${globalThis.crypto.randomUUID()}`;
    return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    };

    const open = () => {
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
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
        const role = normalizeRole(form.elements.role?.value || "user");
        const status = String(
            form.elements.status?.value || "active",
        ).toLowerCase();

        if (!email) {
            if (feedback) feedback.textContent = "Email address is required.";
            return;
        }

        const uid = generatedProfileId();
        const payload = {
            uid,
            email,
            firstName,
            lastName,
            role: EDIT_ROLES_FOR_CREATE.includes(role) ? role : "user",
            status: EDIT_STATUSES_FOR_CREATE.includes(status)
                ? status
                : "active",
            disabled: status === "inactive",
            suspended: status === "suspended",
            createdAt: serverTimestamp(),
            createdByAdmin: true,
        };

        if (feedback) feedback.textContent = "Creating profile...";
        if (submitBtn) submitBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;

        try {
            await setDoc(doc(db, "users", uid), payload);
            toastSuccess("User profile added");
            close();
            await loadUsersTable();
        } catch (err) {
            console.error("[users] add user", err);
            const msg = err?.message || "Failed to add user profile";
            if (feedback) feedback.textContent = msg;
            toastError(msg);
        } finally {
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

export async function loadUsersTable() {
    const tbody = document.getElementById("users-tbody");
    const meta = document.getElementById("users-count");
    if (!tbody) return;

    tbody.innerHTML =
        '<tr class="incidents-table__empty"><td colspan="7">Loading…</td></tr>';
    if (meta) meta.textContent = "Loading…";

    const snap = await fetchUsersQuery();
    allDocs = snap.docs;
    bindToolbar();
    bindAddUserModal();
    populateRoleSelect();
    renderFilteredTable();
}
