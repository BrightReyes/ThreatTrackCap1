import { deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";
import { COVERED_BARANGAYS, getBarangayNameById } from "../../shared/barangays.js";
import { COVERED_SUBSTATIONS, getSubstationNameById } from "../../shared/substations.js";
import { isUserVerified, verifiedBadgeHtml } from "./users-list.js";
import { getCurrentAdminRole, isHeadPoliceAdminRole } from "./admin-auth.js";

const EDIT_ROLES = ["user", "admin", "police", "head_police"];
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
    const fn = (d.firstName || "").trim();
    const ln = (d.lastName || "").trim();
    if (fn || ln) {
        return `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
    }
    const email = (d.email || "").trim();
    if (email) return email.charAt(0).toUpperCase();
    return "U";
}

function userAvatarClass(role) {
    const r = normalizeRole(role);
    if (r === "head_police") return "user-profile__avatar user-profile__avatar--head-police";
    if (r === "police") return "user-profile__avatar user-profile__avatar--police";
    if (r === "admin") return "user-profile__avatar user-profile__avatar--admin";
    return "user-profile__avatar user-profile__avatar--user";
}

function updateUserModalHeader(userId, d) {
    const titleEl = document.getElementById("user-modal-title");
    if (!titleEl || !d) return;
    const name = displayName(d);
    const hasRealName = name !== "—";
    const headerTitle = hasRealName ? name : (d.email || "User Profile");
    const sysId = formatUserSystemId(userId);
    const status = userStatus(d);

    titleEl.innerHTML = `
        <div class="incident-modal__header-bar">
            <div class="incident-modal__header-left">
                <span class="incident-modal__code-badge">${escapeHtml(sysId)}</span>
                <span class="incident-modal__type-name">${escapeHtml(headerTitle)}</span>
            </div>
            <div class="incident-modal__header-badges">
                <span class="${roleBadgeClass(d.role)}">${escapeHtml(humanizeRole(d.role))}</span>
                <span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span>
            </div>
        </div>
    `;
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

export function formatUserSystemId(userId) {
    if (!userId) return "";
    let hash = 0;
    const s = String(userId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `#${String(hash).padStart(4, "0")}`;
}

function humanizeRole(role) {
    const normalized = normalizeRole(role);
    if (normalized === "admin") return "Barangay Admin";
    if (normalized === "police") return "Police Admin";
    if (normalized === "head_police") return "Head Police Admin";
    if (normalized === "user") return "User";
    return String(normalized)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleBadgeClass(role) {
    const r = normalizeRole(role);
    if (r === "admin") return "incidents-badge incidents-badge--role-admin";
    if (r === "police" || r === "head_police") return "incidents-badge incidents-badge--role-police";
    return "incidents-badge incidents-badge--role-user";
}

function normalizeRole(role) {
    const value = String(role || "user")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (["head_police", "head_police_admin", "police_chief", "head_admin", "hq_police"].includes(value)) {
        return "head_police";
    }
    if (["police", "police_admin", "substation_police", "substation"].includes(value)) {
        return "police";
    }
    if (["moderator", "barangay", "barangay_admin"].includes(value)) {
        return "admin";
    }
    if (["user", "citizen", "resident"].includes(value)) {
        return "user";
    }
    return value;
}

function renderUserDetail(userId, d) {
    const isHQ = isHeadPoliceAdminRole(getCurrentAdminRole());
    const name = displayName(d);
    const hasRealName = name !== "—";
    const status = userStatus(d);
    const verified = isUserVerified(d);
    const isCitizen = normalizeRole(d.role) === "user";
    const contact = d.phone || d.phoneNumber || d.contactNumber || "—";
    const joined = formatDate(d.createdAt);
    const updated = formatTimestamp(d.updatedAt || d.lastUpdatedAt);
    const lastSeen = formatTimestamp(
        d.lastLoginAt || d.lastSeenAt || d.lastActiveAt,
    );
    const sysId = formatUserSystemId(userId);

    const jurisdictionText =
        d.role === "admin" || d.barangayId
            ? getBarangayNameById(d.barangayId) || d.assignedBarangay || "Unassigned Barangay"
            : d.role === "police" || d.substationId
            ? getSubstationNameById(d.substationId) || d.assignedSubstation || "Unassigned Substation"
            : d.role === "head_police"
            ? "Central Command (City-wide Oversight)"
            : "General Citizen (No municipal jurisdiction)";

    const jurisdictionIcon =
        d.role === "admin"
            ? "location_on"
            : d.role === "police"
            ? "local_police"
            : d.role === "head_police"
            ? "corporate_fare"
            : "person";

    return `<section class="user-profile" aria-label="User profile summary">
    <!-- Hero Identity Card -->
    <div class="user-profile__hero">
      <div class="${userAvatarClass(d.role)}" aria-hidden="true">${escapeHtml(userInitials(d))}</div>
      <div class="user-profile__identity">
        <div class="user-profile__title-wrap">
          <h3>${escapeHtml(hasRealName ? name : (d.email || "Unnamed User"))}</h3>
          ${isCitizen ? verifiedBadgeHtml(verified) : ""}
        </div>
        <p class="user-profile__email-line">
          ${hasRealName && d.email ? `<span>${escapeHtml(d.email)}</span> <span class="user-profile__sep">•</span>` : ""}
          <span class="user-profile__sys-chip" title="System ID (Click to copy)" data-copy-text="${escapeAttr(sysId)}">
            <code>${escapeHtml(sysId)}</code>
            <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
          </span>
        </p>
        <div class="user-profile__badges">
          <span class="${roleBadgeClass(d.role)}">${escapeHtml(humanizeRole(d.role))}</span>
          <span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span>
        </div>
      </div>
    </div>

    <!-- Quick Telemetry Overview Ribbon -->
    <div class="user-profile__quick-grid" aria-label="Account telemetry">
      <div class="user-profile__quick-item">
        <div class="user-profile__quick-icon-wrap">
          <span class="material-symbols-outlined" aria-hidden="true">calendar_today</span>
        </div>
        <div class="user-profile__quick-content">
          <span>Date registered</span>
          <strong>${escapeHtml(joined)}</strong>
        </div>
      </div>
      <div class="user-profile__quick-item">
        <div class="user-profile__quick-icon-wrap">
          <span class="material-symbols-outlined" aria-hidden="true">schedule</span>
        </div>
        <div class="user-profile__quick-content">
          <span>Last active</span>
          <strong>${escapeHtml(lastSeen)}</strong>
        </div>
      </div>
    </div>

    <!-- Section 1: Contact & Verification -->
    <section class="user-profile__section">
      <div class="user-profile__section-header">
        <span class="material-symbols-outlined user-profile__section-icon" aria-hidden="true">contact_mail</span>
        <h4>Contact &amp; Verification</h4>
      </div>
      <dl class="user-profile__details">
        <div>
          <dt>Email address</dt>
          <dd class="user-profile__copy-dd">
            <span>${escapeHtml(d.email || "—")}</span>
            ${d.email ? `
            <button type="button" class="user-profile__inline-copy-btn" data-copy-text="${escapeAttr(d.email)}" title="Copy email address" aria-label="Copy email address">
              <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
            </button>` : ""}
          </dd>
        </div>
        <div>
          <dt>Contact phone</dt>
          <dd>${escapeHtml(contact)}</dd>
        </div>
        ${isCitizen ? `
        <div class="user-profile__details--full">
          <dt>Gmail Verification</dt>
          <dd>
            <div class="user-profile__verified-row">
              <span class="users-verified-badge ${verified ? "users-verified-badge--yes" : "users-verified-badge--no"}">
                <span class="material-symbols-outlined" aria-hidden="true">${verified ? "verified" : "help_outline"}</span>
                ${verified ? "Verified Account" : "Unverified Account"}
              </span>
              <span class="user-profile__verified-hint">${verified ? "Verified Gmail (eligible to submit incident reports)" : "Pending verification (citizen reports held until verified)"}</span>
            </div>
          </dd>
        </div>` : ""}
      </dl>
    </section>

    <!-- Section 2: System & Jurisdiction -->
    <section class="user-profile__section">
      <div class="user-profile__section-header">
        <span class="material-symbols-outlined user-profile__section-icon" aria-hidden="true">badge</span>
        <h4>System &amp; Jurisdiction</h4>
      </div>
      <dl class="user-profile__details">
        <div>
          <dt>System ID (Pseudonym)</dt>
          <dd class="user-profile__copy-dd">
            <code class="user-profile__mono-pill">${escapeHtml(sysId)}</code>
            <button type="button" class="user-profile__inline-copy-btn" data-copy-text="${escapeAttr(sysId)}" title="Copy System ID" aria-label="Copy System ID">
              <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
            </button>
          </dd>
        </div>
        <div>
          <dt>Firestore User ID</dt>
          <dd class="user-profile__copy-dd">
            <span class="incident-detail__mono" title="${escapeAttr(userId)}">${escapeHtml(userId)}</span>
            <button type="button" class="user-profile__inline-copy-btn" data-copy-text="${escapeAttr(userId)}" title="Copy User ID" aria-label="Copy User ID">
              <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
            </button>
          </dd>
        </div>
        <div>
          <dt>Assigned Role</dt>
          <dd><span class="${roleBadgeClass(d.role)}">${escapeHtml(humanizeRole(d.role))}</span></dd>
        </div>
        <div>
          <dt>Jurisdiction Assignment</dt>
          <dd class="user-profile__jurisdiction-dd">
            <span class="material-symbols-outlined" aria-hidden="true">${jurisdictionIcon}</span>
            <span>${escapeHtml(jurisdictionText)}</span>
          </dd>
        </div>
        <div>
          <dt>Account Status</dt>
          <dd><span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span></dd>
        </div>
        <div>
          <dt>Last Profile Update</dt>
          <dd>${escapeHtml(updated)}</dd>
        </div>
      </dl>
    </section>
  </section>

  <!-- Modal Action Footer -->
  <section class="incident-actions incident-actions--user" aria-label="User actions">
    <div class="incident-actions__head">
      <h3 class="incident-actions__title">Profile Actions</h3>
      <p class="incident-actions__hint">Manage account status, credentials, and cross-reference linked incident reports.</p>
    </div>
    <div class="incident-actions__buttons">
      <a href="incidents.html?search=${encodeURIComponent(sysId)}" target="_blank" rel="noopener noreferrer" class="incident-action-btn incident-action-btn--secondary" title="Search all incidents involving ${escapeAttr(sysId)}">
        <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
        <span>View Incidents</span>
      </a>
      <button type="button" class="incident-action-btn" data-user-action="edit-profile">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        <span>Edit Profile</span>
      </button>
      ${isCitizen && !verified && isHQ ? `
      <button type="button" class="incident-action-btn incident-action-btn--secondary" data-user-action="verify-account">
        <span class="material-symbols-outlined" aria-hidden="true">verified</span>
        <span>Verify (HQ Override)</span>
      </button>` : ""}
      <button type="button" class="incident-action-btn incident-action-btn--danger" data-user-action="delete-profile">
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        <span>Delete Profile</span>
      </button>
    </div>
    <p id="user-actions-feedback" class="incident-actions__feedback" aria-live="polite"></p>
  </section>`;
}

function renderUserEditForm(userId, d) {
    const isHQ = isHeadPoliceAdminRole(getCurrentAdminRole());
    const cur = normalizeRole(d.role);
    const curStatus = userStatus(d);
    const verified = isUserVerified(d);
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
        <p>Control the account role, verification, and moderation status.</p>
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
      <div class="user-modal-form__grid" id="user-edit-verified-grid" style="${cur === "user" && isHQ ? "margin-top: 10px;" : "display:none;margin-top: 10px;"}">
        <div class="user-modal-form__field user-modal-form__field--full">
          <label class="user-modal-form__label" for="user-edit-verified">Gmail Verification (HQ Override)</label>
          <div class="user-modal-form__select-wrap">
            <select id="user-edit-verified" name="isVerified" class="incidents-select" aria-label="Verification status">
              <option value="true"${verified ? " selected" : ""}>Verified — Eligible to send reports</option>
              <option value="false"${!verified ? " selected" : ""}>Unverified — Pending verification</option>
            </select>
          </div>
          <small style="color: #64748b; font-size: 0.8rem; margin-top: 4px; display: block;">
            Head Police HQ override for manual or testing account verification.
          </small>
        </div>
      </div>
      <div class="user-modal-form__grid" id="user-edit-barangay-grid" style="${cur === "admin" ? "margin-top:10px;" : "display:none;margin-top:10px;"}">
        <div class="user-modal-form__field user-modal-form__field--full">
          <label class="user-modal-form__label" for="user-edit-barangay">Assigned Barangay (Jurisdiction)</label>
          <div class="user-modal-form__select-wrap">
            <select id="user-edit-barangay" name="barangayId" class="incidents-select" aria-label="Assigned Barangay">
              <option value="">Unassigned</option>
              ${COVERED_BARANGAYS.map((b) => {
                  const sel = (String(d.barangayId || d.assignedBarangay || "").toLowerCase() === b.id.toLowerCase()) ? " selected" : "";
                  return `<option value="${escapeAttr(b.id)}"${sel}>${escapeHtml(b.name)} (${escapeHtml(b.code)})</option>`;
              }).join("")}
            </select>
          </div>
          <small style="color: #64748b; font-size: 0.8rem; margin-top: 4px; display: block;">
            Restricts incident report views and AI decision support to this barangay.
          </small>
        </div>
      </div>
      <div class="user-modal-form__grid" id="user-edit-substation-grid" style="${cur === "police" ? "margin-top:10px;" : "display:none;margin-top:10px;"}">
        <div class="user-modal-form__field user-modal-form__field--full">
          <label class="user-modal-form__label" for="user-edit-substation">Assigned Police Sub-station</label>
          <div class="user-modal-form__select-wrap">
            <select id="user-edit-substation" name="substationId" class="incidents-select" aria-label="Assigned Sub-station">
              <option value="">Unassigned</option>
              ${COVERED_SUBSTATIONS.map((s) => {
                  const sel = (String(d.substationId || d.assignedSubstation || "").toLowerCase() === s.id.toLowerCase()) ? " selected" : "";
                  return `<option value="${escapeAttr(s.id)}"${sel}>${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>`;
              }).join("")}
            </select>
          </div>
          <small style="color: #64748b; font-size: 0.8rem; margin-top: 4px; display: block;">
            Tactical responder station receiving High Severity & SOS alerts in this sector.
          </small>
        </div>
      </div>
      <div class="user-modal-form__grid" id="user-edit-head-police-note" style="${cur === "head_police" ? "margin-top:10px;" : "display:none;margin-top:10px;"}">
        <div class="user-modal-form__field user-modal-form__field--full">
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; border-radius: 6px; padding: 10px 12px; font-size: 0.85rem; line-height: 1.4;">
            <strong>Central Command (City-wide):</strong> Head Police Admin maintains macro oversight across all substations and can dispatch/reassign incidents.
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
    if (!row || row.children.length < 7) return;
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
    const badge = roleBadgeClass(d.role);
    const isVerified = isUserVerified(d);
    const isCitizen = normalizeRole(d.role) === "user";
    const status = userStatus(d);
    const sysId = formatUserSystemId(userId);

    const c1 = row.children[1];
    const c2 = row.children[2];
    const c3 = row.children[3];
    const c4 = row.children[4];
    const c5 = row.children[5];

    if (c1) {
        c1.innerHTML = `
          <div class="users-table__name-wrap">
            <span>${escapeHtml(name)}</span>
            <span class="users-table__sys-id" title="System ID for incident cross-referencing">${escapeHtml(sysId)}</span>
          </div>
        `;
    }
    if (c2) {
        c2.textContent = email;
        c2.setAttribute("title", email);
        c2.className = "incidents-table__desc";
    }
    if (c3) {
        c3.innerHTML = `<span class="${badge}" title="${escapeAttr(fullRole)}">${escapeHtml(baseRole)}</span>`;
    }
    if (c4) {
        c4.innerHTML = isCitizen
            ? verifiedBadgeHtml(isVerified)
            : '<span style="color: #94a3b8; font-weight: 500;">—</span>';
    }
    if (c5) {
        c5.innerHTML = `<span class="${statusBadgeClass(status)}">${escapeHtml(humanizeStatus(status))}</span>`;
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
    let modalDocUnsubscribe = null;

    function closeModal() {
        if (modalDocUnsubscribe) {
            modalDocUnsubscribe();
            modalDocUnsubscribe = null;
        }
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
        updateUserModalHeader(currentUserId, currentData);
        body.innerHTML = renderUserDetail(currentUserId, currentData);
        bindViewActions();
    }

    function showEdit() {
        if (!currentUserId || !currentData) return;
        if (titleEl) {
            titleEl.innerHTML = `
                <div class="incident-modal__header-bar">
                    <div class="incident-modal__header-left">
                        <span class="incident-modal__code-badge">EDIT</span>
                        <span class="incident-modal__type-name">Edit User Profile</span>
                    </div>
                </div>
            `;
        }
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
        const verifyBtn = body.querySelector(
            '[data-user-action="verify-account"]',
        );

        // Bind 1-click clipboard copy
        body.querySelectorAll("[data-copy-text]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const val = btn.getAttribute("data-copy-text");
                if (!val) return;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(val);
                        toastSuccess(`Copied: ${val}`);
                    } else {
                        prompt("Copy to clipboard:", val);
                    }
                } catch {
                    prompt("Copy to clipboard:", val);
                }
            });
        });

        verifyBtn?.addEventListener("click", async () => {
            if (!currentUserId) return;
            const isHQ = isHeadPoliceAdminRole(getCurrentAdminRole());
            if (!isHQ) {
                toastError("Only Head Police HQ Admin has permission to override user verification.");
                return;
            }
            verifyBtn.disabled = true;
            if (feedback) feedback.textContent = "Updating verification status…";
            try {
                await updateDoc(doc(db, "users", currentUserId), {
                    emailVerified: true,
                    isVerified: true,
                    updatedAt: serverTimestamp(),
                });
                toastSuccess("User account marked as verified (HQ Override)");
                if (feedback) feedback.textContent = "Account verified successfully.";
            } catch (err) {
                console.error("[user-modal] verify account error", err);
                toastError(err?.message || "Failed to update verification status");
                if (feedback) feedback.textContent = err?.message || "Verification failed.";
            } finally {
                verifyBtn.disabled = false;
            }
        });

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

        const roleEl = body.querySelector("#user-edit-role");
        const verifiedGrid = body.querySelector("#user-edit-verified-grid");
        const barangayGrid = body.querySelector("#user-edit-barangay-grid");
        const substationGrid = body.querySelector("#user-edit-substation-grid");
        const headPoliceNote = body.querySelector("#user-edit-head-police-note");

        const isHQ = isHeadPoliceAdminRole(getCurrentAdminRole());
        const syncEditRoleVisibility = () => {
            const r = normalizeRole(roleEl?.value ?? "user");
            if (verifiedGrid) verifiedGrid.style.display = (r === "user" && isHQ) ? "" : "none";
            if (barangayGrid) barangayGrid.style.display = r === "admin" ? "" : "none";
            if (substationGrid) substationGrid.style.display = r === "police" ? "" : "none";
            if (headPoliceNote) headPoliceNote.style.display = r === "head_police" ? "" : "none";
        };

        roleEl?.addEventListener("change", syncEditRoleVisibility);
        roleEl?.addEventListener("input", syncEditRoleVisibility);

        cancelBtn?.addEventListener("click", () => {
            if (feedback) feedback.textContent = "";
            showView();
        });

        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentUserId || !currentData) return;

            const fnEl = body.querySelector("#user-edit-first");
            const lnEl = body.querySelector("#user-edit-last");
            const statusEl = body.querySelector("#user-edit-status");
            const barangayEl = body.querySelector("#user-edit-barangay");
            const firstName = String(fnEl?.value ?? "").trim();
            const lastName = String(lnEl?.value ?? "").trim();
            let role = normalizeRole(roleEl?.value ?? "user");
            if (!EDIT_ROLES.includes(role)) role = "user";
            let status = String(statusEl?.value ?? "active").toLowerCase();
            if (!EDIT_STATUSES.includes(status)) status = "active";

            const barangayId = String(barangayEl?.value ?? "").trim();
            const barangayName = barangayId ? getBarangayNameById(barangayId) : null;
            const substationEl = body.querySelector("#user-edit-substation");
            const substationId = String(substationEl?.value ?? "").trim();
            const substationName = substationId ? getSubstationNameById(substationId) : null;
            const verifiedEl = body.querySelector("#user-edit-verified");

            if (feedback) feedback.textContent = "Saving…";
            saveBtn && (saveBtn.disabled = true);
            cancelBtn && (cancelBtn.disabled = true);

            // Always send uid so merged doc satisfies rules (uid must equal document id).
            const isHQ = isHeadPoliceAdminRole(getCurrentAdminRole());
            const payload = {
                uid: currentUserId,
                firstName,
                lastName,
                role,
                status,
                accountStatus: status === "active" ? "active" : (status === "suspended" ? "suspended" : "inactive"),
                disabled: status === "inactive",
                suspended: status === "suspended",
                updatedAt: serverTimestamp(),
            };

            if (isHQ && verifiedEl) {
                const isVerifiedVal = verifiedEl.value === "true";
                payload.isVerified = isVerifiedVal;
                payload.emailVerified = isVerifiedVal;
                payload.verificationStatus = isVerifiedVal ? "approved" : "unverified";
            }

            if (role === "admin" && barangayId) {
                payload.barangayId = barangayId;
                payload.assignedBarangay = barangayId;
                payload.barangayName = barangayName;
                payload.substationId = null;
                payload.assignedSubstation = null;
                payload.substationName = null;
                payload.isHeadPolice = null;
                payload.jurisdictionScope = null;
            } else if (role === "police" && substationId) {
                payload.substationId = substationId;
                payload.assignedSubstation = substationId;
                payload.substationName = substationName;
                payload.barangayId = null;
                payload.assignedBarangay = null;
                payload.barangayName = null;
                payload.isHeadPolice = null;
                payload.jurisdictionScope = null;
            } else if (role === "head_police") {
                payload.isHeadPolice = true;
                payload.jurisdictionScope = "citywide";
                payload.substationId = null;
                payload.assignedSubstation = null;
                payload.substationName = null;
                payload.barangayId = null;
                payload.assignedBarangay = null;
                payload.barangayName = null;
            } else {
                payload.barangayId = null;
                payload.assignedBarangay = null;
                payload.barangayName = null;
                payload.substationId = null;
                payload.assignedSubstation = null;
                payload.substationName = null;
                payload.isHeadPolice = null;
                payload.jurisdictionScope = null;
            }

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

    function openUserModalById(id) {
        if (!id) return;
        currentUserId = id;
        if (titleEl) titleEl.textContent = "Profile";
        body.innerHTML = '<p class="incident-modal__loading">Loading user…</p>';
        openModal();

        if (modalDocUnsubscribe) {
            modalDocUnsubscribe();
            modalDocUnsubscribe = null;
        }

        modalDocUnsubscribe = onSnapshot(
            doc(db, "users", id),
            (snap) => {
                if (!snap.exists()) {
                    body.innerHTML = `<p class="incident-modal__error">${escapeHtml("User profile not found.")}</p>`;
                    return;
                }
                currentData = snap.data();
                const isEditing = body.querySelector("#user-edit-form");
                if (!isEditing) {
                    updateUserModalHeader(snap.id, currentData);
                    body.innerHTML = renderUserDetail(snap.id, currentData);
                    bindViewActions();
                }
            },
            (err) => {
                console.error("[user-modal] realtime error", err);
                body.innerHTML = `<p class="incident-modal__error">${escapeHtml(err?.message || "Failed to load user")}</p>`;
            },
        );
    }

    tbody.addEventListener("click", (e) => {
        const tr = e.target.closest("tr[data-user-id]");
        const id = tr?.dataset?.userId;
        if (!id) return;
        openUserModalById(id);
    });

    tbody.addEventListener("keydown", (e) => {
        if (e.target.closest("button")) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        const tr = e.target.closest("tr[data-user-id]");
        const id = tr?.dataset?.userId;
        if (!id) return;
        e.preventDefault();
        openUserModalById(id);
    });
}
