/**
 * Record Decision-Support Action & Audit Logging
 * Phase 7 Implementation: Callable Cloud Function that records human administrator
 * review decisions (approve, reject, modify, adopt actions) on AI-generated suggestions,
 * and creates an immutable, cryptographically-consistent audit trail in `audit_logs`.
 *
 * Designed for ThreatTrack AI Decision Support.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/* eslint-disable require-jsdoc */

const VALID_DECISIONS = new Set([
  "approved",
  "rejected",
  "modified",
  "adopted_action",
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
 * Pure validation helper for review payload
 * @param {Object} data Input payload from client
 * @return {Object} Clean validated payload
 */
function validateDecisionPayload(data = {}) {
  const summaryId = String(data.summaryId || "").trim();
  if (!summaryId) {
    throw new Error("summaryId is required.");
  }

  const decision = String(data.decision || "").trim().toLowerCase();
  if (!VALID_DECISIONS.has(decision)) {
    throw new Error(`Invalid decision "${decision}". Must be one of: ${Array.from(VALID_DECISIONS).join(", ")}`);
  }

  const adminNotes = String(data.adminNotes || "").trim().slice(0, 1000);
  const adoptedActions = Array.isArray(data.adoptedActions) ?
    data.adoptedActions.slice(0, 10).map((act, index) => ({
      actionId: String(act.actionId || `action-${index + 1}`).slice(0, 60),
      action: String(act.action || act.title || "").slice(0, 200),
      assignedUnit: String(act.assignedUnit || act.owner || "unassigned").slice(0, 60),
      targetLocation: String(act.targetLocation || act.location || "").slice(0, 120),
      adoptedAt: new Date().toISOString(),
    })) :
    [];

  const modifications = data.modifications && typeof data.modifications === "object" ?
    data.modifications :
    null;

  return {
    summaryId,
    decision,
    adminNotes,
    adoptedActions,
    modifications,
  };
}

/**
 * Pure helper to build review update object
 * @param {Object} payload Validated payload
 * @param {Object} user Auth user {uid, email, role}
 * @return {Object} Firestore update dictionary
 */
function buildReviewRecord(payload, user) {
  return {
    "review.status": payload.decision,
    "review.reviewedBy": user.uid,
    "review.reviewerEmail": user.email || null,
    "review.reviewerRole": user.role || "admin",
    "review.reviewedAt": admin.firestore.FieldValue.serverTimestamp(),
    "review.adminNotes": payload.adminNotes,
    "review.adoptedActions": payload.adoptedActions,
    "review.modifications": payload.modifications,
    "review.lastModified": admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Pure helper to build immutable audit log document
 * @param {Object} payload Validated payload
 * @param {Object} user Auth user {uid, email}
 * @param {Object} summaryMeta Summary document metadata
 * @return {Object} Audit log document
 */
function buildAuditRecord(payload, user, summaryMeta = {}) {
  return {
    action: `ai_suggestion.${payload.decision}`,
    meta: {
      summaryId: payload.summaryId,
      decision: payload.decision,
      adminNotes: payload.adminNotes,
      adoptedActionsCount: payload.adoptedActions.length,
      inputStatsHash: summaryMeta.inputStatsHash || null,
      hotspotCount: summaryMeta.hotspotCount || 0,
      timeRange: summaryMeta.timeRange || null,
    },
    uid: user.uid,
    email: user.email || null,
    at: admin.firestore.FieldValue.serverTimestamp(),
    source: "web_admin_decision_support",
  };
}

/**
 * Cloud Function: recordDecisionSupportAction
 */
const recordDecisionSupportActionFunction = onCall(
    {
      timeoutSeconds: 30,
      memory: "256MiB",
    },
    async (request) => {
      const uid = request.auth && request.auth.uid;
      const email = request.auth && request.auth.token && request.auth.token.email;
      if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in required to record decisions.");
      }

      const db = admin.firestore();

      // 1. Verify admin role
      const userSnap = await db.collection("users").doc(uid).get();
      const role = String(userSnap.data()?.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (!ALLOWED_ROLES.has(role)) {
        throw new HttpsError("permission-denied", "Administrator or Police/Barangay role required.");
      }

      const user = {uid, email, role};

      // 2. Validate payload
      let payload;
      try {
        payload = validateDecisionPayload(request.data);
      } catch (validationErr) {
        throw new HttpsError("invalid-argument", validationErr.message);
      }

      // 3. Verify target summary exists
      const summaryRef = db.collection("ai_suggestion_summaries").doc(payload.summaryId);
      const summarySnap = await summaryRef.get();
      if (!summarySnap.exists) {
        throw new HttpsError("not-found", `AI suggestion summary "${payload.summaryId}" not found.`);
      }

      const summaryData = summarySnap.data() || {};
      const summaryMeta = {
        inputStatsHash: summaryData.inputStatsHash,
        hotspotCount: summaryData.hotspotCount,
        timeRange: summaryData.timeRange,
      };

      // 4. Perform atomic batch update for summary review state & audit log
      const batch = db.batch();
      const reviewUpdates = buildReviewRecord(payload, user);
      batch.update(summaryRef, reviewUpdates);

      const auditRef = db.collection("audit_logs").doc();
      const auditRecord = buildAuditRecord(payload, user, summaryMeta);
      batch.set(auditRef, auditRecord);

      await batch.commit();

      return {
        success: true,
        summaryId: payload.summaryId,
        decision: payload.decision,
        auditLogId: auditRef.id,
        recordedAt: new Date().toISOString(),
      };
    },
);

module.exports = {
  recordDecisionSupportAction: recordDecisionSupportActionFunction,
  validateDecisionPayload,
  buildReviewRecord,
  buildAuditRecord,
};
