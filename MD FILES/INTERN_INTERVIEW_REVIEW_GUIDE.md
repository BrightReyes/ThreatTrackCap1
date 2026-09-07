# Intern Interview Review Guide — Hazy Bright P. Reyes

> **Purpose:** Everything you need to refresh before a software engineer intern interview.  
> Covers: anticipated resume questions with sample answers, full system explanation of ThreatTrack, AI integration in simple terms, and code snippets you should be ready to walk through.

---

## Table of Contents

1. [Resume-Based Anticipated Questions](#1-resume-based-anticipated-questions)
2. [ThreatTrack — Full System Explanation](#2-threattrack--full-system-explanation)
3. [How the AI Integration Works (Simple Terms)](#3-how-the-ai-integration-works-simple-terms)
4. [Code You Should Be Ready to Explain](#4-code-you-should-be-ready-to-explain)
5. [Other Projects Quick Refresh](#5-other-projects-quick-refresh)
6. [Technical Skills Refresh](#6-technical-skills-refresh)
7. [Behavioral / Soft Skill Questions](#7-behavioral--soft-skill-questions)
8. [Quick Cheat Sheet](#8-quick-cheat-sheet)

---

## 1. Resume-Based Anticipated Questions

### 1.1 "Tell me about yourself."

**Answer:**

I'm Hazy Bright Reyes, a 3rd-year BS Information Technology student at Pamantasan ng Lungsod ng Valenzuela. I've been building full-stack projects since 2023 — from a mobile crime reporting app with AI integration, to a C# arcade game that won People's Choice at PLV GameCon 2026, to a Django-based library system with book recommendation AI. I also have industry experience as a freelance data annotator where I labeled images and audio for computer vision and speech recognition models. I'm looking for a software engineering internship to apply what I've learned in a production environment and contribute to a real team.

---

### 1.2 "Walk me through your most significant project."

**Answer:**

That would be **ThreatTrack**, our capstone project. It's an Android-based crime reporting system with hotspot mapping for Valenzuela City. I built the full stack:

- **Mobile app** in React Native (Expo) — lets residents submit incident reports and SOS alerts with GPS, photos, and real-time status tracking.
- **Web admin dashboard** in HTML/CSS/JS with Vite — gives admins incident review, user management, analytics, heatmap visualization, and AI-generated action plans.
- **Backend** using Firebase (Auth, Firestore, Storage, Cloud Functions) — handles real-time data, validation, notification dispatch, and AI API calls.
- **AI layer** using Google Gemini and OpenAI — generates structured hotspot summaries and recommended actions for admins.

The biggest technical challenge was designing the real-time pipeline: a user submits a report → a Cloud Function fires on document creation → validates the data and assigns a verification score → updates the status → triggers notifications to nearby users and admins — all within seconds.

---

### 1.3 "What was the hardest bug you had to fix?"

**Answer:**

During ThreatTrack development, I ran into a race condition between the incident validation Cloud Function and the admin response flow. When an admin clicked "Respond" on an SOS report very quickly (before validation finished), the Cloud Function would overwrite the `responding` status back to `verified`. I fixed it by checking the current document status inside the Cloud Function before updating:

```javascript
// Inside validateIncident.js
const currentSnap = await incidentRef.get();
const currentIncident = currentSnap.exists ? currentSnap.data() : incident;
const alreadyResponding = currentIncident?.status === "responding" ||
  currentIncident?.responseStatus === "help_on_the_way";

// Preserve responding status if admin already acted
const updatePayload = {
  verificationScore,
  status: alreadyResponding ? "responding" : status,
  validatedAt: admin.firestore.FieldValue.serverTimestamp(),
};
```

This taught me to always consider concurrent state changes in event-driven architectures.

---

### 1.4 "Why did you choose Firebase over a custom backend?"

**Answer:**

Three reasons:

1. **Real-time sync** — Firestore's `onSnapshot` listeners let both the mobile app and admin dashboard receive updates instantly without polling. When a user submits a report, the admin sees it immediately.
2. **Speed of development** — Firebase Auth, Storage, and Cloud Functions gave us authentication, file uploads, and serverless backend logic without provisioning servers. For a capstone with a 5-month timeline, this was critical.
3. **Scalability without ops** — Cloud Functions auto-scale per request. We didn't need to manage infrastructure, which let us focus on features.

If I were building this for production, I'd add stricter server-side security rules, rate limiting in Cloud Functions, and consider moving the AI calls behind a proper API gateway.

---

### 1.5 "How does the real-time data flow work?"

**Answer:**

Here's the flow step by step:

```
User submits report (React Native)
         │
         ▼
Report saved to Firestore "incidents" collection
         │
         ▼
Cloud Function triggers (onDocumentCreated)
    ├── Validates location, type, severity, description
    ├── Checks for spam (rate limiting, duplicate detection)
    ├── Calculates verification score (0-100)
    ├── Assigns status: verified / under_review / spam
    └── Creates admin notification if high priority
         │
         ▼
Admin dashboard listens via onSnapshot → sees new report instantly
         │
         ▼
Admin responds → status update triggers another Cloud Function
         │
         ▼
User's mobile app receives status update via real-time listener
```

Firebase's real-time listeners (`onSnapshot`) on both ends make this feel instant — no polling, no WebSocket setup needed.

---

### 1.6 "Explain how your verification score works."

**Answer:**

The verification score is a 0-100 quality check on each incident report. It's calculated by five validation checks:

| Check | Points | What it validates |
|---|---:|---|
| Valid location | 25 | GPS coordinates are real numbers, within valid lat/lng range, and not (0,0) |
| Valid incident type | 15 | Type matches one of 10 predefined categories |
| Valid severity | 15 | Severity is "high", "medium", or "low" |
| Valid description | 25 | Description is 10-2000 chars, no spam keywords |
| Not spam | 20 | User hasn't submitted >5 reports/hour, no duplicate locations nearby |

The status is then assigned:

| Score | Status |
|---|---|
| SOS or high-severity + valid location + valid type | `verified` (priority) |
| ≥ 80 | `verified` |
| < 30 | `spam` |
| 30–79 | `under_review` |

```javascript
function calculateVerificationScore(results) {
  let score = 0;
  if (results.hasValidLocation) score += 25;
  if (results.hasValidType) score += 15;
  if (results.hasValidSeverity) score += 15;
  if (results.hasValidDescription) score += 25;
  if (results.isNotSpam) score += 20;
  return score;
}
```

---

### 1.7 "How does your heatmap work?"

**Answer:**

The heatmap groups incidents into geographic grid cells (~111 meters per cell) and applies severity weighting:

```
Weighted Score = (High × 3) + (Medium × 2) + (Low × 1)
```

**How it's built:**

1. A **scheduled Cloud Function** runs every hour.
2. It fetches all visible incidents from Firestore.
3. Rounds each incident's GPS coordinates to 3 decimal places to create grid cells.
4. Counts incidents per cell and calculates the weighted score.
5. Stores aggregated data in a `crime_statistics` collection.
6. The admin dashboard reads this collection and renders it on a map using Google Maps heatmap layer.

```javascript
// Grid cell creation (3 decimal places = ~111 meters)
const lat = parseFloat(incident.location.latitude.toFixed(3));
const lon = parseFloat(incident.location.longitude.toFixed(3));
const gridKey = `${dateStr}_${lat}_${lon}`;

// Weighted score calculation
cellData.weightedScore = 
  (cellData.severityBreakdown.high * 3) +
  (cellData.severityBreakdown.medium * 2) +
  (cellData.severityBreakdown.low * 1);
```

Old data (>90 days) is automatically cleaned up by the same Cloud Function.

---

### 1.8 "What is your experience with AI/ML?"

**Answer:**

I have two types of AI experience:

1. **As a data annotator (Remotask)** — I annotated images with bounding boxes and semantic labels for computer vision models, and transcribed audio files for speech recognition training. This taught me how training data quality directly impacts model accuracy.

2. **As a developer (ThreatTrack)** — I integrated Google Gemini AI and OpenAI APIs to generate structured text summaries from aggregated incident data. The AI doesn't make decisions — it analyzes hotspot patterns and suggests actions for human admins to review. I used structured JSON schemas to constrain the AI output and built fallback logic for when the API is unavailable.

---

### 1.9 "Tell me about the game you built."

**Answer:**

**Road Rumble** is a top-down arcade dodger game built in Unity with C#. It won the People's Choice Award at PLV GameCon 2026. Key technical features:

- **Split-screen multiplayer** — Independent viewport camera rendering for two players on one screen, with localized keyboard input mapping.
- **Modular C# gameplay systems** — Lane-switching mechanics, obstacle collision, weapon power-ups, and a tactical debuff system, all using separate classes to avoid spaghetti code.
- **Dynamic enemy spawning** — A JSON-driven difficulty system that parses config data to scale vehicle velocities and spawn rates, maintaining 60 FPS with 20+ active obstacles via object pooling.

```csharp
// Example: JSON-driven difficulty scaling
[System.Serializable]
public class DifficultyConfig {
    public float spawnRate;
    public float baseSpeed;
    public float speedMultiplier;
}

// Load from JSON and apply
var config = JsonUtility.FromJson<DifficultyConfig>(jsonData);
spawnTimer = config.spawnRate;
enemySpeed = config.baseSpeed * config.speedMultiplier;
```

---

### 1.10 "Tell me about the Library Management System."

**Answer:**

This was a full-stack web app using **Python/Django** for the backend and **SQLite** for the database.

Key features:
- **JWT authentication** for both the student portal and admin dashboard, with role-based access control.
- **Book recommendation engine** using **Scikit-learn** — I implemented TF-IDF vectorization on book descriptions and used cosine similarity to suggest 5 related books per category.
- **Atomic database transactions** to handle race conditions during simultaneous book checkouts, preventing double-lending of the same book.

```python
# Simplified recommendation logic
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

vectorizer = TfidfVectorizer(stop_words='english')
tfidf_matrix = vectorizer.fit_transform(book_descriptions)

# Find similar books to the one the user is viewing
cosine_sim = cosine_similarity(tfidf_matrix[book_index], tfidf_matrix)
similar_indices = cosine_sim[0].argsort()[-6:-1][::-1]
recommended_books = [books[i] for i in similar_indices]
```

---

### 1.11 "What's the difference between your Barangay Equipment system and ThreatTrack?"

**Answer:**

| Aspect | Barangay Equipment System | ThreatTrack |
|---|---|---|
| **Purpose** | Equipment borrowing & tracking | Public safety incident reporting |
| **Users** | Barangay staff managing inventory | Residents + admins/police |
| **Database** | Firestore NoSQL with RBAC | Firestore NoSQL with RBAC |
| **Real-time** | Firestore listeners for instant calendar/dashboard updates | Firestore listeners for instant report/status updates |
| **Key challenge** | Preventing reservation conflicts and overbooking | Real-time validation pipeline + AI integration |
| **AI** | None | Gemini + OpenAI for decision support |

Both use Firebase Auth + Firestore, but ThreatTrack is more complex because of the AI layer, geospatial features, and the multi-platform architecture (mobile + web).

---

### 1.12 "How do you handle security in your projects?"

**Answer:**

In ThreatTrack, security is enforced at multiple layers:

1. **Firebase Auth** — Every user must authenticate. Email + password with verification.
2. **Firestore Security Rules** — These are the real protection. Rules enforce:
   - Users can only create incidents with their own `reporterId`
   - Users can only edit their own pending reports
   - Only admin/police roles can update/delete any incident
   - AI summaries are read-only for admins (written by Cloud Functions only)
   - `crime_statistics` is write-locked (only Cloud Functions can write)
3. **Cloud Functions** — API keys (Gemini, OpenAI) are stored as Firebase Secrets, never exposed to the client.
4. **Input validation** — Both client-side (React Native form validation) and server-side (Cloud Function `validateIncident`).
5. **Spam detection** — Rate limiting (>5 reports/hour = spam flag), duplicate location detection (~50m radius within 10 minutes).

```
// Firestore rule example: users can only create their own incidents
allow create: if isAuthenticated() &&
  canSubmitReports() &&
  isValidIncident() &&
  request.resource.data.reporterId == request.auth.uid;
```

---

### 1.13 "What technologies are you most comfortable with?"

**Answer:**

My strongest stack is **JavaScript/React Native + Firebase** for mobile, and **HTML/CSS/JS + Vite** for web. I've also built backends with **Python/Django** and worked with **C#/Unity** for game development.

For databases, I'm comfortable with both NoSQL (Firestore) and SQL (SQLite, MySQL). I use Git/GitHub for version control on every project and have deployed to Firebase Hosting and Vercel.

---

### 1.14 "How do you approach learning a new technology?"

**Answer:**

I follow a three-step approach:
1. **Read the official docs first** — Understand the core concepts and mental model before copying tutorials.
2. **Build a small throwaway project** — Get my hands dirty immediately. For example, when learning React Native, I built a simple counter app and a todo list before starting ThreatTrack.
3. **Integrate into a real project** — Apply what I learned to something I care about. That's when the real learning happens — debugging real problems.

My Remotask experience also taught me to learn tooling quickly since each AI project had different annotation platforms and requirements.

---

## 2. ThreatTrack — Full System Explanation

### 2.1 What is ThreatTrack?

ThreatTrack is an **Android-based public safety reporting system with hotspot mapping** for Valenzuela City. It connects two sides:

- **Residents** use a mobile app to report incidents (theft, assault, drug activity, etc.) and send SOS emergency alerts.
- **Admins/Police** use a web dashboard to monitor, validate, and respond to reports, with AI-generated analysis and heatmap visualization.

### 2.2 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native / Expo)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Report   │ │   SOS    │ │  Status  │ │  Home / Map   │  │
│  │  Screen   │ │  Screen  │ │  Screen  │ │   Screen      │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Firebase SDK (Auth, Firestore, Storage)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      FIREBASE BACKEND                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Firestore   │  │   Firebase   │  │  Firebase Cloud  │  │
│  │  (Database)  │  │   Storage    │  │    Functions     │  │
│  │              │  │   (Photos)   │  │                  │  │
│  │  • users     │  │              │  │ • validateInc.   │  │
│  │  • incidents │  │              │  │ • calcRiskLevel  │  │
│  │  • precincts │  │              │  │ • aggHeatmap     │  │
│  │  • notifs    │  │              │  │ • sendAlerts     │  │
│  │  • crime_    │  │              │  │ • genAISummary   │  │
│  │    stats     │  │              │  │ • genAnalytics   │  │
│  │  • ai_summ.  │  │              │  │   Solution       │  │
│  └──────────────┘  └──────────────┘  └───────┬──────────┘  │
└──────────────────────────────────────────────┼──────────────┘
                         │                      │
                         │ Real-time listeners   │ API calls
                         ▼                      ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│   WEB ADMIN DASHBOARD       │  │     EXTERNAL AI SERVICES    │
│   (HTML/CSS/JS + Vite)      │  │                            │
│                             │  │  • Google Gemini API       │
│  ┌──────────┐ ┌──────────┐ │  │    (structured hotspot     │
│  │Dashboard │ │Analytics │ │  │     summaries)             │
│  │(stats,   │ │(heatmap, │ │  │                            │
│  │ alerts)  │ │ charts)  │ │  │  • OpenAI API              │
│  ├──────────┤ ├──────────┤ │  │    (analytics solution     │
│  │Incidents │ │  Users   │ │  │     recommendations)       │
│  │(review,  │ │(manage,  │ │  │                            │
│  │ respond) │ │ roles)   │ │  │  • Google Maps API         │
│  ├──────────┤ ├──────────┤ │  │    (map tiles, geocoding)  │
│  │Operation │ │Settings  │ │  └────────────────────────────┘
│  │(police   │ │(system   │ │
│  │ reports) │ │ config)  │ │
│  └──────────┘ └──────────┘ │
└─────────────────────────────┘
```

### 2.3 The Six Cloud Functions (What Each One Does)

| # | Function | Trigger | What It Does |
|---|---|---|---|
| 1 | [validateIncident](file:///c:/Users/Hazy/Documents/GitHub/ThreatTrackCap1/functions/src/validateIncident.js) | Firestore `onCreate` on `incidents` | Validates report data, calculates verification score, assigns status, flags spam |
| 2 | [calculateRiskLevel](file:///c:/Users/Hazy/Documents/GitHub/ThreatTrackCap1/functions/src/calculateRiskLevel.js) | HTTP Request | Takes a GPS coordinate + radius, queries nearby incidents, returns risk level (high/medium/low) |
| 3 | [aggregateHeatmapData](file:///c:/Users/Hazy/Documents/GitHub/ThreatTrackCap1/functions/src/aggregateHeatmapData.js) | Cloud Scheduler (hourly) | Groups incidents into ~111m grid cells, calculates weighted scores, stores in `crime_statistics` |
| 4 | [sendNearbyIncidentAlert](file:///c:/Users/Hazy/Documents/GitHub/ThreatTrackCap1/functions/src/sendNearbyIncidentAlert.js) | Firestore `onUpdate` on `incidents` | When an incident becomes "verified", finds nearby users and sends push notifications |
| 5 | [generateAdminAISummary](file:///c:/Users/Hazy/Documents/GitHub/ThreatTrackCap1/functions/src/generateAdminAISummary.js) | Callable (admin triggers) | Aggregates incident data, calls Gemini API, returns structured hotspot analysis |
| 6 | [generateAnalyticsSolutionSummary](file:///c:/Users/Hazy/Documents/GitHub/ThreatTrackCap1/functions/src/generateAnalyticsSolutionSummary.js) | HTTP Request (admin triggers) | Takes hotspot evidence, calls OpenAI, returns action-oriented solution summaries |

### 2.4 Database Collections

| Collection | What It Stores | Who Reads | Who Writes |
|---|---|---|---|
| `users` | Profiles, roles, alert preferences | Authenticated users | Own profile / Admin for roles |
| `incidents` | Reports with location, type, severity, photos | Everyone (public safety) | Authenticated users (create) / Admin (update/delete) |
| `precincts` | Police station locations and contact info | Everyone | Admin only |
| `crime_statistics` | Aggregated heatmap grid cells | Authenticated users | Cloud Functions only |
| `notifications` | Push notification history | Authenticated users | Cloud Functions + Auth users |
| `ai_suggestion_summaries` | Gemini-generated admin drafts | Admin/Police only | Cloud Functions only |
| `audit_logs` | Admin action audit trail | Admin/Police only | Authenticated (create) / No update/delete |

---

## 3. How the AI Integration Works (Simple Terms)

### 3.1 The Big Picture (ELI5 — Explain Like I'm 5)

Think of the AI like a **smart assistant that reads a report card**.

1. The system collects all the incident reports (like test scores).
2. It organizes them into a summary — how many incidents, where they happened, what type, how serious.
3. It sends this summary to the AI (Gemini or OpenAI) — like handing the report card to a tutor.
4. The AI reads the summary and writes back: "This area has a lot of theft at night. You should increase patrols and install better lighting."
5. The admin reads the AI's suggestion and decides what to do — the AI never makes the final call.

**The AI does NOT:**
- See personal user data (names, emails, phone numbers)
- Approve or reject reports
- Dispatch responders
- Make any automated decisions

**The AI DOES:**
- Read aggregated, anonymous statistics
- Identify patterns (e.g., "theft is concentrated on Main St between 10pm-2am")
- Suggest practical actions for admins to consider
- Flag data quality warnings (e.g., "most reports lack GPS coordinates")

---

### 3.2 The Technical Flow — Gemini AI Summary

Here's exactly what happens when an admin clicks "Generate AI Summary":

```
Step 1: Admin clicks "Generate AI Summary" button on dashboard
         │
Step 2:  Dashboard calls the Cloud Function: generateAdminAISummary()
         │
Step 3:  Cloud Function checks: Is this user actually an admin?
         ├── No  → Return "permission denied"
         └── Yes → Continue
         │
Step 4:  Cloud Function queries Firestore for incidents
         (filtered by time range: last 7/30/90 days)
         │
Step 5:  Cloud Function aggregates the data:
         • Total incidents, severity counts, type counts
         • Groups incidents into geographic hotspots
         • Calculates weighted scores per hotspot
         • Finds nearest police precinct to each hotspot
         • Identifies peak hours and recent trends
         │
Step 6:  Cloud Function builds a text prompt for Gemini:
         "You are an analyst assistant for ThreatTrack...
          Analyze this data and give recommendations...
          Here's the aggregated data: {JSON}"
         │
Step 7:  Cloud Function sends this to Gemini API:
         POST https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent
         │
Step 8:  Gemini returns structured JSON:
         {
           headline: "Theft concentration near Main St",
           overallRisk: "medium",
           priorityHotspots: [...],
           recommendedActions: [...],
           dataWarnings: [...]
         }
         │
Step 9:  Cloud Function normalizes and validates the AI output
         (caps text lengths, validates enums, sets defaults)
         │
Step 10: Cloud Function saves the summary to Firestore
         (in "ai_suggestion_summaries" collection, with audit metadata)
         │
Step 11: Returns the summary to the admin dashboard for display
```

### 3.3 Key Design Decisions (Why It's Built This Way)

**Q: Why use a Cloud Function instead of calling the AI directly from the dashboard?**

A: Three reasons:
1. **API key security** — The Gemini API key is stored as a Firebase Secret. If we called from the browser, the key would be exposed in network requests.
2. **Data sanitization** — The Cloud Function strips personal data before sending to the AI. We send incident counts and locations, not reporter names or emails.
3. **Cost control** — The Cloud Function can rate-limit and log usage. We track token consumption and estimated cost per request.

**Q: Why use a JSON schema for the AI output?**

A: We set `responseMimeType: "application/json"` and provide a `responseJsonSchema` to Gemini. This forces the AI to return data in a predictable structure that we can render in the dashboard. Without this, the AI might return prose text that we can't parse.

```javascript
generationConfig: {
  temperature: 0.2,        // Low temperature = more consistent, less creative
  maxOutputTokens: 2500,   // Cap output length for cost control
  responseMimeType: "application/json",  // Force JSON output
  responseJsonSchema: AI_SUMMARY_SCHEMA, // Our predefined structure
}
```

**Q: What happens if the AI fails?**

A: Graceful degradation:
- **Gemini fails** → The Cloud Function throws an error, dashboard shows an error message. No bad data gets saved.
- **OpenAI fails (analytics solution)** → The system falls back to a **rule-based deterministic summary** that doesn't need AI at all. The admin still gets useful information.
- **No data available** → The system returns a "no data" summary explaining there are no incidents in the selected range.

### 3.4 The Two AI Services Compared

| Aspect | Gemini (generateAdminAISummary) | OpenAI (generateAnalyticsSolutionSummary) |
|---|---|---|
| **Purpose** | Full hotspot analysis with risk levels | Concise action-oriented solution summaries |
| **Trigger** | Callable Cloud Function | HTTP endpoint |
| **Input** | Raw incident data from Firestore | Pre-processed hotspot evidence from dashboard |
| **Output** | Structured JSON with headline, hotspots, warnings | Array of area summaries with suggested solutions |
| **Fallback** | Error (no fallback) | Rule-based deterministic fallback |
| **Model** | gemini-flash-latest | gpt-5 |
| **API key storage** | Firebase Secret (`GEMINI_API_KEY`) | Firebase Secret (`OPENAI_API_KEY`) |
| **Audit** | Saved to `ai_suggestion_summaries` with hash | Returned directly (not persisted) |

### 3.5 What Data the AI Actually Sees (Privacy)

The AI receives an **analyticsPayload** that looks like this:

```json
{
  "city": "Valenzuela City",
  "generatedAt": "2026-05-15T08:00:00Z",
  "timeRange": { "label": "30d", "days": 30 },
  "overallStats": {
    "totalIncidents": 47,
    "openIncidents": 12,
    "severityBreakdown": { "high": 8, "medium": 22, "low": 17 },
    "typeBreakdown": { "theft_snatching": 15, "public_disturbance": 10, "..." : "..." }
  },
  "hotspots": [
    {
      "label": "MacArthur Highway, Brgy. Karuhatan",
      "reportCount": 12,
      "weightedScore": 28,
      "severityBreakdown": { "high": 4, "medium": 5, "low": 3 },
      "peakHours": "10 PM – 2 AM",
      "nearestPrecinct": { "name": "PS-3 Mapulang Lupa", "distance": "0.8km" }
    }
  ]
}
```

**Notice what's NOT there:** No names, no emails, no phone numbers, no user IDs, no personal data.

---

## 4. Code You Should Be Ready to Explain

### 4.1 The Spam Detection Algorithm

```javascript
// From validateIncident.js — checks if user is spamming
async function checkSpamScore(db, incident, incidentId) {
  const oneHourAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - 60 * 60 * 1000
  );

  // Check 1: More than 5 reports from same user in 1 hour?
  if (incident.reporterId) {
    const recentIncidents = await db.collection("incidents")
      .where("reporterId", "==", incident.reporterId)
      .where("reportedAt", ">", oneHourAgo)
      .get();

    if (recentIncidents.size > 5) return false; // SPAM
  }

  // Check 2: Multiple reports at same location within 10 minutes?
  const tenMinutesAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - 10 * 60 * 1000
  );
  
  const recentReports = await db.collection("incidents")
    .where("reportedAt", ">", tenMinutesAgo)
    .limit(100)
    .get();

  const duplicates = recentReports.docs.filter((doc) => {
    if (doc.id === incidentId) return false;
    const data = doc.data();
    // ~50 meters proximity check
    const latDiff = Math.abs(data.location.latitude - incident.location.latitude);
    const lonDiff = Math.abs(data.location.longitude - incident.location.longitude);
    return latDiff < 0.0005 && lonDiff < 0.0005;
  });

  if (duplicates.length > 2) return false; // SPAM

  return true; // NOT spam
}
```

**Be ready to explain:**
- Why 0.0005 degrees ≈ 50 meters (1 degree latitude ≈ 111 km, so 0.0005 × 111,000 ≈ 55 meters)
- Why we check rate (5 reports/hour) AND location duplicates
- Why we default to "not spam" if the check fails (`catch → return true`)

### 4.2 The Risk Level Algorithm

```javascript
// From calculateRiskLevel.js
function determineOverallRisk(stats) {
  // High: 3+ high severity OR 10+ total in last 7 days
  if (stats.high >= 3 || stats.last7d >= 10) return "high";

  // Medium: 1-2 high severity OR 5-9 total in last 7 days
  if ((stats.high >= 1 && stats.high <= 2) || 
      (stats.last7d >= 5 && stats.last7d < 10)) return "medium";

  // Low: everything else
  return "low";
}
```

**Be ready to explain:**
- This uses clear, auditable thresholds — not a black-box ML model
- Easy for stakeholders to understand and adjust
- The 7-day window captures recent trends without being too noisy (24h) or too stale (30d)

### 4.3 The Firestore Security Rules Pattern

```
// Key pattern: diff-based field whitelisting
allow update: if isOwner(userId) &&
  request.resource.data.uid == userId &&
  request.resource.data.email == resource.data.email &&
  request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['firstName', 'lastName', 'phoneNumber', ...]);
```

**Be ready to explain:**
- `request.resource.data` = the document AFTER the update
- `resource.data` = the document BEFORE the update
- `.diff().affectedKeys()` = only the fields that changed
- `.hasOnly([...])` = restricts which fields can be modified
- This prevents a user from changing their own role to "admin"

### 4.4 The Gemini API Call

```javascript
// From generateAdminAISummary.js
async function callGemini(apiKey, analyticsPayload) {
  const prompt = buildGeminiPrompt(analyticsPayload);
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,  // API key in header, not in URL
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2500,
          responseMimeType: "application/json",
          responseJsonSchema: AI_SUMMARY_SCHEMA,
        },
      }),
    }
  );

  const json = await res.json();
  const text = extractGeminiText(json);
  return {
    summary: JSON.parse(stripJson(text)),
    usage: normalizeGeminiUsage(json.usageMetadata),
  };
}
```

**Be ready to explain:**
- `temperature: 0.2` → Low randomness, consistent outputs for same input
- `responseJsonSchema` → Forces structured output matching our schema
- `stripJson()` → Handles cases where AI wraps JSON in markdown code blocks
- Cost tracking via `estimateGeminiFlashCost()` — input tokens × $0.30/M, output tokens × $2.50/M

---

## 5. Other Projects Quick Refresh

### 5.1 Remotask — Data Annotation

- **What:** Freelance annotator for AI training datasets
- **Image annotation:** Drew bounding boxes and semantic labels for computer vision (object detection)
- **Audio transcription:** Converted raw speech audio to text for speech recognition models
- **Key takeaway:** Data quality is the bottleneck in AI/ML — a model can only be as good as its training data

### 5.2 Road Rumble — Unity Game

- **Tech:** Unity, C#, JSON, PlayerPrefs
- **Multiplayer:** Split-screen with independent viewport cameras
- **Performance:** Object pooling pattern to maintain 60 FPS with 20+ concurrent obstacles
- **Award:** People's Choice at PLV GameCon 2026

### 5.3 Library Management System — Django

- **Tech:** Python, Django REST Framework, SQLite, Scikit-learn, Tkinter
- **Auth:** JWT tokens for API authentication
- **AI feature:** TF-IDF + cosine similarity for book recommendations
- **Key challenge:** Atomic transactions for concurrent checkout prevention

---

## 6. Technical Skills Refresh

### 6.1 JavaScript Concepts You Should Know

| Concept | One-Liner | Where You Used It |
|---|---|---|
| `async/await` | Syntactic sugar for Promises; makes async code look synchronous | Every Cloud Function, every API call |
| `Promise.all()` | Run multiple async operations in parallel | Heatmap period aggregations |
| Destructuring | `const { latitude, longitude } = location;` | Validation functions |
| Spread operator | `{ ...route, riskScore }` — merges objects | Enriching hotspot data |
| `Map` | Hash map with any key type, preserves insertion order | Grid cell grouping in heatmap |
| Arrow functions | `(x) => x * 2` — shorter function syntax | Array `.map()`, `.filter()` callbacks |
| Template literals | `` `Score: ${score}` `` — string interpolation | Log messages, notification bodies |
| Optional chaining | `incident?.location?.latitude` — safe property access | Handling missing data fields |

### 6.2 Firebase Concepts

| Concept | What It Is | Where You Used It |
|---|---|---|
| `onSnapshot` | Real-time listener — fires when data changes | Dashboard and mobile app |
| `onDocumentCreated` | Cloud Function trigger when a new Firestore doc is created | `validateIncident` |
| `onDocumentUpdated` | Cloud Function trigger when a Firestore doc changes | `sendNearbyIncidentAlert` |
| `onSchedule` | Cloud Function on a cron timer | `aggregateHeatmapData` |
| `onCall` | Cloud Function callable from client SDK | `generateAdminAISummary` |
| `onRequest` | Cloud Function as HTTP endpoint | `calculateRiskLevel`, analytics solution |
| `FieldValue.serverTimestamp()` | Server-side timestamp (avoids client clock issues) | Every write operation |
| `FieldValue.increment(1)` | Atomic counter increment | Reporter stats update |
| Security Rules `.diff()` | Compare before/after document to find changed fields | User profile update rules |

### 6.3 React Native Concepts

| Concept | Where You Used It |
|---|---|
| `useState`, `useEffect` | Every screen (state management, lifecycle) |
| `useNavigation` | Screen-to-screen navigation |
| `StyleSheet.create()` | Component styling |
| `FlatList` | Rendering lists of incidents, notifications |
| Expo Location API | Getting GPS coordinates for reports |
| Expo Camera/ImagePicker | Taking photos for evidence |
| `onSnapshot` listeners in `useEffect` | Real-time updates on StatusScreen |

---

## 7. Behavioral / Soft Skill Questions

### 7.1 "Tell me about a time you worked in a team."

**Answer:**

In ThreatTrack, I worked with a team of four. I was responsible for the fullstack development — mobile app, admin dashboard, backend, and AI integration. We used GitHub for version control and divided tasks by feature area. When team members had blockers (like difficulty with Firebase Auth), I pair-programmed with them to get them unblocked. The biggest team challenge was coordinating the mobile-side and web-side UI to handle the same Firestore data model consistently.

### 7.2 "How do you handle tight deadlines?"

**Answer:**

I prioritize ruthlessly. During our capstone, we had a hard demo deadline. I listed every feature as "must-have", "nice-to-have", or "cut". The must-haves were: report submission, SOS, admin review, heatmap, and AI summary. Nice-to-haves were: push notifications and analytics charts. I built the must-haves first and added polish afterward. We hit the deadline with all core features working.

### 7.3 "Describe a technical decision you'd make differently."

**Answer:**

In the Library Management System, I initially stored JWT secrets in the Django settings file, which ended up in the Git repo. I should have used environment variables from the start. In ThreatTrack, I learned from this — all API keys are stored in Firebase Secrets, never in source code. The Firebase config in `shared/firebase.js` contains only the project config (which is designed to be public), not the server-side secrets.

### 7.4 "Why do you want to be a software engineer?"

**Answer:**

I genuinely enjoy building things that solve real problems. ThreatTrack started as a school project, but it addresses a real gap in how communities report safety concerns. Road Rumble started as a game jam but ended up winning an award. Every project I've built has taught me something new — async programming, security patterns, AI integration, game physics. I want a career where I keep learning while building things that matter.

---

## 8. Quick Cheat Sheet

### System Architecture in One Sentence
> ThreatTrack is a React Native mobile app + HTML/JS admin dashboard connected via Firebase (Auth, Firestore, Storage, Cloud Functions), with Google Gemini and OpenAI providing AI-powered hotspot analysis for admin decision support.

### AI Integration in One Sentence
> Cloud Functions aggregate anonymous incident statistics, send them to Gemini/OpenAI with a structured JSON schema, receive back prioritized hotspot recommendations, and save them for admin review — the AI never sees personal data or makes final decisions.

### Key Numbers to Remember

| Metric | Value |
|---|---|
| Verification score range | 0–100 |
| Auto-verify threshold | ≥ 80 |
| Auto-spam threshold | < 30 |
| Spam rate limit | > 5 reports/hour |
| Duplicate proximity | ~50 meters (0.0005°) |
| Heatmap grid size | ~111 meters (3 decimal places) |
| Heatmap weights | High=3, Medium=2, Low=1 |
| High risk threshold | ≥ 3 high severity OR ≥ 10 total in 7 days |
| Gemini temperature | 0.2 (low randomness) |
| Max incidents per AI request | 500 |
| Max hotspots per summary | 6 |
| Cloud Function timeout | 60 seconds |
| Old data cleanup | > 90 days |

### Firestore Collections Count: 7
`users`, `incidents`, `precincts`, `crime_statistics`, `notifications`, `ai_suggestion_summaries`, `audit_logs`

### Cloud Functions Count: 6
`validateIncident`, `calculateRiskLevel`, `aggregateHeatmapData`, `sendNearbyIncidentAlert`, `generateAdminAISummary`, `generateAnalyticsSolutionSummary`

### Tech Stack Summary
- **Mobile:** React Native, Expo, JavaScript
- **Web Admin:** HTML5, CSS3, JavaScript, Vite
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **AI:** Google Gemini API, OpenAI API
- **Maps:** Google Maps API
- **Game:** Unity, C#, JSON
- **Library System:** Python, Django, SQLite, Scikit-learn

---

## 9. Step-by-Step AI Implementation & Understanding APIs (Detailed)

This section walks you through **exactly** how the AI features were built, what an API is, how HTTP requests work, and every function in the pipeline — line by line.

---

### 9.1 What is an API? (Fundamentals)

**API** stands for **Application Programming Interface**. Think of it as a **waiter in a restaurant**:

- You (the client) don't walk into the kitchen yourself.
- You tell the waiter (API) what you want.
- The waiter goes to the kitchen (server), gets your food (data), and brings it back to you.

In code, an API is a **URL endpoint** that accepts requests and returns responses.

#### How an HTTP Request Works

Every API call has these parts:

```
┌──────────────────────────────────────────────────────────┐
│                     HTTP REQUEST                          │
│                                                          │
│  1. URL        → WHERE to send the request               │
│                  e.g., https://api.example.com/data       │
│                                                          │
│  2. METHOD     → WHAT action to perform                  │
│                  GET = read data                         │
│                  POST = send/create data                 │
│                  PUT = update data                       │
│                  DELETE = remove data                    │
│                                                          │
│  3. HEADERS    → METADATA about the request              │
│                  Content-Type: "application/json"        │
│                  Authorization: "Bearer YOUR_API_KEY"    │
│                                                          │
│  4. BODY       → The DATA you're sending                 │
│                  (only for POST/PUT, not GET)            │
│                  { "prompt": "Analyze this data..." }    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                    HTTP RESPONSE                          │
│                                                          │
│  1. STATUS CODE → Did it work?                           │
│                   200 = OK (success)                     │
│                   400 = Bad Request (your fault)         │
│                   401 = Unauthorized (bad API key)       │
│                   403 = Forbidden (no permission)        │
│                   404 = Not Found                        │
│                   429 = Too Many Requests (rate limit)   │
│                   500 = Server Error (their fault)       │
│                                                          │
│  2. BODY       → The DATA coming back                    │
│                  { "result": "Here's my analysis..." }   │
└──────────────────────────────────────────────────────────┘
```

#### The `fetch()` Function in JavaScript

`fetch()` is JavaScript's built-in way to make HTTP requests:

```javascript
// Basic GET request — reading data
const response = await fetch("https://api.example.com/users");
const data = await response.json(); // Parse JSON response body

