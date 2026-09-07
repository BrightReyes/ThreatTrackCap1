# Admin AI Suggestion Summary Implementation Guide

Date prepared: May 16, 2026  
System: ThreatTrack web-admin, Firebase Firestore, Firebase Cloud Functions, Leaflet heatmap

## Goal

Add an admin-side AI Suggestion Summary that reads ThreatTrack analytics and heatmap data, identifies streets or heatmap areas with many reports, and suggests practical response actions for admins.

The AI should not replace the admin, police, or responder decision. It should act as a decision-support assistant that explains patterns and drafts recommended actions for human approval.

Expected admin result:

```text
Hotspot: MacArthur Highway, Marulas
Pattern: 9 theft/snatching reports in the last 7 days, mostly 6 PM to 10 PM.
Risk level: High
Suggested action:
- Increase visible patrols during evening commute hours.
- Coordinate with nearby barangay/tanod and business CCTV owners.
- Send a targeted safety advisory to users within the affected radius.
- Review open incidents from this street first.
Confidence: 0.82
```

## How the AI Works

The AI does not automatically know your database. It only knows the analytics data that your backend sends to it.

Recommended flow:

```text
Firestore incidents and crime_statistics
  -> Cloud Function builds safe analytics summary
  -> AI model receives only aggregated/non-sensitive data
  -> AI returns structured JSON suggestions
  -> Cloud Function validates and stores result
  -> Admin dashboard displays AI cards
  -> Admin approves, edits, ignores, or logs action
```

The most important rule: do not send reporter names, emails, phone numbers, exact home addresses, or raw private descriptions unless there is a clear need. For this feature, aggregated counts are enough.

## Existing ThreatTrack Pieces to Reuse

Use these existing files as the base:

| Area | Existing file | How it helps |
| --- | --- | --- |
| Admin dashboard entry | `web-admin/dashboard.html` | Add the AI summary panel or button here. |
| Admin dashboard startup | `web-admin/js/dashboard.js` | Import and initialize the new AI summary module. |
| Admin map and heatmap logic | `web-admin/js/admin-map.js` | Existing map filters, incident loading, heatmap buckets, and Valenzuela map context. |
| Admin statistics | `web-admin/js/admin-stats.js` | Existing incident counts, open reports, 24h reports, and average risk. |
| Heatmap endpoint | `functions/src/getHeatmapData.js` | Already accepts map bounds and returns heatmap cells. |
| Scheduled heatmap aggregation | `functions/src/aggregateHeatmapData.js` | Already writes aggregated `crime_statistics` data. |
| Incident schema | `DATABASE_SCHEMA.md` | Defines incident, location, severity, status, and statistics fields. |
| Function exports | `functions/index.js` | Export the new AI Cloud Function here. |

## Recommended First Version

Build version 1 as an admin-only "Generate AI Summary" button on the admin analytics page.

Version 1 should:

1. Use the last 7 days by default.
2. Find the top 3 to 5 heatmap cells or streets with the most reports.
3. Group reports by `location.address`, normalized street/barangay, incident `type`, `severity`, and hour of day.
4. Send only aggregate counts to the AI.
5. Return structured JSON.
6. Display AI recommendations in the dashboard.
7. Store each generated result for audit and cost control.

Avoid automatic public alerts in version 1. Let admins review and send advisories manually.

## Selected Implementation for This Repo

The selected provider is Google Gemini through the REST `generateContent` endpoint.

For the defense/local demo version, the admin analytics page uses **per-hotspot Gemini tailoring**:

```text
Top Hotspot card
  -> rule-based evidence/actions are calculated from analytics
  -> admin clicks "Generate Action Plan"
  -> Gemini receives only that hotspot's aggregated counts and rule actions
  -> Gemini returns a summarized, tailored prevention/action plan for that street or area
```

This means a hotspot like `Orosco` with 14 reports will get its own tailored AI plan, instead of a generic whole-city summary.

Implemented files:

| File | Purpose |
| --- | --- |
| `functions/src/generateAdminAISummary.js` | Callable Cloud Function that aggregates incident analytics, calls Gemini, validates JSON, and stores the draft summary. |
| `functions/index.js` | Exports `generateAdminAISummary`. |
| `web-admin/analytics.html` | Labels the recommendation section as rule-based actions plus per-hotspot Gemini summary. |
| `web-admin/js/analytics.js` | Adds `Generate Action Plan` on each hotspot card and calls Gemini locally for the selected hotspot. |
| `web-admin/css/analytics.css` | Styles the AI tailoring controls and per-hotspot AI plan. |
| `firestore.rules` | Allows admin/staff reads for stored AI summaries while keeping writes server-side. |

