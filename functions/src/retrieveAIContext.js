/**
 * AI Context Retrieval & Evaluation Engine
 * Phase 4 Implementation: Deterministic retrieval of published knowledge
 * and pure evaluation of active operational rules (Hybrid Model: General Guidance & Threshold-Based).
 *
 * Designed for ThreatTrack AI Decision Support.
 */

/* eslint-disable require-jsdoc */

/**
 * Supported comparison operators for threshold-based rules
 */
const COMPARISON_OPERATORS = {
  ">=": (a, b) => a >= b,
  ">": (a, b) => a > b,
  "<=": (a, b) => a <= b,
  "<": (a, b) => a < b,
  "==": (a, b) => a === b,
};

/**
 * Priority weighting for sorting triggered rules
 */
const PRIORITY_RANKS = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Pure helper: Evaluate a single comparison operator
 * @param {number} metricValue Actual value from analytics/hotspot
 * @param {string} operator Comparison operator ('>=', '>', '<=', '<', '==')
 * @param {number} threshold Target threshold value
 * @return {boolean}
 */
function evaluateCondition(metricValue, operator, threshold) {
  const val = Number(metricValue);
  const thresh = Number(threshold);
  if (!Number.isFinite(val) || !Number.isFinite(thresh)) {
    return false;
  }

  const fn = COMPARISON_OPERATORS[operator];
  if (!fn) return false;

  return fn(val, thresh);
}

/**
 * Extract numerical metric from a hotspot or summary data object
 * @param {Object} hotspot Hotspot analytics object
 * @param {string} conditionType Metric identifier
 * @return {number}
 */
function extractMetricValue(hotspot, conditionType) {
  if (!hotspot || typeof hotspot !== "object") return 0;

  switch (conditionType) {
    case "incident_count":
      return Number(hotspot.totalReports || hotspot.incidentCount || hotspot.count || 0);

    case "high_severity_count":
      if (hotspot.severityBreakdown && typeof hotspot.severityBreakdown.high === "number") {
        return Number(hotspot.severityBreakdown.high);
      }
      return Number(hotspot.highSeverityCount || 0);

    case "sos_count":
      return Number(hotspot.sosReports || hotspot.sosCount || 0);

    case "weighted_score":
      return Number(hotspot.weightedScore || hotspot.score || 0);

    default:
      return 0;
  }
}

/**
 * Check if a rule applies to a specific hotspot's crime types
 * @param {Object} rule Operational rule
 * @param {Object} hotspot Hotspot analytics object
 * @return {boolean}
 */
function matchesCrimeType(rule, hotspot) {
  const ruleCrime = (rule.crimeType || rule.appliesTo || "all").toLowerCase();
  if (ruleCrime === "all") return true;

  const hotspotType = (hotspot.dominantType || hotspot.crimeType || hotspot.type || "").toLowerCase();
  if (hotspotType && (hotspotType === ruleCrime || hotspotType.includes(ruleCrime))) {
    return true;
  }

  // Check top / breakdown types if present
  if (Array.isArray(hotspot.topTypes)) {
    return hotspot.topTypes.some((t) => {
      const typeStr = typeof t === "string" ? t.toLowerCase() : (t.type || "").toLowerCase();
      return typeStr === ruleCrime;
    });
  }

  return false;
}

/**
 * Evaluate an operational rule against a hotspot (supports both General Guidance and Threshold-based)
 * @param {Object} rule Operational rule document
 * @param {Object} hotspot Hotspot data
 * @return {Object|null} Triggered rule object or null
 */
function evaluateRuleAgainstHotspot(rule, hotspot) {
  if (!rule || rule.status !== "active") return null;
  if (!matchesCrimeType(rule, hotspot)) return null;

  const ruleName = rule.name || "Untitled Guidance";
  const guidance = rule.recommendedAction || rule.guidance || "";
  const additionalContext = rule.description || rule.additionalContext || "";
  const priority = (rule.priority || "medium").toLowerCase();
  const ruleId = rule.id || "rule-anon";
  const version = rule.version || 1;

  // Case A: General Guidance Rule (No threshold required)
  if (!rule.hasConditions || !rule.conditionType) {
    return {
      ruleId,
      ruleName,
      ruleType: "general_guidance",
      appliesTo: rule.crimeType || "all",
      guidance,
      additionalContext,
      priority,
      version,
      matchedHotspot: hotspot.locationLabel || hotspot.barangay || "General",
      reason: `General operational guidance applicable to ${rule.crimeType || "all categories"}`,
    };
  }

  // Case B: Threshold-Based Rule
  const metricVal = extractMetricValue(hotspot, rule.conditionType);
  const operator = rule.operator || ">=";
  const threshold = Number(rule.threshold);
  const isTriggered = evaluateCondition(metricVal, operator, threshold);

  if (!isTriggered) return null;

  return {
    ruleId,
    ruleName,
    ruleType: "threshold_rule",
    appliesTo: rule.crimeType || "all",
    guidance,
    additionalContext,
    priority,
    version,
    conditionFormula: `${rule.conditionType} ${operator} ${threshold} [${rule.timePeriod || "30d"}]`,
    metricValue: metricVal,
    threshold,
    matchedHotspot: hotspot.locationLabel || hotspot.barangay || "General",
    reason: `Triggered by ${rule.conditionType}: ${metricVal} ${operator} ${threshold} (${rule.timePeriod || "30d"} window)`,
  };
}

