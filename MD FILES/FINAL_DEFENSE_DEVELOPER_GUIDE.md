# ThreatTrack Final Defense Guide

Your refresher for the system walkthrough and panel Q&A. Everything here was checked against the current code on Nov 10, 2026.

**How to use it:** Read Part 1 first. For each feature in Part 3, memorize the "Say this" box. Use the steps underneath when a panelist digs deeper.

---

## Part 1: Get these right first

Older files in `MD FILES` describe the design from earlier in the year. The system has changed since then. **Use this table if any older note disagrees.**

| Older notes say | What is true now |
|---|---|
| Cloud Functions validate each report and set its status | **No Cloud Functions are deployed** (confirmed with `firebase functions:list`). The project is on the free Spark plan. The `functions/` folder is written but not live. |
| Reports are automatically verified or marked spam | Reports stay `under_review` until **a human admin** acts. |
| Gemini rates each report's legitimacy | The live badge comes from a **rule-based scoring engine in the browser**. Gemini is used only for the hotspot action plan. |
| Photos go to Firebase Storage | Photos are compressed and saved in **Firestore**, in `incident_evidence/{incidentId}`, max 650 KB. |
| Remote push notifications reach users | Users get alerts **while the app is running**. Remote push needs a server, so it is not active. |
| The server creates admin notifications for routing | Routing happens **in the admin dashboard**, using the rules in section 3.3. |
| Admins approve or reject AI plans inside the system | The plan is a **draft**. It offers export and feedback, with no approve button. |

**How to say this confidently:**

> "We built the system to run fully on Firebase's free tier. The apps connect directly to Firestore, and Firestore Security Rules enforce what can be written. We also wrote Cloud Functions for server-side validation and AI, but they need the paid Blaze plan, so they are our deployment path for production."

---

## Part 2: The system in simple terms

### 30-second pitch

> "ThreatTrack is a public safety platform for Valenzuela City. Residents use a mobile app to report incidents or send an SOS with their live location. Police and barangay admins see those reports instantly on a web dashboard, assign the nearest station, and the resident is told help is on the way. The system also maps hotspots and uses AI to draft action plans, but humans make every final decision."

### The parts

| Part | Built with | Job |
|---|---|---|
| Mobile app | React Native, Expo | Reporting, SOS, map, precinct locator, status tracking |
| Web admin | HTML, CSS, JavaScript, Vite, hosted on Vercel | Alerts, incident review, dispatch, map, analytics, AI plans |
| Database | Cloud Firestore | Single source of truth, shared by both apps |
| Login | Firebase Authentication | Accounts and email verification |
| Security | Firestore Security Rules | Server-side checks on every read and write |
| Maps | React Native Maps on mobile, Leaflet on web | Pins, hotspots, heat layer |
| AI | Google Gemini API | Hotspot decision plan drafts only |

### The one idea that explains the whole system

**Both apps talk to the same Firestore database, and both use real-time listeners (`onSnapshot`).** A listener is an open connection that pushes changes as they happen.

- The resident writes a report, and the admin's listener receives it. No refresh is needed.
- The admin writes "responding", and the resident's listener receives it.

### Main Firestore collections

| Collection | Stores |
|---|---|
| `users` | Profiles, roles, account status, assigned barangay or substation |
| `incidents` | Every report and SOS, including status, location and responder |
| `incident_evidence` | Evidence photos, one document per incident |
| `notifications` | Messages such as "Help is on the way" |
| `precincts` | Admin-managed police precincts |
| `audit_logs` | Record of admin actions, which cannot be edited or deleted |
| `ai_knowledge`, `national_laws`, `ai_rules`, `ai_feedback` | Sources the AI uses for its plans |

### Admin roles

| Role | Scope | Main action on an alert |
|---|---|---|
| Head Police (HQ) | Whole city | **Assign Substation** |
| Substation Police | Own sector only | **Respond Now** |
| Barangay Admin | Own barangay only | **Dispatch Tanods / Action** |