For local defense demo only, the browser prompts for the Gemini API key once and keeps it in `localStorage`. This avoids needing Firebase Blaze while still showing a real Gemini response.

For production or deployed use, do not call Gemini directly from the browser. Set the Gemini key as a Firebase Functions secret:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Then deploy the functions and hosting/admin app as usual:

```bash
firebase deploy --only functions
npm --prefix web-admin run build
firebase deploy --only hosting
```

Important: never place the Gemini API key in `web-admin`, `.env` files committed to Git, or any client-side JavaScript.

## AI Provider Choices and Affordable Options

Pricing changes often, so verify pricing before deployment. The numbers below were checked from official pricing pages on May 16, 2026.

| Provider | Suggested model | Official price signal | Best use | Notes |
| --- | --- | --- | --- | --- |
| Google Gemini API | `gemini-2.5-flash-lite` | Free tier; paid tier about $0.10 input and $0.40 output per 1M text/image/video tokens | Cheapest capstone/demo option | Very affordable. Paid tier is better for privacy than relying on free-tier behavior. |
| Google Gemini API | `gemini-2.5-flash` | Free tier; paid tier about $0.30 input and $2.50 output per 1M text/image/video tokens | Better quality while still cheap | Good default if Flash-Lite suggestions feel too shallow. |
| OpenAI API | `gpt-5-mini` or current affordable mini model | OpenAI model/pricing pages list mini models as lower-cost options, with `gpt-5-mini` shown around $0.25 input and $2.00 output per 1M tokens where available | Strong structured JSON output and simple Node SDK | Good balance for reliable admin summaries. If your account offers newer mini models, compare cost before choosing. |
| OpenAI API | `gpt-5.4-mini` | Pricing page shows about $0.75 input and $4.50 output per 1M tokens | Stronger reasoning, still cheaper than flagship models | Use when recommendations need more careful analysis. |
| Groq API | `llama-3.1-8b-instant`, `gpt-oss-20b`, or `llama-4-scout` | Very low per-token pricing on Groq pricing page | Fast and very cheap experiments | Great for prototypes. Test JSON reliability carefully. |
| Anthropic Claude API | `claude-haiku-4.5` | Anthropic pricing page shows about $1 input and $5 output per 1M tokens | Careful summaries and policy-style writing | More expensive than Gemini/Groq, but useful if output quality matters more than lowest cost. |

Recommended low-budget path:

1. Start with `gemini-2.5-flash-lite` if budget is the top priority.
2. Use `gpt-5-mini` or the current OpenAI affordable mini model if you want strong structured outputs and easy JavaScript examples.
3. Keep Groq as an experimental cheap fallback after testing output format stability.

Do not use personal subscriptions like ChatGPT Plus or Claude Pro for backend integration. Use developer API billing with a monthly budget cap.

## Simple Cost Estimate

Assume one AI summary sends about 5,000 input tokens of analytics and receives about 700 output tokens.

| Model example | Estimated cost per summary | Estimated cost per 1,000 summaries |
| --- | ---: | ---: |
| Gemini 2.5 Flash-Lite paid | About $0.0008 | About $0.78 |
| Gemini 2.5 Flash paid | About $0.0033 | About $3.25 |
| OpenAI `gpt-5-mini` where available | About $0.0027 | About $2.65 |
| OpenAI `gpt-5.4-mini` | About $0.0069 | About $6.90 |
| Groq `llama-3.1-8b-instant` | About $0.0003 | About $0.31 |
| Claude Haiku 4.5 | About $0.0085 | About $8.50 |

These estimates exclude taxes, currency conversion, retries, logging, and provider minimums.

## Data the AI Should Receive

Send aggregated hotspot data, not raw personal reports.

Recommended AI input shape:

```json
{
  "city": "Valenzuela City",
  "timeRange": {
    "label": "last_7_days",
    "start": "2026-05-09T00:00:00+08:00",
    "end": "2026-05-16T23:59:59+08:00"
  },
  "overallStats": {
    "totalIncidents": 42,
    "openIncidents": 12,
    "highSeverity": 8,
    "mediumSeverity": 20,
    "lowSeverity": 14
  },
  "hotspots": [
    {
      "rank": 1,
      "label": "MacArthur Highway, Marulas",
      "barangay": "Marulas",
      "street": "MacArthur Highway",
      "center": {
        "latitude": 14.7042,
        "longitude": 120.9612
      },
      "reportCount": 9,
      "weightedScore": 21,
      "severityBreakdown": {
        "high": 3,
        "medium": 5,
        "low": 1
      },
      "typeBreakdown": {
        "theft_snatching": 6,
        "suspicious_activity": 2,
        "public_disturbance": 1
      },
      "peakHours": ["18:00-22:00"],
      "recentTrend": "increasing",
      "nearestPrecinct": "PCP 6 - Malinta"
    }
  ]
}
```

## Fields to Add for Better Street-Level Suggestions

Current reports already store:

```text
incidents/{id}.location.latitude
incidents/{id}.location.longitude
incidents/{id}.location.address
incidents/{id}.type
incidents/{id}.typeLabel
incidents/{id}.severity
incidents/{id}.status
incidents/{id}.timestamp
incidents/{id}.reportedAt
```

For better AI summaries, add these normalized fields when a report is created or later through a Cloud Function:

```json
{
  "location": {
    "latitude": 14.7042,
    "longitude": 120.9612,
    "address": "MacArthur Highway corner Hermoso Street, Valenzuela City",
    "street": "MacArthur Highway",
    "barangay": "Marulas",
    "city": "Valenzuela City"
  },
  "analytics": {
    "gridKey": "14.704_120.961",
    "hourOfDay": 18,
    "dayOfWeek": "Friday",
    "nearestPrecinctCode": "PCP-006"
  }
}
```

Why this matters:

- `street` lets the AI recommend actions for a clear street, not only coordinates.
- `barangay` lets admins filter by local area.
- `gridKey` lets you connect AI output to the heatmap.
- `hourOfDay` helps the AI find peak incident windows.
- `nearestPrecinctCode` helps recommend who should respond.

If reverse geocoding does not provide a clean street, use the heatmap cell label as fallback:

```text
Hotspot near 14.704, 120.961, Valenzuela City
```

## Firestore Collection for AI Outputs

Create a collection:

```text
ai_suggestion_summaries/{summaryId}
```

Suggested document:

```json
{
  "createdAt": "serverTimestamp",
  "createdBy": "adminUid",
  "provider": "openai",
  "model": "gpt-5-mini",
  "timeRange": "last_7_days",
  "filters": {
    "type": "all",
    "severity": "all",
    "status": ["pending", "under_review", "verified", "responding"]
  },
  "inputStatsHash": "sha256-of-analytics-payload",
  "hotspotCount": 5,
  "summary": {
    "headline": "Theft/snatching is concentrated along MacArthur Highway in evening hours.",
    "overallRisk": "high",
    "priorityHotspots": [],
    "recommendedActions": []
  },
  "usage": {
    "inputTokens": 5000,
    "outputTokens": 700,
    "estimatedCostUsd": 0.0027
  },
  "review": {
    "status": "draft",
    "reviewedBy": null,
    "reviewedAt": null,
    "adminNotes": ""
  }
}
```

## Output Schema the AI Must Return

Ask the AI for strict JSON. Validate the result before saving.

```json
{
  "headline": "string",
  "overallRisk": "low | medium | high | critical",
  "executiveSummary": "string",
  "priorityHotspots": [
    {
      "rank": 1,
      "locationLabel": "string",
      "street": "string",
      "barangay": "string",
      "riskLevel": "low | medium | high | critical",
      "mainPattern": "string",
      "evidence": [
        "string"
      ],
      "recommendedActions": [
        {
          "action": "string",
          "owner": "admin | police | barangay | community | system",
          "urgency": "today | this_week | monitor",
          "reason": "string"
        }
      ],
      "suggestedPublicAdvisory": "string",
      "confidence": 0.82
    }
  ],
  "dataWarnings": [
    "string"
  ],
  "nextDataToCollect": [
    "string"
  ]
}
```

## Prompt Template

Use a server-side prompt like this:

```text
You are an analyst assistant for ThreatTrack, a public safety incident reporting admin dashboard for Valenzuela City.

Your task is to analyze aggregated incident analytics and generate practical, non-alarmist, admin-reviewed recommendations.

Rules:
- Do not claim certainty. Use "suggests", "may indicate", or "based on reported data".
- Do not identify private people, reporters, victims, or suspects.
- Do not recommend vigilante action.
- Do not generate public panic or blame a community.
- Recommend actions that admins, police, barangay responders, or the system can realistically do.
- If the data is too thin, say so and recommend more monitoring.
- Return only valid JSON matching the schema.

Data:
{{AGGREGATED_ANALYTICS_JSON}}
```

## Step-by-Step Implementation

### Step 1: Choose the provider

For a capstone/demo budget, choose one:

- Selected for this repo: Gemini `gemini-flash-latest` through REST
- Cheapest production option: Gemini `gemini-2.5-flash-lite`
- Alternative with strong structured output: OpenAI affordable mini model
- Very cheap experimental: Groq `llama-3.1-8b-instant`

The current local implementation uses Gemini REST directly. Some lower examples remain provider-agnostic or OpenAI-style pseudocode so you can compare alternatives later.

### Step 2: Add the server secret

Never put the AI API key in `web-admin`.

Use Firebase Functions secrets:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

For other providers:

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set GROQ_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
```

### Step 3: Install the provider SDK in Cloud Functions

From `functions/`, install only the SDK you choose. The current local Gemini demo uses `fetch`, so it does not need a new SDK.

OpenAI example:

```bash
npm --prefix functions install openai
```

Gemini example:

```bash
npm --prefix functions install @google/generative-ai
```

Anthropic example:

```bash
npm --prefix functions install @anthropic-ai/sdk
```

Groq example:

```bash
npm --prefix functions install groq-sdk
```

### Step 4: Create a Cloud Function

Create:

```text
functions/src/generateAdminAISummary.js
```

Responsibilities:

1. Confirm the caller is authenticated.
2. Confirm the caller is an admin or approved staff role.
3. Query incidents for the selected time range.
4. Build aggregate hotspot data.
5. Call the AI provider with a schema.
6. Validate returned JSON.
7. Save result to `ai_suggestion_summaries`.
8. Return the summary to the admin UI.

### Step 5: Export the function

In `functions/index.js`, add:

```javascript
exports.generateAdminAISummary = require("./src/generateAdminAISummary");
```

### Step 6: Build hotspot aggregation

Start with simple server-side aggregation:

```javascript
function getGridKey(location) {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

function normalizeStreet(address) {
  const value = String(address || "").trim();
  if (!value) return "";

  const beforeCity = value.split(/Valenzuela/i)[0] || value;
  const parts = beforeCity
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts[0] || "";
}
```

Then group incidents:

```javascript
function addIncidentToHotspots(map, docId, incident) {
  const loc = incident.location || {};
  const gridKey = incident.analytics?.gridKey || getGridKey(loc);
  if (!gridKey) return;

  const street = loc.street || normalizeStreet(loc.address);
  const barangay = loc.barangay || "";
  const label = street || barangay || `Grid ${gridKey}`;
  const key = `${barangay}|${street}|${gridKey}`;

  if (!map.has(key)) {
    map.set(key, {
      label,
      street,
      barangay,
      center: {
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
      },
      reportCount: 0,
      weightedScore: 0,
      severityBreakdown: { high: 0, medium: 0, low: 0 },
      typeBreakdown: {},
      hourCounts: {},
      sampleIncidentIds: [],
    });
  }

  const h = map.get(key);
  h.reportCount += 1;

  const severity = String(incident.severity || "low").toLowerCase();
  if (h.severityBreakdown[severity] != null) {
    h.severityBreakdown[severity] += 1;
  }
  h.weightedScore += severity === "high" ? 3 : severity === "medium" ? 2 : 1;

  const type = String(incident.type || "other");
  h.typeBreakdown[type] = (h.typeBreakdown[type] || 0) + 1;

  const ts = incident.timestamp?.toDate?.() || incident.reportedAt?.toDate?.();
  if (ts) {
    const hour = ts.getHours();
    h.hourCounts[hour] = (h.hourCounts[hour] || 0) + 1;
  }

  if (h.sampleIncidentIds.length < 5) {
    h.sampleIncidentIds.push(docId);
  }
}
```

### Step 7: Call the AI from the Cloud Function

OpenAI-style example:

```javascript
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const OpenAI = require("openai");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

module.exports = onCall({ secrets: [OPENAI_API_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const db = admin.firestore();
  const userSnap = await db.collection("users").doc(uid).get();
  const role = userSnap.data()?.role;
  if (!["admin", "moderator", "police"].includes(role)) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const analyticsPayload = await buildAnalyticsPayload(db, request.data || {});

  const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "You are a public safety analyst assistant. Return only valid JSON. Do not include private person details.",
      },
      {
        role: "user",
        content: JSON.stringify(analyticsPayload),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "admin_ai_suggestion_summary",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "headline",
            "overallRisk",
            "executiveSummary",
            "priorityHotspots",
            "dataWarnings",
            "nextDataToCollect"
          ],
          properties: {
            headline: { type: "string" },
            overallRisk: {
              type: "string",
              enum: ["low", "medium", "high", "critical"]
            },
            executiveSummary: { type: "string" },
            priorityHotspots: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
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
                  "confidence"
                ],
                properties: {
                  rank: { type: "number" },
                  locationLabel: { type: "string" },
                  street: { type: "string" },
                  barangay: { type: "string" },
                  riskLevel: {
                    type: "string",
                    enum: ["low", "medium", "high", "critical"]
                  },
                  mainPattern: { type: "string" },
                  evidence: {
                    type: "array",
                    items: { type: "string" }
                  },
                  recommendedActions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["action", "owner", "urgency", "reason"],
                      properties: {
                        action: { type: "string" },
                        owner: {
                          type: "string",
                          enum: ["admin", "police", "barangay", "community", "system"]
                        },
                        urgency: {
                          type: "string",
                          enum: ["today", "this_week", "monitor"]
                        },
                        reason: { type: "string" }
                      }
                    }
                  },
                  suggestedPublicAdvisory: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            },
            dataWarnings: {
              type: "array",
              items: { type: "string" }
            },
            nextDataToCollect: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      }
    }
  });

  const summary = JSON.parse(response.output_text);

  const ref = await db.collection("ai_suggestion_summaries").add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: uid,
    provider: "openai",
    model: "gpt-5-mini",
    filters: request.data || {},
    inputStats: {
      totalIncidents: analyticsPayload.overallStats.totalIncidents,
      hotspotCount: analyticsPayload.hotspots.length,
    },
    summary,
    review: {
      status: "draft",
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: "",
    },
  });

  return { id: ref.id, summary };
});
```

### Step 8: Add the admin UI module

Create:

```text
web-admin/js/admin-ai-summary.js
```

Responsibilities:

1. Find the AI panel container.
2. Call the Cloud Function when the admin clicks "Generate".
3. Show loading, empty, success, and error states.
4. Render priority hotspots and recommended actions.
5. Label results as AI-generated drafts.

Example shape:

```javascript
import { getFunctions, httpsCallable } from "firebase/functions";

