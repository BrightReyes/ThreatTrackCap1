/**
 * Sample Test Data Generator
 * 
 * This script generates sample incidents and precincts for testing.
 * Run this script to populate your Firestore with test data.
 * 
 * Usage: node generateTestData.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Sample data arrays
const INCIDENT_TYPES = ["theft", "assault", "vandalism", "robbery", "burglary", "other"];
const SEVERITIES = ["high", "medium", "low"];

// New York City coordinates for realistic test data
const NYC_CENTER = {lat: 40.7128, lon: -74.0060};
const NYC_RADIUS = 0.1; // About 11km

/**
 * Generate random coordinate near NYC
 */
function randomCoordinate() {
  const randomLat = NYC_CENTER.lat + (Math.random() - 0.5) * NYC_RADIUS;
  const randomLon = NYC_CENTER.lon + (Math.random() - 0.5) * NYC_RADIUS;
  return {
    latitude: parseFloat(randomLat.toFixed(6)),
    longitude: parseFloat(randomLon.toFixed(6)),
  };
}

/**
 * Generate random date within last 30 days
 */
function randomRecentDate() {
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const randomTime = thirtyDaysAgo + Math.random() * (now - thirtyDaysAgo);
  return new Date(randomTime);
}

/**
 * Generate sample incident
 */
function generateIncident(index, userId) {
  const type = INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)];
  const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];
  const timestamp = randomRecentDate();
  const location = randomCoordinate();

  const descriptions = {
    theft: [
      "Bicycle stolen from bike rack near the subway station.",
      "Package stolen from apartment building lobby.",
      "Car break-in, window smashed and items taken from vehicle.",
      "Wallet pickpocketed on crowded street.",
    ],
    assault: [
      "Physical altercation between two individuals.",
      "Verbal harassment reported by pedestrian.",
      "Attempted mugging, suspect fled the scene.",
    ],
    vandalism: [
      "Graffiti spray painted on building wall.",
      "Car tires slashed in parking lot.",
      "Public property damaged, bench broken.",
    ],
    robbery: [
      "Armed robbery at convenience store.",
      "Purse snatching reported by victim.",
      "ATM machine tampered with.",
    ],
    burglary: [
      "Residential break-in, door forced open.",
      "Commercial property burglarized overnight.",
      "Storage unit broken into.",
    ],
    other: [
      "Suspicious activity reported near school.",
      "Noise disturbance and property dispute.",
      "Abandoned vehicle blocking driveway.",
    ],
  };

  const description = descriptions[type][Math.floor(Math.random() * descriptions[type].length)];

  // 80% verified, 15% under review, 5% pending
  const rand = Math.random();
  let status;
  if (rand < 0.8) status = "verified";
  else if (rand < 0.95) status = "under_review";
  else status = "pending";

  return {
    reporterId: Math.random() > 0.1 ? userId : null, // 10% anonymous
    type,
    severity,
    description,
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      address: `${Math.floor(Math.random() * 999) + 1} Sample St, New York, NY`,
    },
    timestamp: admin.firestore.Timestamp.fromDate(timestamp),
    reportedAt: admin.firestore.Timestamp.fromDate(timestamp),
    status,
    isAnonymous: Math.random() > 0.1 ? false : true,
    photoUrls: [],
    moderatedBy: status === "verified" ? "admin_test" : null,
    moderatedAt: status === "verified" ? admin.firestore.Timestamp.fromDate(timestamp) : null,
    verificationScore: Math.floor(Math.random() * 40) + 60, // 60-100
    viewCount: Math.floor(Math.random() * 100),
    reportCount: 0,
  };
}

/**
 * Generate sample precinct
 */
