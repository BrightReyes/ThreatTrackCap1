/**
 * ThreatTrack Responder Distance & Traffic-Aware ETA Utility
 *
 * Calculates initial Haversine distance and realistic city traffic ETA
 * between the citizen reporter's submitted location and the assigned response unit:
 * - Barangay Response: Pinned to the barangay 3S Center / Barangay Hall.
 * - Police Response: Pinned to the designated Police Sub-station / Police Community Precinct (PCP).
 */

import { calculateDistance, formatDistance } from './location';
import { VALENZUELA_POLICE_PRECINCTS } from '../data/valenzuelaPrecincts';

// Official Barangay 3S Centers (Barangay Response Units)
export const COVERED_BARANGAYS = Object.freeze([
  {
    id: 'balangkas',
    name: 'Barangay Balangkas',
    code: 'BAL',
    latitude: 14.7114,
    longitude: 120.9425,
    address: '3S Center & Barangay Hall, Sampaguita St., Balangkas, Valenzuela City',
  },
  {
    id: 'mapulang_lupa',
    name: 'Barangay Mapulang Lupa',
    code: 'MPL',
    latitude: 14.7068,
    longitude: 121.0018,
    address: '3S Center Mapulang Lupa, S. Bautista St., Purok 4, Valenzuela City',
  },
]);

// Official Police Sub-stations (Law Enforcement Response Units)
export const COVERED_SUBSTATIONS = Object.freeze([
  {
    id: 'balangkas_substation',
    name: 'Balangkas Police Sub-station (PCP 5)',
    code: 'SS-BAL',
    latitude: 14.7078,
    longitude: 120.9464,
    address: 'Police Sub-station 5 (PCP 5), Poblacion Road, Polo, Valenzuela City',
  },
  {
    id: 'mapulang_lupa_substation',
    name: 'Mapulang Lupa Police Sub-station (PCP 10)',
    code: 'SS-MPL',
    latitude: 14.7025,
    longitude: 121.0008,
    address: 'Police Community Outpost, Sto. Rosario, Mapulang Lupa, Valenzuela City',
  },
  {
    id: 'valenzuela_police_hq',
    name: 'Valenzuela City Police Station (HQ)',
    code: 'VCPS-HQ',
    latitude: 14.692445,
    longitude: 120.968749,
    address: 'Maysan Road, Valenzuela City',
  },
]);

/**
 * Time-of-day traffic model calibrated for Valenzuela City road network.
 * Synchronized with the web-admin operations model.
 *
 * @param {Date} now
 * @returns {{ label: string, speedKph: number, routeFactor: number, dispatchDelayMin: number }}
 */
export const getValenzuelaTrafficProfile = (now = new Date()) => {
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  // Peak rush hours: morning rush (6-10 AM) and evening rush (4-8 PM) on weekdays
  const isRushHour = !isWeekend && ((hour >= 6 && hour < 10) || (hour >= 16 && hour < 20));
  // Daytime / early evening moderate traffic
  const isDaytimeOrEvening = (hour >= 10 && hour < 16) || (hour >= 20 && hour < 23);

  if (isRushHour) {
    return {
      label: 'rush hour traffic',
      speedKph: 14, // Dense urban rush hour speed
      routeFactor: 1.45, // Detours, narrow barangay streets, traffic signals
      dispatchDelayMin: 4, // Squad vehicle mobilization buffer
    };
  }

  if (isDaytimeOrEvening) {
    return {
      label: 'moderate traffic',
      speedKph: 18,
      routeFactor: 1.35,
      dispatchDelayMin: 3,
    };
  }

  // Off-peak / late night (11 PM - 6 AM) and weekend free-flow
  return {
    label: 'light traffic',
    speedKph: 24,
    routeFactor: 1.25,
    dispatchDelayMin: 3,
  };
};

/**
 * Resolves the assigned station's coordinates, display name, and address.
 * Distinguishes between Barangay (3S Center) and Police (Precinct / Sub-station).
 *
 * @param {Object} incident
 * @returns {{ stationName: string, stationAddress: string, stationCoords: { latitude: number, longitude: number } | null }}
 */