export function initAdminAISummary() {
  const btn = document.getElementById("ai-summary-generate");
  const output = document.getElementById("ai-summary-output");
  if (!btn || !output) return;

  const functions = getFunctions();
  const generate = httpsCallable(functions, "generateAdminAISummary");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    output.textContent = "Generating AI summary...";

    try {
      const result = await generate({
        days: 7,
        type: document.getElementById("map-filter-type")?.value || "all",
        severity: document.getElementById("map-filter-severity")?.value || "all",
      });

      renderAISummary(output, result.data.summary);
    } catch (error) {
      console.error("[admin-ai-summary]", error);
      output.textContent = error?.message || "Could not generate AI summary.";
    } finally {
      btn.disabled = false;
    }
  });
}

function renderAISummary(container, summary) {
  container.innerHTML = "";

  const headline = document.createElement("h3");
  headline.textContent = summary.headline || "AI Summary";
  container.appendChild(headline);

  const body = document.createElement("p");
  body.textContent = summary.executiveSummary || "";
  container.appendChild(body);

  for (const hotspot of summary.priorityHotspots || []) {
    const section = document.createElement("section");
    section.className = "ai-summary-hotspot";

    const title = document.createElement("h4");
    title.textContent = `${hotspot.rank}. ${hotspot.locationLabel}`;
    section.appendChild(title);

    const pattern = document.createElement("p");
    pattern.textContent = hotspot.mainPattern;
    section.appendChild(pattern);

    const list = document.createElement("ul");
    for (const item of hotspot.recommendedActions || []) {
      const li = document.createElement("li");
      li.textContent = `${item.action} (${item.urgency})`;
      list.appendChild(li);
    }
    section.appendChild(list);

    container.appendChild(section);
  }
}
```

### Step 9: Wire it into the dashboard

In `web-admin/dashboard.html`, add a section below the map or beside recent activity:

```html
<section class="admin-dashboard__ai-summary" aria-label="AI suggestion summary">
  <div class="admin-dashboard__section-header">
    <h2 class="admin-dashboard__section-title">AI Suggestion Summary</h2>
    <button id="ai-summary-generate" type="button">Generate</button>
  </div>
  <p class="admin-dashboard__map-caption">
    AI-generated draft based on aggregated incident analytics. Review before taking action.
  </p>
  <div id="ai-summary-output" role="status"></div>