**Pilot coverage:** 2 barangays (Balangkas, Mapulang Lupa) and 2 substations (Balangkas PCP 5, Mapulang Lupa PCP 10). Adding more means adding entries to the registry files in `shared/`.

---

## Part 3: Feature walkthroughs

### 3.1 SOS reporting

> **Say this:** "SOS is the fastest way to ask for help. The user holds the button for 3 seconds so it can't be pressed by accident. The app gets their GPS, they pick the emergency type, and it goes straight to the police. While the SOS is active and the app is open, their location keeps updating so responders can follow them, until they tap 'I Am Safe'."

**Step by step**

1. **Hold for 3 seconds.** Releasing early cancels it. This prevents pocket presses.
2. **Get location.** The app requests a fresh high-accuracy GPS fix and waits up to 10 seconds. If that fails, it uses the phone's last known location and marks it approximate. It never invents a location. With no location, the SOS is blocked.
3. **Choose details.** The user picks 1 of 10 emergency types and witness or victim. A description is optional, and quick-tap chips can fill it in.
4. **Check the account.** The user must be logged in, active, not suspended, and have accepted the false-report policy. Email must be verified, except on the first report (grace period).
5. **Save.** The report goes to `incidents` with `isSOSReport: true` and `liveStreamingActive: true`. Every SOS is high severity.
6. **Weak signal.** If the server doesn't confirm in 15 seconds, the app says the SOS is queued. Firestore sends it when the connection returns. A **Call 911** button is shown.
7. **Live tracking.** `HomeScreen` follows the user's GPS. To stay within free limits, it writes only when the user moves about 10 m or after 20 seconds. It keeps the last 15 points as a trail.
8. **End.** Tapping **I Am Safe Now** closes the SOS, and the admin's alert closes automatically.

**Files:** [SOSGatewayScreen.js](../mobile/screens/SOSGatewayScreen.js), [SOSReportScreen.js](../mobile/screens/SOSReportScreen.js), [HomeScreen.js](../mobile/screens/HomeScreen.js), [ActiveEmergencyModal.js](../mobile/components/ActiveEmergencyModal.js)

**Limit to admit:** live tracking works only while the app is open.

---

### 3.2 Regular incident reporting

> **Say this:** "For non-emergencies, the user fills in a guided form: type of incident, witness or victim, a description, an optional photo, and their GPS location. The system sets the severity from the incident type, so users can't exaggerate it. They can then follow their report's status live."

**Step by step**

1. The user selects a type, and **severity is set automatically**.
2. The user enters a description of at least 10 characters. Quick chips help them write it faster.
3. The photo is optional. It is compressed in steps until it fits 650 KB.
4. A confirmation dialog appears, then the same account checks as SOS run.
5. The report and photo are saved in **one atomic batch**, so both save or neither does. If only the photo fails, the user can send without it.
6. The report starts as `under_review`. The user tracks it on the Status screen.

**Severity by incident type**

| Severity | Types | Goes to |
|---|---|---|
| High | Robbery/Hold-up, Physical Assault, Domestic Violence, Illegal Weapons, Drug-Related Activity | Police |
| Medium | Theft/Snatching, Traffic Accident, Public Disturbance, Suspicious Activity | Barangay |
| Low | Vandalism/Property Damage | Barangay |

**Status path:** `under_review` → `verified` → `responding` → `done`. An admin can choose `rejected` instead, and must give a reason.

**Files:** [ReportIncidentScreen.js](../mobile/screens/ReportIncidentScreen.js), [StatusScreen.js](../mobile/screens/StatusScreen.js), [auth.js](../mobile/utils/auth.js)

---

### 3.3 How reports are routed to the admin

> **Say this:** "Routing answers two questions: is this for police or barangay, and which station or barangay covers it? SOS and high-severity reports go to police. Medium and low go to the barangay. Then the location decides the jurisdiction. The right admin gets a popup with a sound the moment the report is saved."