export const resolveStationData = (incident = {}) => {
  const response = incident.response || {};
  const responder = incident.responder || response.responder || {};

  // Check if responder already provides exact numeric GPS coordinates
  const explicitLat = Number(responder.location?.latitude ?? responder.latitude);
  const explicitLng = Number(responder.location?.longitude ?? responder.longitude);
  if (Number.isFinite(explicitLat) && Number.isFinite(explicitLng)) {
    return {
      stationName: responder.precinctName || responder.name || 'Assigned Response Unit',
      stationAddress: responder.address || 'Valenzuela City',
      stationCoords: { latitude: explicitLat, longitude: explicitLng },
    };
  }

  // Identify assignment tokens
  const rawId = String(
    incident.respondingSubstationId ||
    incident.assignedSubstationId ||
    incident.substationId ||
    responder.substationId ||
    responder.precinctId ||
    incident.respondingBarangayName ||
    ''
  ).toLowerCase();

  const rawName = String(
    incident.respondingSubstationName ||
    incident.assignedSubstationName ||
    incident.substationName ||
    responder.precinctName ||
    responder.name ||
    incident.respondingBarangayName ||
    ''
  ).toLowerCase();

  const combinedKey = `${rawId} ${rawName}`;

  // 1. Is this a Barangay response? Pin to the 3S Center
  const isBarangay =
    combinedKey.includes('barangay') ||
    combinedKey.includes('brgy') ||
    Boolean(incident.respondingBarangayName);

  if (isBarangay) {
    if (combinedKey.includes('balangkas')) {
      const b = COVERED_BARANGAYS[0];
      return {
        stationName: 'Barangay Balangkas (3S Center)',
        stationAddress: b.address,
        stationCoords: { latitude: b.latitude, longitude: b.longitude },
      };
    }
    if (combinedKey.includes('mapulang')) {
      const b = COVERED_BARANGAYS[1];
      return {
        stationName: 'Barangay Mapulang Lupa (3S Center)',
        stationAddress: b.address,
        stationCoords: { latitude: b.latitude, longitude: b.longitude },
      };
    }
  }

  // 2. Is this a Police Sub-station / Precinct?
  if (combinedKey.includes('balangkas')) {
    const s = COVERED_SUBSTATIONS[0];
    return {
      stationName: s.name,
      stationAddress: s.address,
      stationCoords: { latitude: s.latitude, longitude: s.longitude },
    };
  }

  if (combinedKey.includes('mapulang')) {
    const s = COVERED_SUBSTATIONS[1];
    return {
      stationName: s.name,
      stationAddress: s.address,
      stationCoords: { latitude: s.latitude, longitude: s.longitude },
    };
  }

  // 3. Search numbered Police Community Precincts (PCP 1 - 12)
  if (VALENZUELA_POLICE_PRECINCTS && VALENZUELA_POLICE_PRECINCTS.length) {
    const matchedPrecinct = VALENZUELA_POLICE_PRECINCTS.find((p) => {
      const pId = String(p.id || '').toLowerCase();
      const pCode = String(p.code || '').toLowerCase();
      const pName = String(p.name || '').toLowerCase();
      return (
        (rawId && (pId === rawId || rawId.includes(pCode))) ||
        (rawName && (pName.includes(rawName) || rawName.includes(pCode)))
      );
    });

    if (matchedPrecinct && matchedPrecinct.location) {
      return {
        stationName: matchedPrecinct.name,
        stationAddress: matchedPrecinct.address || 'Valenzuela City',
        stationCoords: {
          latitude: matchedPrecinct.location.latitude,
          longitude: matchedPrecinct.location.longitude,
        },
      };
    }
  }

  // 4. Fallback based on reporter coordinates to nearest station
  const repLat = Number(incident.location?.latitude ?? incident.latitude);
  const repLng = Number(incident.location?.longitude ?? incident.longitude);
  if (Number.isFinite(repLat) && Number.isFinite(repLng)) {
    // Find closest covered substation
    let closest = COVERED_SUBSTATIONS[0];
    let minDistance = Infinity;
    for (const sub of COVERED_SUBSTATIONS) {
      const dist = calculateDistance({ latitude: repLat, longitude: repLng }, sub);
      if (dist < minDistance) {
        minDistance = dist;
        closest = sub;
      }
    }
    return {
      stationName: closest.name,
      stationAddress: closest.address,
      stationCoords: { latitude: closest.latitude, longitude: closest.longitude },
    };
  }

  // Default fallback: Central Police Station HQ
  const hq = COVERED_SUBSTATIONS[2];
  return {
    stationName: hq.name,
    stationAddress: hq.address,
    stationCoords: { latitude: hq.latitude, longitude: hq.longitude },
  };
};

