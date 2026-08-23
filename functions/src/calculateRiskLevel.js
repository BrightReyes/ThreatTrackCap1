/**
 * Calculate Risk Level
 *
 * This Cloud Function calculates risk levels for a specific location and radius.
 * It's called via HTTP request with latitude, longitude, and radius parameters.
 *
 * Trigger: HTTP Request
 */

const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {distanceBetween} = require("geofire-common");

module.exports = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    const params = req.method === "POST" ? req.body : req.query;
    const latitude = parseFloat(params.latitude);
    const longitude = parseFloat(params.longitude);
    const radiusKm = parseFloat(params.radius || 5);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({error: "Invalid latitude or longitude"});
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({error: "Latitude/longitude out of range"});
    }

    console.log(`Calculating risk for location: ${latitude}, ${longitude}, radius: ${radiusKm}km`);

    const db = admin.firestore();
    const incidents = await getIncidentsInRadius(db, latitude, longitude, radiusKm);
    const riskStats = calculateRiskStatistics(incidents);
    const overallRisk = determineOverallRisk(riskStats);
    const trends = calculateTrends(incidents);

    const response = {
      location: {latitude, longitude},
      radius: radiusKm,
      riskLevel: overallRisk,
      statistics: riskStats,
      trends,
      calculatedAt: new Date().toISOString(),
      incidentCount: incidents.length,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error calculating risk level:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * Get incidents within a specific radius
 */
async function getIncidentsInRadius(db, latitude, longitude, radiusKm) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snapshot = await db.collection("incidents")
        .where("status", "in", ["verified", "under_review"])
        .where("timestamp", ">=", thirtyDaysAgo)
        .get();

    const incidents = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.location && data.location.latitude && data.location.longitude) {
        const distance = distanceBetween(
            [latitude, longitude],
            [data.location.latitude, data.location.longitude],
        );

        if (distance <= radiusKm) {
          incidents.push({
            id: doc.id,
            ...data,
            distance,
          });
        }
      }
    });

    return incidents;
  } catch (error) {
    console.error("Error getting incidents in radius:", error);
    throw error;
  }
}

/**
 * Calculate risk statistics from incidents
 */
function calculateRiskStatistics(incidents) {
  const stats = {
    total: incidents.length,
    high: 0,
    medium: 0,
    low: 0,
    byType: {
      theft_snatching: 0,
      robbery_holdup: 0,
      physical_assault_injury: 0,
      domestic_violence: 0,
      drug_related_activity: 0,
      public_disturbance: 0,
      vandalism_property_damage: 0,
      traffic_accident: 0,
      illegal_weapons: 0,
      suspicious_activity: 0,
    },
    last24h: 0,
    last7d: 0,
    last30d: 0,
  };

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  incidents.forEach((incident) => {
    if (incident.severity === "high") stats.high++;
    else if (incident.severity === "medium") stats.medium++;
    else if (incident.severity === "low") stats.low++;

    if (Object.prototype.hasOwnProperty.call(stats.byType, incident.type)) {
      stats.byType[incident.type]++;
    }

    const incidentTime = incident.timestamp?.toMillis?.() ||
                         incident.timestamp?.seconds * 1000 ||
                         new Date(incident.timestamp).getTime();

    const ageInMs = now - incidentTime;

    if (ageInMs <= day) stats.last24h++;
    if (ageInMs <= 7 * day) stats.last7d++;
    if (ageInMs <= 30 * day) stats.last30d++;
  });

  return stats;
}

/**
 * Determine overall risk level based on statistics
 */
function determineOverallRisk(stats) {
  if (stats.high >= 3 || stats.last7d >= 10) {
    return "high";
  }

  if ((stats.high >= 1 && stats.high <= 2) || (stats.last7d >= 5 && stats.last7d < 10)) {
    return "medium";
  }

  return "low";
}

/**
 * Calculate trends (comparing recent period to previous period)
 */
function calculateTrends(incidents) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  let recent7d = 0;
  let previous7d = 0;

  incidents.forEach((incident) => {
    const incidentTime = incident.timestamp?.toMillis?.() ||
                         incident.timestamp?.seconds * 1000 ||
                         new Date(incident.timestamp).getTime();

    const ageInMs = now - incidentTime;

    if (ageInMs <= 7 * day) {
      recent7d++;
    } else if (ageInMs <= 14 * day) {
      previous7d++;
    }
  });

  let change = 0;
  let direction = "stable";

  if (previous7d > 0) {
    change = ((recent7d - previous7d) / previous7d) * 100;
  } else if (recent7d > 0) {
    change = 100;
  }

  if (change > 10) direction = "increasing";
  else if (change < -10) direction = "decreasing";

  return {
    recent7d,
    previous7d,
    percentageChange: Math.round(change),
    direction,
  };
}