**Question 1: Police or barangay?** (`determineAlertAudience`)

1. SOS → **Police**, always.
2. High severity or high priority → **Police**.
3. Everything else → **Barangay**.

**Question 2: Who covers it?** (`hasIncidentAccess`)

| Admin | Sees the alert when |
|---|---|
| Head Police | Always, for police-level reports |
| Substation Police | The report falls in their sector |
| Barangay Admin | The report falls in their barangay |

The sector or barangay comes from the first available source: saved ID, barangay text, address text, then **nearest location by GPS** using the Haversine formula.

**What the admin sees**

1. Each admin page listens to the 30 newest incidents.
2. A matching report opens a popup showing type, location, nearest outpost, distance, ETA and a credibility rating.
3. Sounds differ: **siren** for SOS, **double beep** for high priority, **chime** for barangay.
4. Multiple alerts queue, oldest first. An admin reviewing a report is not interrupted, but hears a sound and sees a notice.
5. If the citizen moves 15 m or more, the popup updates live and shows "Citizen is currently in motion."

**After the admin acts**

| Action | Result |
|---|---|
| Assign / Respond | Status becomes `responding`, a responder is saved, and the resident gets "Help is on the way" |
| View Report | Opens full details |
| Dismiss | **Requires a reason and notes**, and is saved to the audit log |

HQ and the sector's substation get the alert at the same time, and whoever acts first handles it. When HQ assigns a case, the assigned station gets its own popup with sound and must press **Confirm Deployment**. Alerts wait in line, first in, first out, and the popup shows how many are waiting. An assigned case can't be dismissed, and it comes back until the station confirms it.

**The credibility badge (`incident-legitimacy.js`)**

It first checks for spam phrases, gibberish, and greetings. It then adds points:

| Signal | Points |
|---|---:|
| GPS inside Valenzuela | +20 |
| Address attached | +10 |
| Verified account (or +15 for a logged-in, unverified account) | +25 |
| Quick situational tag | +25 |
| Emergency keyword | +10 |
| Description of 35+ characters | +5 |
| Photo attached | +25 |
| SOS signal | +30 |
| Live GPS active | +15 |

**55 or more with a clean location = Verified Incident. 30 or more = Needs Verification. Lower = Suspected False / Spam.**

The badge is **advice only**. It never blocks or deletes a report, so a real emergency can't be silently dropped by a wrong score.

**Files:** [admin-sos-alerts.js](../web-admin/js/admin-sos-alerts.js), [admin-auth.js](../web-admin/js/admin-auth.js), [admin-response.js](../web-admin/js/admin-response.js), [incident-legitimacy.js](../web-admin/js/incident-legitimacy.js)

---

### 3.4 Hotspot mapping

> **Say this:** "Hotspots show where reports are concentrated. Residents see nearby danger areas on the mobile map, admins see a live map with markers and a heat layer, and the analytics page ranks the top areas by a transparent score. These show reported incidents, so they guide attention but aren't official crime statistics."

**There are three views, each with its own method.**

**A. Mobile map: clusters by distance**

1. Takes the 50 newest incidents, filtered to active statuses and the chosen period (24h, 7d or 30d, default 7d).
2. Joins each incident to the closest cluster within **120 m**. Otherwise it starts a new cluster.
3. Colors each cluster:

| Level | Condition | Base radius |
|---|---|---:|
| High | 5+ reports, or any high-severity report | 170 m |
| Medium | 2 to 4 reports | 130 m |
| Low | 1 report | 98 m |

The circle grows to cover the actual spread, up to 260 m.

**B. Admin map: markers and heat layer**

- Uses Leaflet with grouped markers, filtered by the admin's jurisdiction.
- The heat layer divides the map into grid cells, about 390 m at medium sensitivity. A cell needs at least **3 reports** to appear.
- Severity weights are high 1.0, medium 0.7, low 0.45.
- The heat layer is **off by default** and is enabled in Settings.

**C. Analytics: ranked hotspots**

Reports are grouped by **street or address text**.