/**
 * Computes initial Haversine distance, traffic-adjusted arrival time (ETA),
 * and user-facing display copy.
 *
 * @param {Object} incident Incident document from Firestore
 * @param {Date} [now] Current timestamp
 * @returns {{
 *   distanceKm: number | null,
 *   distanceText: string,
 *   etaMinutes: number,
 *   etaText: string,
 *   trafficLabel: string,
 *   trafficNote: string,
 *   stationName: string,
 *   stationAddress: string,
 * }}
 */
export const computeInitialDistanceAndEta = (incident = {}, now = new Date()) => {
  const { stationName, stationAddress, stationCoords } = resolveStationData(incident);
  const traffic = getValenzuelaTrafficProfile(now);

  // Extract reporter coordinates
  const reporterLat = Number(incident.location?.latitude ?? incident.latitude);
  const reporterLng = Number(incident.location?.longitude ?? incident.longitude);
  const hasReporterCoords = Number.isFinite(reporterLat) && Number.isFinite(reporterLng);

  let distanceKm = null;

  // Use pre-computed numeric distance if already provided by admin dispatch
  const precomputedDist = Number(incident.response?.distanceKm ?? incident.responder?.distanceKm);
  if (Number.isFinite(precomputedDist) && precomputedDist > 0) {
    distanceKm = precomputedDist;
  } else if (hasReporterCoords && stationCoords) {
    distanceKm = calculateDistance(
      { latitude: reporterLat, longitude: reporterLng },
      stationCoords
    );
  }

  // If distance is known, compute traffic-aware ETA
  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    // Road travel distance (straight-line distance * Valenzuela street grid routing factor)
    const roadDistanceKm = Math.max(distanceKm * traffic.routeFactor, distanceKm + 0.25);
    // Driving minutes
    const travelMinutes = Math.ceil((roadDistanceKm / traffic.speedKph) * 60);
    // Intersection & traffic delay buffer
    const intersectionDelayMin = Math.ceil(Math.min(8, Math.max(1, roadDistanceKm * 1.25)));
    // Total ETA with mobilization buffer
    const etaMinutes = Math.max(4, Math.ceil(traffic.dispatchDelayMin + travelMinutes + intersectionDelayMin));

    const distanceFormatted = formatDistance(distanceKm);
    const distanceText = `${distanceFormatted} away`;
    const etaText = `~${etaMinutes} mins`;
    const trafficNote = `*ETA accounts for Valenzuela ${traffic.label} & response dispatch mobilization.`;

    return {
      distanceKm,
      distanceText,
      etaMinutes,
      etaText,
      trafficLabel: traffic.label,
      trafficNote,
      stationName,
      stationAddress,
    };
  }

  // Fallback when GPS coordinates are unavailable (e.g., legacy manual reports)
  return {
    distanceKm: null,
    distanceText: 'Station assigned',
    etaMinutes: 12,
    etaText: '~10-15 mins',
    trafficLabel: traffic.label,
    trafficNote: '*Estimated response time based on local precinct dispatch.',
    stationName,
    stationAddress,
  };
};