// POST request — sending data
const response = await fetch("https://api.example.com/analyze", {
  method: "POST",                                    // Action: send data
  headers: {
    "Content-Type": "application/json",              // Tell server: "I'm sending JSON"
    "Authorization": "Bearer sk-abc123"              // Prove who I am
  },
  body: JSON.stringify({                             // Convert JS object → JSON string
    prompt: "Analyze this incident data",
    data: { incidents: 47, severity: "high" }
  })
});

if (!response.ok) {                                  // Check if request succeeded
  throw new Error(`HTTP ${response.status}`);        // e.g., "HTTP 401"
}

const result = await response.json();                // Parse the response
console.log(result);                                 // Use the result
```

**Key concepts:**
- `await` — Pauses execution until the network request finishes (since it takes time)
- `JSON.stringify()` — Converts a JavaScript object `{}` into a JSON text string `"{}"`
- `response.json()` — Converts the response text back into a JavaScript object
- `response.ok` — Boolean, `true` if status code is 200–299

---

### 9.2 What is a JSON Schema? (Why We Use One for AI)

A JSON Schema is a **contract** that defines what shape the data must have. It's like a form template — it says "this field must exist, it must be a string, and it can only be one of these values."

**Why we need this for AI:** Without a schema, the AI might return:
- Prose text instead of structured data
- Missing fields the dashboard needs
- Invalid values (e.g., risk level = "kinda bad" instead of "high")

Here is the actual schema we use for the Gemini AI Summary:

```javascript
// From generateAdminAISummary.js — this tells Gemini EXACTLY what to return
const AI_SUMMARY_SCHEMA = {
  type: "object",                              // The response must be a JSON object
  required: [                                  // These fields MUST exist
    "headline",
    "overallRisk",
    "executiveSummary",
    "priorityHotspots",
    "dataWarnings",
    "nextDataToCollect",
  ],
  properties: {
    headline: {
      type: "string",                          // Must be text
      description: "One short headline summarizing the hotspot situation.",
    },
    overallRisk: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],  // ONLY these 4 values allowed
    },
    priorityHotspots: {
      type: "array",                           // Must be a list
      maxItems: 5,                             // Maximum 5 hotspots
      items: {
        type: "object",                        // Each item is an object with:
        required: ["rank", "locationLabel", "riskLevel", "recommendedActions"],
        properties: {
          rank: { type: "integer" },           // 1, 2, 3...
          locationLabel: { type: "string" },   // "MacArthur Highway, Karuhatan"
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          recommendedActions: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              required: ["action", "owner", "urgency", "reason"],
              properties: {
                action: { type: "string" },    // "Increase patrol frequency"
                owner: {
                  type: "string",
                  enum: ["admin", "police", "barangay", "community", "system"],
                },
                urgency: {
                  type: "string",
                  enum: ["today", "this_week", "monitor"],
                },
                reason: { type: "string" },    // "3 robbery reports at night"
              },
            },
          },
          confidence: {
            type: "number",
            minimum: 0,                        // 0.0 to 1.0
            maximum: 1,
          },
        },
      },
    },
    dataWarnings: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },               // e.g., "Most reports lack photos"
    },
  },
};
```

**When we send this schema to Gemini, we're saying:** "You MUST return JSON in exactly this shape. If the field says `enum: ['high', 'medium', 'low']`, you can ONLY use those exact values."

---

### 9.3 AI Pipeline #1 — Gemini Admin Summary (Cloud Function)

This is the **server-side** AI pipeline. It runs inside a Firebase Cloud Function, meaning it executes on Google's servers — not in the user's browser.

#### Step 1: Admin Triggers the Function

The admin dashboard calls the Cloud Function using Firebase's `httpsCallable`:

```javascript
// Dashboard side (simplified) — what happens when admin clicks a button
const generateSummary = httpsCallable(functions, "generateAdminAISummary");
const result = await generateSummary({ range: "30d" }); // Send time range filter
```

Firebase's `httpsCallable` automatically:
- Attaches the admin's auth token (so the server knows WHO is calling)
- Sends the request to the Cloud Function URL
- Handles CORS (cross-origin) automatically

#### Step 2: Cloud Function Verifies the Admin

```javascript
// File: functions/src/generateAdminAISummary.js (lines 149-156)
module.exports = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 60, memory: "512MiB" },
  async (request) => {
    // Step 2a: Check if user is logged in
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    // Step 2b: Check if user has admin role in Firestore
    const db = admin.firestore();
    await assertAdminAccess(db, uid);
    // ...
  }
);

