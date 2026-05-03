import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";

const EDIT_ROLES = ["user", "police", "admin"];
const EDIT_STATUSES = ["active", "inactive", "suspended"];

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

function formatTimestamp(ts) {
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
    return "—";
}

function formatDate(ts) {
    if (ts && typeof ts.toDate === "function") {
        try {
            return ts.toDate().toLocaleDateString(undefined, {
                dateStyle: "medium",
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

function userInitials(d) {
    const name = displayName(d);
    if (name === "—") return "?";
    return name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
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

function humanizeRole(role) {
    return String(normalizeRole(role))
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleBadgeClass(role) {
    const r = normalizeRole(role);
    if (r === "admin") return "incidents-badge incidents-badge--role-admin";
    if (r === "police") return "incidents-badge incidents-badge--role-police";
    return "incidents-badge incidents-badge--role-user";
}

function normalizeRole(role) {
    const value = String(role || "user").toLowerCase();
    return value === "moderator" ? "admin" : value;
}

function renderUserDetail(userId, d) {
    const name = displayName(d);
    const status = userStatus(d);
    const contact = d.phone || d.phoneNumber || d.contactNumber || "—";
    const joined = formatDate(d.createdAt);
    const updated = formatTimestamp(d.updatedAt || d.lastUpdatedAt);
    const lastSeen = formatTimestamp(
        d.lastLoginAt || d.lastSeenAt || d.lastActiveAt,
    );

    return `<section class="user-profile" aria-label="User profile summary">
    <div class="user-profile__hero">
      <div class="user-profile__avatar" aria-hidden="true">${escapeHtml(userInitials(d))}</div>
      <div class="user-profile__identity">
        <h3>${escapeHtml(name)}</h3>
        <p>${escapeHtml(d.email || "No email address")}</p>
        <div class="user-profile__badges">
          <span class="${roleBadgeClass(d.role)}">${escapeHtml(humanizeRole(d.role))}</span>
          <span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span>
        </div>
      </div>
    </div>

    <div class="user-profile__quick-grid" aria-label="Account summary">
      <div class="user-profile__quick-item">
        <span>Date joined</span>
        <strong>${escapeHtml(joined)}</strong>
      </div>
      <div class="user-profile__quick-item">
        <span>Last active</span>
        <strong>${escapeHtml(lastSeen)}</strong>
      </div>
    </div>

    <section class="user-profile__section">
      <h4>Contact</h4>
      <dl class="user-profile__details">
        <div><dt>Email address</dt><dd>${escapeHtml(d.email || "—")}</dd></div>
        <div><dt>Phone</dt><dd>${escapeHtml(contact)}</dd></div>
      </dl>
    </section>

    <section class="user-profile__section">
      <h4>System</h4>
      <dl class="user-profile__details">
        <div><dt>User ID</dt><dd><span class="incident-detail__mono">${escapeHtml(userId)}</span></dd></div>
        <div><dt>Role</dt><dd>${escapeHtml(humanizeRole(d.role))}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(humanizeStatus(status))}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(updated)}</dd></div>
      </dl>
    </section>
  </section>
  <section class="incident-actions incident-actions--user" aria-label="User actions">
    <h3 class="incident-actions__title">Profile actions</h3>
    <p class="incident-actions__hint">Edit profile fields, role, or account status. Delete only removes the Firestore profile document.</p>
    <div class="incident-actions__buttons">
      <button type="button" class="incident-action-btn" data-user-action="edit-profile">Edit</button>
      <button type="button" class="incident-action-btn incident-action-btn--danger" data-user-action="delete-profile">
        Delete profile
      </button>
    </div>
    <p id="user-actions-feedback" class="incident-actions__feedback" aria-live="polite"></p>
  </section>`;
}

function renderUserEditForm(userId, d) {
    const cur = normalizeRole(d.role);
    const curStatus = userStatus(d);
    const name = displayName(d);
    const roleOptions = EDIT_ROLES.map((r) => {
        const sel = r === cur ? " selected" : "";
        return `<option value="${escapeAttr(r)}"${sel}>${escapeHtml(humanizeRole(r))}</option>`;
    }).join("");
    const statusOptions = EDIT_STATUSES.map((s) => {
        const sel = s === curStatus ? " selected" : "";
        return `<option value="${escapeAttr(s)}"${sel}>${escapeHtml(humanizeStatus(s))}</option>`;
    }).join("");

    return `<form class="user-modal-form user-modal-form--profile" id="user-edit-form" novalidate>
    <section class="user-edit-card user-edit-card--hero">
      <div class="user-profile__avatar" aria-hidden="true">${escapeHtml(userInitials(d))}</div>
      <div class="user-profile__identity">
        <h3>Edit profile</h3>
        <p>${escapeHtml(name)} · ${escapeHtml(d.email || "No email address")}</p>
      </div>
    </section>

    <section class="user-edit-card">
      <div class="user-edit-card__head">
        <h4>Identity</h4>
        <p>Update the display name shown across admin records.</p>
      </div>
      <div class="user-modal-form__grid">
        <div class="user-modal-form__field">
          <label class="user-modal-form__label" for="user-edit-first">First name</label>
          <input id="user-edit-first" name="firstName" class="user-modal-form__input" type="text" autocomplete="off" value="${escapeAttr(d.firstName || "")}" />
        </div>
        <div class="user-modal-form__field">
          <label class="user-modal-form__label" for="user-edit-last">Last name</label>
          <input id="user-edit-last" name="lastName" class="user-modal-form__input" type="text" autocomplete="off" value="${escapeAttr(d.lastName || "")}" />
        </div>
      </div>
    </section>

    <section class="user-edit-card">
      <div class="user-edit-card__head">
        <h4>Access</h4>
        <p>Control the account role and moderation status.</p>
      </div>
      <div class="user-modal-form__grid">
        <div class="user-modal-form__field">
          <label class="user-modal-form__label" for="user-edit-role">Role</label>
          <div class="user-modal-form__select-wrap">
            <select id="user-edit-role" name="role" class="incidents-select" aria-label="User role">${roleOptions}</select>
          </div>
        </div>
        <div class="user-modal-form__field">
          <label class="user-modal-form__label" for="user-edit-status">Status</label>
          <div class="user-modal-form__select-wrap">
            <select id="user-edit-status" name="status" class="incidents-select" aria-label="User status">${statusOptions}</select>
          </div>
        </div>
      </div>
    </section>

    <section class="user-edit-card">
      <div class="user-edit-card__head">
        <h4>Reference</h4>
        <p>Read-only account identifiers.</p>
      </div>
      <div class="user-edit-reference">
        <div><span>User ID</span><strong class="incident-detail__mono">${escapeHtml(userId)}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(d.email || "—")}</strong></div>
        <div><span>Joined</span><strong>${escapeHtml(formatTimestamp(d.createdAt))}</strong></div>
      </div>
    </section>
  </form>
  <section class="incident-actions incident-actions--user user-edit-actions" aria-label="Save user edits">
    <div class="incident-actions__buttons">
      <button type="button" class="incident-action-btn" data-user-action="cancel-edit">Cancel</button>
      <button type="submit" form="user-edit-form" class="incident-action-btn incident-action-btn--primary" data-user-action="save-profile">
        Save changes
      </button>
    </div>
    <p id="user-actions-feedback" class="incident-actions__feedback" aria-live="polite"></p>
  </section>`;
}

function patchUsersTableRow(userId, d) {
    const row = document.querySelector(`tr[data-user-id="${CSS.escape(userId)}"]`);
    if (!row || row.children.length < 6) return;
    const email = d.email || "—";
    const name = displayName(d);
    const roleLabel = humanizeRole(d.role);
    const badge = roleBadgeClass(d.role);
    const joined = formatTimestamp(d.createdAt);
    const status = userStatus(d);
    const c1 = row.children[1];
    const c2 = row.children[2];
    const c3 = row.children[3];
    const c4 = row.children[4];
    const c5 = row.children[5];
    if (c1) c1.textContent = name;
    if (c2) {
        c2.textContent = email;
        c2.setAttribute("title", email);
        c2.className = "incidents-table__desc";
    }
    if (c3)
        c3.innerHTML = `<span class="${badge}">${escapeHtml(roleLabel)}</span>`;
    if (c4) {
        const short =
            d.createdAt && typeof d.createdAt.toDate === "function"
                ? (() => {
                      try {
                          return d.createdAt.toDate().toLocaleDateString(undefined, {
                              dateStyle: "short",
                          });
                      } catch {
                          return joined;
                      }
                  })()
                : joined;
        c4.textContent = short;
    }
    if (c5)
        c5.innerHTML = `<span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span>`;
}

export function initUserModal() {
    const modal = document.getElementById("user-modal");
    const body = document.getElementById("user-modal-body");
    const titleEl = document.getElementById("user-modal-title");
    const closeBtn = document.getElementById("user-modal-close");
    const backdrop = modal?.querySelector("[data-close-modal]");
    const tbody = document.getElementById("users-tbody");

    if (!modal || !body || !tbody) return;

    let currentUserId = null;
    let currentData = null;

    function closeModal() {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        body.innerHTML = "";
        document.body.style.overflow = "";
        currentUserId = null;
        currentData = null;
    }

    function openModal() {
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function showView() {
        if (!currentUserId || !currentData) return;
        body.innerHTML = renderUserDetail(currentUserId, currentData);
        bindViewActions();
    }

    function showEdit() {
        if (!currentUserId || !currentData) return;
        body.innerHTML = renderUserEditForm(currentUserId, currentData);
        bindEditActions();
        initAdminCustomSelects(modal);
    }

    function bindViewActions() {
        const feedback = document.getElementById("user-actions-feedback");
        const editBtn = body.querySelector('[data-user-action="edit-profile"]');
        const delBtn = body.querySelector(
            '[data-user-action="delete-profile"]',
        );

        editBtn?.addEventListener("click", () => {
            if (feedback) feedback.textContent = "";
            showEdit();
        });

        delBtn?.addEventListener("click", async () => {
            if (!currentUserId) return;
            const ok = await confirmDanger({
                title: "Delete user profile doc?",
                text: "This does NOT delete the Firebase Auth account, only the users/{uid} document.",
                confirmText: "Delete",
            });
            if (!ok) return;
            if (feedback) feedback.textContent = "Deleting…";
            delBtn.disabled = true;
            editBtn && (editBtn.disabled = true);
            try {
                await deleteDoc(doc(db, "users", currentUserId));
                if (feedback)
                    feedback.textContent = "Deleted user profile document.";
                toastSuccess("User profile deleted");
                const row = document.querySelector(
                    `tr[data-user-id="${CSS.escape(currentUserId)}"]`,
                );
                row?.remove();
                setTimeout(closeModal, 500);
            } catch (err) {
                console.error("[user-modal] delete profile", err);
                if (feedback)
                    feedback.textContent =
                        err?.message || "Failed to delete profile.";
                toastError(err?.message || "Failed to delete profile");
                delBtn.disabled = false;
                if (editBtn) editBtn.disabled = false;
            }
        });
    }

    function bindEditActions() {
        const feedback = document.getElementById("user-actions-feedback");
        const form = body.querySelector("#user-edit-form");
        const cancelBtn = body.querySelector('[data-user-action="cancel-edit"]');
        const saveBtn = body.querySelector('[data-user-action="save-profile"]');

        cancelBtn?.addEventListener("click", () => {
            if (feedback) feedback.textContent = "";
            showView();
        });

        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentUserId || !currentData) return;

            const fnEl = body.querySelector("#user-edit-first");
            const lnEl = body.querySelector("#user-edit-last");
            const roleEl = body.querySelector("#user-edit-role");
            const statusEl = body.querySelector("#user-edit-status");
            const firstName = String(fnEl?.value ?? "").trim();
            const lastName = String(lnEl?.value ?? "").trim();
            let role = normalizeRole(roleEl?.value ?? "user");
            if (!EDIT_ROLES.includes(role)) role = "user";
            let status = String(statusEl?.value ?? "active").toLowerCase();
            if (!EDIT_STATUSES.includes(status)) status = "active";

            if (feedback) feedback.textContent = "Saving…";
            saveBtn && (saveBtn.disabled = true);
            cancelBtn && (cancelBtn.disabled = true);

            // Always send uid so merged doc satisfies rules (uid must equal document id).
            const payload = {
                uid: currentUserId,
                firstName,
                lastName,
                role,
                status,
                disabled: status === "inactive",
                suspended: status === "suspended",
            };

            try {
                await updateDoc(doc(db, "users", currentUserId), payload);
                currentData = { ...currentData, ...payload };
                if (titleEl) titleEl.textContent = "Profile";
                patchUsersTableRow(currentUserId, currentData);
                toastSuccess("User updated");
                if (feedback) feedback.textContent = "";
                showView();
            } catch (err) {
                console.error("[user-modal] save profile", err);
                if (feedback)
                    feedback.textContent =
                        err?.message || "Failed to save changes.";
                toastError(err?.message || "Failed to save changes");
            } finally {
                if (saveBtn) saveBtn.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
            }
        });
    }

    closeBtn?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.hidden) closeModal();
    });

    tbody.addEventListener("click", async (e) => {
        const btn = e.target.closest(".users-more-btn");
        if (!btn) return;
        const tr = btn.closest("tr");
        const id = tr?.dataset?.userId;
        if (!id) return;

        currentUserId = id;
        if (titleEl) titleEl.textContent = "Profile";
        body.innerHTML = '<p class="incident-modal__loading">Loading user…</p>';
        openModal();

        try {
            const snap = await getDoc(doc(db, "users", id));
            if (!snap.exists()) {
                body.innerHTML = `<p class="incident-modal__error">${escapeHtml("User profile not found.")}</p>`;
                return;
            }
            currentData = snap.data();
            if (titleEl) titleEl.textContent = "Profile";
            body.innerHTML = renderUserDetail(snap.id, currentData);
            bindViewActions();
        } catch (err) {
            console.error("[user-modal]", err);
            body.innerHTML = `<p class="incident-modal__error">${escapeHtml(err?.message || "Failed to load user")}</p>`;
        }
    });
}
