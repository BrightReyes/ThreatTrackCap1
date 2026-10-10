/**
 * ThreatTrack Police Sub-station Registry & Geographic Assignment Engine (Backend)
 */

export const COVERED_SUBSTATIONS = Object.freeze([
    {
        id: "balangkas_substation",
        name: "Balangkas Police Sub-station",
        code: "SS-BAL",
        latitude: 14.7175,
        longitude: 120.9495,
        status: "active",
        coverageType: "pilot_capstone",
        address: "Balangkas Police Community Outpost, Valenzuela City",
        contactNumber: "(02) 8292-0000",
    },
    {
        id: "mapulang_lupa_substation",
        name: "Mapulang Lupa Police Sub-station",
        code: "SS-MPL",
        latitude: 14.7025,
        longitude: 121.0008,
        status: "active",
        coverageType: "pilot_capstone",
        address: "3S Center Police Community Outpost, Mapulang Lupa, Valenzuela City",
        contactNumber: "(02) 8983-0000",
    },
]);

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

export function getSubstationNameById(substationId, substationList = COVERED_SUBSTATIONS) {
    if (!substationId) return "Unassigned Sub-station";
    const found = substationList.find(
        (s) => s.id.toLowerCase() === String(substationId).toLowerCase(),
    );
    return found ? found.name : String(substationId).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