// The role check function
async function assertAdminAccess(db, uid) {
  const snap = await db.collection("users").doc(uid).get();   // Read user doc
  const role = normalizeRole(snap.data() && snap.data().role); // Get their role
  if (!ADMIN_ROLES.has(role)) {                                // Check if admin
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

// ADMIN_ROLES = admin, moderator, barangay, barangay_admin, police, police_admin
```

**Why this matters:** If someone somehow calls this function without being an admin, it rejects them immediately. The AI API key is never exposed.

#### Step 3: Normalize the Filters

```javascript
// File: generateAdminAISummary.js (lines 243-260)
function normalizeFilters(data) {
  // Only allow these time ranges — prevents injection attacks
  const range = ["7d", "30d", "90d", "all"].includes(data.range) 
    ? data.range 
    : "30d";  // Default to 30 days
  
  // Convert range string to actual number of days
  const days = range === "7d" ? 7 
    : range === "90d" ? 90 
    : range === "all" ? null 
    : 30;
  
  // Calculate the start and end dates
  const endDate = new Date();  // Now
  const startDate = days 
    ? new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)  // days ago
    : null;  // "all" means no start date limit

  return { range, days, startDate, endDate };
}
```

**Why this matters:** We validate the input strictly. Even if someone sends `range: "DROP TABLE"`, we default to "30d".

#### Step 4: Load Incidents from Firestore

```javascript
// File: generateAdminAISummary.js (lines 262-289)
async function loadIncidentRows(db, filters) {
  let ref = db.collection("incidents");  // Start with the incidents collection
  
  if (filters.startDate) {
    ref = ref
      .where("timestamp", ">=", 
        admin.firestore.Timestamp.fromDate(filters.startDate))  // After start date
      .orderBy("timestamp", "desc");  // Newest first
  } else {
    ref = ref.orderBy("timestamp", "desc");
  }

  const snap = await ref.limit(MAX_INCIDENTS).get();  // MAX_INCIDENTS = 500
  
  return snap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() || {},
      date: toDate(doc.data().timestamp) ||   // Try timestamp field
            toDate(doc.data().reportedAt) ||   // Fallback to reportedAt
            toDate(doc.data().clientTimestamp), // Last resort
    }))
    .filter((row) => {
      // Only include visible statuses (not spam, not rejected)
      const status = normalizeText(row.data.status).toLowerCase();
      return !status || VISIBLE_STATUSES.has(status);
    });
}
```

**What's happening:** We read up to 500 recent incidents from Firestore, filter out spam/rejected ones, and normalize the timestamp format (because Firestore timestamps have a special format).

#### Step 5: Build the Analytics Payload (Data Aggregation)

This is where raw incident data gets converted into **aggregate statistics** that are safe to send to AI:

```javascript
// File: generateAdminAISummary.js (lines 313-356)
function buildAnalyticsPayload(rows, precincts, filters) {
  const severityCounts = { high: 0, medium: 0, low: 0 };
  const statusCounts = {};
  const typeCounts = {};
  let openIncidents = 0;
  let withCoordinates = 0;

  // Count everything
  rows.forEach((row) => {
    const severity = normalizeSeverity(row.data.severity);  // "high"/"medium"/"low"
    const status = normalizeText(row.data.status || "unknown").toLowerCase();
    const type = normalizeText(row.data.type || "unknown").toLowerCase();
    
    severityCounts[severity] += 1;  // Count by severity
    statusCounts[status] = (statusCounts[status] || 0) + 1;  // Count by status
    typeCounts[type] = (typeCounts[type] || 0) + 1;  // Count by incident type
    
    if (status === "pending" || status === "under_review") {
      openIncidents += 1;  // How many still need attention
    }
    if (hasCoordinates(row.data.location)) {
      withCoordinates += 1;  // How many have GPS data
    }
  });

  // Build geographic hotspots (more detail below)
  const hotspots = buildHotspots(rows, precincts, filters);

  // Return the FINAL payload that goes to AI
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
      severityBreakdown: severityCounts,    // { high: 8, medium: 22, low: 17 }
      statusBreakdown: sortObjectByValue(statusCounts),
      typeBreakdown: sortObjectByValue(typeCounts),
    },
    hotspots,  // Array of geographic clusters
  };
}
```

**The key insight:** We NEVER send individual incident descriptions, reporter names, or personal data. We send **counts only**: "8 high severity incidents in this grid area."

#### Step 6: Build Geographic Hotspots

This groups incidents by location to find "hot" areas:

```javascript
// File: generateAdminAISummary.js (lines 358-429) — simplified
function buildHotspots(rows, precincts, filters) {
  const grouped = new Map();  // Key → hotspot data

  rows.forEach((row) => {
    const location = row.data.location || {};
    
    // Create a location key from street + barangay + grid coordinates
    const gridKey = getGridKey(location);    // "14.700_120.967"
    const street = getStreet(row.data);       // "MacArthur Highway"
    const barangay = getBarangay(row.data);   // "Karuhatan"
    const key = `${street}|${barangay}|${gridKey}`;
    
    if (!key) return;  // Skip if no location data

    // Create hotspot entry if first time seeing this location
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: buildLocationLabel(street, barangay, gridKey),
        reportCount: 0,
        weightedScore: 0,
        severityBreakdown: { high: 0, medium: 0, low: 0 },
        typeBreakdown: {},
        hourCounts: Array.from({ length: 24 }, () => 0),  // 24-hour array [0,0,0,...0]
        sosReports: 0,
      });
    }

    // Add this incident to its hotspot
    const hotspot = grouped.get(key);
    const severity = normalizeSeverity(row.data.severity);
    
    hotspot.reportCount += 1;
    hotspot.severityBreakdown[severity] += 1;
    
    // Weighted score: high=3, medium=2, low=1, SOS=+3 bonus
    hotspot.weightedScore += severity === "high" ? 3 
      : severity === "medium" ? 2 : 1;
    
    if (row.data.isSOSReport === true) {
      hotspot.sosReports += 1;
      hotspot.weightedScore += 3;  // SOS gets extra weight
    }
    
    // Track what hour incidents happen (for peak hour analysis)
    const hour = getPhtHour(row.date);  // Convert to Philippine timezone
    if (hour != null) hotspot.hourCounts[hour] += 1;
  });

  // Sort by weighted score (worst first) and return top 6
  return Array.from(grouped.values())
    .map((hotspot) => enrichHotspot(hotspot, precincts))  // Add nearest precinct
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, MAX_HOTSPOTS)  // Top 6 only
    .map((hotspot, index) => ({ rank: index + 1, ...hotspot }));
}
```

**Helper functions used:**

```javascript
// Round GPS to 3 decimal places (~111 meters) to create grid cells
function getGridKey(location) {
  if (!hasCoordinates(location)) return "";
  return `${Number(location.latitude).toFixed(3)}_${Number(location.longitude).toFixed(3)}`;
}

