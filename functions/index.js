/**
 * ThreatTrack Cloud Functions
 * 
 * This file exports all Cloud Functions for the ThreatTrack application.
 * Functions are organized by feature area.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();

// Export individual function modules
exports.validateIncident = require("./src/validateIncident");
exports.calculateRiskLevel = require("./src/calculateRiskLevel");
exports.aggregateHeatmapData = require("./src/aggregateHeatmapData");
exports.findNearestPrecinct = require("./src/findNearestPrecinct");
exports.sendNearbyIncidentAlert = require("./src/sendNearbyIncidentAlert");

// Health check endpoint
exports.healthCheck = onRequest((req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "ThreatTrack Cloud Functions",
    version: "1.0.0"
  });
});
