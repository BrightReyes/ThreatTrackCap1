/**
 * AI Verification & Safety Guardrails Subsystem
 * Phase 6 Implementation: Pure deterministic verification of AI-generated summaries
 * covering PII detection, safety/vigilante language, domestic violence privacy compliance,
 * and knowledge/rule citation reconciliation.
 *
 * Designed for ThreatTrack AI Decision Support.
 */

/* eslint-disable require-jsdoc */

// Regular expressions for Philippine phone numbers & general emails
const PH_MOBILE_REGEX = /(?:\+63|0)9\d{9}\b/g;
const PH_LANDLINE_REGEX = /(?:\+63|0)[2-8]\d{7,8}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Prohibited / Vigilante / Severe Action Keywords & Phrases
const VIGILANTE_PATTERNS = [
  /\bhunt\s+down\b/i,
  /\btake\s+matters\s+into\b/i,
  /\bvigilante\b/i,
  /\barmed\s+confrontation\b/i,
  /\bshoot\s+on\s+sight\b/i,
  /\bexecute\s+suspects\b/i,
  /\bphysical\s+retaliation\b/i,
  /\bextralegal\b/i,
];

// Alarmist Panic Phrases
const ALARMIST_PATTERNS = [
  /\btotal\s+collapse\b/i,
  /\buncontrollable\s+crime\s+wave\b/i,
  /\bcomplete\s+lawlessness\b/i,
  /\bcitywide\s+panic\b/i,
];

/**
 * Scan a text string for PII (phone numbers, emails)
 * @param {string} text Text to scan
 * @param {string} fieldName Location of text in summary
 * @return {Array<Object>} Found violations
 */
function scanForPII(text, fieldName) {
  const violations = [];
  if (!text || typeof text !== "string") return violations;

  const mobileMatches = text.match(PH_MOBILE_REGEX);
  if (mobileMatches) {
    violations.push({
      code: "PII_PHONE_DETECTED",
      severity: "critical",
      field: fieldName,
      message: `Detected telephone/mobile number in ${fieldName}: "${mobileMatches.join(", ")}"`,
    });
  }

  const landlineMatches = text.match(PH_LANDLINE_REGEX);
  if (landlineMatches) {
    violations.push({
      code: "PII_LANDLINE_DETECTED",
      severity: "critical",
      field: fieldName,
      message: `Detected landline phone number in ${fieldName}: "${landlineMatches.join(", ")}"`,
    });
  }

  const emailMatches = text.match(EMAIL_REGEX);
  if (emailMatches) {
    violations.push({
      code: "PII_EMAIL_DETECTED",
      severity: "critical",
      field: fieldName,
      message: `Detected email address in ${fieldName}: "${emailMatches.join(", ")}"`,
    });
  }

  return violations;
}

/**
 * Scan a text string for prohibited or vigilante phrases
 * @param {string} text Text to scan
 * @param {string} fieldName Location in summary
 * @return {Array<Object>} Found violations
 */
function scanForProhibitedLanguage(text, fieldName) {
  const violations = [];
  if (!text || typeof text !== "string") return violations;

  for (const pattern of VIGILANTE_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({
        code: "VIGILANTE_LANGUAGE_DETECTED",
        severity: "critical",
        field: fieldName,
        message: `Prohibited vigilante or unsafe language matched in ${fieldName}: "${pattern.source}"`,
      });
    }
  }

  for (const pattern of ALARMIST_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({
        code: "ALARMIST_LANGUAGE_DETECTED",
        severity: "warning",
        field: fieldName,
        message: `Overly alarmist language matched in ${fieldName}: "${pattern.source}"`,
      });
    }
  }

  return violations;
}

/**
 * Check domestic violence & VAWC privacy compliance
 * @param {Object} hotspot Hotspot summary object
 * @return {Array<Object>} Violations
 */
