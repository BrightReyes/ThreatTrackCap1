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
import {
    evaluateIncidentLegitimacy,
    renderLegitimacyBanner,
} from "./incident-legitimacy.js";
    import {
        getCurrentAdminRole,
        hasIncidentAccess,
        isHeadPoliceAdminRole,
        isSubstationPoliceAdminRole,
        isPoliceAdminRole,
        getCurrentAdminSubstationId,
        getCurrentAdminSubstationName,
        getCurrentAdminBarangayName,
    } from "./admin-auth.js";
    import {
        COVERED_SUBSTATIONS,
        getSortedSubstationCandidates,
        getSubstationNameById,
    } from "../../shared/substations.js";

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
let liveAlertDocUnsub = null;

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

function renderResponderSelect(options = [], autoSelectNearest = false) {
    const selectOptions = options.length
        ? [
              `<option value="" ${autoSelectNearest ? "" : "selected"}>Choose precinct to dispatch</option>`,
              ...options.map((option, index) => {
                  const name = getPrecinctDisplayName(option);
                  const rank = index === 0 ? "Nearest" : `Option ${index + 1}`;
                  const meta = `${formatDistanceKm(option.distanceKm)} / ${formatEtaMinutes(option.etaMinutes, option.trafficLevel)}`;
                  const isSelected = autoSelectNearest && index === 0;
                  return `<option value="${escapeAttr(option.precinctId)}" ${isSelected ? "selected" : ""} data-rank="${escapeAttr(rank)}" data-title="${escapeAttr(name)}" data-meta="${escapeAttr(meta)}">${escapeHtml(`${rank}: ${name} - ${meta}`)}</option>`;
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

/**
 * Determines whether an incident belongs to "police" or "barangay".
 * Mirror of the Cloud Function routing logic:
 * - SOS emergencies ALWAYS route to Police (emergency override).
 * - High severity incidents route to Police.
 * - Low and medium severity incidents route to Barangay.
 *
 * @param {object} data - Incident data object
 * @returns {"police" | "barangay"} Target admin audience
 */
export function determineAlertAudience(data = {}) {
    // Rule 1: Emergency SOS always routes to police
    if (data?.isSOSReport === true) return "police";

    // Rule 2: Explicit notificationAudience stamped by Cloud Function
    const audience = String(data?.notificationAudience || "").toLowerCase().trim();
    if (audience === "police" || audience === "barangay") return audience;

    // Rule 3: High severity or high priority routes to police
    const severity = String(data?.severity || "").toLowerCase().trim();
    if (severity === "high") return "police";

    const priority = String(data?.priority || "").toLowerCase().trim();
    if (priority === "high") return "police";

    // Rule 4: Low and medium severity default to barangay
    return "barangay";
}

/**
 * Web Audio API synthesizer for distinct alert tones:
 * - police_sos: Rapid alternating dual-pitch siren (emergency tone)
 * - police_high: Urgent double-beep (high priority)
 * - barangay: Melodic 2-tone chime (standard notification)
 */
function playAlertSound(data = {}) {
    const audience = determineAlertAudience(data);
    const isSos = data?.isSOSReport === true;

    let soundType = "barangay";
    if (isSos) {
        soundType = "police_sos";
    } else if (audience === "police") {
        soundType = "police_high";
    } else {
        soundType = "barangay";
    }

    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        if (soundType === "police_sos") {
            // Rapid emergency siren (880Hz <-> 660Hz alternating)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sawtooth";
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(660, now + 0.2);
            osc.frequency.setValueAtTime(880, now + 0.4);
            osc.frequency.setValueAtTime(660, now + 0.6);
            osc.frequency.setValueAtTime(880, now + 0.8);
            osc.frequency.setValueAtTime(660, now + 1.0);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.2);
        } else if (soundType === "police_high") {
            // Urgent double-beep (750Hz)
            [0, 0.22].forEach((offset) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(750, now + offset);
                gain.gain.setValueAtTime(0.2, now + offset);
                gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.16);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + offset);
                osc.stop(now + offset + 0.16);
            });
        } else {
            // Barangay standard chime: C5 (523Hz) -> E5 (659Hz)
            const notes = [
                { freq: 523.25, offset: 0, dur: 0.22 },
                { freq: 659.25, offset: 0.16, dur: 0.38 },
            ];
            notes.forEach(({ freq, offset, dur }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(freq, now + offset);
                gain.gain.setValueAtTime(0.22, now + offset);
                gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + offset);
                osc.stop(now + offset + dur);
            });
        }
    } catch (err) {
        console.warn("[admin-sos-alerts] sound playback failed", err);
    }
}

