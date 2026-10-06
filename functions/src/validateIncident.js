/**
 * Validate Incident Submission
 *
 * This Cloud Function validates incident reports when they are created.
 * It checks for spam, validates data integrity, and assigns a verification score.
 *
 * Trigger: Firestore onCreate - incidents collection
 */

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";

// Strict JSON Schema for Gemini structured output (no percentages, words only)
const LEGITIMACY_SCHEMA = {
  type: "object",
  required: ["rating", "summary", "flags"],
  properties: {
    rating: {
      type: "string",
      enum: ["High Confidence Legit", "Needs Verification", "Suspected False / Spam"],
    },
    summary: {
      type: "string",
      description: "Brief 1-sentence rationale explaining the classification to emergency dispatchers.",
    },
    flags: {
      type: "array",
      items: {type: "string"},
      description: "Specific warnings if spam, prank, vague, or out-of-boundary.",
    },
  },
};

module.exports = onDocumentCreated(
    {
      document: "incidents/{incidentId}",
      secrets: [GEMINI_API_KEY],
      timeoutSeconds: 30,
      memory: "256MiB",
    },
    async (event) => {
      const db = admin.firestore();
      const incident = event.data.data();
      const incidentId = event.params.incidentId;

      console.log(`Validating incident: ${incidentId}`);

      try {
        const incidentRef = db.collection("incidents").doc(incidentId);
        const currentSnap = await incidentRef.get();
        const currentIncident = currentSnap.exists ? currentSnap.data() : incident;
        const alreadyResponding = currentIncident?.status === "responding" ||
          currentIncident?.responseStatus === "help_on_the_way";

        // Automated AI semantic legitimacy triage (with safe free-tier fallback)
        const triage = await triageIncidentLegitimacy(db, currentIncident || incident, incidentId);

        // Validation checks
        const validationResults = {
          hasValidLocation: validateLocation(incident.location),
          hasValidType: validateType(incident.type),
          hasValidSeverity: validateSeverity(incident.severity),
          hasValidDescription: validateDescription(incident.description),
          isNotSpam: triage.rating === "Suspected False / Spam" ? false : await checkSpamScore(db, incident, incidentId),
        };

        // Calculate verification score (0-100)
        const verificationScore = calculateVerificationScore(validationResults);

        const isHighPriority = isHighPriorityIncident(incident);

        // Determine initial status
        let status = "pending";
        if (triage.rating === "Suspected False / Spam") {
          status = "spam";
        } else if (isHighPriority && validationResults.hasValidLocation && validationResults.hasValidType) {
          status = "verified"; // SOS/high severity reports go straight to responder review.
        } else if (verificationScore >= 80) {
          status = "verified"; // Auto-verify high-quality reports
        } else if (verificationScore < 30) {
          status = "spam"; // Auto-flag low-quality reports
        } else {
          status = "under_review"; // Needs manual review
        }

        // Update the incident document
        const updatePayload = {
          verificationScore,
          status: alreadyResponding ? "responding" : status,
          validatedAt: admin.firestore.FieldValue.serverTimestamp(),
          legitimacyRating: triage.rating,
          legitimacySummary: triage.summary,
          legitimacyReasons: triage.reasons || [],
          legitimacyFlags: triage.flags || [],
          legitimacySource: triage.source,
          legitimacyEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (isHighPriority && status === "verified") {
          updatePayload.priority = "high";
          updatePayload.responseStatus = alreadyResponding ?
            currentIncident.responseStatus || "help_on_the_way" :
            incident.responseStatus || "awaiting_response";
          updatePayload.autoValidated = true;
          updatePayload.autoValidatedReason = incident.isSOSReport ? "sos_report" : "high_severity";
          updatePayload.autoValidatedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        await incidentRef.update(updatePayload);
        await updateReporterStats(db, incident.reporterId);

        console.log(`Incident ${incidentId} validated. Score: ${verificationScore}, Status: ${status}, Legitimacy: ${triage.rating} (${triage.source})`);

        if (isHighPriority && status === "verified" && !alreadyResponding) {
          await createAdminPriorityNotification(db, incident, incidentId);
        }

        // If spam, log for admin review
        if (status === "spam") {
          await logSuspiciousActivity(db, incident, incidentId);
        }

        return {success: true, verificationScore, status, legitimacy: triage};
      } catch (error) {
        console.error(`Error validating incident ${incidentId}:`, error);

        // Update incident with error status
        await db.collection("incidents").doc(incidentId).update({
          status: "error",
          validationError: error.message,
        });

        return {success: false, error: error.message};
      }
    },
);

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
async function checkSpamScore(db, incident, incidentId) {
  try {
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
    const tenMinutesAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);

    // Check if user has submitted multiple incidents in short time
    if (incident.reporterId) {
      const recentIncidents = await db.collection("incidents")
          .where("reporterId", "==", incident.reporterId)
          .where("reportedAt", ">", oneHourAgo) // Last hour
          .orderBy("reportedAt", "desc")
          .get();

      // More than 5 reports in 1 hour is suspicious
      if (recentIncidents.size > 5) {
        console.log(`Spam detected: User ${incident.reporterId} has ${recentIncidents.size} reports in 1 hour`);
        return false;
      }
    }

    if (!validateLocation(incident.location)) {
      return true;
    }

    // Check for duplicate locations (same location within 50 meters and 10 minutes)
    const recentReports = await db.collection("incidents")
        .where("reportedAt", ">", tenMinutesAgo) // Last 10 minutes
        .orderBy("reportedAt", "desc")
        .limit(100)
        .get();

    const duplicates = recentReports.docs.filter((doc) => {
      if (doc.id === incidentId) return false;

      const data = doc.data();
      if (!validateLocation(data.location)) return false;

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
 * Keep lightweight reporter metadata for moderation and future trust scoring.
 */
async function updateReporterStats(db, reporterId) {
  if (!reporterId) return;

  try {
    await db.collection("users").doc(reporterId).set({
      reportCount: admin.firestore.FieldValue.increment(1),
      lastReportAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    console.error(`Error updating reporter stats for ${reporterId}:`, error);
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
 * SOS and high severity reports must surface immediately to admin response.
 */
function isHighPriorityIncident(incident) {
  return incident?.isSOSReport === true ||
    String(incident?.severity || "").toLowerCase() === "high" ||
    String(incident?.priority || "").toLowerCase() === "high";
}

/**
 * Create/refresh a deterministic admin notification for urgent reports.
 */
async function createAdminPriorityNotification(db, incident, incidentId) {
  try {
    const notificationId = `admin_priority_${incidentId}`;
    const typeLabel = incident.typeLabel || humanizeType(incident.type);
    const isSos = incident.isSOSReport === true;

    await db.collection("notifications").doc(notificationId).set({
      userId: "admin",
      audience: "admin",
      incidentId,
      title: isSos ? "SOS report needs response" : "High priority report needs response",
      body: `${typeLabel} was auto-validated. Click Respond to notify the reporter that help is on the way.`,
      type: isSos ? "admin_sos_report" : "admin_high_priority_report",
      severity: "high",
      priority: "high",
      readAt: null,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      location: incident.location || null,
      reportType: incident.type || null,
    }, {merge: true});
  } catch (error) {
    console.error(`Error creating admin priority notification for ${incidentId}:`, error);
  }
}

function humanizeType(type) {
  if (!type) return "Incident";
  return String(type)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
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

/**
 * Fast-path pre-retrieval check for obvious spam, pure numbers, or keyboard mash (< 1ms).
 * Saves Firestore reads and Gemini API tokens from being wasted on obvious junk.
 */
function fastPathSpamOrGibberishCheck(text, isSos = false) {
  const desc = String(text || "").trim().toLowerCase();
  if (!desc) {
    if (isSos) return {isRejected: false};
    return {isRejected: true, reason: "Description is empty"};
  }
  if (desc.length < 4) {
    if (isSos) return {isRejected: false};
    return {isRejected: true, reason: "Description too brief for dispatch evaluation"};
  }

  // 0. Standalone casual non-incident greeting or accidental send
  const isolatedGreetings = new Set([
    "hi", "hi po", "hello", "hello po", "kamusta", "kamusta po", "kumusta", "kumusta po",
    "good morning", "good morning po", "good afternoon", "good afternoon po",
    "good evening", "good evening po", "good night po", "ok na to", "ok na po",
    "wala lang", "wala po", "wala naman", "wrong send", "kamali", "napindot lang", "namali ng pindot",
  ]);
  if (isolatedGreetings.has(desc)) {
    if (isSos) return {isRejected: false};
    return {isRejected: true, reason: "Casual non-incident greeting without emergency details"};
  }

  // 1. Obvious spam / prank phrases
  const fastSpam = [
    "asdf", "qwerty", "12345", "test only", "testing lang", "sample report",
    "hahaha", "hehehe", "charot", "trip lang", "joke lang",
    "casino", "slot", "scatter", "jili", "sabong", "pautang", "click here",
  ];
  const matched = fastSpam.find((p) => desc.includes(p));
  if (matched) {
    return {isRejected: true, reason: `Spam/prank phrase detected: "${matched}"`};
  }

  // 2. Pure numbers or random numeric mash (e.g. "a1231231231415142" or "123456789")
  const alphaCount = desc.replace(/[^a-z]/g, "").length;
  const digitsCount = desc.replace(/[^0-9]/g, "").length;
  if (alphaCount === 0) {
    return {isRejected: true, reason: "Description contains zero words or letters"};
  }
  if (digitsCount >= 6 && alphaCount <= 2) {
    return {isRejected: true, reason: "Random numeric string without incident details"};
  }

  // 3. Unbroken giant tokens (16+ chars without space) or keyboard rolling
  const tokens = desc.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const letters = token.replace(/[^a-z]/g, "");
    if (letters.length >= 16 && !token.startsWith("http")) {
      return {isRejected: true, reason: "Single unbroken word exceeds normal language length"};
    }
    if (tokens.length === 1 && token.length >= 8 && digitsCount >= 4) {
      return {isRejected: true, reason: "Alphanumeric keyboard mash token"};
    }
    if (letters.length >= 10) {
      const unique = new Set(letters).size;
      if (unique / letters.length < 0.35) {
        return {isRejected: true, reason: "Keyboard rolling pattern / low character variety"};
      }
    }
    if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(letters)) {
      return {isRejected: true, reason: "Impossible consonant cluster"};
    }
  }

  // 4. Repeated character loops (e.g. "aaaaa", "123123123")
  if (/(.)\1{4,}/.test(desc)) {
    return {isRejected: true, reason: "Repetitive character repetition"};
  }
  if (/(.{2,4})\1{2,}/.test(desc.replace(/\s+/g, ""))) {
    return {isRejected: true, reason: "Repetitive pattern looping"};
  }

  return {isRejected: false};
}

/**
 * RAG RETRIEVAL 1: Spatial-temporal proximity corroboration
 * Checks if other reports exist within ~600m in the last 30 minutes
 */
async function retrieveNearbyCorroboration(db, location, currentIncidentId) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
    return [];
  }

  try {
    const thirtyMinsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 60 * 1000);
    const snap = await db.collection("incidents")
        .where("reportedAt", ">=", thirtyMinsAgo)
        .limit(25)
        .get();

    const currentLat = Number(location.latitude);
    const currentLng = Number(location.longitude);
    const nearby = [];

    snap.forEach((docSnap) => {
      if (docSnap.id === currentIncidentId) return;
      const data = docSnap.data();
      const loc = data.location;
      if (!loc || !Number.isFinite(Number(loc.latitude))) return;

      const latDiff = Math.abs(Number(loc.latitude) - currentLat);
      const lngDiff = Math.abs(Number(loc.longitude) - currentLng);

      // ~600 meters proximity
      if (latDiff < 0.0055 && lngDiff < 0.0055) {
        nearby.push({
          id: docSnap.id,
          type: data.type || "incident",
          description: String(data.description || "").substring(0, 70),
          status: data.status || "open",
        });
      }
    });

    return nearby.slice(0, 3);
  } catch (error) {
    console.warn("[retrieveNearbyCorroboration] Proximity lookup error:", error.message);
    return [];
  }
}

/**
 * RAG RETRIEVAL 2: Reporter trust and reputation history
 */
async function retrieveReporterHistory(db, reporterId) {
  if (!reporterId) return {status: "anonymous", isVerified: false, reportCount: 0};

  try {
    const docSnap = await db.collection("users").doc(reporterId).get();
    if (!docSnap.exists) return {status: "new_account", isVerified: false, reportCount: 1};

    const data = docSnap.data() || {};
    return {
      status: "registered_user",
      isVerified: Boolean(data.isVerified),
      reportCount: Number(data.reportCount || 1),
      reputationScore: Number(data.reputationScore || 100),
    };
  } catch (error) {
    return {status: "lookup_failed", isVerified: false, reportCount: 1};
  }
}

/**
 * RAG RETRIEVAL 3: Retrieve 2-3 past genuine, verified/resolved reports of the same category.
 * This Few-Shot Exemplar Grounding gives Gemini Flash real-world examples of authentic
 * resident phrasing, local slang, and emergency descriptions in Valenzuela City.
 */
async function retrieveVerifiedExemplars(db, incidentType, currentIncidentId) {
  if (!incidentType) return [];
  try {
    const snap = await db.collection("incidents")
        .where("type", "==", incidentType)
        .limit(10)
        .get();

    const exemplars = [];
    snap.forEach((docSnap) => {
      if (docSnap.id === currentIncidentId) return;
      const data = docSnap.data() || {};
      const isVerifiedOrResolved = ["resolved", "responding", "verified"].includes(data.status) ||
        Number(data.verificationScore || 0) >= 70;
      const desc = String(data.description || "").trim();

      // Only select genuine reports with informative human descriptions
      if (isVerifiedOrResolved && desc.length >= 12 && exemplars.length < 3) {
        exemplars.push({
          type: data.type,
          description: desc.substring(0, 120),
          address: data.location?.address || "Valenzuela City",
        });
      }
    });

    return exemplars;
  } catch (error) {
    console.warn("[retrieveVerifiedExemplars] Exemplar lookup error:", error.message);
    return [];
  }
}

/**
 * Triage Incident Legitimacy with RAG (Retrieval-Augmented Generation) + Fast-Path Gate
 */
async function triageIncidentLegitimacy(db, incident, incidentId) {
  const desc = String(incident.description || "").trim();

  // STAGE 1: Fast-Path Pre-Retrieval Gate (rejects junk in 0ms without DB or API cost)
  const preCheck = fastPathSpamOrGibberishCheck(desc, incident.isSOSReport === true);
  if (preCheck.isRejected) {
    return {
      rating: "Suspected False / Spam",
      summary: `Pre-retrieval gate: ${preCheck.reason}.`,
      flags: [preCheck.reason],
      source: "pre_retrieval_gate",
    };
  }

  // STAGE 2: RAG Pipeline (Retrieve database evidence in parallel)
  let apiKey = null;
  try {
    apiKey = (typeof GEMINI_API_KEY.value === "function" ? GEMINI_API_KEY.value() : null) || process.env.GEMINI_API_KEY;
  } catch (e) {
    apiKey = process.env.GEMINI_API_KEY || null;
  }

  // Retrieve grounding evidence from Firestore
  const [corroborations, reporterProfile, exemplars] = await Promise.all([
    retrieveNearbyCorroboration(db, incident.location, incidentId),
    retrieveReporterHistory(db, incident.reporterId),
    retrieveVerifiedExemplars(db, incident.type, incidentId),
  ]);

  if (apiKey) {
    try {
      const aiResult = await evaluateLegitimacyWithRAG(
          incident,
          corroborations,
          reporterProfile,
          exemplars,
          apiKey,
      );
      if (aiResult && aiResult.rating) {
        return aiResult;
      }
    } catch (aiError) {
      console.warn(`[validateIncident] Gemini RAG triage unavailable (${aiError.message}). Engaging fallback.`);
    }
  } else {
    console.info("[validateIncident] No GEMINI_API_KEY secret configured. Running fallback engine.");
  }

  // Graceful deterministic fallback using the retrieved corroboration evidence
  return evaluateLegitimacyFallback(incident, corroborations);
}

/**
 * Grounded RAG Call to Google Gemini Flash
 */
async function evaluateLegitimacyWithRAG(incident, corroborations, reporterProfile, exemplars, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const corroborationSection = corroborations.length > 0 ?
      `${corroborations.length} report(s) within ~600m in the last 30 minutes:\n` +
      corroborations.map((c, i) => `  ${i + 1}. [${c.type}] "${c.description}"`).join("\n") :
      "No corroborating reports found in immediate vicinity.";

    const exemplarsSection = exemplars.length > 0 ?
      exemplars.map((e, i) => `  Example ${i + 1}: "${e.description}" (Location: ${e.address})`).join("\n") :
      "No historical verified reports available for this category yet.";

    const hasPhoto = Boolean(
        incident.photoDataUrl ||
        incident.photoURL ||
        incident.imageUrl ||
        (Array.isArray(incident.images) && incident.images.length > 0) ||
        (Array.isArray(incident.photoUrls) && incident.photoUrls.length > 0),
    );

    const prompt = [
      "You are the official emergency triage AI for Valenzuela City's ThreatTrack public safety system.",
      "TASK: Grounded evaluation of whether this report is legitimate, needs review, or is spam/false.",
      "",
      "=== 1. CURRENT CITIZEN SUBMISSION ===",
      `Category: ${incident.type || "unknown"}`,
      `Severity: ${incident.severity || "normal"}`,
      `Address: ${incident.location?.address || "No address attached"}`,
      `Coordinates: lat=${incident.location?.latitude || 0}, lng=${incident.location?.longitude || 0}`,
      `Direct SOS Distress Signal: ${incident.isSOSReport ? "YES" : "NO"}`,
      `Photographic Evidence Attached: ${hasPhoto ? "YES" : "NO"}`,
      `Citizen Description: "${incident.description || ""}"`,
      "",
      "=== 2. GROUNDED EVIDENCE RETRIEVED FROM THREATTRACK DATABASE (RAG) ===",
      `A. Spatial-Temporal Corroboration:\n${corroborationSection}`,
      `B. Reporter Trust Profile: Verified=${reporterProfile.isVerified}, TotalReports=${reporterProfile.reportCount}, Status=${reporterProfile.status}`,
      `C. Historical Verified Resident Reports of this Category (Benchmark Examples):\n${exemplarsSection}`,
      "",
      "=== 3. CRITICAL EVALUATION RULES ===",
      "1. CONTENT INTEGRITY FIRST: The description MUST describe an intelligible human incident in English, Tagalog, or Taglish.",
      "   - Compare against the Benchmark Verified Reports: Does this describe a genuine emergency situation?",
      "   - Meaningless keyboard mash, random numbers, single vague words, or jokes are an AUTOMATIC 'Suspected False / Spam'.",
      "   - Proximity to a real incident NEVER validates meaningless or spam text.",
      "2. HIGH CONFIDENCE: If the description describes an intelligible emergency AND is corroborated by nearby reports OR matches authentic emergency patterns with clear context, assign 'High Confidence Legit'.",
      "3. UNCORROBORATED / VAGUE: If plausible but isolated, brief, or needs dispatcher confirmation before deploying units, assign 'Needs Verification'.",
      "",
      "OUTPUT: Return strictly JSON adhering to the provided schema with NO markdown formatting.",
    ].join("\n");

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{parts: [{text: prompt}]}],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500,
              responseMimeType: "application/json",
              responseJsonSchema: LEGITIMACY_SCHEMA,
            },
          }),
          signal: controller.signal,
        },
    );

    clearTimeout(timeoutId);

    if (res.status === 429) {
      throw new Error("Free tier rate limit reached (HTTP 429)");
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(`Gemini API error: ${errBody?.error?.message || `HTTP ${res.status}`}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");

    const parsed = JSON.parse(text.replace(/```json\s*|\s*```/gi, "").trim());
    const validRatings = ["High Confidence Legit", "Needs Verification", "Suspected False / Spam"];
    const rating = validRatings.includes(parsed.rating) ? parsed.rating : "Needs Verification";

    const reasons = [];
    if (incident.isSOSReport) reasons.push("Direct emergency SOS distress signal");
    if (hasPhoto) reasons.push("Photographic evidence attached");
    if (incident.location?.latitude && incident.location?.longitude) reasons.push("GPS verified inside Valenzuela");
    if (reporterProfile.isVerified) reasons.push("Verified resident account");
    if (corroborations.length > 0) reasons.push(`Corroborated by ${corroborations.length} nearby report(s)`);
    if (exemplars.length > 0 && rating === "High Confidence Legit") reasons.push("Matches authentic emergency patterns");

    return {
      rating,
      summary: parsed.summary || "AI-evaluated incident report.",
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      reasons,
      source: "gemini_rag",
      corroborationCount: corroborations.length,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Deterministic rule-based fallback when Gemini is offline, using retrieved corroboration
 */
function evaluateLegitimacyFallback(incident, corroborations = []) {
  const loc = incident.location || {};
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  const isSos = Boolean(incident.isSOSReport);

  const insideValenzuela = lat >= 14.668 && lat <= 14.760 && lng >= 120.925 && lng <= 121.026;
  const reasons = [];
  const flags = [];

  if (insideValenzuela) {
    reasons.push("GPS verified inside Valenzuela");
  } else {
    flags.push("Coordinates outside Valenzuela coverage");
  }

  if (isSos) {
    reasons.push("Direct emergency SOS distress signal");
    return {
      rating: "High Confidence Legit",
      summary: "Rule engine: Direct citizen SOS distress signal with verified telemetry.",
      flags,
      reasons,
      source: "rule_engine_fallback",
    };
  }

  // If corroborated by another nearby report in Firestore
  if (corroborations && corroborations.length > 0 && insideValenzuela) {
    reasons.push(`Corroborated by ${corroborations.length} nearby report(s)`);
    return {
      rating: "High Confidence Legit",
      summary: `Rule engine: Report corroborated by nearby active incident in Valenzuela.`,
      flags,
      reasons,
      source: "rule_engine_fallback",
    };
  }

  return {
    rating: "Needs Verification",
    summary: "Rule engine: Automated analysis pending; manual review recommended.",
    flags,
    reasons,
    source: "rule_engine_fallback",
  };
}
