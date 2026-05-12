/**
 * Generate Analytics Solution Summary
 *
 * Admin-only endpoint that turns aggregated hotspot evidence into concise
 * recommended actions. It keeps the actual recommendation rules deterministic
 * on the client, then optionally asks OpenAI to write a clearer summary.
 */

/* eslint-disable require-jsdoc */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");

const ALLOWED_ROLES = new Set(["admin", "moderator"]);
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5";
const MAX_HOTSPOTS = 5;
const MAX_ACTIONS_PER_HOTSPOT = 6;
const openAiApiKey = defineSecret("OPENAI_API_KEY");

module.exports = onRequest({cors: true, secrets: [openAiApiKey]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
    return;
  }

  try {
    const user = await requireAdmin(req);
    const context = sanitizePayload(req.body || {});

    if (!context.hotspots.length) {
      res.status(400).json({
        success: false,
        error: "No hotspot evidence provided",
      });
      return;
    }

    const fallback = buildFallbackSummaries(context);
    const apiKey = openAiApiKey.value() || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      res.json({
        success: true,
        source: "rule_based_fallback",
        configured: false,
        summaries: fallback,
      });
      return;
    }

    try {
      const aiSummaries = await generateWithOpenAI(context, fallback, apiKey);
      res.json({
        success: true,
        source: "openai",
        configured: true,
        requestedBy: user.uid,
        summaries: mergeWithFallback(aiSummaries, fallback),
      });
    } catch (aiError) {
      console.warn("[analytics-ai] OpenAI unavailable", aiError);
      res.json({
        success: true,
        source: "rule_based_fallback",
        configured: true,
        warning: "AI summary unavailable; returned rule-based summary.",
        summaries: fallback,
      });
    }
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("[analytics-ai] summary failed", error);
    res.status(status).json({
      success: false,
      error: status === 500 ? "Could not generate AI summary" : error.message,
    });
  }
});

async function requireAdmin(req) {
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error("Missing Firebase auth token");
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    const err = new Error("Invalid Firebase auth token");
    err.statusCode = 401;
    throw err;
  }

  const snap = await admin.firestore().collection("users").doc(decoded.uid).get();
  const role = String(snap.data()?.role || "").toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    const err = new Error("Admin or moderator role required");
    err.statusCode = 403;
    throw err;
  }

  return {uid: decoded.uid, role};
}

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

function sanitizePayload(body) {
  const range = safeText(body.range || "selected range", 40);
  const generatedAt = safeText(body.generatedAt || new Date().toISOString(), 40);
  const hotspots = Array.isArray(body.hotspots) ? body.hotspots : [];

  return {
    range,
    generatedAt,
    hotspots: hotspots.slice(0, MAX_HOTSPOTS).map(sanitizeHotspot),
  };
}

function sanitizeHotspot(item) {
  const typeCounts = sanitizeNumberMap(item?.typeCounts, 10);
  const severity = sanitizeNumberMap(item?.severityBreakdown, 4);
  const actions = Array.isArray(item?.actions) ? item.actions : [];

  return {
    area: safeText(item?.area || "Unknown area", 120),
    priority: safeText(item?.priority || "monitor", 20),
    dominantTypes: Array.isArray(item?.dominantTypes) ?
      item.dominantTypes.slice(0, 3).map((v) => safeText(v, 60)) :
      [],
    totalReports: safeNumber(item?.totalReports),
    weightedScore: safeNumber(item?.weightedScore),
    peakHours: Array.isArray(item?.peakHours) ?
      item.peakHours.slice(0, 6).map((v) => safeNumber(v)) :
      [],
    peakLabel: safeText(item?.peakLabel || "No clear peak", 80),
    evidence: safeText(item?.evidence || "", 240),
    typeCounts,
    severityBreakdown: severity,
    actions: actions.slice(0, MAX_ACTIONS_PER_HOTSPOT).map((action) => ({
      actionId: safeText(action?.actionId || "", 60),
      title: safeText(action?.title || "", 140),
      reason: safeText(action?.reason || "", 240),
      timeframe: safeText(action?.timeframe || "", 80),
    })),
  };
}

function sanitizeNumberMap(value, maxKeys) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  Object.keys(value).slice(0, maxKeys).forEach((key) => {
    out[safeText(key, 60)] = safeNumber(value[key]);
  });
  return out;
}

function safeText(value, maxLength) {
  return String(value == null ? "" : value).slice(0, maxLength);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildFallbackSummaries(context) {
  return context.hotspots.map((hotspot) => {
    const pattern = hotspot.dominantTypes.length ?
      humanize(hotspot.dominantTypes.join(", ")) :
      "mixed incident pattern";
    const actionList = hotspot.actions
        .map((action) => action.title)
        .filter(Boolean)
        .slice(0, 4);

    const summary = [
      `${hotspot.area} shows a ${hotspot.priority} priority ${pattern}`,
      `hotspot with ${hotspot.totalReports} report(s) in ${context.range}.`,
      hotspot.peakLabel,
    ].join(" ");

    return {
      area: hotspot.area,
      summary,
      suggestedSolution: actionList.length ?
        `Recommended focus: ${actionList.join("; ")}.` :
        "Recommended focus: continue monitoring and verify new reports before escalation.",
      confidenceNote: "Generated from deterministic hotspot rules.",
    };
  });
}

async function generateWithOpenAI(context, fallback, apiKey) {
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const prompt = {
    range: context.range,
    generatedAt: context.generatedAt,
    instructions: [
      "You are helping a city admin understand crime analytics.",
      "Use only the supplied aggregated hotspot evidence.",
      "Do not invent locations, counts, crimes, agencies, or actions.",
      "Keep recommendations practical, specific, and safe.",
      "For domestic violence, prioritize privacy and victim support.",
      "Return valid JSON only with a summaries array.",
    ],
    requiredShape: {
      summaries: [
        {
          area: "same area label from input",
          summary: "1-2 concise sentences explaining the situation",
          suggestedSolution: "1-2 concise sentences with the recommended action plan",
          confidenceNote: "short note about evidence strength",
        },
      ],
    },
    hotspots: context.hotspots,
    fallback,
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "developer",
          content: "Return compact JSON for an admin public-safety dashboard.",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
      max_output_tokens: 1100,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  const parsed = parseJsonObject(text);
  return Array.isArray(parsed?.summaries) ? parsed.summaries : [];
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  output.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part?.text === "string") parts.push(part.text);
    });
  });
  return parts.join("\n");
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    void error;
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      void error;
    }
  }
  return null;
}

function mergeWithFallback(aiSummaries, fallback) {
  return fallback.map((item) => {
    const ai = aiSummaries.find((summary) =>
      String(summary?.area || "").toLowerCase() === item.area.toLowerCase(),
    );
    return {
      area: item.area,
      summary: safeText(ai?.summary || item.summary, 700),
      suggestedSolution: safeText(
          ai?.suggestedSolution || item.suggestedSolution,
          700,
      ),
      confidenceNote: safeText(
          ai?.confidenceNote || item.confidenceNote,
          220,
      ),
    };
  });
}

function humanize(value) {
  return String(value || "unknown")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
}
