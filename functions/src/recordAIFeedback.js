/**
 * Record AI Feedback Subsystem
 * Phase 8 Implementation: Callable Cloud Function that captures administrator ratings,
 * diagnostic category tags, and feedback comments on AI-generated recommendations.
 *
 * Designed for ThreatTrack AI Decision Support.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/* eslint-disable require-jsdoc */

const VALID_RATINGS = new Set(["helpful", "unhelpful", "neutral", "1", "2", "3", "4", "5"]);
const VALID_CATEGORIES = new Set([
  "accurate",
  "inaccurate_law",
  "unrealistic_action",
  "incomplete_data",
  "helpful_strategy",
  "general",
  "other",
]);

const ALLOWED_ROLES = new Set([
  "admin",
  "moderator",
  "police",
  "police_admin",
  "police admin",
  "barangay",
  "barangay_admin",
  "barangay admin",
]);

/**
 * Pure validation helper for feedback payload
 * @param {Object} data Input payload
 * @return {Object} Clean validated payload
 */
function validateFeedbackPayload(data = {}) {
  const summaryId = String(data.summaryId || "").trim();
  if (!summaryId) {
    throw new Error("summaryId is required.");
  }

  const rating = String(data.rating || "").trim().toLowerCase();
  if (!VALID_RATINGS.has(rating)) {
    throw new Error(`Invalid rating "${rating}". Must be one of: ${Array.from(VALID_RATINGS).join(", ")}`);
  }

  const category = String(data.category || "general").trim().toLowerCase();
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`Invalid category "${category}". Must be one of: ${Array.from(VALID_CATEGORIES).join(", ")}`);
  }

  const hotspotLabel = String(data.hotspotLabel || "City-Wide").trim().slice(0, 140);
  const comment = String(data.comment || "").trim().slice(0, 1000);

  return {
    summaryId,
    rating,
    category,
    hotspotLabel,
    comment,
  };
}

/**
 * Pure helper to build feedback document
 * @param {Object} payload Validated payload
 * @param {Object} user Auth user {uid, email, role}
 * @return {Object} Firestore document dictionary
 */
function buildFeedbackRecord(payload, user) {
  return {
    summaryId: payload.summaryId,
    hotspotLabel: payload.hotspotLabel,
    rating: payload.rating,
    category: payload.category,
    comment: payload.comment,
    submittedBy: user.uid,
    submitterEmail: user.email || null,
    submitterRole: user.role || "admin",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Pure helper to build audit log entry
 * @param {Object} payload Validated payload
 * @param {Object} user Auth user
 * @return {Object} Audit log document
 */
function buildFeedbackAuditRecord(payload, user) {
  return {
    action: "ai_feedback.submit",
    meta: {
      summaryId: payload.summaryId,
      hotspotLabel: payload.hotspotLabel,
      rating: payload.rating,
      category: payload.category,
    },
    uid: user.uid,
    email: user.email || null,
    at: admin.firestore.FieldValue.serverTimestamp(),
    source: "web_admin_decision_support",
  };
}

/**
 * Cloud Function: recordAIFeedback
 */
const recordAIFeedbackFunction = onCall(
    {
      timeoutSeconds: 30,
      memory: "256MiB",
    },
    async (request) => {
      const uid = request.auth && request.auth.uid;
      const email = request.auth && request.auth.token && request.auth.token.email;
      if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in required to submit feedback.");
      }

      const db = admin.firestore();

      // 1. Verify role
      const userSnap = await db.collection("users").doc(uid).get();
      const role = String(userSnap.data()?.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (!ALLOWED_ROLES.has(role)) {
        throw new HttpsError("permission-denied", "Administrator or Police/Barangay role required.");
      }

      const user = {uid, email, role};

      // 2. Validate payload
      let payload;
      try {
        payload = validateFeedbackPayload(request.data);
      } catch (validationErr) {
        throw new HttpsError("invalid-argument", validationErr.message);
      }

      // 3. Save feedback record and audit log in batch
      const batch = db.batch();
      const feedbackRef = db.collection("ai_feedback").doc();
      const feedbackRecord = buildFeedbackRecord(payload, user);
      batch.set(feedbackRef, feedbackRecord);

      const auditRef = db.collection("audit_logs").doc();
      const auditRecord = buildFeedbackAuditRecord(payload, user);
      batch.set(auditRef, auditRecord);

      await batch.commit();

      return {
        success: true,
        feedbackId: feedbackRef.id,
        summaryId: payload.summaryId,
        rating: payload.rating,
        recordedAt: new Date().toISOString(),
      };
    },
);

module.exports = {
  recordAIFeedback: recordAIFeedbackFunction,
  validateFeedbackPayload,
  buildFeedbackRecord,
  buildFeedbackAuditRecord,
};
