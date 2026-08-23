/**
 * Generate Admin AI Suggestion Summary
 *
 * Callable Cloud Function that builds an aggregated, privacy-safe analytics
 * payload from incident data, retrieves published knowledge and active operational rules
 * from Firestore, asks Gemini for a structured recommendation summary grounded in evidence,
 * verifies output against deterministic safety guardrails, and stores the draft for audit.
 *
 * Phase 5 & 6 Implementation: Context Grounding, Prompt Redesign, and Safety Guardrails.
 */

const crypto = require("crypto");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {retrieveAIContext} = require("./retrieveAIContext");
const {verifyAIGuardrails} = require("./verifyAIGuardrails");

/* eslint-disable require-jsdoc */

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";
const MAX_INCIDENTS = 500;
const MAX_HOTSPOTS = 6;
const VISIBLE_STATUSES = new Set([
  "pending",
  "under_review",
  "verified",
  "responding",
  "done",
  "submitted",
  "open",
]);
const ADMIN_ROLES = new Set([
  "admin",
  "moderator",
  "barangay",
  "barangay_admin",
  "barangay admin",
  "police",
  "police_admin",
  "police admin",
]);

const AI_SUMMARY_SCHEMA = {
  type: "object",
  required: [
    "headline",
    "overallRisk",
    "executiveSummary",
    "priorityHotspots",
    "dataWarnings",
    "nextDataToCollect",
  ],
  properties: {
    headline: {
      type: "string",
      description: "One short headline summarizing the hotspot situation.",
    },
    overallRisk: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    executiveSummary: {
      type: "string",
      description: "Brief admin-facing summary of the reported pattern.",
    },
    groundingSummary: {
      type: "string",
      description: "Brief note summarizing how official ordinances and operational guidance were incorporated.",
    },
    priorityHotspots: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        required: [
          "rank",
          "locationLabel",
          "street",
          "barangay",
          "riskLevel",
          "mainPattern",
          "evidence",
          "recommendedActions",
          "suggestedPublicAdvisory",
          "confidence",
        ],
        properties: {
          rank: {type: "integer"},
          locationLabel: {type: "string"},
          street: {type: "string"},
          barangay: {type: "string"},
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          mainPattern: {type: "string"},
          evidence: {
            type: "array",
            maxItems: 5,
            items: {type: "string"},
          },
          citedKnowledge: {
            type: "array",
            maxItems: 5,
            items: {type: "string"},
            description: "Official ordinances, policies, or reference numbers applicable to this hotspot.",
          },
          matchedGuidance: {
            type: "array",
            maxItems: 5,
            items: {type: "string"},
            description: "Admin operational rules or guidance applied to this hotspot.",
          },
          recommendedActions: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              required: ["action", "owner", "urgency", "reason"],
              properties: {
                action: {type: "string"},
                owner: {
                  type: "string",
                  enum: [
                    "admin",
                    "police",
                    "barangay",
                    "community",
                    "system",
                  ],
                },
                urgency: {
                  type: "string",
                  enum: ["today", "this_week", "monitor"],
                },
                reason: {type: "string"},
              },
            },
          },
          suggestedPublicAdvisory: {type: "string"},
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
      },
    },
    dataWarnings: {
      type: "array",
      maxItems: 5,
      items: {type: "string"},
    },
    nextDataToCollect: {
      type: "array",
      maxItems: 5,
      items: {type: "string"},
    },
  },
};

