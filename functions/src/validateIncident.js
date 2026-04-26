/**
 * Validate Incident Submission
 * 
 * This Cloud Function validates incident reports when they are created.
 * It checks for spam, validates data integrity, and assigns a verification score.
 * 
 * Trigger: Firestore onCreate - incidents collection
 */

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

module.exports = onDocumentCreated("incidents/{incidentId}", async (event) => {
  const db = admin.firestore();
  const incident = event.data.data();
  const incidentId = event.params.incidentId;

  console.log(`Validating incident: ${incidentId}`);

  try {
    // Validation checks
    const validationResults = {
      hasValidLocation: validateLocation(incident.location),
      hasValidType: validateType(incident.type),
      hasValidSeverity: validateSeverity(incident.severity),
      hasValidDescription: validateDescription(incident.description),
      isNotSpam: await checkSpamScore(db, incident),
    };

    // Calculate verification score (0-100)
    const verificationScore = calculateVerificationScore(validationResults);

    // Determine initial status
    let status = "pending";
    if (verificationScore >= 80) {
      status = "verified"; // Auto-verify high-quality reports
    } else if (verificationScore < 30) {
      status = "spam"; // Auto-flag low-quality reports
    } else {
      status = "under_review"; // Needs manual review
    }

    // Update the incident document
    await db.collection("incidents").doc(incidentId).update({
      verificationScore,
      status,
      validatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Incident ${incidentId} validated. Score: ${verificationScore}, Status: ${status}`);

    // If spam, log for admin review
    if (status === "spam") {
      await logSuspiciousActivity(db, incident, incidentId);
    }

    return {success: true, verificationScore, status};
  } catch (error) {
    console.error(`Error validating incident ${incidentId}:`, error);
    
    // Update incident with error status
    await db.collection("incidents").doc(incidentId).update({
      status: "error",
      validationError: error.message,
    });

    return {success: false, error: error.message};
  }
});

/**
 * Validate location data
 */
function validateLocation(location) {
  if (!location || typeof location !== "object") return false;
  
  const {latitude, longitude} = location;
  
  // Check if coordinates exist and are valid numbers
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  
  // Check if coordinates are within valid ranges
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  
  // Check if coordinates are not (0, 0) which is likely an error
  if (latitude === 0 && longitude === 0) return false;
  
  return true;
}

/**
 * Validate incident type
 */
function validateType(type) {
  const validTypes = [
    "theft_snatching",
    "robbery_holdup",
    "physical_assault_injury",
    "domestic_violence",
    "drug_related_activity",
    "public_disturbance",
    "vandalism_property_damage",
    "traffic_accident",
    "illegal_weapons",
    "suspicious_activity",
  ];
  return validTypes.includes(type);
}

/**
 * Validate severity level
 */
function validateSeverity(severity) {
  const validSeverities = ["high", "medium", "low"];
  return validSeverities.includes(severity);
}

/**
 * Validate description
 */
function validateDescription(description) {
  if (!description || typeof description !== "string") return false;
  
  // Check minimum length (at least 10 characters)
  if (description.trim().length < 10) return false;
  
  // Check maximum length (2000 characters)
  if (description.length > 2000) return false;
  
  // Check for spam keywords (basic spam detection)
  const spamKeywords = ["viagra", "casino", "lottery", "click here", "buy now"];
  const lowerDesc = description.toLowerCase();
  const hasSpamKeywords = spamKeywords.some((keyword) => lowerDesc.includes(keyword));
  
  return !hasSpamKeywords;
}

/**
 * Check for spam patterns
 */
async function checkSpamScore(db, incident) {
  try {
    // Check if user has submitted multiple incidents in short time
    if (incident.reporterId) {
      const recentIncidents = await db.collection("incidents")
        .where("reporterId", "==", incident.reporterId)
        .where("reportedAt", ">", new Date(Date.now() - 60 * 60 * 1000)) // Last hour
        .get();

      // More than 5 reports in 1 hour is suspicious
      if (recentIncidents.size > 5) {
        console.log(`Spam detected: User ${incident.reporterId} has ${recentIncidents.size} reports in 1 hour`);
        return false;
      }
    }

    // Check for duplicate locations (same location within 50 meters and 10 minutes)
    const recentNearby = await db.collection("incidents")
      .where("location.latitude", ">=", incident.location.latitude - 0.0005)
      .where("location.latitude", "<=", incident.location.latitude + 0.0005)
      .where("reportedAt", ">", new Date(Date.now() - 10 * 60 * 1000)) // Last 10 minutes
      .get();

    const duplicates = recentNearby.docs.filter((doc) => {
      const data = doc.data();
      const latDiff = Math.abs(data.location.latitude - incident.location.latitude);
      const lonDiff = Math.abs(data.location.longitude - incident.location.longitude);
      return latDiff < 0.0005 && lonDiff < 0.0005; // ~50 meters
    });

    if (duplicates.length > 2) {
      console.log(`Spam detected: ${duplicates.length} similar reports at same location`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking spam score:", error);
    return true; // Default to not spam if check fails
  }
}

/**
 * Calculate verification score based on validation results
 */
function calculateVerificationScore(results) {
  let score = 0;
  
  // Each validation check contributes to the score
  if (results.hasValidLocation) score += 25;
  if (results.hasValidType) score += 15;
  if (results.hasValidSeverity) score += 15;
  if (results.hasValidDescription) score += 25;
  if (results.isNotSpam) score += 20;
  
  return score;
}

/**
 * Log suspicious activity for admin review
 */
async function logSuspiciousActivity(db, incident, incidentId) {
  try {
    await db.collection("suspicious_activity").add({
      incidentId,
      reporterId: incident.reporterId || "anonymous",
      type: "potential_spam",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      incidentData: {
        type: incident.type,
        location: incident.location,
        description: incident.description.substring(0, 100), // First 100 chars
      },
    });
  } catch (error) {
    console.error("Error logging suspicious activity:", error);
  }
}