```text
Weighted score = (High × 3) + (Medium × 2) + (Low × 1) + (SOS × 3)
```

| Priority | Any one of these |
|---|---|
| High | Score ≥ 12, or ≥ 8 reports, or ≥ 3 high severity, or ≥ 3 robberies, or ≥ 3 weapons reports |
| Medium | Score ≥ 6, or ≥ 3 reports, or ≥ 1 high severity |
| Low | Everything else |

A recommendation appears only with enough evidence: at least 3 reports, or 2 high-severity reports, or 1 SOS within 2 or more reports.

**Files:** [HomeScreen.js](../mobile/screens/HomeScreen.js), [admin-map.js](../web-admin/js/admin-map.js), [analytics.js](../web-admin/js/analytics.js)

---

### 3.5 Precinct locator

> **Say this:** "The app finds the police station nearest to the user's real GPS location and sorts the rest by distance. One tap opens Google Maps with directions. On the admin side, the same distance calculation helps choose which station to send."

**For residents**

1. Station list combines **15 built-in Valenzuela locations** (PCP 1 to 12, VCPS headquarters, Lawang Bato Base, Wawang Pulo PCP), the covered substations, and active precincts added by admins.
2. Duplicates are merged by matching code, ID or name, or when within 75 m of each other.
3. Distance is calculated with the **Haversine formula**, from the user's **real GPS fix** and never from the default map center.
4. The nearest station is highlighted, and the rest are sorted by distance.
5. Tapping navigate opens Google Maps directions.

**What is Haversine?** A formula for the shortest distance between two points on a sphere, using Earth's radius of 6,371 km. It is straight-line distance, so the road route is usually longer.

**For admins (dispatch ETA)**

The alert popup, incident details screen and mobile app all use the same time-of-day estimate, with a minimum of 5 minutes:

```text
Road distance = straight-line distance × route factor
ETA = dispatch delay + road travel time + intersection delay
```

| Time | Route factor | Speed | Dispatch delay |
|---|---:|---:|---:|
| Weekday rush (6–10 AM, 4–8 PM) | ×1.45 | 14 km/h | 4 min |
| Daytime (10 AM–4 PM) or evening (8–11 PM) | ×1.35 | 18 km/h | 3 min |
| Other hours | ×1.25 | 24 km/h | 3 min |

An intersection delay of 1 to 8 minutes is also added. This is an **estimate**, because no live traffic service is connected.

**Files:** [HomeScreen.js](../mobile/screens/HomeScreen.js), [valenzuelaPrecincts.js](../mobile/data/valenzuelaPrecincts.js), [substations.js](../shared/substations.js), [admin-response.js](../web-admin/js/admin-response.js)

---

### 3.6 AI-assisted decision plan

> **Say this:** "The decision plan is a one-page draft for authorities. Our code calculates every fact from the reports. A recommendation can only appear if it's on our approved list and a document in our knowledge base supports it. Gemini explains it in plain language and points to the supporting documents by ID. It doesn't decide staffing, schedules or assignments. Authorities do."

**What the admin sees**

Location, evidence level, what the reports show, how sure we are, recommendations with source badges, what we don't know, and links to the actual reports.

**Who does what**

| Code | Gemini |
|---|---|
| Counts, trends, time patterns, evidence level | Writes 3 to 5 short, everyday-English sentences explaining each recommendation |
| Which recommendations are allowed | Chooses from the allowed list |
| Retrieves sources and creates the badges | Returns source IDs only |
| Checks all of Gemini's output | Writes the same explanation in Filipino |

**Step by step**

1. **Count only valid reports.** Rejected, spam, deleted and false-alarm reports are left out. Admins see only hotspots in their jurisdiction.
2. **Set the evidence level:**

| Level | Condition | Result |
|---|---|---|
| Handle live case first | An SOS here is still active | No recommendations |
| Monitor | 1 to 2 reports | No recommendations |
| Verify reports | 3 or more reports, without the Consider Action evidence | Validation-type recommendations only |
| Consider action | 5+ reports, 2+ confirmed by an admin, clear time pattern | All supported recommendations |