// Convert timestamp to Philippine timezone hour (0-23)
function getPhtHour(date) {
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",        // Philippine timezone
    hour: "2-digit",
    hour12: false,                  // 24-hour format
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour % 24 : null;
}

// Calculate distance between two GPS points using the Haversine formula
function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;                   // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find which police precinct is closest to a hotspot
function findNearestPrecinct(center, precincts) {
  if (!hasCoordinates(center) || !precincts.length) return "";
  let best = null;
  precincts.forEach((precinct) => {
    const distance = haversineKm(
      center.latitude, center.longitude,
      precinct.latitude, precinct.longitude
    );
    if (!best || distance < best.distance) {
      best = { ...precinct, distance };
    }
  });
  return best ? `${best.name} (${best.distance.toFixed(1)} km)` : "";
}
```

#### Step 7: Build the Prompt for Gemini

The prompt is what we actually send to Gemini. It combines instructions with the data:

```javascript
// File: generateAdminAISummary.js (lines 498-518)
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
    JSON.stringify(analyticsPayload),  // The stats we built in Step 5-6
  ].join("\n");
}
```

**Why this prompt works:**
1. **Role assignment** — "You are an analyst assistant" — sets the AI's persona
2. **Safety guardrails** — "Do not identify private people" — prevents harmful output
3. **Clear output format** — "Return only JSON matching the schema" — forces structured data
4. **Data attachment** — The aggregated (not raw) analytics data is appended at the end

#### Step 8: Call the Gemini API

```javascript
// File: generateAdminAISummary.js (lines 451-496)
async function callGemini(apiKey, analyticsPayload) {
  const prompt = buildGeminiPrompt(analyticsPayload);
  
  // Build the request body
  const body = {
    contents: [
      {
        parts: [{ text: prompt }],  // The prompt text goes here
      },
    ],
    generationConfig: {
      temperature: 0.2,             // 0.0 = very deterministic, 1.0 = very creative
                                    // We use 0.2 for consistency (same input → same output)
      maxOutputTokens: 2500,        // Cap the response length (controls cost)
      responseMimeType: "application/json",  // FORCE JSON output (not prose)
      responseJsonSchema: AI_SUMMARY_SCHEMA, // The schema from Step 9.2
    },
  };

  // Make the HTTP POST request to Gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    //  ↑ URL pattern: base_url/models/MODEL_NAME:generateContent
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",   // Sending JSON
        "X-goog-api-key": apiKey,             // API key in header (not URL params!)
      },
      body: JSON.stringify(body),             // Convert to JSON string
    }
  );

  // Parse the response
  const json = await res.json().catch(() => null);  // Safely parse (might fail)
  
  if (!res.ok) {
    // If request failed, extract error message
    const detail = json && json.error && json.error.message
      ? json.error.message
      : `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${detail}`);
  }

  // Extract the text from Gemini's response structure
  const text = extractGeminiText(json);
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    summary: JSON.parse(stripJson(text)),           // Parse JSON from text
    usage: normalizeGeminiUsage(json.usageMetadata), // Track token usage
  };
}
```

**The Gemini API response structure looks like:**

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "{ \"headline\": \"Theft concentration...\", ... }"
          }
        ]
      }
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 1250,
    "candidatesTokenCount": 800,
    "totalTokenCount": 2050
  }
}
```