</section>
```

In `web-admin/js/dashboard.js`, import and initialize:

```javascript
import { initAdminAISummary } from "./admin-ai-summary.js";

// inside onReady()
initAdminAISummary();
```

### Step 10: Cache the result

To control cost, avoid generating a new AI result every time the dashboard loads.

Recommended cache rules:

- Cache one result per filter set for 15 to 60 minutes.
- Generate again only when the admin clicks refresh.
- Store `inputStatsHash` to detect whether the analytics changed.
- Show the generated timestamp in the UI.

### Step 11: Add review actions

Add admin review fields:

```json
{
  "review": {
    "status": "draft | accepted | edited | dismissed",
    "reviewedBy": "uid",
    "reviewedAt": "timestamp",
    "adminNotes": "string"
  }
}
```

This helps during defense because you can explain that the system keeps human control over safety decisions.

## Suggested Recommendations the AI Can Make

Keep recommendations practical and locally actionable.

Good recommendation categories:

- Increase patrol visibility for the peak time range.
- Prioritize open reports from the hotspot.
- Coordinate with nearest precinct or barangay responders.
- Issue a careful public safety advisory to nearby users.
- Check street lighting, CCTV, and blind spots.
- Monitor the hotspot for 24 to 72 hours before escalation if data is thin.
- Compare with the previous 7-day period to confirm if the hotspot is rising.

Bad recommendation categories:

- Do not accuse a person or group.
- Do not tell civilians to confront suspicious people.
- Do not claim that a street is definitely dangerous based only on reports.
- Do not automatically dispatch emergency services without human confirmation.

## Expanded Rule-Based Knowledge Layer

The current local implementation uses a hybrid approach:

```text
analytics data
  -> deterministic hotspot scoring
  -> crime-type rule base
  -> situational rule base
  -> Gemini structured JSON summary
  -> admin review
