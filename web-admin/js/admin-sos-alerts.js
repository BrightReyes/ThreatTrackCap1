import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { toastError, toastSuccess } from "./alerts.js";
import {
    canRespondToIncident,
    calculateDistanceKm,
    formatDistanceKm,
    getIncidentTypeLabel,
    respondToIncident,
} from "./admin-response.js";

const LISTEN_LIMIT = 30;
const DISMISS_PREFIX = "threattrack:priority-alert-dismissed:";
const SHOWN_PREFIX = "threattrack:sos-alert-shown:";

let listenerStarted = false;
let alertOpen = false;
let activeAlert = null;
const shownThisSession = new Set();

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
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

function dismissalKey(id, data = {}) {
    return `${DISMISS_PREFIX}${id}:${data.status || "new"}:${data.responseStatus || "none"}`;
}

function shownKey(id) {
    return `${SHOWN_PREFIX}${id}`;
}

function isDismissed(id, data) {
    try {
        return localStorage.getItem(dismissalKey(id, data)) === "1";
    } catch {
        return false;
    }
}

function wasShown(id) {
    try {
        return localStorage.getItem(shownKey(id)) === "1";
    } catch {
        return false;
    }
}

function markShown(id) {
    try {
        localStorage.setItem(shownKey(id), "1");
    } catch {}
}

function dismiss(id, data) {
    try {
        localStorage.setItem(dismissalKey(id, data), "1");
    } catch {}
}

function closeActiveAlert() {
    if (!activeAlert) return;
    activeAlert.remove();
    activeAlert = null;
    alertOpen = false;
}

function showPriorityAlert(id, data, options = {}) {
    const isPreview = options.preview === true;
    if (alertOpen || !canRespondToIncident(data)) return;
    if (data.isSOSReport !== true) return;
    if (
        !isPreview &&
        (shownThisSession.has(id) || wasShown(id) || isDismissed(id, data))
    )
        return;

    if (!isPreview) {
        shownThisSession.add(id);
        markShown(id);
    }
    alertOpen = true;

    const typeLabel = getIncidentTypeLabel(data);
    const distanceKm = calculateDistanceKm(data.location);
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
        <div class="admin-priority-alert__backdrop" data-priority-action="dismiss"></div>
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
                    <span>Default responder</span>
                    <strong>Malinta Precinct</strong>
                </div>
                <div>
                    <span>Distance</span>
                    <strong>${escapeHtml(formatDistanceKm(distanceKm))}</strong>
                </div>
            </div>
            <div class="admin-priority-alert__actions">
                <button type="button" class="admin-priority-alert__btn admin-priority-alert__btn--primary" data-priority-action="respond">Respond</button>
                <button type="button" class="admin-priority-alert__btn" data-priority-action="view">View report</button>
            </div>
            <p class="admin-priority-alert__feedback" aria-live="polite"></p>
        </section>
    `;

    root.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-priority-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-priority-action");
        const feedback = root.querySelector(".admin-priority-alert__feedback");

        if (action === "dismiss") {
            if (!isPreview) dismiss(id, data);
            closeActiveAlert();
            return;
        }

        if (action === "view") {
            if (isPreview) {
                if (feedback)
                    feedback.textContent =
                        "Preview mode: this would open the full incident report.";
                return;
            }
            window.location.href = `incidents.html?incidentId=${encodeURIComponent(id)}`;
            return;
        }

        if (action === "respond") {
            if (isPreview) {
                if (feedback)
                    feedback.textContent =
                        "Preview mode: this would send a responder update.";
                return;
            }
            root.querySelectorAll("[data-priority-action]").forEach((el) => {
                el.disabled = true;
            });
            if (feedback) feedback.textContent = "Sending response update...";
            try {
                await respondToIncident(id, data);
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
                root.querySelectorAll("[data-priority-action]").forEach((el) => {
                    el.disabled = false;
                });
            }
        }
    });

    document.body.appendChild(root);
    activeAlert = root;
}

export function showSosAlertPreview() {
    showPriorityAlert(
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
                return;
            }

            const newSosDoc = snap.docChanges().find((change) => {
                if (change.type !== "added") return false;
                const data = change.doc.data() || {};
                return (
                    data.isSOSReport === true &&
                    canRespondToIncident(data) &&
                    !wasShown(change.doc.id) &&
                    !isDismissed(change.doc.id, data)
                );
            });

            if (newSosDoc) {
                showPriorityAlert(newSosDoc.doc.id, newSosDoc.doc.data() || {});
            }
        },
        (error) => {
            console.error("[admin-priority-alert] listener", error);
        },
    );
}