**Helper functions for parsing:**

```javascript
// Extract the text from the nested response structure
function extractGeminiText(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text || "")
    .join("")
    .trim();
}

// Sometimes AI wraps JSON in markdown ```json ... ``` blocks — strip that
function stripJson(text) {
  const trimmed = String(text || "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}
```

#### Step 9: Normalize and Validate the AI Output

We never trust AI output blindly. Every field is validated and capped:

```javascript
// File: generateAdminAISummary.js (lines 562-591)
function normalizeSummary(value, analyticsPayload) {
  const summary = value && typeof value === "object" ? value : {};

  return {
    headline: normalizeText(
      summary.headline || "AI recommendation summary...",
      160  // Max 160 characters
    ),
    overallRisk: normalizeRisk(summary.overallRisk),  // Must be low/medium/high/critical
    executiveSummary: normalizeText(summary.executiveSummary, 900),
    priorityHotspots: (summary.priorityHotspots || [])
      .slice(0, 5)  // Max 5 hotspots
      .map((hotspot, index) => normalizeHotspotSummary(hotspot, index)),
    dataWarnings: normalizeStringArray(summary.dataWarnings, 5, 220),
    nextDataToCollect: normalizeStringArray(summary.nextDataToCollect, 5, 220),
    basedOn: {
      totalIncidents: analyticsPayload.overallStats.totalIncidents,
      hotspotCount: analyticsPayload.hotspots.length,
      timeRange: analyticsPayload.timeRange.label,
    },
  };
}

// Validate risk is one of allowed values — default to "medium" if garbage
function normalizeRisk(value) {
  const risk = normalizeText(value).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(risk)) return risk;
  return "medium";  // Safe default
}

// Truncate text and clean whitespace
function normalizeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/\s+/g, " ")  // Collapse multiple spaces
    .trim()
    .slice(0, maxLength);  // Hard character limit
}

// Clamp number within range
function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));  // e.g., confidence 0.0-1.0
}
```