3. **Retrieve sources for each recommendation.** It searches published knowledge, national laws and active rules. A recommendation with no matching source is removed.
4. **Ask Gemini.** It gets the facts, up to 15 shortened report narratives with phones and emails removed, the allowed recommendations, and their sources.
5. **Check the response.** A recommendation needs a valid source ID. Text is rejected if it has a number not in the data, a staffing count, an order such as "deploy," a legal reference in the sentence, or hard words such as "intimidation."
6. **Fallback.** If Gemini fails or its wording is rejected, code writes the reasoning from the same facts, in the same layout, and the source badges still apply.

**Why each plan is different:** recommendations use that hotspot's own counts, time pattern, trend, confirmed reports, SOS reports and details people mentioned. They also cover the second most common incident type, and are ranked by how well they fit the data.

**Two languages:** the English and Filipino toggle at the top of the section covers the whole AI Decision Support area. Each plan is prepared in both languages when generated, so switching is instant and doesn't call the AI again.

**"How sure are we?"** High needs 8+ reports, at least half confirmed, and 80% exact GPS. Moderate needs at least 5 reports with 2 confirmed, or 3 reports with 1 confirmed. Everything else is Low.

**What a badge means:** the recommendation is grounded in that document in our knowledge base. It doesn't mean the law orders that action.

**Files:** [decision-plan.js](../web-admin/js/decision-plan.js), [analytics.js](../web-admin/js/analytics.js), [ai-management.js](../web-admin/js/ai-management.js)

---

## Part 4: Suggested walkthrough order

Have one phone logged in as a resident, and the browser logged in as Head Police. Keep a Barangay Admin login ready.

**Important:** a report goes to whichever pilot barangay is closest to the phone. Find out which one that is at the venue, and use **that** barangay's admin account in step 4.

| # | Show | Say |
|---|---|---|
| 1 | Mobile home map | "Residents see hotspots and nearby stations." |
| 2 | Precinct locator, then Google Maps | "Nearest station from real GPS, with directions." |
| 3 | Regular report (Public Disturbance) | "Severity is automatic. Medium goes to the barangay." |
| 4 | Barangay login shows the alert and chime | "Routed by severity and location." |
| 5 | SOS: hold 3 seconds, then send | "The hold prevents accidental alerts." |
| 6 | Dashboard siren popup | "Instant, with no refresh. Note the distance, ETA and credibility badge." |
| 7 | Assign substation | "One click updates the case and notifies the resident." |
| 8 | Phone shows "Help is on the way" | "That closes the loop in real time." |
| 9 | Tap I Am Safe | "The resident ends it, and the case closes." |
| 10 | Analytics: hotspot ranking | "Transparent scoring." |
| 11 | Generate AI plan | "A draft that an admin reviews before acting." |
| 12 | Live Audit Trail on the dashboard | "Every important action is recorded." |

**If something breaks during the demo**

| Problem | Say or do |
|---|---|
| AI is slow or falls back to rules | "This is our fallback, so admins are never left without a plan." |
| No GPS indoors | "The app refuses to guess a location. That's intentional for emergencies." Move near a window. |
| Internet drops | "Firestore queues the report and sends it when back online." Show the 911 option. |
| A popup doesn't appear | Check the admin's role and that the report is in that admin's area. Open it from Incidents. |

---

## Part 5: Anticipated questions and answers

### General

**Q: Why did you build this?**
Reporting incidents is often slow and scattered across calls and messages. ThreatTrack gives residents a direct channel and gives police and barangays organized, located, real-time data.

**Q: What makes it different from just calling 911 or messaging on Facebook?**
It sends exact GPS, routes the report to the right office, tracks the responder, tells the resident the status, and builds data for hotspot analysis. It supports hotlines and does not replace them. We even show a 911 button when the connection is weak.

