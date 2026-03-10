/**
 * Find Nearest Precinct
 * 
 * This Cloud Function finds the nearest police precinct(s) to a given location.
 * Returns up to 3 nearest precincts with distance and contact information.
 * 
 * Trigger: HTTP Request
 */

const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {distanceBetween} = require("geofire-common");

module.exports = onRequest({cors: true}, async (req, res) => {
  // Validate request method
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    // Extract parameters
    const params = req.method === "POST" ? req.body : req.query;
    const latitude = parseFloat(params.latitude);
    const longitude = parseFloat(params.longitude);
    const limit = parseInt(params.limit || 3); // Default to 3 nearest

    // Validate parameters
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({error: "Invalid latitude or longitude"});
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({error: "Latitude/longitude out of range"});
    }

    console.log(`Finding nearest precincts for location: ${latitude}, ${longitude}`);

    const db = admin.firestore();

    // Get all active precincts
    const snapshot = await db.collection("precincts")
      .where("isActive", "==", true)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        error: "No active precincts found",
        precincts: [],
      });
    }

    // Calculate distances and sort
    const precincts = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      
      if (data.location && data.location.latitude && data.location.longitude) {
        const distance = distanceBetween(
          [latitude, longitude],
          [data.location.latitude, data.location.longitude]
        );

        precincts.push({
          id: doc.id,
          ...data,
          distance: parseFloat(distance.toFixed(2)), // Distance in km
          distanceInMiles: parseFloat((distance * 0.621371).toFixed(2)), // Convert to miles
        });
      }
    });

    // Sort by distance
    precincts.sort((a, b) => a.distance - b.distance);

    // Return top N nearest
    const nearest = precincts.slice(0, limit);

    // Format response
    const response = {
      location: {latitude, longitude},
      nearestPrecincts: nearest.map((precinct) => ({
        id: precinct.id,
        name: precinct.name,
        code: precinct.code,
        address: precinct.address,
        location: precinct.location,
        contact: precinct.contact,
        hours: precinct.hours,
        district: precinct.district,
        distance: precinct.distance,
        distanceInMiles: precinct.distanceInMiles,
        // Add navigation URL
        navigationUrl: generateNavigationUrl(precinct.location),
      })),
      totalPrecinctsFound: precincts.length,
      searchedAt: new Date().toISOString(),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error finding nearest precinct:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * Generate Google Maps navigation URL
 */
function generateNavigationUrl(location) {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
}