const generateAdminAISummaryFunction = onCall(
    {
      cors: true,
      secrets: [GEMINI_API_KEY],
      timeoutSeconds: 60,
      memory: "512MiB",
    },
    async (request) => {
      const uid = request.auth && request.auth.uid;
      if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in required.");
      }

      const db = admin.firestore();
      await assertAdminAccess(db, uid);

      const filters = normalizeFilters(request.data || {});
      const incidents = await loadIncidentRows(db, filters);
      const precincts = await loadPrecincts(db);
      const analyticsPayload = buildAnalyticsPayload(
          incidents,
          precincts,
          filters,
      );

      // Phase 4: Retrieve knowledge base & operational rules
      const aiContext = await retrieveAIContext(db, analyticsPayload);

      if (!analyticsPayload.overallStats.totalIncidents) {
        const summary = buildNoDataSummary(filters, aiContext);
        const verification = verifyAIGuardrails(summary, analyticsPayload, aiContext);
        const saved = await saveSummary(db, {
          uid,
          filters,
          analyticsPayload,
          aiContext,
          summary,
          verification,
          usage: null,
          source: "system_no_data",
        });
        return {
          id: saved.id,
          provider: "system",
          model: "no_data",
          source: "system_no_data",
          analytics: analyticsPayload,
          aiContext: aiContext.metadata,
          verification,
          summary,
        };
      }

      let summary;
      let usage = null;
      let source = "gemini";
      let model = GEMINI_MODEL;
      let provider = "gemini";

      const apiKey = GEMINI_API_KEY.value();
      if (apiKey) {
        try {
          const geminiResult = await callGemini(apiKey, analyticsPayload, aiContext);
          summary = normalizeSummary(geminiResult.summary, analyticsPayload, aiContext);
          usage = geminiResult.usage;
        } catch (geminiError) {
          console.warn("[generateAdminAISummary] Gemini call failed, engaging deterministic fallback:", geminiError.message);
          summary = buildDeterministicFallbackSummary(analyticsPayload, aiContext, filters);
          source = "deterministic_fallback";
          model = "rule_engine_v1";
          provider = "rules_engine";
        }
      } else {
        console.warn("[generateAdminAISummary] No GEMINI_API_KEY secret configured, using deterministic fallback engine.");
        summary = buildDeterministicFallbackSummary(analyticsPayload, aiContext, filters);
        source = "deterministic_fallback";
        model = "rule_engine_v1";
        provider = "rules_engine";
      }

      // Phase 6: Run deterministic Safety & Verification Guardrails
      const verification = verifyAIGuardrails(summary, analyticsPayload, aiContext);

      const saved = await saveSummary(db, {
        uid,
        filters,
        analyticsPayload,
        aiContext,
        summary,
        verification,
        usage,
        source,
      });

      return {
        id: saved.id,
        provider,
        model,
        source,
        usage,
        analytics: analyticsPayload,
        aiContext: aiContext.metadata,
        verification,
        summary,
      };
    },
);


async function assertAdminAccess(db, uid) {
  const snap = await db.collection("users").doc(uid).get();
  const role = normalizeRole(snap.data() && snap.data().role);
  if (!ADMIN_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

function normalizeRole(role) {
  return String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
}

function normalizeFilters(data) {
  const range = ["7d", "30d", "90d", "all"].includes(data.range) ?
    data.range :
    "30d";
  const days = range === "7d" ? 7 : range === "90d" ? 90 :
    range === "all" ? null : 30;
  const endDate = new Date();
  const startDate = days ?
    new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000) :
    null;

  return {
    range,
    days,
    startDate,
    endDate,
    barangay: normalizeText(data.barangay || "", 60),
    crimeType: normalizeText(data.crimeType || "", 60),
  };
}

async function loadIncidentRows(db, filters) {
  let query = db.collection("incidents");
  if (filters.startDate) {
    query = query.where("createdAt", ">=", filters.startDate);
  }

  const snapshot = await query.limit(MAX_INCIDENTS).get();
  const rows = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const status = normalizeText(data.status).toLowerCase();
    if (status && !VISIBLE_STATUSES.has(status)) return;

    const barangay = getBarangay(data);
    if (filters.barangay && barangay.toLowerCase() !== filters.barangay.toLowerCase()) {
      return;
    }

    const type = normalizeText(data.type || data.crimeType || "other").toLowerCase();
    if (filters.crimeType && type !== filters.crimeType.toLowerCase()) {
      return;
    }

    const date = parseTimestamp(data.createdAt);
    rows.push({
      id: docSnap.id,
      date,
      data,
    });
  });

  return rows;
}

