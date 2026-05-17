import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { VALENZUELA_POLICE_PRECINCTS } from "../../mobile/data/valenzuelaPrecincts.js";

export const DEFAULT_RESPONDER = {
    precinctId: null,
    precinctName: "Valenzuela Police Dispatch",
    shortName: "Police Dispatch",
    address: "Valenzuela City",
    location: null,
    source: "manual_dispatch_required",
};

const RESPONDED_STATUSES = new Set(["responding", "done"]);
const CLOSED_STATUSES = new Set(["done", "rejected", "spam"]);
const PRECINCT_CACHE_MS = 5 * 60 * 1000;

let precinctCache = {
    loadedAt: 0,
    precincts: [],
};

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

export function calculateDistanceKm(from, to) {
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
    const estimate = estimateTrafficAwareEta(distanceKm);
    return estimate ? estimate.etaMinutes : null;
}

export function estimateTrafficAwareEta(distanceKm, now = new Date()) {
    const n = Number(distanceKm);
    if (!Number.isFinite(n)) return null;

    const traffic = getValenzuelaTrafficProfile(now);
    const roadDistanceKm = Math.max(n * traffic.routeFactor, n + 0.25);
    const travelMinutes = Math.ceil((roadDistanceKm / traffic.speedKph) * 60);
    const intersectionDelayMinutes = Math.ceil(
        Math.min(8, Math.max(1, roadDistanceKm * 1.25)),
    );
    const etaMinutes = Math.max(
        5,
        Math.ceil(traffic.dispatchDelayMinutes + travelMinutes + intersectionDelayMinutes),
    );

    return {
        etaMinutes,
        roadDistanceKm: Number(roadDistanceKm.toFixed(2)),
        trafficDelayMinutes:
            traffic.dispatchDelayMinutes + intersectionDelayMinutes,
        trafficLevel: traffic.label,
        trafficSpeedKph: traffic.speedKph,
    };
}

function getValenzuelaTrafficProfile(now = new Date()) {
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const rushHour =
        !isWeekend && ((hour >= 6 && hour < 10) || (hour >= 16 && hour < 20));
    const daytime = hour >= 10 && hour < 16;
    const evening = hour >= 20 && hour < 23;

    if (rushHour) {
        return {
            label: "heavy traffic",
            routeFactor: 1.45,
            speedKph: 14,
            dispatchDelayMinutes: 4,
        };
    }

    if (daytime || evening) {
        return {
            label: "moderate traffic",
            routeFactor: 1.35,
            speedKph: 18,
            dispatchDelayMinutes: 3,
        };
    }

    return {
        label: "light traffic",
        routeFactor: 1.25,
        speedKph: 24,
        dispatchDelayMinutes: 3,
    };
}

