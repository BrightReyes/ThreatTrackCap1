import {
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { confirmDanger, toastError, toastSuccess } from "./alerts.js";
import {
    canRespondToIncident,
    formatDistanceKm,
    getResponderOptionsForIncident,
    getIncidentTypeLabel,
    hasResponderAssigned,
    respondToIncident,
} from "./admin-response.js";

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

function humanize(str) {
    if (!str) return "—";
    return String(str)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status) {
    const allowed = ["pending", "under_review", "verified", "responding", "rejected", "done"];
    const s = status && allowed.includes(status) ? status : "unknown";
    return `incidents-badge incidents-badge--${s}`;
}

function severityBadgeClass(severity) {
    const allowed = ["high", "medium", "low"];
    const s =
        severity && allowed.includes(String(severity).toLowerCase())
            ? String(severity).toLowerCase()
            : "unknown";
    return `incidents-badge incidents-badge--${s}`;
}

function formatIncidentCode(docId) {
    // Stable 4-digit code derived from docId (not sequential).
    let hash = 0;
    const s = String(docId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `TR-${String(hash).padStart(4, "0")}`;
}

function isIncidentOpened(data = {}) {
    return data.isOpened === true || data.opened === true || !!data.openedAt;
}

function updateStatusCell(incidentId, status) {
    const row = document.querySelector(`tr[data-incident-id="${incidentId}"]`);
    if (!row) return;
    // Columns: 0 code, 1 reported, 2 type, 3 severity, 4 status, ...
    const cell = row.children?.[4];
    if (!cell) return;
    cell.innerHTML = `<span class="${statusBadgeClass(status)}">${escapeHtml(humanize(status))}</span>`;
}

function markRowOpened(incidentId) {
    const row = document.querySelector(
        `tr[data-incident-id="${CSS.escape(incidentId)}"]`,
    );
    if (!row) return;
    row.classList.remove("incidents-table__row--unopened");
    const code = row.querySelector(".incidents-code");
    code?.classList.remove("incidents-code--unopened");
    code?.setAttribute("title", "Opened incident");
}

function buildPhotosHtml(data) {
    const urls = [];
    if (Array.isArray(data.photoUrls)) {
        data.photoUrls.forEach((u) => {
            if (u) urls.push(String(u));
        });
    }
    if (data.photoURL) urls.push(String(data.photoURL));
    const unique = [...new Set(urls)];
    if (!unique.length) return '<span class="incident-detail__value">—</span>';
    return unique
        .map(
            (u, i) =>
                `<a class="incident-detail__link" href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">Photo ${i + 1}</a>`,
        )
        .join(" · ");
}

function reportedAtDisplay(d) {
    const primary = d.reportedAt || d.timestamp;
    return escapeHtml(formatTimestamp(primary));
}

function reporterSummary(d) {
    if (d.isAnonymous === true) return "Anonymous";
    if (d.reporterId) return "Signed-in user";
    return "—";
}

function buildPriorityPanel(d) {
    if (!canRespondToIncident(d)) return "";
    const label = d.isSOSReport ? "SOS auto-validated" : "High priority auto-validated";
    return `<section class="incident-priority-card">
    <div class="incident-priority-card__icon">!</div>
    <div>
      <h3>${escapeHtml(label)}</h3>
      <p>This report is ready for responder acknowledgement. Click Respond to alert the reporter.</p>
    </div>
  </section>`;
}

function buildResponsePanel(d) {
    if (!hasResponderAssigned(d)) return "";
    const response = d.response || {};
    const responder = d.responder || response.responder || {};
    const distanceText = formatDistanceKm(response.distanceKm);
    const etaText = formatEtaMinutes(
        response.etaMinutes,
        response.trafficLevel || responder.trafficLevel,
    );

    return `<section class="incident-response-card">
    <p class="incident-response-card__eyebrow">Responder update sent</p>
    <h3>${escapeHtml(getPrecinctDisplayName(responder) || "Assigned responder")}</h3>
    <p>${escapeHtml(response.message || "Help is on the way to the reporter.")}</p>
    <div class="incident-response-card__meta">
      <span>${escapeHtml(distanceText)}</span>
      <span>${escapeHtml(etaText)}</span>
      <span>${escapeHtml(responder.address || "Valenzuela City")}</span>
    </div>
  </section>`;
}

function getPrecinctDisplayName(option = {}) {
    return option.precinctName || option.name || option.shortName || "";
}

function formatEtaMinutes(etaMinutes, trafficLevel = null) {
    const n = Number(etaMinutes);
    if (!Number.isFinite(n)) return "ETA unavailable";
    const trafficText = trafficLevel ? `, ${trafficLevel}` : "";
    return `${Math.round(n)} min ETA${trafficText}`;
}

function buildResponderOptionsPanel(options = []) {
    const cards = options.length
        ? options
              .map(
                  (option, index) => `<button type="button" class="incident-responder-option" data-responder-id="${escapeAttr(option.precinctId)}">
        <span class="incident-responder-option__rank">${index === 0 ? "Nearest" : `Option ${index + 1}`}</span>
        <strong>${escapeHtml(getPrecinctDisplayName(option))}</strong>
        <span>${escapeHtml(option.address || "Valenzuela City")}</span>
        <span class="incident-responder-option__meta">
          ${escapeHtml(formatDistanceKm(option.distanceKm))} • ${escapeHtml(formatEtaMinutes(option.etaMinutes))}
        </span>
      </button>`,
              )
              .join("")
        : `<div class="incident-responder-picker__empty">
        No active precinct options with coordinates are available for this report. Check the incident location and precinct records before responding.
      </div>`;

    return `<section class="incident-responder-picker" aria-label="Choose responder precinct">
    <div class="incident-responder-picker__header">
      <h3>Choose responder precinct</h3>
      <p>Nearest options are sorted by distance. The alert is sent only after an admin chooses one.</p>
    </div>
    <div class="incident-responder-picker__list">${cards}</div>
  </section>`;
}

function buildResponderSelect(options = null) {
    if (options === null) {
        return `<label class="incident-responder-select">
      <span class="incident-responder-select__label">Responder precinct</span>
      <div class="incident-responder-select__wrap">
        <select id="incident-responder-select" disabled>
          <option>Loading nearest precincts...</option>
        </select>
      </div>
      <small>Choices use the same precinct list as the map locator.</small>
    </label>`;
    }

    if (!options.length) {
        return `<label class="incident-responder-select">
      <span class="incident-responder-select__label">Responder precinct</span>
      <div class="incident-responder-select__wrap">
        <select id="incident-responder-select" disabled>
          <option>No precinct options available</option>
        </select>
      </div>
      <small>Check the incident location and precinct records before responding.</small>
    </label>`;
    }

    const optionHtml = [
        '<option value="">Choose precinct...</option>',
        ...options.map((option, index) => {
            const prefix = index === 0 ? "Nearest" : `Option ${index + 1}`;
            const distance = formatDistanceKm(option.distanceKm);
            const eta = formatEtaMinutes(option.etaMinutes, option.trafficLevel);
            return `<option value="${escapeAttr(option.precinctId)}">${escapeHtml(`${prefix}: ${getPrecinctDisplayName(option)} - ${distance} / ${eta}`)}</option>`;
        }),
    ].join("");

    return `<label class="incident-responder-select">
      <span class="incident-responder-select__label">Responder precinct</span>
      <div class="incident-responder-select__wrap">
        <select id="incident-responder-select">${optionHtml}</select>
      </div>
      <small>Sorted nearest first. ETA includes dispatch, route, traffic, and delay buffers.</small>
    </label>`;
}

function buildStatusUpdatePayload(nextStatus) {
    const moderatedBy = auth.currentUser?.uid || null;
    const firestore = {
        status: nextStatus,
        moderatedBy,
        moderatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    const local = {
        status: nextStatus,
        moderatedBy,
        moderatedAt: null,
        updatedAt: null,
    };

    if (nextStatus === "done") {
        Object.assign(firestore, {
            responseStatus: "completed",
            completedBy: moderatedBy,
            completedAt: serverTimestamp(),
            "response.status": "completed",
            "response.completedAt": serverTimestamp(),
            "response.updatedAt": serverTimestamp(),
        });
        Object.assign(local, {
            responseStatus: "completed",
            completedBy: moderatedBy,
            completedAt: null,
            response: {
                ...(local.response || {}),
                status: "completed",
                completedAt: null,
                updatedAt: null,
            },
        });
    }

    if (nextStatus === "rejected") {
        Object.assign(firestore, {
            responseStatus: "rejected",
            "response.status": "rejected",
            "response.updatedAt": serverTimestamp(),
        });
        Object.assign(local, {
            responseStatus: "rejected",
            response: {
                ...(local.response || {}),
                status: "rejected",
                updatedAt: null,
            },
        });
    }

    return {firestore, local};
}

function needsTerminalResponseSync(data = {}, nextStatus = "") {
    if (nextStatus === "done") {
        return (
            data.responseStatus !== "completed" ||
            data.response?.status !== "completed"
        );
    }
    if (nextStatus === "rejected") {
        return (
            data.responseStatus === "help_on_the_way" ||
            data.response?.status === "help_on_the_way"
        );
    }
    return false;
}

function renderIncidentDetail(docId, d, responderOptions = null) {
    const loc = d.location || {};
    const lat =
        loc.latitude != null && !Number.isNaN(Number(loc.latitude))
            ? Number(loc.latitude)
            : null;
    const lng =
        loc.longitude != null && !Number.isNaN(Number(loc.longitude))
            ? Number(loc.longitude)
            : null;
    const mapsHref =
        lat != null && lng != null
            ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
            : null;

    const code = formatIncidentCode(docId);

    const rows = [
        ["Incident code", escapeHtml(code)],
        [
            "Status",
            `<span class="${statusBadgeClass(d.status)}">${escapeHtml(humanize(d.status))}</span>`,
        ],
        [
            "Severity",
            `<span class="${severityBadgeClass(d.severity)}">${escapeHtml(humanize(d.severity))}</span>`,
        ],
        ["Type", escapeHtml(getIncidentTypeLabel(d))],
        [
            "Description",
            `<div class="incident-detail__desc">${escapeHtml(d.description || "—")}</div>`,
        ],
        ["Reported", reportedAtDisplay(d)],
        [
            "Location",
            lat != null && lng != null
                ? `${escapeHtml(String(lat))}, ${escapeHtml(String(lng))}${
                      mapsHref
                          ? ` · <a class="incident-detail__link" href="${escapeAttr(mapsHref)}" target="_blank" rel="noopener noreferrer">Open map</a>`
                          : ""
                  }`
                : "—",
        ],
        ["Address", escapeHtml(loc.address || "—")],
        ["Reporter", escapeHtml(reporterSummary(d))],
        ["Photos", buildPhotosHtml(d)],
    ];

    const actionStatus = d.status || "under_review";
    return `<dl class="incident-detail">
    ${rows
        .map(
            ([label, inner]) =>
                `<div class="incident-detail__row"><dt>${escapeHtml(label)}</dt><dd>${inner}</dd></div>`,
        )
        .join("")}
  </dl>
  ${buildPriorityPanel(d)}
  ${buildResponsePanel(d)}
  <section class="incident-actions incident-actions--moderation" aria-label="Incident actions">
    ${canRespondToIncident(d) ? buildResponderSelect(responderOptions) : ""}
    <div class="incident-actions__buttons">
      ${
          canRespondToIncident(d)
              ? '<button type="button" class="incident-action-btn incident-action-btn--respond" data-action-respond="true">Respond</button>'
              : ""
      }
      <button type="button" class="incident-action-btn${actionStatus === "under_review" ? " is-active" : ""}" data-action-status="under_review">Under review</button>
      <button type="button" class="incident-action-btn${actionStatus === "verified" ? " is-active" : ""}" data-action-status="verified">Verify</button>
      <button type="button" class="incident-action-btn${actionStatus === "done" ? " incident-action-btn--success is-active" : " incident-action-btn--success"}" data-action-status="done">${actionStatus === "done" ? "Completed" : "Mark Done"}</button>
      <button type="button" class="incident-action-btn${actionStatus === "rejected" ? " incident-action-btn--danger is-active" : " incident-action-btn--danger"}" data-action-status="rejected">Reject</button>
    </div>
    <p id="incident-actions-feedback" class="incident-actions__feedback" aria-live="polite"></p>
  </section>`;
}

export function initIncidentModal() {
    const modal = document.getElementById("incident-modal");
    const body = document.getElementById("incident-modal-body");
    const titleEl = document.getElementById("incident-modal-title");
    const closeBtn = document.getElementById("incident-modal-close");
    const backdrop = modal?.querySelector("[data-close-modal]");
    const tbody = document.getElementById("incidents-tbody");
    let currentIncidentId = null;
    let currentData = null;
    let currentResponderOptions = [];
    let openMenu = null;

    if (!modal || !body || !tbody) return;

    function closeModal() {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        body.innerHTML = "";
        document.body.style.overflow = "";
        currentIncidentId = null;
        currentData = null;
        currentResponderOptions = [];
    }

    function openModal() {
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeRowMenu() {
        if (!openMenu) return;
        const button = openMenu
            .closest(".incidents-row-actions")
            ?.querySelector("[data-incident-menu-toggle]");
        openMenu.hidden = true;
        button?.setAttribute("aria-expanded", "false");
        openMenu = null;
    }

    function toggleRowMenu(button) {
        const menu = button
            ?.closest(".incidents-row-actions")
            ?.querySelector(".incidents-row-menu");
        if (!menu) return;
        if (openMenu && openMenu !== menu) closeRowMenu();
        const nextOpen = menu.hidden;
        menu.hidden = !nextOpen;
        button.setAttribute("aria-expanded", String(nextOpen));
        openMenu = nextOpen ? menu : null;
    }

    closeBtn?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeRowMenu();
            if (!modal.hidden) closeModal();
        }
    });
    document.addEventListener("click", (e) => {
        if (!openMenu || e.target.closest(".incidents-row-actions")) return;
        closeRowMenu();
    });

    function bindActionHandlers() {
        const feedback = document.getElementById("incident-actions-feedback");
        body.querySelector("[data-action-respond]")?.addEventListener("click", async () => {
            if (!currentIncidentId || !currentData) return;
            const selectedId = document.getElementById("incident-responder-select")?.value;
            const selectedResponder = currentResponderOptions.find(
                (option) => option.precinctId === selectedId,
            );

            if (!selectedResponder) {
                if (feedback) {
                    feedback.textContent = "Choose a responder precinct before sending the alert.";
                }
                toastError("Choose a responder precinct first.");
                return;
            }

            sendResponderUpdate(selectedResponder);
        });

        body.querySelectorAll("[data-action-status]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                if (!currentIncidentId || !currentData) return;
                const nextStatus = btn.getAttribute("data-action-status");
                if (!nextStatus) return;
                const needsSync = needsTerminalResponseSync(currentData, nextStatus);
                if (currentData.status === nextStatus && !needsSync) return;

                const previous = currentData.status;
                if (feedback) {
                    feedback.textContent = needsSync
                        ? "Syncing user-facing status..."
                        : "Updating status...";
                }
                body.querySelectorAll("[data-action-status]").forEach(
                    (b) => (b.disabled = true),
                );
                try {
                    const statusUpdate = buildStatusUpdatePayload(nextStatus);
                    await updateDoc(
                        doc(db, "incidents", currentIncidentId),
                        statusUpdate.firestore,
                    );
                    currentData = {
                        ...currentData,
                        ...statusUpdate.local,
                        response: {
                            ...(currentData.response || {}),
                            ...(statusUpdate.local.response || {}),
                        },
                    };
                    body.innerHTML = renderIncidentDetail(
                        currentIncidentId,
                        currentData,
                    );
                    bindActionHandlers();
                    updateStatusCell(currentIncidentId, nextStatus);
                    if (feedback)
                        feedback.textContent = `Status updated to ${humanize(nextStatus)}.`;
                    toastSuccess(`Incident set to ${humanize(nextStatus)}`);
                    window.dispatchEvent(
                        new CustomEvent("incident:updated", {
                            detail: {
                                id: currentIncidentId,
                                status: nextStatus,
                            },
                        }),
                    );
                } catch (err) {
                    console.error("[incident-modal] update status", err);
                    currentData = { ...currentData, status: previous };
                    if (feedback)
                        feedback.textContent =
                            err?.message || "Failed to update status.";
                    toastError(err?.message || "Failed to update status");
                    body.querySelectorAll("[data-action-status]").forEach(
                        (b) => (b.disabled = false),
                    );
                }
            });
        });
    }

    function syncResponderActionState() {
        const select = document.getElementById("incident-responder-select");
        const respondButton = body.querySelector("[data-action-respond]");
        const selectedResponder = currentResponderOptions.find(
            (option) => option.precinctId === select?.value,
        );

        if (respondButton) {
            respondButton.disabled = !selectedResponder;
        }

        const feedback = document.getElementById("incident-actions-feedback");
        if (feedback && selectedResponder) {
            feedback.textContent = `${getPrecinctDisplayName(selectedResponder)} selected. Click Respond to send the alert.`;
        }
    }

    async function loadResponderOptions() {
        if (!currentIncidentId || !currentData || !canRespondToIncident(currentData)) {
            return;
        }
        const respondButton = body.querySelector("[data-action-respond]");
        if (respondButton) respondButton.disabled = true;

        try {
            currentResponderOptions = await getResponderOptionsForIncident(currentData);
            const select = body.querySelector(".incident-responder-select");
            if (select) {
                select.outerHTML = buildResponderSelect(currentResponderOptions);
            }
            document
                .getElementById("incident-responder-select")
                ?.addEventListener("change", syncResponderActionState);
            syncResponderActionState();
        } catch (err) {
            console.error("[incident-modal] load responders", err);
            currentResponderOptions = [];
            const select = body.querySelector(".incident-responder-select");
            if (select) {
                select.outerHTML = buildResponderSelect([]);
            }
        } finally {
            syncResponderActionState();
        }
    }

    async function sendResponderUpdate(selectedResponder) {
        if (!currentIncidentId || !currentData) return;
        const feedback = document.getElementById("incident-actions-feedback");
        if (feedback) {
            feedback.textContent = `Sending responder alert for ${getPrecinctDisplayName(selectedResponder)}...`;
        }
        body.querySelectorAll(
            "[data-action-status], [data-action-respond], #incident-responder-select",
        ).forEach((b) => (b.disabled = true));

        try {
            const responseUpdate = await respondToIncident(
                currentIncidentId,
                currentData,
                selectedResponder,
            );
            currentData = {
                ...currentData,
                ...responseUpdate,
            };
            body.innerHTML = renderIncidentDetail(currentIncidentId, currentData);
            bindActionHandlers();
            updateStatusCell(currentIncidentId, "responding");
            toastSuccess("Responder alert sent to user");
            window.dispatchEvent(
                new CustomEvent("incident:updated", {
                    detail: {
                        id: currentIncidentId,
                        status: "responding",
                    },
                }),
            );
        } catch (err) {
            console.error("[incident-modal] respond", err);
            if (feedback) {
                feedback.textContent =
                    err?.message || "Failed to send responder update.";
            }
            toastError(err?.message || "Failed to send responder update");
            body.querySelectorAll(
                "[data-action-status], [data-action-respond], #incident-responder-select",
            ).forEach((b) => (b.disabled = false));
        }
    }

    async function openIncidentById(id) {
        if (!id) return;
        currentIncidentId = id;
        if (titleEl) titleEl.textContent = "Incident details";
        body.innerHTML =
            '<p class="incident-modal__loading">Loading report…</p>';
        openModal();

        try {
            const ref = doc(db, "incidents", id);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                body.innerHTML = `<p class="incident-modal__error">${escapeHtml("This incident was not found.")}</p>`;
                return;
            }
            const d = snap.data();
            currentData = d;
            currentResponderOptions = [];
            if (!isIncidentOpened(d)) {
                currentData = { ...currentData, isOpened: true };
                markRowOpened(id);
                window.dispatchEvent(
                    new CustomEvent("incident:updated", {
                        detail: {
                            id,
                            isOpened: true,
                        },
                    }),
                );
                updateDoc(ref, {
                    isOpened: true,
                    openedBy: auth.currentUser?.uid || null,
                    openedAt: serverTimestamp(),
                }).catch((err) => {
                    console.warn("[incident-modal] mark opened", err);
                });
            }
            if (titleEl) {
                titleEl.textContent = `Incident — ${humanize(d.type)}`;
            }
            body.innerHTML = renderIncidentDetail(snap.id, currentData);
            bindActionHandlers();
            loadResponderOptions();
        } catch (err) {
            console.error("[incident-modal] open by id", err);
            body.innerHTML = `<p class="incident-modal__error">${escapeHtml(err?.message || "Failed to load incident")}</p>`;
        }
    }

    async function archiveIncidentById(id) {
        const ref = doc(db, "incidents", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            throw new Error("This incident was not found.");
        }

        const batch = writeBatch(db);
        batch.set(
            doc(db, "incidents_archive", id),
            {
                ...snap.data(),
                archivedAt: serverTimestamp(),
                archivedBy: auth.currentUser?.uid || null,
            },
            { merge: true },
        );
        batch.delete(ref);
        await batch.commit();
    }

    function removeRowFromTable(id) {
        document
            .querySelector(`tr[data-incident-id="${CSS.escape(id)}"]`)
            ?.remove();
        window.dispatchEvent(
            new CustomEvent("incident:removed", {
                detail: { id },
            }),
        );
    }

    async function handleRowOption(action, id, button) {
        if (!action || !id) return;
        closeRowMenu();

        if (action === "archive") {
            const ok = await confirmDanger({
                title: "Archive incident?",
                text: "This moves the incident out of the active incident list.",
                confirmText: "Archive",
            });
            if (!ok) return;

            button.disabled = true;
            try {
                await archiveIncidentById(id);
                removeRowFromTable(id);
                toastSuccess("Incident archived");
            } catch (err) {
                console.error("[incident-modal] archive", err);
                toastError(err?.message || "Failed to archive incident");
                button.disabled = false;
            }
            return;
        }

        if (action === "delete") {
            const ok = await confirmDanger({
                title: "Delete incident?",
                text: "This permanently deletes the incident from the active list.",
                confirmText: "Delete",
            });
            if (!ok) return;

            button.disabled = true;
            try {
                await deleteDoc(doc(db, "incidents", id));
                removeRowFromTable(id);
                toastSuccess("Incident deleted");
            } catch (err) {
                console.error("[incident-modal] delete", err);
                toastError(err?.message || "Failed to delete incident");
                button.disabled = false;
            }
        }
    }

    tbody.addEventListener("click", async (e) => {
        const toggle = e.target.closest("[data-incident-menu-toggle]");
        if (toggle) {
            e.stopPropagation();
            toggleRowMenu(toggle);
            return;
        }

        const option = e.target.closest("[data-incident-option]");
        if (option) {
            e.stopPropagation();
            const tr = option.closest("tr");
            await handleRowOption(
                option.getAttribute("data-incident-option"),
                tr?.dataset?.incidentId,
                option,
            );
            return;
        }

        const tr = e.target.closest("tr[data-incident-id]");
        const id = tr?.dataset?.incidentId;
        if (!id) return;

        await openIncidentById(id);
    });

    tbody.addEventListener("keydown", async (e) => {
        if (e.target.closest("button")) return;
        if (e.key !== "Enter" && e.key !== " ") return;

        const tr = e.target.closest("tr[data-incident-id]");
        const id = tr?.dataset?.incidentId;
        if (!id) return;

        e.preventDefault();
        await openIncidentById(id);
    });

    return { openIncidentById };
}