async function loadPrecincts(db) {
  try {
    const snapshot = await db.collection("police_precincts").get();
    const precincts = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (
        Number.isFinite(Number(data.latitude)) &&
        Number.isFinite(Number(data.longitude))
      ) {
        precincts.push({
          id: docSnap.id,
          name: normalizeText(data.name || data.stationName || "Precinct", 60),
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
        });
      }
    });
    return precincts;
  } catch (error) {
    console.warn("[generateAdminAISummary] Could not load precincts", error);
    return [];
  }
}

function buildAnalyticsPayload(incidents, precincts, filters) {
  const overallStats = {
    totalIncidents: incidents.length,
    highSeverity: 0,
    mediumSeverity: 0,
    lowSeverity: 0,
    openIncidents: 0,
    sosReports: 0,
    withCoordinates: 0,
  };

  const typeCounts = {};
  const hourCounts = new Array(24).fill(0);
  const barangayCounts = {};

  incidents.forEach((row) => {
    const d = row.data;
    const severity = normalizeSeverity(d.severity);
    if (severity === "high") overallStats.highSeverity += 1;
    else if (severity === "medium") overallStats.mediumSeverity += 1;
    else overallStats.lowSeverity += 1;

    const status = normalizeText(d.status).toLowerCase();
    if (status !== "done" && status !== "resolved") {
      overallStats.openIncidents += 1;
    }

    if (d.isSOSReport === true) overallStats.sosReports += 1;

    if (hasCoordinates(d.location)) overallStats.withCoordinates += 1;

    const type = normalizeText(d.type || d.crimeType || "other").toLowerCase();
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    const brgy = getBarangay(d);
    if (brgy) barangayCounts[brgy] = (barangayCounts[brgy] || 0) + 1;

    const hour = getPhtHour(row.date);
    if (hour != null) hourCounts[hour] += 1;
  });

  const hotspots = clusterHotspots(incidents, precincts, filters);

  return {
    timeRange: {
      label: filters.range,
      start: filters.startDate ? filters.startDate.toISOString() : null,
      end: filters.endDate.toISOString(),
    },
    overallStats,
    topCrimeTypes: sortObjectByValue(typeCounts),
    peakHours: formatPeakHours(hourCounts, incidents.length),
    barangayDistribution: sortObjectByValue(barangayCounts),
    hotspots,
    priorityHotspots: hotspots,
  };
}

function clusterHotspots(incidents, precincts, filters) {
  const grouped = new Map();
  const midpoint = filters.startDate ?
    filters.startDate.getTime() +
      (filters.endDate.getTime() - filters.startDate.getTime()) / 2 :
    null;

  incidents.forEach((row) => {
    const street = getStreet(row.data);
    const barangay = getBarangay(row.data);
    const gridKey = getGridKey(row.data.location);
    const key = `${barangay}__${street || gridKey || "general"}`.toLowerCase();

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: buildLocationLabel(street, barangay, gridKey),
        street,
        barangay,
        center: row.data.location || {},
        reportCount: 0,
        weightedScore: 0,
        severityBreakdown: {high: 0, medium: 0, low: 0},
        typeBreakdown: {},
        hourCounts: new Array(24).fill(0),
        sosReports: 0,
        previousPeriodCount: 0,
        recentPeriodCount: 0,
      });
    }

    const hotspot = grouped.get(key);
    const severity = normalizeSeverity(row.data.severity);
    const type = normalizeText(row.data.type || row.data.crimeType || "other").toLowerCase();
    const hour = getPhtHour(row.date);

    hotspot.reportCount += 1;
    hotspot.severityBreakdown[severity] += 1;
    hotspot.typeBreakdown[type] = (hotspot.typeBreakdown[type] || 0) + 1;
    hotspot.weightedScore += severity === "high" ? 3 :
      severity === "medium" ? 2 : 1;
    if (row.data.isSOSReport === true) {
      hotspot.sosReports += 1;
      hotspot.weightedScore += 3;
    }
    if (hour != null) hotspot.hourCounts[hour] += 1;
    if (midpoint && row.date && row.date.getTime() >= midpoint) {
      hotspot.recentPeriodCount += 1;
    } else if (midpoint && row.date) {
      hotspot.previousPeriodCount += 1;
    }
  });

  return Array.from(grouped.values())
      .map((hotspot) => enrichHotspot(hotspot, precincts))
      .sort((a, b) => {
        const scoreDiff = b.weightedScore - a.weightedScore;
        if (scoreDiff) return scoreDiff;
        return b.reportCount - a.reportCount;
      })
      .slice(0, MAX_HOTSPOTS)
      .map((hotspot, index) => ({
        rank: index + 1,
        locationLabel: hotspot.label,
        ...hotspot,
      }));
}

