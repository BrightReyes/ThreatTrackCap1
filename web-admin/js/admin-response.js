import {
    collection,
    doc,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";

export const DEFAULT_RESPONDER = {
    precinctId: "precinct-4-malinta",
    precinctName: "Police Community Precinct 4 (Malinta)",
    shortName: "Malinta Precinct",
    address: "Governor I. Santiago Rd., Malinta, Valenzuela, Metro Manila",
    location: {
        latitude: 14.71,
        longitude: 120.96,
    },
    source: "default_precinct",
};

const RESPONDED_STATUSES = new Set(["responding", "done"]);
const CLOSED_STATUSES = new Set(["done", "rejected", "spam"]);

export function isPriorityIncident(data = {}) {
    return (
        data.isSOSReport === true ||
        String(data.severity || "").toLowerCase() === "high" ||
        String(data.priority || "").toLowerCase() === "high"
    );
}

export function hasResponderAssigned(data = {}) {
    return (
        data.responseStatus === "help_on_the_way" ||
        data.response?.status === "help_on_the_way" ||
        RESPONDED_STATUSES.has(String(data.status || "").toLowerCase())
    );
}

export function canRespondToIncident(data = {}) {
    const status = String(data.status || "").toLowerCase();
    return isPriorityIncident(data) && !hasResponderAssigned(data) && !CLOSED_STATUSES.has(status);
}

export function getIncidentTypeLabel(data = {}) {
    if (data.typeLabel) return data.typeLabel;
    if (!data.type) return "Incident";
    return String(data.type)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDistanceKm(distanceKm) {
    const n = Number(distanceKm);
    if (!Number.isFinite(n)) return "Distance unavailable";
    if (n < 1) return `${Math.round(n * 1000)} m away`;
    return `${n.toFixed(1)} km away`;
}

export function calculateDistanceKm(from, to = DEFAULT_RESPONDER.location) {
    const fromLat = Number(from?.latitude);
    const fromLng = Number(from?.longitude);
    const toLat = Number(to?.latitude);
    const toLng = Number(to?.longitude);

    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
        return null;
    }

    const earthRadiusKm = 6371;
    const dLat = toRadians(toLat - fromLat);
    const dLng = toRadians(toLng - fromLng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(fromLat)) *
            Math.cos(toRadians(toLat)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((earthRadiusKm * c).toFixed(2));
}

export function estimateEtaMinutes(distanceKm) {
    const n = Number(distanceKm);
    if (!Number.isFinite(n)) return null;
    return Math.max(3, Math.ceil((n / 25) * 60));
}

export async function respondToIncident(incidentId, incidentData = {}) {
    if (!incidentId) {
        throw new Error("Missing incident id");
    }

    const distanceKm = calculateDistanceKm(incidentData.location);
    const etaMinutes = estimateEtaMinutes(distanceKm);
    const distanceText = formatDistanceKm(distanceKm);
    const etaText = etaMinutes ? `${etaMinutes} min ETA` : "ETA unavailable";
    const message = `Help is on the way from ${DEFAULT_RESPONDER.precinctName}. ${distanceText}. ${etaText}.`;
    const responder = {...DEFAULT_RESPONDER};
    const response = {
        status: "help_on_the_way",
        message,
        distanceKm,
        etaMinutes,
        responder,
        respondedBy: auth.currentUser?.uid || null,
        respondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    const incidentRef = doc(db, "incidents", incidentId);

    batch.update(incidentRef, {
        status: "responding",
        responseStatus: "help_on_the_way",
        responder,
        response,
        moderatedBy: auth.currentUser?.uid || null,
        moderatedAt: serverTimestamp(),
        respondedBy: auth.currentUser?.uid || null,
        respondedAt: serverTimestamp(),
    });

    if (incidentData.reporterId) {
        const notificationRef = doc(collection(db, "notifications"));
        batch.set(notificationRef, {
            userId: incidentData.reporterId,
            incidentId,
            title: "Help is on the way",
            body: message,
            type: "response_update",
            severity: "high",
            priority: "high",
            readAt: null,
            sentAt: serverTimestamp(),
            timestamp: serverTimestamp(),
            responder,
            response: {
                status: "help_on_the_way",
                distanceKm,
                etaMinutes,
            },
        });
    }

    await batch.commit();

    return {
        status: "responding",
        responseStatus: "help_on_the_way",
        responder,
        response: {
            ...response,
            respondedAt: null,
            updatedAt: null,
        },
    };
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}