**Why this matters:** If Gemini returns `overallRisk: "EXTREMELY DANGEROUS!!!"`, our code converts it to `"medium"` (the default). The dashboard never crashes from bad AI output.

#### Step 10: Save to Firestore for Audit

Every AI generation is saved to the `ai_suggestion_summaries` collection:

```javascript
// File: generateAdminAISummary.js (lines 520-560)
async function saveSummary(db, data) {
  // Hash the input stats so we can detect if same data was analyzed twice
  const inputStatsHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(data.analyticsPayload))
    .digest("hex");
  
  // Estimate the cost of this API call
  const estimatedCostUsd = estimateGeminiFlashCost(data.usage);

  // Save to Firestore
  const ref = await db.collection("ai_suggestion_summaries").add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: data.uid,              // Which admin requested this
    provider: "gemini",
    model: GEMINI_MODEL,              // "gemini-flash-latest"
    source: "gemini",
    timeRange: data.filters.range,    // "7d", "30d", "90d", "all"
    inputStatsHash,                   // SHA-256 hash of the input
    summary: data.summary,            // The AI's output
    usage: {
      ...data.usage,
      estimatedCostUsd,               // e.g., 0.000832
    },
    review: {
      status: "draft",               // Admin hasn't approved it yet
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: "",
    },
  });

  return { id: ref.id };
}

// Cost estimation for Gemini Flash
function estimateGeminiFlashCost(usage) {
  if (!usage) return null;
  const input = Number(usage.promptTokenCount);
  const output = Number(usage.candidatesTokenCount);
  // Gemini Flash pricing: $0.30 per million input tokens, $2.50 per million output tokens
  const inputCost = (input || 0) * 0.30 / 1000000;
  const outputCost = (output || 0) * 2.50 / 1000000;
  return Number((inputCost + outputCost).toFixed(6));
}
```