function enrichHotspot(hotspot, precincts) {
  return {
    label: hotspot.label,
    street: hotspot.street,
    barangay: hotspot.barangay,
    center: hotspot.center,
    reportCount: hotspot.reportCount,
    weightedScore: hotspot.weightedScore,
    severityBreakdown: hotspot.severityBreakdown,
    typeBreakdown: sortObjectByValue(hotspot.typeBreakdown),
    peakHours: formatPeakHours(hotspot.hourCounts, hotspot.reportCount),
    recentTrend: getRecentTrend(
        hotspot.previousPeriodCount,
        hotspot.recentPeriodCount,
    ),
    sosReports: hotspot.sosReports,
    nearestPrecinct: findNearestPrecinct(hotspot.center, precincts),
  };
}

async function callGemini(apiKey, analyticsPayload, aiContext) {
  const prompt = buildGeminiPrompt(analyticsPayload, aiContext);
  const body = {
    contents: [
      {
        parts: [{text: prompt}],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 3000,
      responseMimeType: "application/json",
      responseJsonSchema: AI_SUMMARY_SCHEMA,
    },
  };

  const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      },
  );

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json && json.error && json.error.message ?
      json.error.message :
      `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${detail}`);
  }

  const text = extractGeminiText(json);
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    summary: JSON.parse(stripJson(text)),
    usage: normalizeGeminiUsage(json.usageMetadata),
  };
}

function buildGeminiPrompt(analyticsPayload, aiContext = {}) {
  const knowledge = Array.isArray(aiContext.knowledge) ? aiContext.knowledge : [];
  const rules = Array.isArray(aiContext.triggeredRules) ? aiContext.triggeredRules : [];

  const knowledgeSection = knowledge.length > 0 ?
    knowledge.map((k, i) =>
      `${i + 1}. [${k.type.toUpperCase()}] "${k.title}" (${k.source}${k.referenceNumber ? ` | Ref: ${k.referenceNumber}` : ""})\n` +
      `   Directives: ${k.content}`).join("\n\n") :
    "No official knowledge base documents currently registered.";

  const rulesSection = rules.length > 0 ?
    rules.map((r, i) =>
      `${i + 1}. [${r.priority.toUpperCase()}] "${r.ruleName}" (Applies to: ${r.appliesTo})\n` +
      `   Guidance: ${r.guidance}${r.additionalContext ? `\n   Context: ${r.additionalContext}` : ""}\n` +
      `   Trigger: ${r.reason}`).join("\n\n") :
    "No specific operational guidance triggered for these hotspots.";

  return [
    "You are an expert public safety decision-support AI for Valenzuela City's ThreatTrack system.",
    "",
    "TASK:",
    "Analyze the provided incident evidence and synthesize actionable, non-alarmist public safety recommendations",
    "grounded strictly in the provided official policies/ordinances and administrative operational rules.",
    "",
    "CORE GROUNDING RULES:",
    "1. FACTUAL GROUNDING: Anchor every claim strictly in the supplied analytics numbers, peak times, and crime types.",
    "2. POLICY CITATION: Reference relevant official ordinances or policies in 'citedKnowledge' using title/ref.",
    "3. OPERATIONAL GUIDANCE: Incorporate triggered administrative rules into 'matchedGuidance' and 'recommendedActions'.",
    "4. SENSITIVITY: For domestic dispute or VAWC incidents, ensure privacy, victim safety, and Barangay VAWC referral.",
    "5. OBJECTIVITY: Avoid alarmist language. If data is thin, recommend monitoring and continued data collection.",
    "6. FORMAT: Output MUST strictly adhere to the provided JSON schema.",

    "",
    "=== SECTION 1: AGGREGATED INCIDENT EVIDENCE ===",
    JSON.stringify(analyticsPayload, null, 2),
    "",
    "=== SECTION 2: OFFICIAL POLICIES & ORDINANCES (Knowledge Base) ===",
    knowledgeSection,
    "",
    "=== SECTION 3: ADMINISTRATIVE OPERATIONAL GUIDANCE & RULES ===",
    rulesSection,
  ].join("\n");
}