**Q: Why Firebase instead of your own backend?**
We needed real-time sync, login and security rules for a small team and at no cost. Firestore listeners give live updates on both apps without maintaining a server.

**Q: Do you have a backend at all?**
Firebase is our backend as a service. Firestore Security Rules run on Google's servers and validate every write. We also wrote Cloud Functions, but they need the paid plan, so they aren't deployed yet.

**Q: Why is the `functions` folder there if it isn't used?**
It is our production path. It holds server-side validation, AI triage and notification logic, with test files. Moving to Blaze and deploying it would add that layer without changing the apps' main flow.

**Q: Why only two barangays?**
It is a pilot scope for a capstone. The barangays and substations are registry entries, so expanding means adding entries and creating accounts for those areas.

### SOS

**Q: What stops accidental SOS?**
A 3-second hold, then the user must still select the emergency type and press send.

**Q: What if there's no internet?**
Firestore holds the write on the phone and sends it when the connection returns, so the user should keep the app open. The app tells the user it's queued and offers a direct 911 call. Without any signal, ThreatTrack cannot alert responders right away.

**Q: What if GPS is unavailable?**
It waits up to 10 seconds for a fresh fix, then uses the last known location and marks it approximate so responders know. If there's no location at all, the SOS is blocked and the user is told to enable location.

**Q: Does live tracking continue if the app is closed?**
No. It works while the app is open, and the app tells the user this. Background tracking is a planned improvement.

**Q: How do you avoid too many database writes during tracking?**
It only writes after about 10 meters of movement or 20 seconds, and keeps only the last 15 trail points.

**Q: What if someone abuses SOS?**
Users accept a false-report policy, and each SOS is tied to an account. After the first report, email verification is required. Admins can suspend accounts, and suspended accounts are blocked by the database rules too.

**Q: Can an admin ignore an SOS?**
Dismissing one requires a reason and notes, and that is stored permanently in the audit log.

### Reporting

**Q: Why can't users choose severity?**
People in distress may rate everything as high, or misjudge it. Mapping severity from type keeps it consistent, and it also determines who receives the report.

**Q: How is theft medium but robbery high?**
Robbery involves force or intimidation against a person, while theft or snatching is handled at a lower level in our routing. In an active emergency, the user can use SOS, which is always high.

**Q: Where are photos stored?**
In Firestore, compressed to 650 KB or less, in a separate collection only the reporter and staff can read. Firebase Storage needs the paid plan. Photos are cleared when a case is marked done to save space.

**Q: How do you handle fake reports?**
Several layers: a verified, policy-accepting account, a credibility rating, human review, rejection with a reason, and account suspension. We don't auto-delete, because a wrong automatic decision could hide a real emergency.

**Q: Can a user bypass the app and write fake data directly?**
The Firestore rules check the login, active account, reporter ID, incident type, description length, coordinates, server timestamp and photo format on the server. Even a modified app must pass those.

**Q: What about duplicate reports of the same incident?**
Reports are kept separately, and the admin map shows them together in one location. Automatic duplicate merging is future work, since multiple reports can also help corroborate an incident.

### Routing

**Q: How does a report reach the correct admin?**
Severity or SOS decides police or barangay. Location then decides which station or barangay. The admin dashboard applies those rules to a live feed of new incidents and opens the alert.

**Q: Why is routing done in the dashboard and not on a server?**
Because we are on the free plan with no server functions. The routing rules are written so the same logic can run on the server later, and the server version already exists in `validateIncident`.

**Q: Could a barangay admin see police-level reports?**
The urgent popup goes only to the correct audience. The Incidents list is filtered by jurisdiction, so a barangay admin can see reports in their own barangay for awareness. The police handle dispatch for high-level cases.

**Q: What if a report is outside the pilot area?**
It is assigned to the nearest covered area, and the credibility check flags "Coordinates outside Valenzuela coverage," so the admin can decide.

