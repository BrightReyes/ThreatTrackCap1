/**
 * Synchronize User Auth Verification Status
 * Callable Cloud Function that verifies whether a user's Gmail/Email is marked
 * as verified in Firebase Authentication, and updates the corresponding Firestore
 * user profile document to keep client and administrative interfaces in lockstep.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const ALLOWED_STAFF_ROLES = new Set([
  "admin",
  "moderator",
  "police",
  "police_admin",
  "police admin",
  "head_police",
  "head_police_admin",
  "head police admin",
  "barangay",
  "barangay_admin",
  "barangay admin",
]);

/**
 * Callable function to synchronize a user's Firebase Auth emailVerified status
 * with their Firestore profile document.
 * Callable by authorized administrative staff or the user themselves.
 */
exports.syncUserAuthVerification = onCall({cors: true}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required to sync verification.");
  }

  const callerUid = request.auth.uid;
  const targetUid = String(request.data?.uid || callerUid).trim();

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "Target user ID is required.");
  }

  // If checking another user, ensure caller has administrative staff authority
  if (targetUid !== callerUid) {
    const callerSnap = await admin.firestore().collection("users").doc(callerUid).get();
    const callerRole = String(callerSnap.data()?.role || "").trim().toLowerCase();
    if (!ALLOWED_STAFF_ROLES.has(callerRole)) {
      throw new HttpsError("permission-denied", "Only administrative staff may inspect another user's verification status.");
    }
  }

  try {
    const userRecord = await admin.auth().getUser(targetUid);
    const isEmailVerified = Boolean(userRecord.emailVerified);

    if (isEmailVerified) {
      await admin.firestore().collection("users").doc(targetUid).set({
        emailVerified: true,
        isVerified: true,
        lastVerificationCheckAt: new Date().toISOString(),
      }, {merge: true});
    }

    return {
      success: true,
      uid: targetUid,
      email: userRecord.email,
      emailVerified: isEmailVerified,
      isVerified: isEmailVerified,
      synced: isEmailVerified,
    };
  } catch (err) {
    console.error(`[syncUserAuthVerification] Error for UID ${targetUid}:`, err);
    throw new HttpsError("internal", err.message || "Failed to inspect auth verification status.");
  }
});