function verifyVAWCCompliance(hotspot) {
  const violations = [];
  const pattern = (hotspot.mainPattern || "").toLowerCase();
  const advisory = (hotspot.suggestedPublicAdvisory || "").toLowerCase();

  const isVAWC = pattern.includes("domestic") || pattern.includes("vawc") || pattern.includes("assault");
  if (isVAWC) {
    // Check if public advisory is broadcasting sensitive resident details
    if (advisory.includes("specific address") || advisory.includes("victim") || advisory.includes("resident name")) {
      violations.push({
        code: "VAWC_PRIVACY_BREACH",
        severity: "critical",
        field: `hotspot[${hotspot.rank}].suggestedPublicAdvisory`,
        message: "Public advisory for domestic/VAWC case must not mention specific resident or victim identifiers.",
      });
    }
  }

  return violations;
}

/**
 * Verify citations against actual retrieved knowledge & rules
 * @param {Object} summary Normalized AI summary
 * @param {Object} aiContext Retrieved knowledge and rules bundle
 * @return {Object} Citation report with verified count & hallucination warnings
 */
function verifyCitations(summary, aiContext = {}) {
  const violations = [];
  const knowledgeList = Array.isArray(aiContext.knowledge) ? aiContext.knowledge : [];
  const rulesList = Array.isArray(aiContext.triggeredRules) ? aiContext.triggeredRules : [];

  const validKnowledgeTitles = new Set(knowledgeList.map((k) => (k.title || "").toLowerCase()));
  const validKnowledgeRefs = new Set(knowledgeList.map((k) => (k.referenceNumber || "").toLowerCase()).filter(Boolean));
  const validRuleNames = new Set(rulesList.map((r) => (r.ruleName || "").toLowerCase()));

  let totalCitedKnowledge = 0;
  let verifiedKnowledgeCount = 0;
  let totalMatchedRules = 0;
  let verifiedRulesCount = 0;

  const hotspots = Array.isArray(summary.priorityHotspots) ? summary.priorityHotspots : [];

  hotspots.forEach((h) => {
    const citedKnowledge = Array.isArray(h.citedKnowledge) ? h.citedKnowledge : [];
    const matchedGuidance = Array.isArray(h.matchedGuidance) ? h.matchedGuidance : [];

    citedKnowledge.forEach((cite) => {
      totalCitedKnowledge++;
      const lower = cite.toLowerCase();
      const isKnown = Array.from(validKnowledgeTitles).some((t) => lower.includes(t)) ||
        Array.from(validKnowledgeRefs).some((ref) => lower.includes(ref));

      if (isKnown || knowledgeList.length === 0) {
        verifiedKnowledgeCount++;
      } else {
        violations.push({
          code: "UNVERIFIED_KNOWLEDGE_CITATION",
          severity: "warning",
          field: `hotspot[${h.rank}].citedKnowledge`,
          message: `Cited ordinance/policy "${cite}" could not be reconciled with registered knowledge base entries.`,
        });
      }
    });

    matchedGuidance.forEach((rule) => {
      totalMatchedRules++;
      const lower = rule.toLowerCase();
      const isKnown = Array.from(validRuleNames).some((r) => lower.includes(r));

      if (isKnown || rulesList.length === 0) {
        verifiedRulesCount++;
      } else {
        violations.push({
          code: "UNVERIFIED_RULE_CITATION",
          severity: "warning",
          field: `hotspot[${h.rank}].matchedGuidance`,
          message: `Matched rule guidance "${rule}" could not be reconciled with active operational rules.`,
        });
      }
    });
  });

  const knowledgeGroundingRate = totalCitedKnowledge > 0 ?
    verifiedKnowledgeCount / totalCitedKnowledge :
    1.0;

  const ruleGroundingRate = totalMatchedRules > 0 ?
    verifiedRulesCount / totalMatchedRules :
    1.0;

  const overallGroundingRate = Number(((knowledgeGroundingRate + ruleGroundingRate) / 2).toFixed(2));

  return {
    violations,
    stats: {
      totalCitedKnowledge,
      verifiedKnowledgeCount,
      totalMatchedRules,
      verifiedRulesCount,
      groundingScore: overallGroundingRate,
    },
  };
}