**Q: What if the admin dashboard isn't open?**
The alert appears when an admin opens it, as long as the report is still among the latest incidents and is unresolved. In production we would add server-sent push and a staffed command center.

**Q: What if two admins respond at once?**
The popup watches the incident live. As soon as one responds, the alert closes or updates for the other, and responded incidents don't alert again.

### Hotspot mapping

**Q: What algorithm do you use?**
On mobile, distance-based clustering within 120 meters using the Haversine formula. On the web, grid-based density with severity weights. Analytics ranks locations with a weighted score.

**Q: Why those weights?**
High is 3, medium 2, low 1, and SOS adds 3, reflecting urgency. They are simple rules that admins can understand and audit. We would tune them with real data and input from the police.

**Q: Is the heatmap accurate?**
It's as accurate as the reports and GPS behind it. It shows **reported incident concentration**, so we treat it as decision support and not official crime statistics.

**Q: Could a fake report create a false hotspot?**
On mobile, one high-severity report can show a hotspot, so this is possible. Rejected reports are excluded, and the analytics page requires a minimum amount of evidence before recommending action. Admin review is the safeguard.

**Q: Why does a hotspot appear with just one report?**
It helps residents stay aware of a recent serious incident. The radius and color reflect how many reports and how severe they are.

**Q: Analytics groups by address. Isn't that imprecise?**
Yes, slightly different address text can split one location. The map view uses coordinates, so the two views complement each other. Grouping analytics by coordinates is a clear next improvement.

### Precinct locator

**Q: How do you find the nearest precinct?**
We compute the Haversine distance from the user's GPS to every station and take the smallest.

**Q: Why straight-line and not road distance?**
It's fast, free and works without a routing API. For the actual route, we open Google Maps. Road distance can be longer, so we label it as an estimate.

**Q: Where did the precinct data come from?**
Public PNP and Valenzuela police references plus public map records, stored as a baseline. Admins can add or override precincts in Firestore. Official coordinates should be validated with the station before real deployment.

**Q: Is the ETA real?**
It's an estimate based on distance and time of day. No live traffic data is connected, so we present it as an estimate.

**Q: Does the system automatically dispatch the nearest station?**
No. It recommends the nearest first, and a person confirms, because local knowledge matters, such as unit availability.

### AI decision plan

**Q: Does the AI make decisions?**
No. It explains recommendations on a draft. It cannot dispatch, assign, change a report's status or close a case.

**Q: Why doesn't the plan say how many officers to send?**
The system doesn't know available staff or current operations. Staffing, schedule and assignment belong to the authorities, so code rejects any AI text that specifies them.

**Q: Which AI do you use and why?**
Google Gemini Flash. It's fast and supports structured output. The system tries several current model versions in order, because one can be busy.

**Q: How do you prevent hallucination?**
Every number comes from code and is checked against the reports. The AI can only choose approved recommendations and can only cite documents we retrieved, by ID, so it can't create a source. It can still misapply a real source, so authorities review the draft.

**Q: What is RAG in your system?**
For each recommendation, we retrieve matching laws, ordinances and rules from Firestore and give only those to Gemini. Retrieval is keyword-based, and embeddings are a possible upgrade.

**Q: What does the badge prove?**
That the recommendation is tied to that document in our knowledge base. Some action guidance in our seed data was written for this project as operational notes, so a badge doesn't mean that statute orders the action. Authorities should validate it, and local ordinances would make the basis stronger.

**Q: Why are some recommendations missing?**
If our knowledge base has no supporting source, the system doesn't recommend it. We chose no recommendation over an ungrounded one.

**Q: What data goes to Gemini?**
Hotspot facts, recommendation options, sources and up to 15 shortened narratives. Reporter accounts aren't sent, and phone numbers and emails are removed. Names written inside a description aren't automatically detected, so stronger anonymization is needed before real deployment.

**Q: What if Gemini is down?**
Code writes the reasoning from the same facts and approved rules. The layout, sources and checks stay the same.