export async function getResponderOptionsForIncident(incidentData = {}, limit = Infinity) {
    const incidentLocation = normalizeLocation(incidentData.location);
    if (!incidentLocation) {
        return [];
    }

    const precincts = await loadActivePrecincts();

    return precincts
        .map((precinct) => {
            const distanceKm = calculateDistanceKm(
                incidentLocation,
                precinct.location,
            );
            if (!Number.isFinite(distanceKm)) return null;
            const eta = estimateTrafficAwareEta(distanceKm);
            return {
                precinctId: precinct.precinctId,
                precinctName: precinct.precinctName,
                shortName: precinct.shortName,
                address: precinct.address,
                location: precinct.location,
                contact: precinct.contact || null,
                district: precinct.district || null,
                source: "admin_selected_precinct",
                distanceKm,
                etaMinutes: eta?.etaMinutes ?? null,
                roadDistanceKm: eta?.roadDistanceKm ?? null,
                trafficDelayMinutes: eta?.trafficDelayMinutes ?? null,
                trafficLevel: eta?.trafficLevel ?? null,
                trafficSpeedKph: eta?.trafficSpeedKph ?? null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, Number.isFinite(Number(limit)) ? Number(limit) : undefined);
}

export async function respondToIncident(
    incidentId,
    incidentData = {},
    selectedResponder = null,
) {
    if (!incidentId) {
        throw new Error("Missing incident id");
    }
    const responder = normalizeSelectedResponder(selectedResponder);
    if (!responder) {
        throw new Error("Choose a responder precinct before sending the alert.");
    }

    const distanceKm = Number.isFinite(Number(responder.distanceKm))
        ? Number(responder.distanceKm)
        : calculateDistanceKm(incidentData.location, responder.location);
    const eta = estimateTrafficAwareEta(distanceKm);
    const etaMinutes = Number.isFinite(Number(responder.etaMinutes))
        ? Number(responder.etaMinutes)
        : eta?.etaMinutes;
    const distanceText = formatDistanceKm(distanceKm);
    const trafficLevel = responder.trafficLevel || eta?.trafficLevel || null;
    const trafficDelayMinutes = Number.isFinite(Number(responder.trafficDelayMinutes))
        ? Number(responder.trafficDelayMinutes)
        : eta?.trafficDelayMinutes ?? null;
    const roadDistanceKm = Number.isFinite(Number(responder.roadDistanceKm))
        ? Number(responder.roadDistanceKm)
        : eta?.roadDistanceKm ?? null;
    const etaText = etaMinutes
        ? `${etaMinutes} min ETA${trafficLevel ? `, including ${trafficLevel}` : ""}`
        : "ETA unavailable";
    const message = buildResponseMessage(responder, distanceText, etaText);
    const response = {
        status: "help_on_the_way",
        message,
        distanceKm,
        etaMinutes,
        roadDistanceKm,
        trafficDelayMinutes,
        trafficLevel,
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
                roadDistanceKm,
                trafficDelayMinutes,
                trafficLevel,
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

async function loadActivePrecincts() {
    const now = Date.now();
    if (now - precinctCache.loadedAt < PRECINCT_CACHE_MS) {
        return precinctCache.precincts;
    }

    try {
        const snap = await getDocs(collection(db, "precincts"));
        const merged = new Map();

        VALENZUELA_POLICE_PRECINCTS
            .map(normalizeBaselinePrecinct)
            .filter(Boolean)
            .forEach((precinct) => mergePrecinct(merged, precinct));

        snap.docs
            .map(normalizePrecinctDoc)
            .filter(Boolean)
            .forEach((precinct) => mergePrecinct(merged, precinct));

        const precincts = Array.from(new Set(merged.values())).filter(
            (precinct) => precinct.isActive !== false,
        );

        precinctCache = {
            loadedAt: now,
            precincts,
        };
        return precincts;
    } catch (error) {
        console.error("[admin-response] load precincts", error);
        return precinctCache.precincts;
    }
}

function mergePrecinct(merged, precinct) {
    const aliases = getPrecinctMergeAliases(precinct);
    if (!aliases.length) return;
    const existingKey = aliases.find((alias) => merged.has(alias)) || aliases[0];
    const next = {
        ...(merged.get(existingKey) || {}),
        ...precinct,
    };
    aliases.forEach((alias) => merged.set(alias, next));
}

function getPrecinctMergeAliases(precinct) {
    return [
        precinct.precinctId,
        precinct.code,
        precinct.sourceId,
        precinct.precinctName,
    ]
        .map(normalizeKey)
        .filter(Boolean);
}

function normalizeKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeBaselinePrecinct(data = {}) {
    const location = normalizeLocation(data.location);
    if (!location) return null;

    return {
        precinctId: data.id,
        code: data.code || null,
        sourceId: data.sourceId || null,
        precinctName: String(data.name || data.code || data.id),
        shortName: String(data.code || data.name || data.id),
        address: String(data.address || "Valenzuela City"),
        location,
        contact: data.contact || data.phone || null,
        district: data.district || data.barangay || null,
        isActive: data.isActive !== false,
    };
}

function normalizePrecinctDoc(docSnap) {
    const data = docSnap.data() || {};
    const location = normalizeLocation(data.location) || normalizeLocation(data);
    if (!location) return null;

    const status = String(data.status || data.accountStatus || "").toLowerCase();
    const isClosed = ["inactive", "disabled", "closed", "archived"].includes(status);
    const name = data.name || data.precinctName || data.title || data.code || docSnap.id;

    return {
        precinctId: docSnap.id,
        code: data.code || null,
        sourceId: data.sourceId || null,
        precinctName: String(name),
        shortName: String(data.shortName || data.code || name),
        address: String(data.address || data.locationName || "Valenzuela City"),
        location,
        contact: data.contact || data.phone || data.phoneNumber || null,
        district: data.district || data.barangay || null,
        isActive: data.isActive !== false && !isClosed,
    };
}

function normalizeSelectedResponder(responder = null) {
    if (!responder || typeof responder !== "object") return null;
    const location = normalizeLocation(responder.location);
    if (!responder.precinctId || !responder.precinctName || !location) return null;
    return {
        precinctId: String(responder.precinctId),
        precinctName: String(responder.precinctName),
        shortName: String(responder.shortName || responder.precinctName),
        address: String(responder.address || "Valenzuela City"),
        location,
        contact: responder.contact || null,
        district: responder.district || null,
        source: "admin_selected_precinct",
        distanceKm: Number.isFinite(Number(responder.distanceKm))
            ? Number(responder.distanceKm)
            : null,
        etaMinutes: Number.isFinite(Number(responder.etaMinutes))
            ? Number(responder.etaMinutes)
            : null,
        roadDistanceKm: Number.isFinite(Number(responder.roadDistanceKm))
            ? Number(responder.roadDistanceKm)
            : null,
        trafficDelayMinutes: Number.isFinite(Number(responder.trafficDelayMinutes))
            ? Number(responder.trafficDelayMinutes)
            : null,
        trafficLevel: responder.trafficLevel || null,
        trafficSpeedKph: Number.isFinite(Number(responder.trafficSpeedKph))
            ? Number(responder.trafficSpeedKph)
            : null,
    };
}

function normalizeLocation(location = {}) {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {latitude, longitude};
}

function buildResponseMessage(responder, distanceText, etaText) {
    const name = responder?.precinctName || responder?.shortName;
    if (!name || responder?.source === "manual_dispatch_required" || responder?.source === "no_precinct_match") {
        return "Help request acknowledged. The admin desk is assigning the nearest available responder.";
    }

    return `Help is on the way from ${name}. ${distanceText}. ${etaText}.`;
}