/**
 * Main Guardrails Verifier Function
 * Evaluates full AI summary against all deterministic safety & grounding checks
 *
 * @param {Object} summary Normalized AI Summary object
 * @param {Object} analyticsPayload Original evidence payload
 * @param {Object} aiContext Retrieved knowledge and rules bundle
 * @return {Object} Guardrail verification report
 */
function verifyAIGuardrails(summary, analyticsPayload = {}, aiContext = {}) {
  if (!summary || typeof summary !== "object") {
    return {
      passed: false,
      safetyScore: 0,
      criticalViolationCount: 1,
      warningCount: 0,
      violations: [
        {
          code: "EMPTY_SUMMARY",
          severity: "critical",
          field: "root",
          message: "Summary is empty or invalid.",
        },
      ],
      groundingScore: 0,
      verifiedAt: new Date().toISOString(),
    };
  }

  const violations = [];

  // 1. Scan Top-Level Fields for PII & Prohibited Language
  violations.push(...scanForPII(summary.headline, "headline"));
  violations.push(...scanForPII(summary.executiveSummary, "executiveSummary"));
  violations.push(...scanForPII(summary.groundingSummary, "groundingSummary"));

  violations.push(...scanForProhibitedLanguage(summary.headline, "headline"));
  violations.push(...scanForProhibitedLanguage(summary.executiveSummary, "executiveSummary"));

  // 2. Scan Hotspot Items
  const hotspots = Array.isArray(summary.priorityHotspots) ? summary.priorityHotspots : [];
  hotspots.forEach((h) => {
    const locPrefix = `hotspot[${h.rank}]`;
    violations.push(...scanForPII(h.locationLabel, `${locPrefix}.locationLabel`));
    violations.push(...scanForPII(h.mainPattern, `${locPrefix}.mainPattern`));
    violations.push(...scanForPII(h.suggestedPublicAdvisory, `${locPrefix}.suggestedPublicAdvisory`));

    violations.push(...scanForProhibitedLanguage(h.mainPattern, `${locPrefix}.mainPattern`));
    violations.push(...scanForProhibitedLanguage(h.suggestedPublicAdvisory, `${locPrefix}.suggestedPublicAdvisory`));

    violations.push(...verifyVAWCCompliance(h));

    if (Array.isArray(h.recommendedActions)) {
      h.recommendedActions.forEach((action, actIndex) => {
        const actPrefix = `${locPrefix}.action[${actIndex + 1}]`;
        violations.push(...scanForPII(action.action, `${actPrefix}.action`));
        violations.push(...scanForPII(action.reason, `${actPrefix}.reason`));
        violations.push(...scanForProhibitedLanguage(action.action, `${actPrefix}.action`));
        violations.push(...scanForProhibitedLanguage(action.reason, `${actPrefix}.reason`));
      });
    }
  });

  // 3. Verify Citations & Grounding Reconciliation
  const citationReport = verifyCitations(summary, aiContext);
  violations.push(...citationReport.violations);

  // 4. Compute Metrics & Final Pass/Fail Status
  const criticalCount = violations.filter((v) => v.severity === "critical").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;

  const passed = criticalCount === 0;
  // Safety score: 1.0 down to 0.0 with deductions for critical (0.5 each) and warning (0.1 each)
  const deduction = (criticalCount * 0.5) + (warningCount * 0.1);
  const safetyScore = Number(Math.max(0, 1.0 - deduction).toFixed(2));

  return {
    passed,
    safetyScore,
    criticalViolationCount: criticalCount,
    warningCount,
    groundingScore: citationReport.stats.groundingScore,
    citationStats: citationReport.stats,
    violations,
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = {
  scanForPII,
  scanForProhibitedLanguage,
  verifyVAWCCompliance,
  verifyCitations,
  verifyAIGuardrails,
};
