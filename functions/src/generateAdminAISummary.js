/**
 * Generate Admin AI Suggestion Summary
 *
 * Callable Cloud Function that builds an aggregated, privacy-safe analytics
 * payload from incident data, asks Gemini for a structured recommendation
 * summary, and stores the generated draft for audit.
 */

const crypto = require("crypto");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");

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

module.exports = onCall(
    {
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

      if (!analyticsPayload.overallStats.totalIncidents) {
        const summary = buildNoDataSummary(filters);
        const saved = await saveSummary(db, {
          uid,
          filters,
          analyticsPayload,
          summary,
          usage: null,
          source: "system_no_data",
        });
        return {
          id: saved.id,
          provider: "system",
          model: "no_data",
          source: "system_no_data",
          analytics: analyticsPayload,
          summary,
        };
      }

      const apiKey = GEMINI_API_KEY.value();
      if (!apiKey) {
        throw new HttpsError(
            "failed-precondition",
            "GEMINI_API_KEY secret is not configured.",
        );
      }

      let geminiResult;
      try {
        geminiResult = await callGemini(apiKey, analyticsPayload);
      } catch (error) {
        console.error("[generateAdminAISummary] Gemini call failed", error);
        throw new HttpsError(
            "internal",
            "Gemini could not generate the AI summary. Check the API key, billing, and model access.",
        );
      }

      const summary = normalizeSummary(geminiResult.summary, analyticsPayload);
      const saved = await saveSummary(db, {
        uid,
        filters,
        analyticsPayload,
        summary,
        usage: geminiResult.usage,
        source: "gemini",
      });

      return {
        id: saved.id,
        provider: "gemini",
        model: GEMINI_MODEL,
        source: "gemini",
        usage: geminiResult.usage,
        analytics: analyticsPayload,
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
  };
}

async function loadIncidentRows(db, filters) {
  let ref = db.collection("incidents");
  if (filters.startDate) {
    ref = ref
        .where(
            "timestamp",
            ">=",
            admin.firestore.Timestamp.fromDate(filters.startDate),
        )
        .orderBy("timestamp", "desc");
  } else {
    ref = ref.orderBy("timestamp", "desc");
  }

  const snap = await ref.limit(MAX_INCIDENTS).get();
  return snap.docs
      .map((doc) => ({
        id: doc.id,
        data: doc.data() || {},
        date: toDate(doc.data().timestamp) ||
          toDate(doc.data().reportedAt) ||
          toDate(doc.data().clientTimestamp),
      }))
      .filter((row) => {
        const status = normalizeText(row.data.status).toLowerCase();
        return !status || VISIBLE_STATUSES.has(status);
      });
}

async function loadPrecincts(db) {
  try {
    const snap = await db.collection("precincts").limit(100).get();
    return snap.docs
        .map((doc) => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            name: normalizeText(data.name || data.code || doc.id, 90),
            latitude: Number(data.location && data.location.latitude),
            longitude: Number(data.location && data.location.longitude),
          };
        })
        .filter((p) =>
          Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
        );
  } catch (error) {
    console.warn("[generateAdminAISummary] precinct load failed", error);
    return [];
  }
}

function buildAnalyticsPayload(rows, precincts, filters) {
  const severityCounts = {high: 0, medium: 0, low: 0};
  const statusCounts = {};
  const typeCounts = {};
  let openIncidents = 0;
  let withCoordinates = 0;

  rows.forEach((row) => {
    const severity = normalizeSeverity(row.data.severity);
    const status = normalizeText(row.data.status || "unknown").toLowerCase();
    const type = normalizeText(row.data.type || "unknown").toLowerCase();
    severityCounts[severity] += 1;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    if (status === "pending" || status === "under_review") {
      openIncidents += 1;
    }
    if (hasCoordinates(row.data.location)) {
      withCoordinates += 1;
    }
  });

  const hotspots = buildHotspots(rows, precincts, filters);

  return {
    city: "Valenzuela City",
    generatedAt: new Date().toISOString(),
    timeRange: {
      label: filters.range,
      start: filters.startDate ? filters.startDate.toISOString() : null,
      end: filters.endDate.toISOString(),
      days: filters.days,
    },
    overallStats: {
      totalIncidents: rows.length,
      openIncidents,
      withCoordinates,
      severityBreakdown: severityCounts,
      statusBreakdown: sortObjectByValue(statusCounts),
      typeBreakdown: sortObjectByValue(typeCounts),
    },
    hotspots,
  };
}