```

The AI does not invent the base recommendation from nothing. It receives a hidden operational reference that includes:

- Crime-type playbooks for robbery, theft, assault, domestic violence, drug-related activity, disturbance, vandalism, traffic accidents, illegal weapons, and suspicious activity.
- Situational rules for high-severity clusters, SOS reports, repeat hotspots, peak-hour patterns, mixed crime patterns, and street-level safety audits.
- Safety boundaries that prevent public shaming, vigilante action, direct civilian confrontation, or exposure of private people.
- Accuracy guidance telling the model to rely on the aggregated analytics and avoid facts not present in the payload.

Examples of added rule approaches:

- Robbery or holdup: escape-route review, lighting, CCTV, visible patrols, nearby store or transport-point coordination.
- Theft or snatching: commuter-flow review, anti-snatching reminders, foot or bike patrols, business quick-reporting coordination.
- Assault: responder-route checks, CCTV near gathering points, barangay conflict mediation where appropriate.
- Domestic violence: VAW desk or social welfare coordination, confidential follow-up, safe reporting pathways, no public hotspot warning.
- Drug-related reports: authorized police review, observation logs, official reporting channels, no civilian confrontation.
- Traffic accidents: road safety audit, signage and crossing repair, lighting, speed-control review, traffic visibility during peak accident hours.
- Illegal weapons: authorized review, responder safety note, evidence preservation, controlled information sharing.

For the admin card, only the top action, reason, evidence summary, and generated AI plan are shown. The larger rule base stays as AI context so the UI remains clean.

## How to Make the AI Smarter and More Accurate

Use better data before using a bigger model. The AI can only be as accurate as the hotspot evidence passed to it.

1. Normalize locations.
   Save `street`, `barangay`, `city`, and `gridKey` for every report. This lets the AI recommend for a real street or heatmap cell instead of a vague coordinate.

2. Improve incident timestamps.
   Save normalized `hourOfDay`, `dayOfWeek`, and timezone-adjusted report time. This makes peak-hour recommendations more reliable.

3. Deduplicate repeated reports.
   If five users report the same event, tag it as one incident with multiple confirmations. This prevents the AI from overestimating risk.

4. Track verification status.
   Pass counts for pending, verified, responding, and done reports. Give verified reports more weight than unverified reports.

5. Add outcome feedback.
   Let admins mark an AI suggestion as `accepted`, `edited`, `dismissed`, or `completed`. Later prompts can include which actions worked for similar hotspots.

6. Add local SOP context.
   Store approved barangay, police, or city response guidelines and retrieve the relevant sections for the hotspot. This is called retrieval augmented generation, or RAG.

7. Keep the rule base updated.
   Add new rules after each defense test or real admin review. The model becomes more useful when the rule base reflects local operations.

8. Lower randomness for safety.
   Keep Gemini `temperature` low, such as `0.1` to `0.2`, so outputs are consistent and easier to defend.

9. Require structured JSON.
   Continue using a response schema so the UI receives predictable fields like `riskSummary`, `tailoredSolution`, and `priorityActions`.

10. Evaluate with sample hotspots.
    Test known cases like `Orosco` with 14 reports. Check whether the AI mentions the correct crime types, severity, SOS count, peak hour, and rule-based actions.

## Security and Privacy Requirements

1. Keep AI API keys only in Cloud Functions secrets.
2. Only admin, moderator, or police roles should call the AI function.
3. Send aggregated data, not raw user PII.
4. Remove reporter emails, names, phone numbers, and exact profile addresses from AI input.
5. Log who generated a summary and when.
6. Rate limit AI calls to prevent cost spikes.
7. Set provider account monthly spending limits.
8. Display "AI-generated draft" in the admin UI.
9. Store AI outputs for audit.
10. Let admins edit or reject suggestions.

## Firestore Rules to Add Later

Add rules so only admin/staff can read AI summaries and only Cloud Functions/admin users can create them.

Example policy goal:

```text
ai_suggestion_summaries:
- read: admin, moderator, police
- create: Cloud Function or admin
- update review fields: admin, moderator
- delete: admin only
```

Implementation depends on your final role rules. Do not make these documents public because they may mention sensitive hotspot patterns.

## Testing Checklist

Before defense or production demo:

1. Generate a summary with no incidents.
2. Generate a summary with fewer than 3 incidents.
3. Generate a summary with one clear hotspot.
4. Generate a summary with multiple hotspots.
5. Confirm normal users cannot call the function.
6. Confirm API keys are not visible in browser source or Vite build files.
7. Confirm AI output is valid JSON every time.
8. Confirm suggestions do not include reporter names, emails, or private user details.
9. Confirm estimated cost is logged.
10. Confirm admins can tell that the output is a draft.

## Defense Explanation

Use this explanation:

```text
The AI feature is not predicting crime by itself. It summarizes existing verified or reviewable incident analytics. The backend aggregates reports by heatmap cell, street, severity, incident type, and time window. The AI receives only that summarized data and returns a structured recommendation, such as which hotspot needs more review, patrol coordination, or a user safety advisory. The final action remains under admin or police review.
```

## Suggested Implementation Order

1. Add normalized `location.street`, `location.barangay`, and `analytics.gridKey` to new incidents.
2. Build `generateAdminAISummary` Cloud Function with admin role checks.
3. Start with top 5 hotspots from the last 7 days.
4. Integrate one AI provider.
5. Store AI summaries in Firestore.
6. Add the dashboard panel.
7. Add review status and audit logging.
8. Add cost tracking and caching.
9. Add tests.
10. Later, add an "Approve public advisory" workflow.

## Official References

- OpenAI API pricing: https://openai.com/api/pricing/
- OpenAI JavaScript quickstart: https://platform.openai.com/docs/quickstart/using-the-api
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Anthropic Claude pricing: https://docs.anthropic.com/en/docs/about-claude/pricing
- Groq pricing: https://groq.com/pricing