async function saveSummary(db, data) {
  const inputStatsHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(data.analyticsPayload))
      .digest("hex");
  const usage = data.usage || {};
  const estimatedCostUsd = estimateGeminiFlashCost(usage);
  const aiContext = data.aiContext || {};
  const verification = data.verification || {passed: true, safetyScore: 1.0};

  const initialStatus = verification.passed ? "draft" : "flagged_safety";

  const ref = await db.collection("ai_suggestion_summaries").add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: data.uid,
    provider: data.source === "gemini" ? "gemini" : "system",
    model: data.source === "gemini" ? GEMINI_MODEL : "no_data",
    source: data.source,
    timeRange: data.filters.range,
    filters: {
      range: data.filters.range,
      days: data.filters.days,
    },
    inputStatsHash,
    hotspotCount: data.analyticsPayload.hotspots.length,
    inputStats: {
      totalIncidents: data.analyticsPayload.overallStats.totalIncidents,
      openIncidents: data.analyticsPayload.overallStats.openIncidents,
      withCoordinates: data.analyticsPayload.overallStats.withCoordinates,
    },
    aiContextMetadata: aiContext.metadata || {
      knowledgeCount: (aiContext.knowledge || []).length,
      rulesTriggeredCount: (aiContext.triggeredRules || []).length,
    },
    verification: {
      passed: verification.passed,
      safetyScore: verification.safetyScore,
      groundingScore: verification.groundingScore,
      criticalViolationCount: verification.criticalViolationCount || 0,
      warningCount: verification.warningCount || 0,
      violations: verification.violations || [],
      verifiedAt: verification.verifiedAt || new Date().toISOString(),
    },
    summary: data.summary,
    usage: {
      ...usage,
      estimatedCostUsd,
    },
    review: {
      status: initialStatus,
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: verification.passed ? "" : "Automatically flagged for admin safety review.",
    },
  });

  return {id: ref.id};
}

function normalizeSummary(value, analyticsPayload, aiContext = {}) {
  const summary = value && typeof value === "object" ? value : {};
  const hotspots = Array.isArray(summary.priorityHotspots) ?
    summary.priorityHotspots :
    [];

  return {
    headline: normalizeText(
        summary.headline ||
          "AI recommendation summary for selected incident analytics",
        160,
    ),
    overallRisk: normalizeRisk(summary.overallRisk),
    executiveSummary: normalizeText(summary.executiveSummary, 900),
    groundingSummary: normalizeText(
        summary.groundingSummary ||
          "Grounded in verified incident evidence, city ordinances, and operational directives.",
        300,
    ),
    priorityHotspots: hotspots
        .slice(0, 5)
        .map((hotspot, index) => normalizeHotspotSummary(hotspot, index)),
    dataWarnings: normalizeStringArray(summary.dataWarnings, 5, 220),
    nextDataToCollect: normalizeStringArray(
        summary.nextDataToCollect,
        5,
        220,
    ),
    basedOn: {
      totalIncidents: analyticsPayload.overallStats.totalIncidents,
      hotspotCount: analyticsPayload.hotspots.length,
      timeRange: analyticsPayload.timeRange.label,
      knowledgeEntriesCited: (aiContext.knowledge || []).length,
      rulesEvaluated: aiContext.metadata?.rulesTriggeredCount || 0,
    },
  };
}

