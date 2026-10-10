/**
 * ThreatTrack Barangay Registry & Geographic Assignment Engine (Cloud Functions)
 *
 * CommonJS export for Firebase Cloud Functions backend.
 * Uses Haversine distance to assign incidents to the nearest covered pilot barangay.
 */

const COVERED_BARANGAYS = Object.freeze([
  {
    id: "balangkas",
    name: "Balangkas",
    code: "BAL",
    latitude: 14.7175,
    longitude: 120.9495,
    status: "active",
    coverageType: "pilot_capstone",
    address: "Balangkas Barangay Hall, Valenzuela City",
    contactNumber: "(02) 8292-0000",
  },
  {
    id: "mapulang_lupa",
    name: "Mapulang Lupa",
    code: "MPL",
    latitude: 14.7025,
    longitude: 121.0008,
    status: "active",
    coverageType: "pilot_capstone",
    address: "3S Center, Sto. Rosario, Mapulang Lupa, Valenzuela City",
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
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
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
 * Assigns an incident coordinate to the nearest active covered barangay.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Array} barangayList
 * @returns {{ barangayId: string, barangayName: string, distanceKm: number, isNearestCovered: boolean }}
 */
function findNearestCoveredBarangay(
    latitude,
    longitude,
    barangayList = COVERED_BARANGAYS,
) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  const activeList = barangayList.filter((b) => b.status === "active");
  if (!activeList.length) {
    return {
      barangayId: "unknown",
      barangayName: "Unknown",
      distanceKm: null,
      isNearestCovered: false,
    };
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      barangayId: activeList[0].id,
      barangayName: activeList[0].name,
      distanceKm: null,
      isNearestCovered: false,
    };
  }

  let nearest = activeList[0];
  let minDistance = Infinity;

  for (const b of activeList) {
    const dist = calculateHaversineDistanceKm(lat, lng, b.latitude, b.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = b;
    }
  }

  return {
    barangayId: nearest.id,
    barangayName: nearest.name,
    distanceKm: minDistance,
    isNearestCovered: true,
  };
}

function getBarangayNameById(barangayId, barangayList = COVERED_BARANGAYS) {
  if (!barangayId) return "Unassigned";
  const found = barangayList.find(
      (b) => b.id.toLowerCase() === String(barangayId).toLowerCase(),
  );
  return found ?
    found.name :
    String(barangayId).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = {
  COVERED_BARANGAYS,
  calculateHaversineDistanceKm,
  findNearestCoveredBarangay,
  getBarangayNameById,
};
