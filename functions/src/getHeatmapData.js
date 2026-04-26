/**
 * Get Heatmap Data - HTTP Endpoint
 *
 * Fetches incident heatmap data for a geographic region and time range.
 *
 * Request body:
 * {
 *   bounds: {north, south, east, west},
 *   timeRange: {start, end},
 *   days: 7
 * }
 */

const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const GRID_SIZE = 0.01;

module.exports = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const {bounds, timeRange, days = DEFAULT_DAYS} = req.body || {};

    if (!isValidBounds(bounds)) {
      res.status(400).json({
        success: false,
        error: "Invalid bounds. Required numeric north, south, east, and west",
      });
      return;
    }

    const {startDate, endDate} = getDateRange(timeRange, days);
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      res.status(400).json({
        success: false,
        error: "Invalid time range",
      });
      return;
    }

    const db = admin.firestore();
    const incidentsSnapshot = await db.collection("incidents")
        .where("status", "in", ["verified", "under_review"])
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(startDate))
        .where("timestamp", "<=", admin.firestore.Timestamp.fromDate(endDate))
        .get();

    const filteredIncidents = [];
    incidentsSnapshot.forEach((doc) => {
      const incident = doc.data();
      const location = incident.location;

      if (
        location &&
        location.latitude >= bounds.south &&
        location.latitude <= bounds.north &&
        location.longitude >= bounds.west &&
        location.longitude <= bounds.east
      ) {
        filteredIncidents.push(incident);
      }
    });

    const {cells, maxCount} = buildHeatmapCells(filteredIncidents);

    res.json({
      success: true,
      data: {
        cells,
        metadata: {
          totalIncidents: filteredIncidents.length,
          cellCount: cells.length,
          gridResolution: GRID_SIZE,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          bounds,
          maxIncidentsPerCell: maxCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching heatmap data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Validates map bounds from the client.
 *
 * @param {object} bounds Client map bounds.
 * @return {boolean} Whether the bounds are valid.
 */
function isValidBounds(bounds) {
  return Boolean(
      bounds &&
      Number.isFinite(bounds.north) &&
      Number.isFinite(bounds.south) &&
      Number.isFinite(bounds.east) &&
      Number.isFinite(bounds.west) &&
      bounds.north > bounds.south &&
      bounds.east > bounds.west,
  );
}

/**
 * Calculates the request date range.
 *
 * @param {object|undefined} timeRange Optional explicit time range.
 * @param {number|string} days Number of days to query when no time range exists.
 * @return {{startDate: Date, endDate: Date}} Query date range.
 */
function getDateRange(timeRange, days) {
  if (timeRange && timeRange.start && timeRange.end) {
    return {
      startDate: new Date(timeRange.start),
      endDate: new Date(timeRange.end),
    };
  }

  const endDate = new Date();
  const daysNumber = Number.isFinite(Number(days)) ? Number(days) : DEFAULT_DAYS;
  const clampedDays = Math.min(Math.max(daysNumber, 1), MAX_DAYS);
  const startDate = new Date(endDate.getTime() - clampedDays * 24 * 60 * 60 * 1000);

  return {startDate, endDate};
}

/**
 * Checks that a value is a valid Date.
 *
 * @param {Date} date Date to validate.
 * @return {boolean} Whether the date is valid.
 */
function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Builds normalized heatmap cells from incidents.
 *
 * @param {Array<object>} incidents Incidents inside requested bounds.
 * @return {{cells: Array<object>, maxCount: number}} Heatmap cells and max count.
 */
function buildHeatmapCells(incidents) {
  const gridCells = new Map();
  let maxCount = 0;

  incidents.forEach((incident) => {
    const cellLat = Math.floor(incident.location.latitude / GRID_SIZE) * GRID_SIZE;
    const cellLng = Math.floor(incident.location.longitude / GRID_SIZE) * GRID_SIZE;
    const cellKey = `${cellLat.toFixed(2)}_${cellLng.toFixed(2)}`;

    if (!gridCells.has(cellKey)) {
      gridCells.set(cellKey, {
        latitude: cellLat,
        longitude: cellLng,
        count: 0,
        severity: {high: 0, medium: 0, low: 0},
        types: {},
      });
    }

    const cell = gridCells.get(cellKey);
    cell.count++;
    maxCount = Math.max(maxCount, cell.count);

    const severity = incident.severity || "low";
    if (Object.prototype.hasOwnProperty.call(cell.severity, severity)) {
      cell.severity[severity]++;
    }

    const type = incident.type || "other";
    cell.types[type] = (cell.types[type] || 0) + 1;
  });

  const cells = Array.from(gridCells.values())
      .map((cell) => ({
        latitude: cell.latitude,
        longitude: cell.longitude,
        weight: maxCount > 0 ? cell.count / maxCount : 0,
        count: cell.count,
        severity: cell.severity,
        types: cell.types,
      }))
      .sort((a, b) => b.count - a.count);

  return {cells, maxCount};
}
