import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";

const EDIT_ROLES = ["user", "moderator", "police", "admin"];

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

function displayName(d) {
    const fn = (d.firstName || "").trim();
    const ln = (d.lastName || "").trim();
    const parts = [fn, ln].filter(Boolean);
    return parts.length ? parts.join(" ") : "—";
}

function humanizeRole(role) {
    if (!role) return "User";
    return String(role)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleBadgeClass(role) {
    const r = String(role || "user").toLowerCase();
    if (r === "admin") return "incidents-badge incidents-badge--role-admin";
    if (r === "moderator")
        return "incidents-badge incidents-badge--role-moderator";
    if (r === "police") return "incidents-badge incidents-badge--role-police";
    return "incidents-badge incidents-badge--role-user";
}

function renderUserDetail(userId, d) {
    const rows = [
        [
            "User ID",
            `<span class="incident-detail__mono">${escapeHtml(userId)}</span>`,
        ],
        ["Email", escapeHtml(d.email || "—")],
        ["Name", escapeHtml(displayName(d))],
        [
            "Role",
            `<span class="${roleBadgeClass(d.role)}">${escapeHtml(humanizeRole(d.role))}</span>`,
        ],
        ["Joined", escapeHtml(formatTimestamp(d.createdAt))],
    ];

    return `<dl class="incident-detail">
    ${rows
        .map(
            ([label, inner]) =>
                `<div class="incident-detail__row"><dt>${escapeHtml(label)}</dt><dd>${inner}</dd></div>`,
        )
        .join("")}
  </dl>
  <section class="incident-actions incident-actions--user" aria-label="User actions">
    <h3 class="incident-actions__title">Actions</h3>
    <p class="incident-actions__hint">Edit profile fields or remove the Firestore document (sign-in account stays).</p>
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
    const cur = String(d.role || "user").toLowerCase();
    const roleOptions = EDIT_ROLES.map((r) => {
        const sel = r === cur ? " selected" : "";
        return `<option value="${escapeAttr(r)}"${sel}>${escapeHtml(humanizeRole(r))}</option>`;
    }).join("");

    return `<form class="user-modal-form" id="user-edit-form" novalidate>
    <div class="user-modal-form__readonly">
      <span class="user-modal-form__readonly-label">User ID</span>
      <span class="incident-detail__mono">${escapeHtml(userId)}</span>
    </div>
    <div class="user-modal-form__readonly">
      <span class="user-modal-form__readonly-label">Email</span>
      <span>${escapeHtml(d.email || "—")}</span>
    </div>
    <div class="user-modal-form__readonly">
      <span class="user-modal-form__readonly-label">Joined</span>
      <span>${escapeHtml(formatTimestamp(d.createdAt))}</span>
    </div>
    <div class="user-modal-form__field">
      <label class="user-modal-form__label" for="user-edit-first">First name</label>
      <input id="user-edit-first" name="firstName" class="user-modal-form__input" type="text" autocomplete="off" value="${escapeAttr(d.firstName || "")}" />
    </div>
    <div class="user-modal-form__field">
      <label class="user-modal-form__label" for="user-edit-last">Last name</label>
      <input id="user-edit-last" name="lastName" class="user-modal-form__input" type="text" autocomplete="off" value="${escapeAttr(d.lastName || "")}" />
    </div>
    <div class="user-modal-form__field">
      <label class="user-modal-form__label" for="user-edit-role">Role</label>
      <div class="user-modal-form__select-wrap">
        <select id="user-edit-role" name="role" class="incidents-select" aria-label="User role">${roleOptions}</select>
      </div>
    </div>
  </form>
  <section class="incident-actions incident-actions--user" aria-label="Save user edits">
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
    if (!row || row.children.length < 4) return;
    const email = d.email || "—";
    const name = displayName(d);
    const roleLabel = humanizeRole(d.role);
    const badge = roleBadgeClass(d.role);
    const joined = formatTimestamp(d.createdAt);
    const c0 = row.children[0];
    const c1 = row.children[1];
    const c2 = row.children[2];
    const c3 = row.children[3];
    if (c0) {
        c0.textContent = email;
        c0.setAttribute("title", email);
        c0.className = "incidents-table__desc";
    }
    if (c1) c1.textContent = name;
    if (c2)
        c2.innerHTML = `<span class="${badge}">${escapeHtml(roleLabel)}</span>`;
    if (c3) {
        const short =
            d.createdAt && typeof d.createdAt.toDate === "function"
                ? (() => {
                      try {
                          return d.createdAt.toDate().toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                          });
                      } catch {
                          return joined;
                      }
                  })()
                : joined;
        c3.textContent = short;
    }
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
            const firstName = String(fnEl?.value ?? "").trim();
            const lastName = String(lnEl?.value ?? "").trim();
            let role = String(roleEl?.value ?? "user").toLowerCase();
            if (!EDIT_ROLES.includes(role)) role = "user";

            if (feedback) feedback.textContent = "Saving…";
            saveBtn && (saveBtn.disabled = true);
            cancelBtn && (cancelBtn.disabled = true);

            // Always send uid so merged doc satisfies rules (uid must equal document id).
            const payload = {
                uid: currentUserId,
                firstName,
                lastName,
                role,
            };

            try {
                await updateDoc(doc(db, "users", currentUserId), payload);
                currentData = { ...currentData, ...payload };
                if (titleEl)
                    titleEl.textContent = `${currentData.email || currentUserId}`;
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
        const btn = e.target.closest(".incidents-action-btn");
        if (!btn) return;
        const tr = btn.closest("tr");
        const id = tr?.dataset?.userId;
        if (!id) return;

        currentUserId = id;
        if (titleEl) titleEl.textContent = "User details";
        body.innerHTML = '<p class="incident-modal__loading">Loading user…</p>';
        openModal();

        try {
            const snap = await getDoc(doc(db, "users", id));
            if (!snap.exists()) {
                body.innerHTML = `<p class="incident-modal__error">${escapeHtml("User profile not found.")}</p>`;
                return;
            }
            currentData = snap.data();
            if (titleEl)
                titleEl.textContent = `${currentData.email || snap.id}`;
            body.innerHTML = renderUserDetail(snap.id, currentData);
            bindViewActions();
        } catch (err) {
            console.error("[user-modal]", err);
            body.innerHTML = `<p class="incident-modal__error">${escapeHtml(err?.message || "Failed to load user")}</p>`;
        }
    });
}