function isEligibleAlert(id, data = {}, options = {}) {
    if (options.preview === true) return true;
    if (!id) return false;

    // Filter by audience against current admin role:
    // - Barangay Admin ("admin") only sees "barangay" audience (low / medium severity)
    // - Police Admin ("police") only sees "police" audience (SOS / high severity)
    const audience = determineAlertAudience(data);
    const currentRole = getCurrentAdminRole();
    const isPolice = isPoliceAdminRole(currentRole);
    const isForPolice = audience === "police";

    if (isPolice && !isForPolice) return false;
    if (!isPolice && isForPolice) return false;

    // Enforce jurisdiction: Barangay Admins only receive alerts for their assigned coverage
    if (!hasIncidentAccess(data)) return false;

    const status = String(data.status || "").toLowerCase().trim();
    if (["done", "completed", "resolved", "closed", "rejected", "spam"].includes(status)) return false;
    if (data.adminDismissed === true) return false;
    if (data.resolutionReason === "user_marked_safe") return false;
    if (data.isSOSReport && (data.liveStreamingActive === false || Boolean(data.distressResolvedAt))) return false;
    const isHqAssignedToMyStation =
        isSubstationPoliceAdminRole(currentRole) &&
        data.assignedByHq === true &&
        !data.respondingSubstationId;
    if (!canRespondToIncident(data) && !isHqAssignedToMyStation) return false;
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

    const currentRole = getCurrentAdminRole();
    const isHeadPolice = isHeadPoliceAdminRole(currentRole);
    const isSubstation = isSubstationPoliceAdminRole(currentRole);
    const isBarangay = currentRole === "admin";

    const typeLabel = getIncidentTypeLabel(data);
    const lat = Number(data.location?.latitude ?? data.latitude);
    const lng = Number(data.location?.longitude ?? data.longitude);

    // Candidates calculation:
    const substationCandidates = getSortedSubstationCandidates(lat, lng);
    const closestSubstation = substationCandidates[0] || null;
    const distanceKm = closestSubstation?.distanceKm ?? null;

    const locationText =
        data.location?.address ||
        (Number.isFinite(lat) && Number.isFinite(lng)
            ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
            : "Location attached");

    const audience = determineAlertAudience(data);
    let urgencyLabel;
    if (data.isSOSReport) {
        urgencyLabel = isHeadPolice ? "🚨 SOS EMERGENCY (HQ COMMAND)" : "🚨 SOS EMERGENCY (YOUR SECTOR)";
    } else if (audience === "police") {
        urgencyLabel = isHeadPolice ? "🚨 HIGH PRIORITY (HQ COMMAND)" : "🚨 HIGH PRIORITY (YOUR SECTOR)";
    } else {
        const brgyName = getCurrentAdminBarangayName() || "BARANGAY";
        urgencyLabel = `🔔 INCIDENT REPORT (${brgyName.toUpperCase()})`;
    }

    const legitimacy = evaluateIncidentLegitimacy(data);
    const legitimacyBannerHtml = renderLegitimacyBanner(legitimacy);

    // Render substation options for Head Police
    const substationSelectHtml = substationCandidates.length
        ? [
              '<option value="">Choose substation to assign...</option>',
              ...substationCandidates.map((s, idx) => {
                  const rank = idx === 0 ? "Nearest" : `Option ${idx + 1}`;
                  const meta = `${formatDistanceKm(s.distanceKm)} / ${s.etaMinutes} min ETA`;
                  const isSel = idx === 0 ? "selected" : "";
                  return `<option value="${escapeAttr(s.substationId)}" ${isSel}>${escapeHtml(`${rank}: ${s.substationName} - ${meta}`)}</option>`;
              }),
          ].join("")
        : '<option value="">No substation options loaded</option>';

    const root = document.createElement("div");
    root.className = `admin-priority-alert admin-priority-alert--${audience}`;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");

    let actionButtonsHtml = "";
    let responderPanelHtml = "";

    if (isHeadPolice) {
        // Head Police (HQ) POV: Assignment control
        responderPanelHtml = `
            <div class="admin-priority-alert__responders" aria-label="Assign police substation">
                <label class="admin-priority-alert__responder-select" for="admin-priority-responder-select">
                    <span class="admin-priority-alert__select-label">Assign Police Sub-station (Sorted by Distance)</span>
                    <div class="admin-priority-alert__select-wrap">
                        <select id="admin-priority-responder-select" data-priority-responder-select class="incidents-select">
                            ${substationSelectHtml}
                        </select>
                    </div>
                    <small>HQ Command: Select a substation to assign response deployment.</small>
                </label>
            </div>
        `;
        actionButtonsHtml = `
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--view" data-priority-action="view">View Report</button>
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--dismiss" data-priority-action="dismiss">Dismiss</button>
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--primary" data-priority-action="assign-substation">Assign Substation</button>
        `;
    } else if (isSubstation) {
        // Substation Police Admin POV: Direct response
        const myStationName = getCurrentAdminSubstationName() || "Your Sector Substation";
        const isHqAssigned = Boolean(data.assignedByHq);
        responderPanelHtml = `
            ${isHqAssigned ? '<div class="admin-priority-alert__hq-assigned-banner" style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px 12px;border-radius:6px;font-size:0.875rem;font-weight:700;margin-bottom:12px;">📢 Assigned by HQ Command to your station!</div>' : ''}
            <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:12px;">
                <div style="font-size:0.8rem;color:#64748b;font-weight:600;text-transform:uppercase;">Assigned Sector Outpost</div>
                <div style="font-size:0.95rem;color:#0f172a;font-weight:700;margin-top:2px;">🚔 ${escapeHtml(myStationName)}</div>
                <div style="font-size:0.8rem;color:#475569;margin-top:2px;">Distance to incident: ${escapeHtml(formatDistanceKm(distanceKm))} (${closestSubstation?.etaMinutes || 5} min ETA)</div>
            </div>
        `;
        actionButtonsHtml = `
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--view" data-priority-action="view">View Report</button>
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--dismiss" data-priority-action="dismiss">Dismiss</button>
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--primary" data-priority-action="respond">${isHqAssigned ? 'Confirm Deployment' : 'Respond Now'}</button>
        `;
    } else {
        // Barangay Admin POV
        const myBrgyName = getCurrentAdminBarangayName() || "Barangay Jurisdiction";
        responderPanelHtml = `
            <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:12px;">
                <div style="font-size:0.8rem;color:#64748b;font-weight:600;text-transform:uppercase;">Community Jurisdiction</div>
                <div style="font-size:0.95rem;color:#0f172a;font-weight:700;margin-top:2px;">📍 ${escapeHtml(myBrgyName)}</div>
                <div style="font-size:0.8rem;color:#475569;margin-top:2px;">Local peacekeeping & ordinance enforcement jurisdiction.</div>
            </div>
        `;
        actionButtonsHtml = `
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--view" data-priority-action="view">View Report</button>
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--dismiss" data-priority-action="dismiss">Dismiss</button>
            <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--primary" data-priority-action="respond">Dispatch Tanods / Action</button>
        `;
    }

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
            ${legitimacyBannerHtml}
            ${data.description ? `<div style="margin:0 0 12px 0;font-size:0.875rem;color:#334155;background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0;line-height:1.4;"><strong>Report Note:</strong> ${escapeHtml(data.description)}</div>` : ""}
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
                    <span>Closest outpost</span>
                    <strong>${escapeHtml(closestSubstation?.substationName || "No outpost loaded")}</strong>
                </div>
                <div>
                    <span>Distance</span>
                    <strong>${escapeHtml(formatDistanceKm(distanceKm))}</strong>
                </div>
            </div>
            ${responderPanelHtml}
            <div class="admin-priority-alert__actions">
                ${actionButtonsHtml}
            </div>
            <p class="admin-priority-alert__feedback" aria-live="polite"></p>
        </section>
    `;

    // Real-Time Race Condition Listener
    if (!isPreview) {
        liveAlertDocUnsub = onSnapshot(doc(db, "incidents", id), (snap) => {
            if (!snap.exists()) return;
            const liveData = snap.data();

            // Scenario A: Substation open modal receives HQ assignment
            if (isSubstation && liveData.assignedByHq === true) {
                let hqBanner = root.querySelector(".admin-priority-alert__hq-assigned-banner");
                if (!hqBanner) {
                    hqBanner = document.createElement("div");
                    hqBanner.className = "admin-priority-alert__hq-assigned-banner";
                    hqBanner.style.cssText = "background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px 12px;border-radius:6px;font-size:0.875rem;font-weight:700;margin-bottom:12px;";
                    hqBanner.textContent = "📢 Assigned by HQ Command to your station!";
                    const top = root.querySelector(".admin-priority-alert__top");
                    top?.after(hqBanner);
                }
                const respBtn = root.querySelector("[data-priority-action='respond']");
                if (respBtn) {
                    respBtn.textContent = "Confirm Deployment / Respond";
                    respBtn.disabled = false;
                }
                const fb = root.querySelector(".admin-priority-alert__feedback");
                if (fb) fb.textContent = "HQ has assigned this emergency to your sector.";
            }

            // Scenario B: HQ open modal receives Substation active response
            if (isHeadPolice && (liveData.responseStatus === "help_on_the_way" || liveData.status === "responding")) {
                let respBanner = root.querySelector(".admin-priority-alert__substation-responding-banner");
                if (!respBanner) {
                    respBanner = document.createElement("div");
                    respBanner.className = "admin-priority-alert__substation-responding-banner";
                    respBanner.style.cssText = "background:#ecfdf5;border:1px solid #10b981;color:#065f46;padding:10px 12px;border-radius:6px;font-size:0.875rem;font-weight:700;margin-bottom:12px;";
                    const stationName = liveData.respondingSubstationName || liveData.assignedSubstationName || "Substation";
                    respBanner.textContent = `🚔 ${stationName} is actively responding to this report!`;
                    const top = root.querySelector(".admin-priority-alert__top");
                    top?.after(respBanner);
                }
                const assignBtn = root.querySelector("[data-priority-action='assign-substation']");
                if (assignBtn) {
                    assignBtn.textContent = "Acknowledged / Close";
                    assignBtn.setAttribute("data-priority-action", "close-sync");
                    assignBtn.disabled = false;
                }
                const fb = root.querySelector(".admin-priority-alert__feedback");
                if (fb) fb.textContent = `Substation deployed units at ${new Date().toLocaleTimeString()}.`;
            }
        });
    }

    root.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-priority-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-priority-action");
        const feedback = root.querySelector(".admin-priority-alert__feedback");

        if (action === "close-sync") {
            closeActiveAlert();
            return;
        }

        if (action === "assign-substation") {
            const select = root.querySelector("#admin-priority-responder-select");
            const targetSubstationId = select?.value;
            const targetStation = COVERED_SUBSTATIONS.find((s) => s.id === targetSubstationId) || closestSubstation;
            if (!targetStation) {
                toastError("Choose a substation before assigning.");
                return;
            }

            root.querySelectorAll("[data-priority-action], select").forEach((el) => { el.disabled = true; });
            if (feedback) feedback.textContent = `Assigning ${targetStation.name}...`;

            try {
                const incidentRef = doc(db, "incidents", id);
                await updateDoc(incidentRef, {
                    status: "responding",
                    assignedSubstationId: targetStation.id,
                    assignedSubstationName: targetStation.name,
                    substationId: targetStation.id,
                    substationName: targetStation.name,
                    assignedByHq: true,
                    assignedByHqUid: auth.currentUser?.uid || null,
                    assignedByHqEmail: auth.currentUser?.email || null,
                    assignedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });

                await logAudit("sos_assigned_by_hq", {
                    incidentId: id,
                    assignedSubstationId: targetStation.id,
                    assignedSubstationName: targetStation.name,
                });

                toastSuccess(`Assigned to ${targetStation.name}`);
                closeActiveAlert();
                window.dispatchEvent(
                    new CustomEvent("incident:updated", {
                        detail: { id, status: "responding" },
                    }),
                );
            } catch (err) {
                console.error("[admin-sos-alerts] assign error", err);
                toastError(err?.message || "Failed to assign substation");
                root.querySelectorAll("[data-priority-action], select").forEach((el) => { el.disabled = false; });
            }
            return;
        }

        if (action === "respond") {
            const mySubstationId = getCurrentAdminSubstationId();
            const mySubstationName = getCurrentAdminSubstationName() || (mySubstationId ? getSubstationNameById(mySubstationId) : "Substation Police");
            const myBrgyName = getCurrentAdminBarangayName();

            root.querySelectorAll("[data-priority-action], select").forEach((el) => { el.disabled = true; });
            if (feedback) feedback.textContent = "Deploying emergency response units...";

            try {
                const incidentRef = doc(db, "incidents", id);
                const payload = {
                    status: "responding",
                    responseStatus: "help_on_the_way",
                    updatedAt: serverTimestamp(),
                };

                if (isSubstation) {
                    payload.respondingSubstationId = mySubstationId || null;
                    payload.respondingSubstationName = mySubstationName;
                    payload.respondedAt = serverTimestamp();
                } else {
                    payload.respondingBarangayName = myBrgyName;
                    payload.respondedAt = serverTimestamp();
                }

                await updateDoc(incidentRef, payload);

                await logAudit("incident_responded", {
                    incidentId: id,
                    stationOrBarangay: isSubstation ? mySubstationName : myBrgyName,
                });

                toastSuccess("Response units deployed! Help is on the way.");
                closeActiveAlert();
                window.dispatchEvent(
                    new CustomEvent("incident:updated", {
                        detail: { id, status: "responding" },
                    }),
                );
            } catch (err) {
                console.error("[admin-sos-alerts] respond error", err);
                toastError(err?.message || "Failed to deploy response");
                root.querySelectorAll("[data-priority-action], select").forEach((el) => { el.disabled = false; });
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

            root.querySelectorAll("[data-priority-action], select").forEach((el) => { el.disabled = true; });
            if (feedback) feedback.textContent = "Recording dismissal and clearing alert...";

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

                dismiss(id, data);
                toastSuccess("SOS alert dismissed with audit record.");
                closeActiveAlert();
            } catch (err) {
                console.error("[admin-sos-alerts] dismiss error", err);
                toastError("Failed to record dismissal: " + (err?.message || "Unknown error"));
                root.querySelectorAll("[data-priority-action], select").forEach((el) => { el.disabled = false; });
            }
            return;
        }

        if (action === "view") {
            if (isPreview) {
                if (feedback) feedback.textContent = "Preview mode: this would open the full incident report.";
                return;
            }
            markActioned(id, data);
            closeActiveAlert({ showNext: false });
            window.location.href = `incidents.html?incidentId=${encodeURIComponent(id)}`;
            return;
        }
    });

    document.body.appendChild(root);
    initAdminCustomSelects(root);
    activeAlert = root;
    playAlertSound(data);
}

export function showSosAlertPreview(overrides = {}) {
    enqueuePriorityAlert(
        `preview-${Date.now()}`,
        {
            isSOSReport: true,
            type: "robbery_holdup",
            typeLabel: "Robbery / Hold-up",
            description: "May snatcher sa overpass ng Karuhatan tumakbo papuntang palengke.",
            severity: "high",
            priority: "high",
            status: "under_review",
            timestamp: new Date(),
            location: {
                latitude: 14.6991,
                longitude: 120.982,
                address: "MacArthur Highway, Karuhatan, Valenzuela City",
            },
            legitimacyRating: "High Confidence Legit",
            legitimacySummary: "Verified emergency report with active SOS signal matching authentic incidents.",
            legitimacySource: "gemini_rag",
            ...overrides,
        },
        { preview: true },
    );
}

export function showBarangayAlertPreview(overrides = {}) {
    enqueuePriorityAlert(
        `preview-brgy-${Date.now()}`,
        {
            isSOSReport: false,
            notificationAudience: "barangay",
            type: "noise_disturbance",
            typeLabel: "Disturbance / Noise Complaint",
            description: "Loud karaoke session past curfew in Purok 4, Malinta.",
            severity: "low",
            priority: "normal",
            status: "under_review",
            timestamp: new Date(),
            location: {
                latitude: 14.6851,
                longitude: 120.975,
                address: "Purok 4, Barangay Malinta, Valenzuela City",
            },
            legitimacyRating: "High Confidence Legit",
            legitimacySummary: "Citizen community report verified with valid local barangay location.",
            legitimacySource: "gemini_rag",
            ...overrides,
        },
        { preview: true },
    );
}

// Expose on window for easy manual browser testing
if (typeof window !== "undefined") {
    window.showSosAlertPreview = showSosAlertPreview;
    window.showBarangayAlertPreview = showBarangayAlertPreview;
    window.showPoliceAlertPreview = showSosAlertPreview;
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