function normalizeHotspotSummary(hotspot, index) {
  const value = hotspot && typeof hotspot === "object" ? hotspot : {};
  const actions = Array.isArray(value.recommendedActions) ?
    value.recommendedActions :
    [];

  return {
    rank: Number.isFinite(Number(value.rank)) ? Number(value.rank) : index + 1,
    locationLabel: normalizeText(value.locationLabel, 140),
    street: normalizeText(value.street, 90),
    barangay: normalizeText(value.barangay, 90),
    riskLevel: normalizeRisk(value.riskLevel),
    mainPattern: normalizeText(value.mainPattern, 500),
    evidence: normalizeStringArray(value.evidence, 5, 180),
    citedKnowledge: normalizeStringArray(value.citedKnowledge, 5, 200),
    matchedGuidance: normalizeStringArray(value.matchedGuidance, 5, 200),
    recommendedActions: actions
        .slice(0, 6)
        .map((action) => normalizeActionSummary(action)),
    suggestedPublicAdvisory: normalizeText(value.suggestedPublicAdvisory, 400),
    confidence: clampNumber(value.confidence, 0, 1, 0.5),
  };
}

function normalizeActionSummary(action) {
  const value = action && typeof action === "object" ? action : {};
  return {
    action: normalizeText(value.action, 180),
    owner: normalizeOwner(value.owner),
    urgency: normalizeUrgency(value.urgency),
    reason: normalizeText(value.reason, 300),
  };
}

function buildNoDataSummary(filters, aiContext = {}) {
  return {
    headline: "No incident pattern available for this range",
    overallRisk: "low",
    executiveSummary:
      [
        "There are no visible incident records in the selected range,",
        "so no hotspot-specific AI recommendation is needed yet.",
      ].join(" "),
    groundingSummary: "No incident data to evaluate against operational rules.",
    priorityHotspots: [],
    dataWarnings: [
      "The selected range has no visible incident records.",
    ],
    nextDataToCollect: [
      "Continue collecting reports with complete type, severity, time, and location fields.",
    ],
    basedOn: {
      totalIncidents: 0,
      hotspotCount: 0,
      timeRange: filters.range,
      knowledgeEntriesCited: (aiContext.knowledge || []).length,
      rulesEvaluated: 0,
    },
  };
}

function normalizeGeminiUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    promptTokens: Number(usage.promptTokenCount) || 0,
    candidatesTokens: Number(usage.candidatesTokenCount) || 0,
    totalTokens: Number(usage.totalTokenCount) || 0,
  };
}

function estimateGeminiFlashCost(usage) {
  if (!usage) return 0;
  const prompt = Number(usage.promptTokens) || 0;
  const output = Number(usage.candidatesTokens) || 0;
  const cost = prompt * (0.075 / 1000000) + output * (0.3 / 1000000);
  return Number(cost.toFixed(6));
}

function extractGeminiText(json) {
  const candidate = json &&
    Array.isArray(json.candidates) &&
    json.candidates[0];
  const parts = candidate &&
    candidate.content &&
    Array.isArray(candidate.content.parts) &&
    candidate.content.parts;
  return parts && parts[0] && typeof parts[0].text === "string" ?
    parts[0].text :
    null;
}