function buildHotspots(rows, precincts, filters) {
  const grouped = new Map();
  const midpoint = filters.startDate ?
    filters.startDate.getTime() +
      (filters.endDate.getTime() - filters.startDate.getTime()) / 2 :
    null;

  rows.forEach((row) => {
    const location = row.data.location || {};
    const gridKey = getGridKey(location);
    const street = getStreet(row.data);
    const barangay = getBarangay(row.data);
    const key = street || barangay ?
      `${street}|${barangay}|${gridKey || "no_grid"}` :
      gridKey;
    if (!key) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        label: buildLocationLabel(street, barangay, gridKey),
        street,
        barangay,
        center: {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
        },
        reportCount: 0,
        weightedScore: 0,
        severityBreakdown: {high: 0, medium: 0, low: 0},
        typeBreakdown: {},
        hourCounts: Array.from({length: 24}, () => 0),
        previousPeriodCount: 0,
        recentPeriodCount: 0,
        sosReports: 0,
      });
    }

    const hotspot = grouped.get(key);
    const severity = normalizeSeverity(row.data.severity);
    const type = normalizeText(row.data.type || "unknown").toLowerCase();
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

async function callGemini(apiKey, analyticsPayload) {
  const prompt = buildGeminiPrompt(analyticsPayload);
  const body = {
    contents: [
      {
        parts: [{text: prompt}],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2500,
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

function buildGeminiPrompt(analyticsPayload) {
  return [
    "You are an analyst assistant for ThreatTrack, a public safety incident",
    "reporting admin dashboard for Valenzuela City.",
    "",
    "Analyze the aggregated incident analytics and generate practical,",
    "non-alarmist recommendations for admin review.",
    "",
    "Rules:",
    "- Do not claim certainty. Use cautious wording based on reported data.",
    "- Do not identify private people, reporters, victims, or suspects.",
    "- Do not recommend vigilante action.",
    "- Do not blame a community or create public panic.",
    "- Recommend actions admins, police, barangay responders, or the system can do.",
    "- If data is thin, state that and recommend monitoring.",
    "- Return only JSON matching the schema.",
    "",
    "Aggregated analytics data:",
    JSON.stringify(analyticsPayload),
  ].join("\n");
}

async function saveSummary(db, data) {
  const inputStatsHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(data.analyticsPayload))
      .digest("hex");
  const usage = data.usage || {};
  const estimatedCostUsd = estimateGeminiFlashCost(usage);

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
    summary: data.summary,
    usage: {
      ...usage,
      estimatedCostUsd,
    },
    review: {
      status: "draft",
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: "",
    },
  });

  return {id: ref.id};
}

function normalizeSummary(value, analyticsPayload) {
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

function buildNoDataSummary(filters) {
  return {
    headline: "No incident pattern available for this range",
    overallRisk: "low",
    executiveSummary:
      [
        "There are no visible incident records in the selected range,",
        "so no hotspot-specific AI recommendation is needed yet.",
      ].join(" "),
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
    },
  };
}

function normalizeGeminiUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    promptTokenCount: numberOrNull(usage.promptTokenCount),
    candidatesTokenCount: numberOrNull(usage.candidatesTokenCount),
    totalTokenCount: numberOrNull(usage.totalTokenCount),
  };
}

function estimateGeminiFlashCost(usage) {
  if (!usage) return null;
  const input = Number(usage.promptTokenCount);
  const output = Number(usage.candidatesTokenCount);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  const inputCost = (Number.isFinite(input) ? input : 0) * 0.30 / 1000000;
  const outputCost = (Number.isFinite(output) ? output : 0) * 2.50 / 1000000;
  return Number((inputCost + outputCost).toFixed(6));
}

function extractGeminiText(json) {
  const parts = json &&
    json.candidates &&
    json.candidates[0] &&
    json.candidates[0].content &&
    Array.isArray(json.candidates[0].content.parts) ?
    json.candidates[0].content.parts :
    [];
  return parts
      .map((part) => part.text || "")
      .join("")
      .trim();
}

function stripJson(text) {
  const trimmed = String(text || "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch (error) {
      return null;
    }
  }
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
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

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