**Q: Is the API key safe?**
For the prototype, the call is made from the admin browser, so the key can be seen in the built web app. We know that isn't safe for production. It would move to a server-side Cloud Function.

**Q: How does an admin approve a plan?**
There is no approval step, because it is only a draft. An admin can export it and take it through normal police or barangay channels.

**Q: Are plans saved?**
A plan stays available in that browser while the admin moves between pages, is cleared on logout, and can be exported to PDF. Admin feedback is saved and given to Gemini as context for later plans, but it can never be cited as a source.

**Q: How do you decide "Consider action"?**
At least 5 reports, at least 2 confirmed by an admin, and a clear time pattern, where at least half of the reports fall within a three-hour window.

### Security, privacy and limitations

**Q: How do you control admin access?**
Firebase login plus a role stored in the user's profile. The dashboard checks it for the interface, and Firestore rules enforce it for protected data.

**Q: Can anyone read the reports?**
In the current prototype, the `incidents` and `notifications` collections are publicly readable so the map can load them. This is a known limitation. Before production, we would serve the public map from a sanitized version and restrict the full records to the reporter and staff. Evidence photos are already restricted.

**Q: Is there rate limiting?**
Not on the server yet. The current protections are the account checks, email verification and human review. The Cloud Function has spam-rate checks, ready for when it's deployed.

**Q: Are audit logs tamper-proof?**
Logged entries can't be updated or deleted under our rules, but they're created from the admin client. Server-created logs would be stronger.

**Q: What are the main limitations?**

- No server functions are deployed, so there's no remote push or server-side rate limiting.
- Live tracking works only while the app is open.
- Incident data needs tighter read rules.
- The AI key must move to the server.
- ETA is an estimate.
- The pilot covers only two barangays, and data must be validated with real stakeholders.

**Q: What would you add next?**
Move to the Blaze plan and deploy the functions, add remote push, tighten privacy rules, add background location, connect traffic data, and expand beyond the pilot area with official station data.

**Q: How did you test the system?**
Use the testing you actually performed for your study, such as your test cases, device tests and evaluation results. The latest device QA fixes are recorded in `mobile/QA_FIX_LOG.md`.

---

## Part 6: Say this, not that

| Avoid | Say instead |
|---|---|
| "The AI decides" | "The AI drafts, and admins decide" |
| "Cloud Functions process each report" | "The apps use Firestore directly, with rules enforcing validity" |
| "AI verifies each report" | "A rule-based score advises the admin" |
| "Verified means it's true" | "It passed credibility checks, and an admin confirms it" |
| "The heatmap shows crime rates" | "It shows where reports are concentrated" |
| "The ETA is exact" | "It's a time-of-day estimate" |
| "Fully secure" | "Secured for a prototype, with a clear hardening plan" |
| "It works offline" | "Reports queue on the phone and send when back online" |
| "Tracks in the background" | "Tracks live while the app is open" |

---

## Part 7: Check tonight

- [ ] Test SOS end to end on the APK you will use for the demo.
- [ ] Generate one decision plan, then hover over "Decision plan draft" at the top. It should say **Reasoning written with Gemini**.
- [ ] In AI Management, confirm the national laws are loaded. Add any real Valenzuela ordinances you have.
- [ ] Mark at least 2 reports as verified in a demo hotspot with 5+ reports and a clear time pattern, or it won't reach Consider Action.
- [ ] Turn on the heat layer in Settings if you plan to show it, and make sure at least 3 reports fall in one area.
- [ ] Make sure there are enough recent reports for the hotspot ranking to appear.
- [ ] Confirm the Head Police, Substation and Barangay logins all work.
- [ ] Push the new decision plan and ETA changes, then test the live Vercel site. Vercel builds from git, so they won't appear there until they are pushed.
- [ ] Confirm the browser allows sound, since alerts play audio. Click once on the dashboard first.
- [ ] Bring mobile data as a backup for the venue Wi-Fi.
- [ ] Know your study's actual test and evaluation results. They aren't in the code, so this guide can't supply them.