function stripJson(raw) {
  return String(raw || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value.toDate && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function hasCoordinates(location) {
  return Number.isFinite(Number(location && location.latitude)) &&
    Number.isFinite(Number(location && location.longitude));
}

function getGridKey(location) {
  if (!hasCoordinates(location)) return "";
  return `${Number(location.latitude).toFixed(3)}_${Number(location.longitude).toFixed(3)}`;
}

function getStreet(data) {
  const location = data.location || {};
  return normalizeText(
      location.street ||
        data.street ||
        extractStreetFromAddress(location.address || data.address),
      90,
  );
}

function getBarangay(data) {
  const location = data.location || {};
  return normalizeText(
      location.barangay ||
        data.barangay ||
        location.area ||
        data.area ||
        data.district,
      90,
  );
}

function extractStreetFromAddress(address) {
  const value = normalizeText(address, 160);
  if (!value) return "";
  const beforeCity = value.split(/valenzuela/i)[0] || value;
  const parts = beforeCity
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  return parts[0] || "";
}

function buildLocationLabel(street, barangay, gridKey) {
  const parts = [street, barangay].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return gridKey ? `Hotspot ${gridKey}` : "Unknown hotspot";
}

function normalizeSeverity(value) {
  const severity = normalizeText(value).toLowerCase();
  if (severity === "high" || severity === "medium" || severity === "low") {
    return severity;
  }
  return "low";
}

function normalizeRisk(value) {
  const risk = normalizeText(value).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(risk)) return risk;
  return "medium";
}

function normalizeOwner(value) {
  const owner = normalizeText(value).toLowerCase();
  if (["admin", "police", "barangay", "community", "system"].includes(owner)) {
    return owner;
  }
  return "admin";
}

function normalizeUrgency(value) {
  const urgency = normalizeText(value).toLowerCase();
  if (["today", "this_week", "monitor"].includes(urgency)) return urgency;
  return "monitor";
}

function normalizeText(value, maxLength = 120) {
  return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
}

function normalizeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
      .slice(0, maxItems)
      .map((item) => normalizeText(item, maxLength))
      .filter(Boolean);
}

function sortObjectByValue(obj) {
  return Object.fromEntries(
      Object.entries(obj || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12),
  );
}

function getPhtHour(date) {
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour % 24 : null;
}

function formatPeakHours(hourCounts, totalReports) {
  const max = Math.max(...hourCounts);
  if (max <= 0 || (max === 1 && totalReports < 5)) return [];
  return hourCounts
      .map((count, hour) => ({count, hour}))
      .filter((item) => item.count === max)
      .slice(0, 4)
      .map((item) => hourLabel(item.hour));
}

function hourLabel(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: true,
  }).format(date);
}

function getRecentTrend(previous, recent) {
  if (!previous && !recent) return "no_data";
  if (recent >= previous * 1.25 && recent >= 2) return "increasing";
  if (previous >= recent * 1.25 && previous >= 2) return "decreasing";
  return "stable";
}

