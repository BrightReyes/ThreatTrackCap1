/**
 * ThreatTrack Police Sub-station Registry & Geographic Assignment Engine
 *
 * Scalable jurisdiction model for Law Enforcement Sub-stations:
 * Instead of hardcoding substation names, each Police Sub-station / Police Community
 * Precinct (PCP) is registered with its unique ID, display name, coordinates, and status.
 *
 * Pilot Capstone Prototype Scope:
 * - Balangkas Police Sub-station (West Sector)
 * - Mapulang Lupa Police Sub-station (East Sector)
 *
 * For expansion, additional substations (e.g. PCP 1-12) are simply added to
 * COVERED_SUBSTATIONS with status: 'active'.
 */

export const COVERED_SUBSTATIONS = Object.freeze([
    {
        id: "balangkas_substation",
        name: "Balangkas Police Sub-station (PCP 5)",
        code: "SS-BAL",
        latitude: 14.7078,
        longitude: 120.9464,
        status: "active",
        coverageType: "pilot_capstone",
        address: "Police Sub-station 5 (PCP 5), Poblacion Road, Polo, Valenzuela City",
        contactNumber: "(02) 8292-0000",
    },
    {
        id: "mapulang_lupa_substation",
        name: "Mapulang Lupa Police Sub-station (PCP 10)",
        code: "SS-MPL",
        latitude: 14.7025,
        longitude: 121.0008,
        status: "active",
        coverageType: "pilot_capstone",
        address: "Police Community Outpost, Sto. Rosario, Mapulang Lupa, Valenzuela City",
        contactNumber: "(02) 8983-0000",
    },
]);

/**
 * Calculates great-circle distance between two GPS coordinates
 * using the Haversine formula (Earth radius = 6371 km).
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
    if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(Number(v)))) {
        return Infinity;
    }
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
}

/**
 * Assigns an incident coordinate to the nearest active covered police substation.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Array} substationList
 * @returns {{ substationId: string, substationName: string, distanceKm: number, isNearestCovered: boolean }}
 */
export function findNearestCoveredSubstation(
    latitude,
    longitude,
    substationList = COVERED_SUBSTATIONS,
) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    const activeList = substationList.filter((s) => s.status === "active");
    if (!activeList.length) {
        return {
            substationId: "unknown",
            substationName: "Unknown Sub-station",
            distanceKm: null,
            isNearestCovered: false,
        };
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return {
            substationId: activeList[0].id,
            substationName: activeList[0].name,
            distanceKm: null,
            isNearestCovered: false,
        };
    }

    let nearest = activeList[0];
    let minDistance = Infinity;

    for (const s of activeList) {
        const dist = calculateHaversineDistanceKm(lat, lng, s.latitude, s.longitude);
        if (dist < minDistance) {
            minDistance = dist;
            nearest = s;
        }
    }

    return {
        substationId: nearest.id,
        substationName: nearest.name,
        distanceKm: minDistance,
        isNearestCovered: true,
    };
}

/**
 * The single web-side ETA formula: dispatch delay + road travel + intersection
 * delay, using a time-of-day traffic profile. Keep the numbers in step with
 * mobile/utils/responderEta.js, which the app uses for the same estimate.
 *
 * @param {number} distanceKm Straight-line distance
 * @param {Date} [now]
 * @returns {{ etaMinutes: number, roadDistanceKm: number, trafficDelayMinutes: number, trafficLevel: string, trafficSpeedKph: number } | null}
 */
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

/**
 * Returns candidate substations sorted nearest-first to a given coordinate,
 * including computed distance and ETA.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Array} substationList
 * @returns {Array<{ substationId: string, substationName: string, distanceKm: number, etaMinutes: number, address: string, code: string }>}
 */
export function getSortedSubstationCandidates(
    latitude,
    longitude,
    substationList = COVERED_SUBSTATIONS,
) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const activeList = substationList.filter((s) => s.status === "active");

    return activeList
        .map((s) => {
            const distanceKm =
                Number.isFinite(lat) && Number.isFinite(lng)
                    ? calculateHaversineDistanceKm(lat, lng, s.latitude, s.longitude)
                    : null;
            const etaMinutes =
                distanceKm != null ? (estimateTrafficAwareEta(distanceKm)?.etaMinutes ?? 5) : 5;
            return {
                substationId: s.id,
                substationName: s.name,
                code: s.code,
                address: s.address,
                distanceKm,
                etaMinutes,
            };
        })
        .sort((a, b) => {
            if (a.distanceKm == null) return 1;
            if (b.distanceKm == null) return -1;
            return a.distanceKm - b.distanceKm;
        });
}

/**
 * Resolves a substation ID to its human-readable display name.
 */
export function getSubstationNameById(substationId, substationList = COVERED_SUBSTATIONS) {
    if (!substationId) return "Unassigned Sub-station";
    const found = substationList.find(
        (s) => s.id.toLowerCase() === String(substationId).toLowerCase(),
    );
    return found ? found.name : String(substationId).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
