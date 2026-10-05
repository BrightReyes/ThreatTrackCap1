import {
    addDoc,
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { logAudit } from "./audit.js";
import { toastError, toastSuccess } from "./alerts.js";
import {
    closeAdminCustomSelects,
    initAdminCustomSelects,
} from "./admin-custom-select.js";
import {
    canRespondToIncident,
    formatDistanceKm,
    getResponderOptionsForIncident,
    getIncidentTypeLabel,
    respondToIncident,
} from "./admin-response.js";

const LISTEN_LIMIT = 30;
const DISMISS_PREFIX = "threattrack:priority-alert-dismissed:";
const ACTIONED_PREFIX = "threattrack:priority-alert-actioned:";

let listenerStarted = false;
let alertOpen = false;
let activeAlert = null;
let activeAlertId = null;
let renderingAlert = false;
const alertQueue = [];
const queuedAlertIds = new Set();

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

function formatIncidentCode(docId) {
    let hash = 0;
    const s = String(docId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `TR-${String(hash).padStart(4, "0")}`;
}

function formatReportedAt(data = {}) {
    const ts = data.timestamp || data.reportedAt || data.clientTimestamp;
    try {
        const date =
            ts && typeof ts.toDate === "function"
                ? ts.toDate()
                : ts?.seconds
                  ? new Date(ts.seconds * 1000)
                  : ts
                    ? new Date(ts)
                    : null;
        if (!date || Number.isNaN(date.getTime())) return "Just now";
        return date.toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return "Just now";
    }
}

function getPrecinctDisplayName(option = {}) {
    return option.precinctName || option.name || option.shortName || "Unnamed precinct";
}

function formatEtaMinutes(etaMinutes, trafficLevel = null) {
    const n = Number(etaMinutes);
    if (!Number.isFinite(n)) return "ETA unavailable";
    const trafficText = trafficLevel ? `, ${trafficLevel}` : "";
    return `${Math.round(n)} min ETA${trafficText}`;
}

function renderResponderSelect(options = []) {
    const selectOptions = options.length
        ? [
              `<option value="">Choose precinct to dispatch</option>`,
              ...options.map((option, index) => {
                  const name = getPrecinctDisplayName(option);
                  const rank = index === 0 ? "Nearest" : `Option ${index + 1}`;
                  const meta = `${formatDistanceKm(option.distanceKm)} / ${formatEtaMinutes(option.etaMinutes, option.trafficLevel)}`;
                  return `<option value="${escapeAttr(option.precinctId)}" data-rank="${escapeAttr(rank)}" data-title="${escapeAttr(name)}" data-meta="${escapeAttr(meta)}">${escapeHtml(`${rank}: ${name} - ${meta}`)}</option>`;
              }),
          ].join("")
        : `<option value="">No precinct options loaded</option>`;
    const helperText = options.length
        ? "Sorted nearest first. ETA includes dispatch, route, traffic, and delay buffers."
        : "Open the report and verify the location before responding.";

    return `<label class="admin-priority-alert__responder-select" for="admin-priority-responder-select">
        <span class="admin-priority-alert__select-label">Responder precinct</span>
        <div class="admin-priority-alert__select-wrap">
            <select id="admin-priority-responder-select" data-priority-responder-select data-admin-select-variant="priority" ${options.length ? "" : "disabled"}>
                ${selectOptions}
            </select>
        </div>
        <small>${escapeHtml(helperText)}</small>
    </label>`;
}

function dismissalKey(id, data = {}) {
    return `${DISMISS_PREFIX}${id}:${data.status || "new"}:${data.responseStatus || "none"}`;
}

function actionedKey(id, data = {}) {
    return `${ACTIONED_PREFIX}${id}:${data.status || "new"}:${data.responseStatus || "none"}`;
}

function isDismissed(id, data) {
    try {
        return localStorage.getItem(dismissalKey(id, data)) === "1";
    } catch {
        return false;
    }
}

function wasActioned(id, data) {
    try {
        return localStorage.getItem(actionedKey(id, data)) === "1";
    } catch {
        return false;
    }
}

function dismiss(id, data) {
    try {
        localStorage.setItem(dismissalKey(id, data), "1");
    } catch {}
}

function markActioned(id, data) {
    try {
        localStorage.setItem(actionedKey(id, data), "1");
    } catch {}
}

function reportSortMs(data = {}) {
    const ts = data.timestamp || data.reportedAt || data.clientTimestamp;
    if (ts && typeof ts.toDate === "function") {
        const ms = ts.toDate().getTime();
        return Number.isFinite(ms) ? ms : 0;
    }
    if (ts?.seconds) {
        return Number(ts.seconds) * 1000;
    }
    if (ts) {
        const ms = new Date(ts).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }
    return 0;
}

function isEligibleAlert(id, data = {}, options = {}) {
    if (options.preview === true) return true;
    if (!id || data.isSOSReport !== true) return false;
    const status = String(data.status || "").toLowerCase().trim();
    if (["done", "completed", "resolved", "closed", "rejected", "spam"].includes(status)) return false;
    if (data.adminDismissed === true) return false;
    if (data.resolutionReason === "user_marked_safe") return false;
    if (data.liveStreamingActive === false || Boolean(data.distressResolvedAt)) return false;
    if (!canRespondToIncident(data)) return false;
    if (isDismissed(id, data)) return false;
    if (wasActioned(id, data)) return false;
    return true;
}

function shouldQueueAlert(id, data = {}, options = {}) {
    if (!isEligibleAlert(id, data, options)) return false;
    if (activeAlertId === id || queuedAlertIds.has(id)) return false;
    return true;
}

function sortAlertQueue() {
    alertQueue.sort(
        (a, b) =>
            a.reportedAtMs - b.reportedAtMs ||
            a.queuedAtMs - b.queuedAtMs,
    );
}

function enqueuePriorityAlert(id, data = {}, options = {}, queueOptions = {}) {
    if (!isEligibleAlert(id, data, options)) return;
    if (queuedAlertIds.has(id)) {
        const existing = alertQueue.find((item) => item.id === id);
        if (existing) {
            existing.data = data;
            existing.options = options;
            existing.reportedAtMs = reportSortMs(data);
            sortAlertQueue();
        }
        if (!queueOptions.deferProcess) {
            processPriorityQueue();
        }
        return;
    }
    if (!shouldQueueAlert(id, data, options)) return;
    queuedAlertIds.add(id);
    alertQueue.push({
        id,
        data,
        options,
        reportedAtMs: reportSortMs(data),
        queuedAtMs: Date.now(),
    });
    sortAlertQueue();
    if (!queueOptions.deferProcess) {
        processPriorityQueue();
    }
}

function removeQueuedAlert(id) {
    if (activeAlertId === id) {
        closeActiveAlert({showNext: true});
    }
    if (!queuedAlertIds.has(id)) return;
    queuedAlertIds.delete(id);
    const index = alertQueue.findIndex((item) => item.id === id);
    if (index >= 0) alertQueue.splice(index, 1);
}

function processPriorityQueue() {
    if (alertOpen || renderingAlert || !alertQueue.length) return;
    const next = alertQueue.shift();
    queuedAlertIds.delete(next.id);

    if (!shouldQueueAlert(next.id, next.data, next.options)) {
        processPriorityQueue();
        return;
    }

    renderingAlert = true;
    showPriorityAlert(next.id, next.data, next.options)
        .catch((error) => {
            activeAlert?.remove();
            activeAlert = null;
            activeAlertId = null;
            alertOpen = false;
            console.error("[admin-priority-alert] render", error);
        })
        .finally(() => {
            renderingAlert = false;
            if (!alertOpen) {
                processPriorityQueue();
            }
        });
}

function closeActiveAlert({showNext = true} = {}) {
    closeAdminCustomSelects();
    activeAlert?.remove();
    activeAlert = null;
    activeAlertId = null;
    alertOpen = false;
    if (showNext) {
        window.setTimeout(processPriorityQueue, 0);
    }
}

function promptSosDismissalReason(incidentCode = "") {
    return new Promise((resolve) => {
        let modalEl = document.getElementById("sos-dismissal-dialog");
        if (!modalEl) {
            modalEl = document.createElement("div");
            modalEl.id = "sos-dismissal-dialog";
            modalEl.className = "admin-priority-alert";
            modalEl.setAttribute("role", "dialog");
            modalEl.setAttribute("aria-modal", "true");
            modalEl.style.zIndex = "10001";
            modalEl.innerHTML = `
              <div class="admin-priority-alert__backdrop" data-sos-dismiss-cancel></div>
              <section class="admin-priority-alert__panel" style="max-width:500px;background:#ffffff;color:#1e293b;border-top:4px solid #ef4444;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                  <h3 id="sos-dismissal-dialog-title" style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:24px;color:#ef4444;">notifications_off</span>
                    Dismiss SOS Alert
                  </h3>
                  <button type="button" class="admin-priority-alert__close" data-sos-dismiss-cancel aria-label="Cancel" style="font-size:1.4rem;line-height:1;border:none;background:transparent;cursor:pointer;color:#64748b;">×</button>
                </div>
                <form id="sos-dismissal-form" style="display:flex;flex-direction:column;gap:14px;">
                  <p style="margin:0;font-size:0.875rem;color:#475569;line-height:1.45;">
                    Dismissing an active SOS alert requires an operational reason. This action is <strong>permanently logged in the audit trail</strong> and clears the urgent alert queue.
                  </p>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <label for="sos-dismissal-category" style="font-size:0.825rem;font-weight:700;color:#334155;">
                      Dismissal Reason <span style="color:#ef4444;">*</span>
                    </label>
                    <select id="sos-dismissal-category" required style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.9rem;background:#ffffff;color:#0f172a;">
                      <option value="" disabled selected>Select a reason...</option>
                      <option value="Handled via Radio / Phone / Direct Dispatch">Handled via Radio / Hotline / Direct Dispatch</option>
                      <option value="Accidental Trigger / Confirmed Safe">Accidental Trigger / Citizen Confirmed Safe</option>
                      <option value="False Alarm / Checked & Cleared">False Alarm / Area Checked & Cleared</option>
                      <option value="Duplicate Alert">Duplicate Alert (Already Actioned)</option>
                      <option value="System Test / Training Drill">System Test / Training Drill</option>
                      <option value="Other">Other Operational Reason</option>
                    </select>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <label for="sos-dismissal-notes" style="font-size:0.825rem;font-weight:700;color:#334155;">
                      Operational Notes / Details <span style="color:#ef4444;">*</span>
                    </label>
                    <textarea id="sos-dismissal-notes" required rows="3" placeholder="Explain how this distress call was addressed or verified..." style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.875rem;font-family:inherit;color:#0f172a;resize:vertical;box-sizing:border-box;"></textarea>
                  </div>
                  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:4px;">
                    <button type="button" class="admin-priority-alert__btn" data-sos-dismiss-cancel style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
                    <button type="submit" class="admin-priority-alert__btn admin-priority-alert__btn--dismiss" style="background:#ef4444;color:#ffffff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:700;">Confirm Dismissal</button>
                  </div>
                </form>
              </section>
            `;
            document.body.appendChild(modalEl);
        }

        const titleEl = modalEl.querySelector("#sos-dismissal-dialog-title");
        if (titleEl) {
            titleEl.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:24px;color:#ef4444;">notifications_off</span>
              Dismiss SOS Alert ${escapeHtml(incidentCode ? `(${incidentCode})` : "")}
            `;
        }

        const form = modalEl.querySelector("#sos-dismissal-form");
        const categorySelect = modalEl.querySelector("#sos-dismissal-category");
        const notesTextarea = modalEl.querySelector("#sos-dismissal-notes");

        categorySelect.value = "";
        notesTextarea.value = "";

        const onCategoryChange = () => {
            const val = categorySelect.value;
            if (val === "Handled via Radio / Phone / Direct Dispatch" && !notesTextarea.value) {
                notesTextarea.value = "Dispatched and coordinated directly via police radio/hotline.";
            } else if (val === "Accidental Trigger / Confirmed Safe" && !notesTextarea.value) {
                notesTextarea.value = "Citizen contacted and confirmed distress button was pressed accidentally; confirmed safe.";
            } else if (val === "False Alarm / Checked & Cleared" && !notesTextarea.value) {
                notesTextarea.value = "Patrol unit investigated reported coordinates; no emergency found, area clear.";
            } else if (val === "Duplicate Alert" && !notesTextarea.value) {
                notesTextarea.value = "Duplicate distress trigger for incident already being handled by responders.";
            } else if (val === "System Test / Training Drill" && !notesTextarea.value) {
                notesTextarea.value = "Operational system test / training drill alert.";
            }
        };
        categorySelect.addEventListener("change", onCategoryChange);

        const cancelButtons = modalEl.querySelectorAll("[data-sos-dismiss-cancel]");

        function cleanup() {
            modalEl.remove();
        }

        function onCancel(e) {
            e?.preventDefault?.();
            cleanup();
            resolve(null);
        }

        function onSubmit(e) {
            e.preventDefault();
            const category = categorySelect.value.trim();
            const notes = notesTextarea.value.trim();
            if (!category || !notes) return;
            cleanup();
            resolve({ category, notes });
        }

        form.addEventListener("submit", onSubmit);
        cancelButtons.forEach((b) => b.addEventListener("click", onCancel));
    });
}

async function showPriorityAlert(id, data, options = {}) {
    const isPreview = options.preview === true;
    if (alertOpen || !shouldQueueAlert(id, data, options)) return;
    alertOpen = true;
    activeAlertId = id;

    const typeLabel = getIncidentTypeLabel(data);
    const responderOptions = await getResponderOptionsForIncident(data, 4);
    const closestOption = responderOptions[0] || null;
    const distanceKm = closestOption?.distanceKm ?? null;
    const locationText =
        data.location?.address ||
        (data.location?.latitude && data.location?.longitude
            ? `${Number(data.location.latitude).toFixed(4)}, ${Number(data.location.longitude).toFixed(4)}`
            : "Location attached");
    const urgencyLabel = data.isSOSReport ? "SOS REPORT" : "HIGH PRIORITY";

    const root = document.createElement("div");
    root.className = "admin-priority-alert";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `
        <div class="admin-priority-alert__backdrop"></div>
        <section class="admin-priority-alert__panel" aria-label="Urgent incident alert">
            <div class="admin-priority-alert__signal" aria-hidden="true"></div>
            <div class="admin-priority-alert__top">
                <div>
                    <p class="admin-priority-alert__eyebrow">${escapeHtml(urgencyLabel)}</p>
                    <h2 class="admin-priority-alert__title">${escapeHtml(typeLabel)}</h2>
                </div>
                <button type="button" class="admin-priority-alert__close" data-priority-action="dismiss" aria-label="Dismiss">X</button>
            </div>
            <p class="admin-priority-alert__body">
                This report was auto-validated and needs responder acknowledgement.
            </p>
            <div class="admin-priority-alert__grid">
                <div>
                    <span>Reported</span>
                    <strong>${escapeHtml(formatReportedAt(data))}</strong>
                </div>
                <div>
                    <span>Location</span>
                    <strong>${escapeHtml(locationText)}</strong>
                </div>
                <div>
                    <span>Closest option</span>
                    <strong>${escapeHtml(closestOption ? getPrecinctDisplayName(closestOption) : "No option loaded")}</strong>
                </div>
                <div>
                    <span>Distance</span>
                    <strong>${escapeHtml(formatDistanceKm(distanceKm))}</strong>
                </div>
            </div>
            <div class="admin-priority-alert__responders" aria-label="Choose responder precinct">
                ${renderResponderSelect(responderOptions)}
            </div>
            <div class="admin-priority-alert__actions">
                <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--view" data-priority-action="view">View Report</button>
                <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--dismiss" data-priority-action="dismiss">Dismiss</button>
                <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--primary" data-priority-action="respond" data-priority-respond-button disabled>Respond</button>
            </div>
            <p class="admin-priority-alert__feedback" aria-live="polite"></p>
        </section>
    `;

    root.addEventListener("change", (event) => {
        const select = event.target.closest("[data-priority-responder-select]");
        if (!select) return;

        const respondButton = root.querySelector("[data-priority-respond-button]");
        const selectedResponder = responderOptions.find(
            (option) => option.precinctId === select.value,
        );
        if (respondButton) {
            respondButton.disabled = !selectedResponder;
        }

        const feedback = root.querySelector(".admin-priority-alert__feedback");
        if (feedback) {
            feedback.textContent = selectedResponder
                ? `${getPrecinctDisplayName(selectedResponder)} selected. Click Respond to send the update.`
                : "";
        }
    });

    root.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-priority-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-priority-action");
        const feedback = root.querySelector(".admin-priority-alert__feedback");

        if (action === "respond") {
            const select = root.querySelector("[data-priority-responder-select]");
            const responderId = select?.value || "";
            const selectedResponder = responderOptions.find(
                (option) => option.precinctId === responderId,
            );
            if (!selectedResponder) {
                if (feedback) {
                    feedback.textContent =
                        "Choose a responder precinct before sending a response.";
                }
                toastError("Choose a responder precinct before responding.");
                return;
            }

            if (isPreview) {
                if (feedback) {
                    feedback.textContent = `Preview mode: this would dispatch ${getPrecinctDisplayName(selectedResponder)}.`;
                }
                return;
            }

            root.querySelectorAll(
                "[data-priority-action], [data-priority-responder-select]",
            ).forEach((el) => {
                el.disabled = true;
            });
            if (feedback) {
                feedback.textContent = `Sending response update for ${getPrecinctDisplayName(selectedResponder)}...`;
            }
            try {
                await respondToIncident(id, data, selectedResponder);
                markActioned(id, data);
                toastSuccess("Responder alert sent to user");
                closeActiveAlert();
                window.dispatchEvent(
                    new CustomEvent("incident:updated", {
                        detail: {id, status: "responding"},
                    }),
                );
            } catch (error) {
                console.error("[admin-priority-alert] respond", error);
                toastError(error?.message || "Failed to respond");
                if (feedback) feedback.textContent = error?.message || "Failed to respond.";
                root.querySelectorAll(
                    "[data-priority-action], [data-priority-responder-select]",
                ).forEach((el) => {
                    el.disabled = false;
                });
            }
            return;
        }

        if (action === "dismiss") {
            if (isPreview) {
                closeActiveAlert();
                return;
            }
            const code = formatIncidentCode(id);
            const dismissal = await promptSosDismissalReason(code);
            if (!dismissal) return;

            root.querySelectorAll(
                "[data-priority-action], [data-priority-responder-select]",
            ).forEach((el) => {
                el.disabled = true;
            });
            if (feedback) {
                feedback.textContent = "Recording dismissal and clearing alert...";
            }

            try {
                const incidentRef = doc(db, "incidents", id);
                await updateDoc(incidentRef, {
                    adminDismissed: true,
                    adminDismissalReason: `${dismissal.category}: ${dismissal.notes}`,
                    adminDismissalCategory: dismissal.category,
                    adminDismissalNotes: dismissal.notes,
                    adminDismissedAt: serverTimestamp(),
                    adminDismissedBy: auth.currentUser?.uid || null,
                    adminDismissedByEmail: auth.currentUser?.email || null,
                });

                await logAudit("sos_alert_dismissed", {
                    incidentId: id,
                    incidentCode: code,
                    category: dismissal.category,
                    notes: dismissal.notes,
                });

                if (data.userId) {
                    try {
                        await addDoc(collection(db, "notifications"), {
                            userId: data.userId,
                            title: "Emergency Alert Cleared",
                            message: `Your SOS alert was reviewed and dismissed by dispatch: ${dismissal.category} - ${dismissal.notes}`,
                            type: "sos_dismissed",
                            incidentId: id,
                            read: false,
                            createdAt: serverTimestamp(),
                        });
                    } catch (notifErr) {
                        console.warn("[admin-sos-alerts] notification failed", notifErr);
                    }
                }

                dismiss(id, data);
                toastSuccess("SOS alert dismissed with audit record.");
                closeActiveAlert();
            } catch (err) {
                console.error("[admin-sos-alerts] dismiss error", err);
                toastError("Failed to record dismissal: " + (err?.message || "Unknown error"));
                if (feedback) {
                    feedback.textContent = err?.message || "Failed to record dismissal.";
                }
                root.querySelectorAll(
                    "[data-priority-action], [data-priority-responder-select]",
                ).forEach((el) => {
                    el.disabled = false;
                });
            }
            return;
        }

        if (action === "view") {
            if (isPreview) {
                if (feedback)
                    feedback.textContent =
                        "Preview mode: this would open the full incident report.";
                return;
            }
            markActioned(id, data);
            closeActiveAlert({showNext: false});
            window.location.href = `incidents.html?incidentId=${encodeURIComponent(id)}`;
            return;
        }

    });

    document.body.appendChild(root);
    initAdminCustomSelects(root);
    activeAlert = root;
}

export function showSosAlertPreview() {
    enqueuePriorityAlert(
        `preview-${Date.now()}`,
        {
            isSOSReport: true,
            type: "robbery_holdup",
            typeLabel: "Robbery / Hold-up",
            severity: "high",
            priority: "high",
            status: "under_review",
            timestamp: new Date(),
            location: {
                latitude: 14.6991,
                longitude: 120.982,
                address: "MacArthur Highway, Valenzuela City",
            },
        },
        { preview: true },
    );
}

function syncIncidentQueueFromDoc(docSnap, queueOptions = {}) {
    const data = docSnap.data() || {};
    const id = docSnap.id;

    if (activeAlertId === id && !isEligibleAlert(id, data)) {
        closeActiveAlert({showNext: true});
        if (data.resolutionReason === "user_marked_safe" || data.status === "done") {
            toastSuccess("Citizen confirmed safe. Emergency alert closed.");
        }
        window.dispatchEvent(
            new CustomEvent("incident:updated", {
                detail: { id, status: data.status || "done" },
            }),
        );
        return;
    }

    if (isEligibleAlert(id, data)) {
        enqueuePriorityAlert(id, data, {}, queueOptions);
    } else {
        removeQueuedAlert(id);
    }
}

function syncIncidentQueueFromChange(change, queueOptions = {}) {
    if (change.type === "removed") {
        removeQueuedAlert(change.doc.id);
        return;
    }
    syncIncidentQueueFromDoc(change.doc, queueOptions);
}

export function startAdminPriorityAlerts() {
    if (listenerStarted) return;
    listenerStarted = true;
    let initialSnapshotHandled = false;

    window.ThreatTrackPreviewSOS = showSosAlertPreview;

    const params = new URLSearchParams(window.location.search);
    if (params.get("sosPreview") === "1") {
        window.setTimeout(showSosAlertPreview, 250);
    }

    const q = query(
        collection(db, "incidents"),
        orderBy("timestamp", "desc"),
        limit(LISTEN_LIMIT),
    );

    onSnapshot(
        q,
        (snap) => {
            if (!initialSnapshotHandled) {
                initialSnapshotHandled = true;
                snap.docs.forEach((docSnap) =>
                    syncIncidentQueueFromDoc(docSnap, {deferProcess: true}),
                );
                processPriorityQueue();
                return;
            }

            snap.docChanges().forEach((change) =>
                syncIncidentQueueFromChange(change, {deferProcess: true}),
            );
            processPriorityQueue();
        },
        (error) => {
            console.error("[admin-priority-alert] listener", error);
        },
    );
}