function findNearestPrecinct(center, precincts) {
  if (!hasCoordinates(center) || !precincts.length) return "";
  let best = null;
  precincts.forEach((precinct) => {
    const distance = haversineKm(
        Number(center.latitude),
        Number(center.longitude),
        precinct.latitude,
        precinct.longitude,
    );
    if (!best || distance < best.distance) {
      best = {...precinct, distance};
    }
  });
  return best ? `${best.name} (${best.distance.toFixed(1)} km)` : "";
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function buildDeterministicFallbackSummary(analyticsPayload, aiContext = {}, filters = {}) {
  const hotspots = analyticsPayload.hotspots || [];
  const topTypes = Object.keys(analyticsPayload.topCrimeTypes || {});
  const dominantCrime = topTypes[0] || "incident";
  const dominantCrimeLabel = dominantCrime.replace(/_/g, " ");

  const totalIncidents = analyticsPayload.overallStats?.totalIncidents || 0;
  const highSeverity = analyticsPayload.overallStats?.highSeverity || 0;
  const peakHours = analyticsPayload.peakHours || [];

  const headline = `Operational rule guidance for ${totalIncidents} reported ${dominantCrimeLabel} incidents`;
  const overallRisk = highSeverity >= 5 || (analyticsPayload.overallStats?.sosReports || 0) > 0 ? "high" :
    highSeverity >= 2 ? "medium" : "low";

  const executiveSummary = [
    `Analysis of ${totalIncidents} incident records across Valenzuela City indicates elevated ${dominantCrimeLabel} activity,`,
    `with ${highSeverity} high-severity cases reported.`,
    peakHours.length > 0 ? `Peak reporting hours are concentrated around ${peakHours.join(", ")}.` : "",
    "Recommended operational actions are synthesized directly from active administrative guidelines and municipal policies.",
  ].filter(Boolean).join(" ");

  const groundingSummary =
    "Synthesized using ThreatTrack Deterministic Rule Engine based on active ordinances and directives (Fallback Mode).";

  const priorityHotspots = hotspots.slice(0, 5).map((hotspot, idx) => {
    const hotspotRules = (aiContext.rulesByHotspot && aiContext.rulesByHotspot[hotspot.key]) ||
      (aiContext.triggeredRules || []).slice(0, 2);

    const matchedGuidance = hotspotRules.map((r) => `${r.ruleName}: ${r.guidance}`);
    const citedKnowledge = (aiContext.knowledge || [])
        .slice(0, 2)
        .map((k) => `${k.referenceNumber ? `${k.referenceNumber}: ` : ""}${k.title}`);

    const recommendedActions = hotspotRules.length > 0 ?
      hotspotRules.map((r) => ({
        action: r.guidance,
        owner: r.priority === "critical" ? "police" : "barangay",
        urgency: r.priority === "critical" ? "today" : "this_week",
        reason: r.reason || `Correlates with ${hotspot.reportCount} reports in ${hotspot.locationLabel}`,
      })) :
      [
        {
          action: "Deploy routine high-visibility foot and mobile patrols during peak hours.",
          owner: "police",
          urgency: "today",
          reason: `Address cluster of ${hotspot.reportCount} reports recorded in ${hotspot.locationLabel}.`,
        },
        {
          action: "Coordinate with Barangay Peacekeeping Action Team (BPAT) for area monitoring.",
          owner: "barangay",
          urgency: "this_week",
          reason: "Enhance community presence and deter opportunist offences.",
        },
      ];

    const suggestedPublicAdvisory =
      `Residents and commuters around ${hotspot.locationLabel} are advised to remain vigilant ` +
      `during peak evening transit hours and report any suspicious activity to local authorities.`;


    return {
      rank: idx + 1,
      locationLabel: hotspot.locationLabel || "Valenzuela Hotspot",
      street: hotspot.street || "",
      barangay: hotspot.barangay || "",
      riskLevel: hotspot.severityBreakdown?.high >= 2 ? "high" : "medium",
      mainPattern: `${hotspot.reportCount} reported incidents with focus on ${dominantCrimeLabel}.`,
      evidence: [
        `${hotspot.reportCount} incident reports in selected period`,
        `${hotspot.severityBreakdown?.high || 0} high-severity cases`,
        hotspot.peakHours && hotspot.peakHours.length ? `Peak time: ${hotspot.peakHours.join(", ")}` : "Dispersed reporting hours",
      ],
      citedKnowledge: citedKnowledge.slice(0, 3),
      matchedGuidance: matchedGuidance.slice(0, 3),
      recommendedActions: recommendedActions.slice(0, 4),
      suggestedPublicAdvisory,
      confidence: 0.85,
    };
  });

  return {
    headline,
    overallRisk,
    executiveSummary,
    groundingSummary,
    priorityHotspots,
    dataWarnings: [
      "Generated via deterministic operational rule engine (AI network fallback mode).",
    ],
    nextDataToCollect: [
      "Continue logging verified incident coordinates and peak time details.",
    ],
    basedOn: {
      totalIncidents,
      hotspotCount: hotspots.length,
      timeRange: filters.range || "30d",
      knowledgeEntriesCited: (aiContext.knowledge || []).length,
      rulesEvaluated: aiContext.metadata?.rulesTriggeredCount || 0,
    },
  };
}

// Module Exports (including pure helpers for unit testing)
module.exports = {
  generateAdminAISummary: generateAdminAISummaryFunction,
  AI_SUMMARY_SCHEMA,
  buildGeminiPrompt,
  normalizeSummary,
  buildDeterministicFallbackSummary,
  buildAnalyticsPayload,
  clusterHotspots,
};