/**
 * Retrieve published knowledge entries from Firestore
 * @param {Object} db Firestore Admin instance
 * @param {Object} options Query & filtering options
 * @return {Promise<Array>}
 */
async function retrievePublishedKnowledge(db, options = {}) {
  const maxItems = options.limit || 15;
  const filterTypes = Array.isArray(options.types) ? options.types : null;

  try {
    const snapshot = await db.collection("ai_knowledge")
        .where("status", "==", "published")
        .get();

    const now = Date.now();
    const results = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Check expiration if set
      if (data.expirationDate) {
        const expTime = data.expirationDate.toDate ?
          data.expirationDate.toDate().getTime() :
          new Date(data.expirationDate).getTime();

        if (Number.isFinite(expTime) && expTime < now) {
          return; // Expired
        }
      }

      // Check type filter if requested
      if (filterTypes && filterTypes.length > 0 && !filterTypes.includes(data.type)) {
        return;
      }

      results.push({
        id: docSnap.id,
        title: data.title || "",
        type: data.type || "reference",
        source: data.source || "",
        referenceNumber: data.referenceNumber || "",
        content: data.content || "",
        version: data.version || 1,
        updatedAt: data.updatedAt ?
          (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) :
          null,
      });
    });

    return results.slice(0, maxItems);
  } catch (error) {
    console.error("[retrieveAIContext] Failed to retrieve published knowledge:", error);
    return []; // Graceful fallback
  }
}

/**
 * Retrieve and evaluate active operational rules against analytics hotspots
 * @param {Object} db Firestore Admin instance
 * @param {Array} hotspots Array of hotspot objects
 * @param {Object} options Options
 * @return {Promise<Object>}
 */
async function evaluateActiveRules(db, hotspots = [], options = {}) {
  try {
    const snapshot = await db.collection("ai_rules")
        .where("status", "==", "active")
        .get();

    const activeRules = [];
    snapshot.forEach((docSnap) => {
      activeRules.push({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });

    const triggeredRules = [];
    const rulesByHotspot = {};
    const seenRuleHotspotPairs = new Set();

    // Default to at least one evaluation context if no hotspots provided
    const evalTargets = Array.isArray(hotspots) && hotspots.length > 0 ?
      hotspots :
      [{locationLabel: "City-Wide", dominantType: "all", totalReports: 0}];

    for (const hotspot of evalTargets) {
      const targetLabel = hotspot.locationLabel || hotspot.barangay || "General";
      rulesByHotspot[targetLabel] = [];

      for (const rule of activeRules) {
        const matched = evaluateRuleAgainstHotspot(rule, hotspot);
        if (matched) {
          const pairKey = `${rule.id}::${targetLabel}`;
          if (!seenRuleHotspotPairs.has(pairKey)) {
            seenRuleHotspotPairs.add(pairKey);
            triggeredRules.push(matched);
            rulesByHotspot[targetLabel].push(matched);
          }
        }
      }
    }

    // Sort triggered rules by Priority rank descending
    triggeredRules.sort((a, b) => {
      const rankA = PRIORITY_RANKS[a.priority] || 1;
      const rankB = PRIORITY_RANKS[b.priority] || 1;
      return rankB - rankA;
    });

    return {
      triggeredRules,
      rulesByHotspot,
      totalActiveRulesCount: activeRules.length,
      triggeredCount: triggeredRules.length,
    };
  } catch (error) {
    console.error("[retrieveAIContext] Failed to evaluate active rules:", error);
    return {
      triggeredRules: [],
      rulesByHotspot: {},
      totalActiveRulesCount: 0,
      triggeredCount: 0,
    };
  }
}

/**
 * Main coordinator function: Retrieve enriched AI context bundle
 * @param {Object} db Firestore Admin instance
 * @param {Object} analyticsPayload Payload containing summary and priority hotspots
 * @return {Promise<Object>}
 */
async function retrieveAIContext(db, analyticsPayload = {}) {
  const hotspots = Array.isArray(analyticsPayload.priorityHotspots) ?
    analyticsPayload.priorityHotspots :
    Array.isArray(analyticsPayload.hotspots) ?
      analyticsPayload.hotspots :
      [];

  const [knowledge, rulesEvaluation] = await Promise.all([
    retrievePublishedKnowledge(db, {limit: 10}),
    evaluateActiveRules(db, hotspots),
  ]);

  return {
    knowledge,
    triggeredRules: rulesEvaluation.triggeredRules,
    rulesByHotspot: rulesEvaluation.rulesByHotspot,
    metadata: {
      knowledgeCount: knowledge.length,
      rulesEvaluatedCount: rulesEvaluation.totalActiveRulesCount,
      rulesTriggeredCount: rulesEvaluation.triggeredCount,
      retrievedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  evaluateCondition,
  extractMetricValue,
  matchesCrimeType,
  evaluateRuleAgainstHotspot,
  retrievePublishedKnowledge,
  evaluateActiveRules,
  retrieveAIContext,
};