**What an admin can see after generation:**
- Who generated it (their user ID)
- When it was generated
- What data it was based on (incident count, hotspot count, time range)
- The AI's full output
- How many tokens were used and the estimated cost
- Review status (draft → approved/rejected)

#### Step 11: Return Result to Dashboard

```javascript
// File: generateAdminAISummary.js (lines 216-226)
return {
  id: saved.id,                        // Firestore document ID
  provider: "gemini",                  // Which AI service
  model: GEMINI_MODEL,                 // "gemini-flash-latest"
  source: "gemini",
  usage: geminiResult.usage,           // Token counts
  analytics: analyticsPayload,         // The data that was analyzed
  summary,                             // The AI's recommendations
};
```

The dashboard receives this and renders the hotspot cards, recommendations, and risk levels.

---

### 9.4 AI Pipeline #2 — OpenAI Analytics Solution (HTTP Endpoint)

This is the **second** AI service. It's simpler — it takes pre-processed hotspot evidence from the dashboard and asks OpenAI to write clearer action summaries.

#### Key Difference from Gemini Pipeline

| Aspect | Gemini (Pipeline #1) | OpenAI (Pipeline #2) |
|---|---|---|
| Trigger | `onCall` (Firebase callable) | `onRequest` (HTTP endpoint) |
| Auth method | Firebase SDK auto-attaches token | Bearer token in Authorization header |
| Input | Raw Firestore query → Cloud Function aggregates | Dashboard pre-aggregates → sends ready data |
| Fallback | Error if AI fails | **Rule-based fallback** if AI fails |
| Output storage | Saved to `ai_suggestion_summaries` | Returned directly (not saved) |

#### The Fallback System (When AI is Unavailable)

This is a key design pattern — the system works **even without AI**:

```javascript
// File: generateAnalyticsSolutionSummary.js (lines 183-208)

// If OpenAI key is not configured, use deterministic rules instead
const apiKey = openAiApiKey.value() || process.env.OPENAI_API_KEY;

if (!apiKey) {
  // NO AI — return rule-based summaries
  res.json({
    success: true,
    source: "rule_based_fallback",
    configured: false,
    summaries: fallback,            // Deterministic summaries (no AI involved)
  });
  return;
}

// Rule-based fallback generator
function buildFallbackSummaries(context) {
  return context.hotspots.map((hotspot) => {
    // Build summary from pure rules — no AI needed
    const pattern = hotspot.dominantTypes.length
      ? humanize(hotspot.dominantTypes.join(", "))
      : "mixed incident pattern";
    
    const actionList = hotspot.actions
      .map((action) => action.title)
      .filter(Boolean)
      .slice(0, 4);

    return {
      area: hotspot.area,
      summary: `${hotspot.area} shows a ${hotspot.priority} priority ${pattern} ` +
               `hotspot with ${hotspot.totalReports} report(s) in ${context.range}.`,
      suggestedSolution: actionList.length
        ? `Recommended focus: ${actionList.join("; ")}.`
        : "Continue monitoring and verify new reports before escalation.",
      confidenceNote: "Generated from deterministic hotspot rules.",
    };
  });
}
```

**Why fallback matters:** If OpenAI is down, rate-limited, or the API key expires, the admin still gets useful recommendations. The system degrades gracefully instead of showing an error.

#### The Merge Strategy

When OpenAI IS available, the AI output is merged with the fallback:

```javascript
// File: generateAnalyticsSolutionSummary.js (lines 305-323)
function mergeWithFallback(aiSummaries, fallback) {
  return fallback.map((item) => {
    // Try to find a matching AI summary for this area
    const ai = aiSummaries.find((summary) =>
      String(summary?.area || "").toLowerCase() === item.area.toLowerCase()
    );
    
    // Use AI text if available, otherwise keep fallback text
    return {
      area: item.area,
      summary: safeText(ai?.summary || item.summary, 700),
      suggestedSolution: safeText(ai?.suggestedSolution || item.suggestedSolution, 700),
      confidenceNote: safeText(ai?.confidenceNote || item.confidenceNote, 220),
    };
  });
}
```

**The pattern:** AI enhances the output, but the fallback provides the safety net.

---

### 9.5 AI Pipeline #3 — Dashboard Direct Gemini Call (Client-Side)

There's a **third** AI integration — the dashboard can call Gemini directly for **per-hotspot action plans**. This is used in the analytics page when admin clicks "Generate Action Plan" on a specific hotspot card.

#### How it works:

```javascript
// File: web-admin/js/analytics.js (lines 1560-1589)
async function handleGenerateHotspotAi(aiId, button) {
  const solution = latestSolutionById.get(String(aiId));  // Get hotspot data
  const output = document.getElementById(`analytics-ai-hotspot-${aiId}`);
  
  // Step 1: Get the Gemini API key (prompted from admin on first use)
  const key = getGeminiDemoKey();
  if (!key) {
    output.innerHTML = '<p class="analytics-ai-error">No Gemini key provided.</p>';
    return;
  }

  // Step 2: Show loading state
  setHotspotAiButtonLoading(button, true);
  output.innerHTML = renderHotspotAiLoading(solution);

  try {
    // Step 3: Call Gemini API directly from the browser
    const result = await generateHotspotAiPlan(solution, key);
    
    // Step 4: Cache the result in sessionStorage (avoids re-calling for same data)
    cacheHotspotAiPlan(solution, result);
    
    // Step 5: Render the AI plan in the dashboard
    output.innerHTML = renderHotspotAiPlan(result.summary, result.usage);
  } catch (error) {
    // Step 6: Show error, clear bad API key
    console.error("[analytics] hotspot Gemini plan", error);
    localStorage.removeItem(GEMINI_DEMO_KEY_STORAGE);  // Clear bad key
    output.innerHTML = `<div class="analytics-ai-error" role="alert">
      <strong>AI tailoring failed</strong>
      <p>${escapeHtml(error?.message)}</p>
    </div>`;
  } finally {
    setHotspotAiButtonLoading(button, false);
  }
}
```

#### The API Key Handling (Demo Mode)

For the local demo, the API key is prompted from the admin and stored in `localStorage`:

```javascript
// File: web-admin/js/analytics.js (lines 1599-1614)
function getGeminiDemoKey() {
  // Check if key is already saved
  const cached = localStorage.getItem(GEMINI_DEMO_KEY_STORAGE);
  if (cached) return cached;

  // Prompt admin to paste their Gemini API key
  const message = [
    "Local demo mode: paste the Gemini API key.",
    "",
    "The key will be remembered in this browser for the local demo.",
    "It is not written to the repository.",
  ].join("\n");
  
  const key = window.prompt(message);
  const trimmed = String(key || "").trim();
  if (!trimmed) return "";
  
  localStorage.setItem(GEMINI_DEMO_KEY_STORAGE, trimmed);
  return trimmed;
}
```

> **Important note for interviews:** This is demo-mode only. In production, the API key would be in Firebase Secrets and the call would go through a Cloud Function instead.

#### The Per-Hotspot Prompt (More Detailed Than Cloud Function)

The dashboard builds a richer prompt with operational reference data:

```javascript
// File: web-admin/js/analytics.js (lines 1703-1747) — simplified
function buildHotspotGeminiPrompt(solution) {
  const payload = {
    city: "Valenzuela City",
    timeRange: rangeLabel(currentAnalyticsRange()),  // "last 30 days"
    hotspot: {
      area: solution.area,                  // "MacArthur Highway, Karuhatan"
      priority: solution.priority,          // "high"
      dominantCrimeTypes: solution.dominantTypes,  // ["robbery_holdup", "theft_snatching"]
      totalReports: solution.totalReports,  // 12
      weightedScore: solution.weightedScore,// 28
      severityBreakdown: solution.severityBreakdown,
      sosReports: solution.sosReports,
      peakHours: solution.peakHours.map(hourLabel),  // ["10 PM", "11 PM"]
      evidence: solution.evidence,          // "12 reports, 4 high severity, peak 10 PM"
    },
    ruleBasedRecommendations: solution.actions.map((action) => ({
      action: action.title,                 // "Install or repair street lights"
      reason: action.reason,
      timeframe: action.timeframe,
      basis: action.source || "rule",
    })),
    operationalReference: buildHotspotOperationalReference(solution),
  };

  return [
    "You are the AI assistant for ThreatTrack admin analytics.",
    "Create a tailored prevention and response plan for ONE hotspot only.",
    "Use the analytics evidence and the rule-based recommendations as your basis.",
    "Keep each JSON string concise to avoid truncated output.",
    "Use cautious wording such as 'reported data suggests'.",
    "Do not identify private people, reporters, victims, or suspects.",
    "Do not recommend vigilante action.",
    "Return only JSON matching the schema.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}
```

#### The Hotspot AI Output Schema

The dashboard uses a different schema focused on actionable plans:

```javascript
// File: web-admin/js/analytics.js (lines 19-58)
const HOTSPOT_AI_SCHEMA = {
  type: "object",
  required: [
    "hotspotTitle",          // "Theft & Robbery Hotspot: MacArthur Highway"
    "riskLevel",             // "high"
    "riskSummary",           // "This area has seen 12 reports in 30 days..."
    "crimePattern",          // "Primarily robbery at night near commercial areas"
    "tailoredSolution",      // "Deploy mobile patrol units 9PM-1AM..."
    "priorityActions",       // Array of concrete steps
    "publicAdvisoryDraft",   // "Residents near MacArthur Highway are advised..."
    "adminNotes",            // "Verify reports before allocating resources..."
    "confidenceNote",        // "Based on 12 reports, moderate confidence..."
  ],
  properties: {
    priorityActions: {
      type: "array",
      items: {
        type: "object",
        required: ["action", "why", "implementation", "timeframe"],
        properties: {
          action: { type: "string" },         // WHAT to do
          why: { type: "string" },            // WHY to do it
          implementation: { type: "string" }, // HOW to do it
          timeframe: { type: "string" },      // WHEN to do it
        },
      },
    },
    // ...other fields
  },
};
```

#### Session Caching (Avoid Re-Calling API)

The dashboard caches AI results in `sessionStorage` to avoid wasting API calls:

```javascript
// File: web-admin/js/analytics.js (lines 1511-1558)

// Generate a unique key based on the hotspot data
function hotspotAiSessionKey(solution) {
  const signature = {
    range: currentAnalyticsRange(),
    area: solution.area,
    priority: solution.priority,
    totalReports: solution.totalReports,
    weightedScore: solution.weightedScore,
    // ...all the fields that would change the AI output
  };
  return `tt_hotspot_ai_plan:${currentAdminSessionId}:${hashString(JSON.stringify(signature))}`;
}

// Save result to sessionStorage (survives page refreshes within same tab)
function cacheHotspotAiPlan(solution, result) {
  const key = hotspotAiSessionKey(solution);
  sessionStorage.setItem(key, JSON.stringify({
    summary: result.summary,
    usage: result.usage || null,
    savedAt: new Date().toISOString(),
  }));
}

// Check if we already have a cached result
function getCachedHotspotAiPlan(solution) {
  const key = hotspotAiSessionKey(solution);
  const cached = JSON.parse(sessionStorage.getItem(key) || "null");
  return cached?.summary ? cached : null;
}
```

**Why cache?** If the admin switches between dashboard tabs and comes back, the AI plan is instantly restored from sessionStorage instead of making a new API call (which costs money and takes 3-5 seconds).

---

### 9.6 Understanding `temperature` — The Randomness Dial

This is a common interview question. Temperature controls how "creative" vs "predictable" the AI is:

```
temperature: 0.0 → VERY deterministic
  Same input always gives (nearly) same output.
  Good for: data analysis, structured output, classification.

temperature: 0.5 → BALANCED
  Some variety but mostly consistent.
  Good for: summarization, moderate creativity.

temperature: 1.0 → VERY creative
  Highly varied outputs each time.
  Good for: creative writing, brainstorming.

temperature: 2.0 → CHAOTIC
  Almost random. Not useful for structured tasks.
```

**In ThreatTrack:**
- Cloud Function uses `temperature: 0.2` — we want consistent, reliable recommendations
- Dashboard uses `temperature: 0.15` — even more deterministic for per-hotspot plans

---

### 9.7 Understanding Tokens — How AI Billing Works

AI models don't read words — they read **tokens**. A token is roughly ¾ of a word.

```
"The quick brown fox" = 4 words = ~5 tokens
"MacArthur Highway, Karuhatan" = 3 words = ~6 tokens (complex words = more tokens)
```

**Billing is based on tokens:**
- **Input tokens** = what you SEND to the AI (your prompt + data)
- **Output tokens** = what the AI RETURNS (the summary)
- Different models charge different prices

**ThreatTrack cost tracking:**

```javascript
function estimateGeminiFlashCost(usage) {
  const input = usage.promptTokenCount;      // e.g., 1250 tokens
  const output = usage.candidatesTokenCount; // e.g., 800 tokens
  
  const inputCost = input * 0.30 / 1000000;  // $0.30 per 1M input tokens
  const outputCost = output * 2.50 / 1000000; // $2.50 per 1M output tokens
  
  // Example: (1250 × 0.30 + 800 × 2.50) / 1,000,000
  //        = (375 + 2000) / 1,000,000
  //        = $0.002375 per request (less than 1 cent!)
  return inputCost + outputCost;
}
```

---

### 9.8 The Full Request-Response Lifecycle (Summary Diagram)

```
ADMIN CLICKS "Generate AI Summary"
         │
         ▼
┌─────── DASHBOARD (browser) ─────────────────────────────────┐
│  1. httpsCallable("generateAdminAISummary") called           │
│  2. Firebase SDK attaches admin's auth token automatically   │
│  3. Request sent to Cloud Function URL                       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─────── CLOUD FUNCTION (Google server) ──────────────────────┐
│  4. Verify auth token → extract uid                          │
│  5. Check Firestore: is this uid an admin?                   │
│  6. Read filters (range = "30d") → normalize                 │
│  7. Query Firestore: get incidents from last 30 days         │
│  8. Filter out spam/rejected incidents                       │
│  9. Count by severity, type, status                          │
│ 10. Group by location → build geographic hotspots            │
│ 11. Calculate weighted scores, peak hours, trends            │
│ 12. Find nearest precinct for each hotspot (Haversine)       │
│ 13. Build analytics payload (aggregate stats only)           │
│ 14. Build prompt text (instructions + payload JSON)          │
│ 15. Read GEMINI_API_KEY from Firebase Secrets                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─────── GEMINI API (Google AI server) ───────────────────────┐
│ 16. Receive prompt + JSON schema                             │
│ 17. Analyze the incident patterns                            │
│ 18. Generate structured JSON matching schema                 │
│ 19. Return response with text + token usage metadata         │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─────── CLOUD FUNCTION (continued) ──────────────────────────┐
│ 20. Parse Gemini response → extract text                     │
│ 21. Strip markdown fences if present (```json...```)         │
│ 22. JSON.parse the text into a JavaScript object             │
│ 23. Normalize every field (cap lengths, validate enums)      │
│ 24. Save to Firestore "ai_suggestion_summaries" collection   │
│     (with uid, timestamp, hash, token usage, cost estimate)  │
│ 25. Return result to dashboard                               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─────── DASHBOARD (browser) ─────────────────────────────────┐
│ 26. Receive the summary object                               │
│ 27. Render headline, risk level, hotspot cards               │
│ 28. Render recommended actions per hotspot                   │
│ 29. Render data warnings and next steps                      │
│ 30. Admin reviews and decides whether to act                 │
└──────────────────────────────────────────────────────────────┘
```

---

### 9.9 Common Interview Questions About This AI Implementation

#### Q: "Why not use AI directly from the mobile app?"

**A:** Three reasons:
1. **API key exposure** — If the key is in the mobile app bundle, anyone can decompile the APK and steal it.
2. **Cost control** — We can't control how many times users call the API. One user could drain our credits.
3. **Data safety** — The Cloud Function sanitizes data before sending to AI. The mobile app doesn't need AI access — only admins do.

#### Q: "What if Gemini returns garbage?"

**A:** Every field is normalized:
- `overallRisk: "SUPER DANGEROUS"` → becomes `"medium"` (default)
- `headline` longer than 160 chars → gets truncated
- `confidence: 5.7` → gets clamped to `1.0` (max)
- Missing fields → get default values
- Invalid JSON → caught by try/catch, error shown to admin

#### Q: "Is the AI always right?"

**A:** No, and we design for that:
- AI output is labeled as "decision support" — not final decisions
- Every summary is saved as "draft" status — admin must review
- The dashboard shows "Admin review needed" on every AI plan
- Data warnings tell the admin if the data quality is low
- The AI prompt explicitly says "Do not claim certainty"

#### Q: "How do you prevent prompt injection?"

**A:** The analytics payload is **pre-built server-side** from Firestore data. Users never write text that goes directly into the prompt. The incident descriptions are NOT included — only aggregated counts. Even if a user writes "ignore previous instructions" in their report description, it never reaches the AI.

#### Q: "How much does this cost?"

**A:** Each Gemini Flash request costs approximately **$0.002–$0.005** (less than 1 cent). At 100 requests per month, that's about **$0.20–$0.50/month**. We track the exact cost per request:

```javascript
// Logged in Firestore for every AI call
usage: {
  promptTokenCount: 1250,
  candidatesTokenCount: 800,
  totalTokenCount: 2050,
  estimatedCostUsd: 0.002375
}
```

---

### 9.10 API Key Security — Where Keys Live

| Environment | Where the Key Is | Who Can Access It |
|---|---|---|
| **Production Cloud Function** | Firebase Secrets (encrypted, server-only) | Only the Cloud Function runtime |
| **Local demo dashboard** | Admin pastes into `window.prompt()` → `localStorage` | Only the admin's browser |
| **Source code (Git repo)** | ❌ NEVER stored here | N/A |
| **Firebase config (shared/firebase.js)** | Only the project config (safe to expose) | Everyone — this is by design |

```javascript
// This IS safe to have in source code (Firebase is designed for this)
const firebaseConfig = {
  apiKey: "AIzaSyA2hk...",           // Firebase Web API key (NOT a secret)
  authDomain: "threattrackcap1...",
  projectId: "threattrackcap1",
};

// This is NOT in source code — it's in Firebase Secrets
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Only accessible inside Cloud Functions via: GEMINI_API_KEY.value()
```

**Interview-ready explanation:** Firebase Web API keys are designed to be public — security is enforced through Firestore security rules and Firebase Auth, not by hiding the key. But AI service keys (Gemini, OpenAI) are real secrets that grant pay-per-use access, so they MUST be hidden server-side.

---

> **Final tip:** In every answer, connect your experience to the role you're applying for. Don't just describe what you built — explain what you learned and how it makes you a better engineer.
