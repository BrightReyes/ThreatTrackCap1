import "../css/incidents.css";
import { initAdminPage } from "./admin-auth.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import { initIncidentModal } from "./incident-modal.js";
import { loadIncidentsTable } from "./incidents-list.js";

const incidentModal = initIncidentModal();

// Fast in-page modal opener for SOS alerts and real-time triggers (0ms reload)
window.threatTrackOpenIncident = (id) => {
    if (id && incidentModal?.openIncidentById) {
        return incidentModal.openIncidentById(id);
    }
    return Promise.resolve();
};

// Immediate kickoff if incidentId is in the URL: starts document fetch in parallel with auth check
const initialIncidentId = new URLSearchParams(window.location.search).get("incidentId");
let initialOpened = false;
if (initialIncidentId && incidentModal?.openIncidentById) {
    initialOpened = true;
    incidentModal.openIncidentById(initialIncidentId).catch((err) => {
        console.error("[incidents] initial open incident error", err);
    });
}

initAdminPage({
    pageId: "page-incidents",
    onReady() {
        initAdminCustomSelects(document.getElementById("page-incidents"));

        const incidentId = new URLSearchParams(window.location.search).get(
            "incidentId",
        );
        if (incidentId && !initialOpened && incidentModal?.openIncidentById) {
            incidentModal.openIncidentById(incidentId).catch((err) => {
                console.error("[incidents] open incident", err);
            });
        }

        loadIncidentsTable().catch((err) => {
            console.error("[incidents]", err);
            const meta = document.getElementById("incidents-count");
            if (meta) meta.textContent = "Failed to load incidents";
            const tbody = document.getElementById("incidents-tbody");
            if (tbody) {
                const msg =
                    err?.code === "failed-precondition"
                        ? "Firestore index may be required. Check the browser console."
                        : err?.message || "Something went wrong";
                tbody.innerHTML = `<tr class="incidents-table__empty"><td colspan="7">${escapeCell(
                    msg,
                )}</td></tr>`;
            }
        });
    },
});

function escapeCell(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}
