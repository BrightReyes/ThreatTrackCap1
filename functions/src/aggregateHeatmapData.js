/**
 * Aggregate Heatmap Data
 * 
 * This Cloud Function runs on a schedule to aggregate incident data into grid cells
 * for efficient heatmap visualization. Runs every hour.
 * 
 * Trigger: Cloud Scheduler (hourly)
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

module.exports = onSchedule("every 1 hours", async (event) => {
  console.log("Starting heatmap data aggregation...");

  const db = admin.firestore();
  
  try {
    // Get all verified incidents
    const snapshot = await db.collection("incidents")
      .where("status", "in", ["verified", "under_review"])
      .get();

    console.log(`Processing ${snapshot.size} incidents for heatmap aggregation`);

    // Grid cell precision (3 decimal places = ~111 meters)
    const GRID_PRECISION = 3;

    // Aggregate data by grid cell and time period
    const gridData = new Map();

    snapshot.forEach((doc) => {
      const incident = doc.data();
      
      if (!incident.location || !incident.location.latitude || !incident.location.longitude) {
        return; // Skip incidents without valid location
      }

      // Round coordinates to create grid cell
      const lat = parseFloat(incident.location.latitude.toFixed(GRID_PRECISION));
      const lon = parseFloat(incident.location.longitude.toFixed(GRID_PRECISION));
      
      // Get incident timestamp
      const timestamp = incident.timestamp?.toDate?.() || 
                       new Date(incident.timestamp?.seconds * 1000) || 
                       new Date(incident.timestamp);
      
      const dateStr = timestamp.toISOString().split("T")[0]; // YYYY-MM-DD
      
      // Create unique key for this grid cell and date
      const gridKey = `${dateStr}_${lat}_${lon}`;
      
      // Initialize grid cell data if not exists
      if (!gridData.has(gridKey)) {
        gridData.set(gridKey, {
          gridCell: {latitude: lat, longitude: lon},
          date: dateStr,
          incidentCount: 0,
          severityBreakdown: {high: 0, medium: 0, low: 0},
          typeBreakdown: {
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
          weightedScore: 0,
          incidentIds: [], // For debugging/reference
        });
      }

      // Update aggregated data
      const cellData = gridData.get(gridKey);
      cellData.incidentCount++;
      cellData.incidentIds.push(doc.id);

      // Update severity breakdown
      const severity = incident.severity || "low";
      if (cellData.severityBreakdown.hasOwnProperty(severity)) {
        cellData.severityBreakdown[severity]++;
      }

      // Update type breakdown
      const type = incident.type || "other";
      if (cellData.typeBreakdown.hasOwnProperty(type)) {
        cellData.typeBreakdown[type]++;
      }
    });

    // Calculate weighted scores and save to Firestore
    const batch = db.batch();
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500;

    for (const [gridKey, cellData] of gridData) {
      // Calculate weighted score (high=3, medium=2, low=1)
      cellData.weightedScore = 
        (cellData.severityBreakdown.high * 3) +
        (cellData.severityBreakdown.medium * 2) +
        (cellData.severityBreakdown.low * 1);

      // Remove incidentIds before saving (too large for document)
      delete cellData.incidentIds;

      // Add timestamp
      cellData.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
      cellData.period = "daily";

      // Create or update document
      const docRef = db.collection("crime_statistics").doc(gridKey);
      batch.set(docRef, cellData, {merge: true});

      batchCount++;

      // Commit batch if it reaches max size
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} documents`);
        batchCount = 0;
      }
    }

    // Commit remaining documents
    if (batchCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${batchCount} documents`);
    }

    // Clean up old aggregated data (older than 90 days)
    await cleanupOldData(db);

    // Create aggregated statistics for different time periods
    await createPeriodAggregations(db, gridData);

    console.log(`Heatmap aggregation complete. Processed ${gridData.size} grid cells`);

    return {
      success: true,
      gridCellsProcessed: gridData.size,
      incidentsProcessed: snapshot.size,
    };
  } catch (error) {
    console.error("Error aggregating heatmap data:", error);
    throw error;
  }
});

/**
 * Clean up old aggregated data (older than 90 days)
 */
async function cleanupOldData(db) {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString().split("T")[0];

    console.log(`Cleaning up data older than ${cutoffDate}`);

    // Query old documents
    const oldDocs = await db.collection("crime_statistics")
      .where("date", "<", cutoffDate)
      .where("period", "==", "daily") // Only delete daily aggregations
      .get();

    if (oldDocs.empty) {
      console.log("No old data to clean up");
      return;
    }

    // Delete in batches
    const batch = db.batch();
    let count = 0;

    oldDocs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();
    console.log(`Deleted ${count} old aggregation documents`);
  } catch (error) {
    console.error("Error cleaning up old data:", error);
  }
}

/**
 * Create aggregated statistics for different time periods (7d, 30d, all)
 */
async function createPeriodAggregations(db, gridData) {
  try {
    // Calculate date ranges
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const date7d = sevenDaysAgo.toISOString().split("T")[0];
    const date30d = thirtyDaysAgo.toISOString().split("T")[0];

    // Get incidents for each period
    const [snapshot7d, snapshot30d] = await Promise.all([
      db.collection("crime_statistics")
        .where("date", ">=", date7d)
        .where("period", "==", "daily")
        .get(),
      db.collection("crime_statistics")
        .where("date", ">=", date30d)
        .where("period", "==", "daily")
        .get(),
    ]);

    // Aggregate 7-day data
    const grid7d = aggregateByLocation(snapshot7d);
    await savePeriodData(db, grid7d, "7d");

    // Aggregate 30-day data
    const grid30d = aggregateByLocation(snapshot30d);
    await savePeriodData(db, grid30d, "30d");

    console.log(`Created period aggregations: 7d (${grid7d.size} cells), 30d (${grid30d.size} cells)`);
  } catch (error) {
    console.error("Error creating period aggregations:", error);
  }
}

/**
 * Aggregate data by location (combine dates)
 */
function aggregateByLocation(snapshot) {
  const gridMap = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const locKey = `${data.gridCell.latitude}_${data.gridCell.longitude}`;

    if (!gridMap.has(locKey)) {
      gridMap.set(locKey, {
        gridCell: data.gridCell,
        incidentCount: 0,
        severityBreakdown: {high: 0, medium: 0, low: 0},
        typeBreakdown: {
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
        weightedScore: 0,
      });
    }

    const cellData = gridMap.get(locKey);
    cellData.incidentCount += data.incidentCount;

    // Aggregate severity
    Object.keys(data.severityBreakdown).forEach((severity) => {
      cellData.severityBreakdown[severity] += data.severityBreakdown[severity];
    });

    // Aggregate type
    Object.keys(data.typeBreakdown).forEach((type) => {
      cellData.typeBreakdown[type] += data.typeBreakdown[type];
    });

    // Recalculate weighted score
    cellData.weightedScore = 
      (cellData.severityBreakdown.high * 3) +
      (cellData.severityBreakdown.medium * 2) +
      (cellData.severityBreakdown.low * 1);
  });

  return gridMap;
}

/**
 * Save period aggregated data to Firestore
 */
async function savePeriodData(db, gridMap, period) {
  const batch = db.batch();
  let count = 0;

  for (const [locKey, cellData] of gridMap) {
    const docId = `${period}_${locKey}`;
    const docRef = db.collection("crime_statistics").doc(docId);
    
    batch.set(docRef, {
      ...cellData,
      period,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    count++;
  }

  if (count > 0) {
    await batch.commit();
  }
}