function generatePrecinct(index) {
  const precincts = [
    {
      name: "1st Police Precinct",
      code: "PCT-001",
      address: "16 Ericsson Place, New York, NY 10013",
      location: {latitude: 40.7145, longitude: -74.0071},
      district: "Manhattan",
    },
    {
      name: "5th Police Precinct",
      code: "PCT-005",
      address: "19 Elizabeth Street, New York, NY 10013",
      location: {latitude: 40.7149, longitude: -73.9979},
      district: "Manhattan",
    },
    {
      name: "6th Police Precinct",
      code: "PCT-006",
      address: "233 West 10th Street, New York, NY 10014",
      location: {latitude: 40.7353, longitude: -74.0032},
      district: "Manhattan",
    },
    {
      name: "7th Police Precinct",
      code: "PCT-007",
      address: "19 1/2 Pitt Street, New York, NY 10002",
      location: {latitude: 40.7157, longitude: -73.9866},
      district: "Manhattan",
    },
    {
      name: "9th Police Precinct",
      code: "PCT-009",
      address: "321 East 5th Street, New York, NY 10003",
      location: {latitude: 40.7252, longitude: -73.9811},
      district: "Manhattan",
    },
    {
      name: "10th Police Precinct",
      code: "PCT-010",
      address: "230 West 20th Street, New York, NY 10011",
      location: {latitude: 40.7437, longitude: -74.0001},
      district: "Manhattan",
    },
    {
      name: "13th Police Precinct",
      code: "PCT-013",
      address: "230 East 21st Street, New York, NY 10010",
      location: {latitude: 40.7371, longitude: -73.9825},
      district: "Manhattan",
    },
    {
      name: "Midtown South Precinct",
      code: "PCT-014",
      address: "357 West 35th Street, New York, NY 10001",
      location: {latitude: 40.7541, longitude: -73.9934},
      district: "Manhattan",
    },
  ];

  if (index >= precincts.length) return null;

  const precinct = precincts[index];

  return {
    ...precinct,
    contact: {
      phone: `(212) 555-${String(index + 1).padStart(4, "0")}`,
      emergency: "911",
      email: `precinct${precinct.code.split("-")[1]}@nyc.gov`,
    },
    hours: "24/7",
    jurisdictionArea: [], // Would be array of GeoPoints in production
    services: ["emergency", "reporting", "community_outreach"],
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Generate test user
 */
async function createTestUser() {
  const userId = "test_user_123";
  const location = randomCoordinate();

  await db.collection("users").doc(userId).set({
    uid: userId,
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    role: "user",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    alertRadius: 5,
    alertPreferences: {
      enabled: true,
      highSeverity: true,
      mediumSeverity: true,
      lowSeverity: false,
    },
    fcmToken: "",
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
  });

  console.log("✅ Test user created");
  return userId;
}

/**
 * Main function to generate all test data
 */
async function generateAllTestData() {
  console.log("🚀 Starting test data generation...\n");

  try {
    // Create test user
    const userId = await createTestUser();

    // Generate precincts
    console.log("📍 Generating precincts...");
    const precinctBatch = db.batch();
    let precinctCount = 0;

    for (let i = 0; i < 8; i++) {
      const precinct = generatePrecinct(i);
      if (precinct) {
        const docRef = db.collection("precincts").doc();
        precinctBatch.set(docRef, precinct);
        precinctCount++;
      }
    }

    await precinctBatch.commit();
    console.log(`✅ Created ${precinctCount} precincts\n`);

    // Generate incidents in batches (Firestore limit: 500 per batch)
    console.log("🚨 Generating incidents...");
    const TOTAL_INCIDENTS = 75;
    const BATCH_SIZE = 500;

    let incidentCount = 0;

    for (let i = 0; i < TOTAL_INCIDENTS; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchEnd = Math.min(i + BATCH_SIZE, TOTAL_INCIDENTS);

      for (let j = i; j < batchEnd; j++) {
        const incident = generateIncident(j, userId);
        const docRef = db.collection("incidents").doc();
        batch.set(docRef, incident);
        incidentCount++;
      }

      await batch.commit();
      console.log(`  ✅ Created ${batchEnd} / ${TOTAL_INCIDENTS} incidents`);
    }

    console.log(`\n✅ Created ${incidentCount} incidents\n`);

    console.log("🎉 Test data generation complete!");
    console.log("\nSummary:");
    console.log(`  - Users: 1`);
    console.log(`  - Precincts: ${precinctCount}`);
    console.log(`  - Incidents: ${incidentCount}`);
    console.log("\n📝 Next steps:");
    console.log("  1. Deploy Cloud Functions: cd functions && npm run deploy");
    console.log("  2. Deploy Firestore rules: firebase deploy --only firestore:rules");
    console.log("  3. Deploy Storage rules: firebase deploy --only storage");
    console.log("  4. Test the app!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating test data:", error);
    process.exit(1);
  }
}

// Run the script
generateAllTestData();
