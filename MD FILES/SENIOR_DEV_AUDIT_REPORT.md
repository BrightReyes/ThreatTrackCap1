# ThreatTrack — Senior Developer Audit Report

**System:** ThreatTrack Crime Reporting & Emergency Response System
**Date Audited:** August 15, 2026
**Auditor Role:** Senior Software Engineer / System Architect / Technical Lead
**Audit Method:** Direct inspection of source files — mobile app, admin web panel, Cloud Functions, and Firestore/Storage security rules. No assumptions made from screenshots or documentation alone.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Trace](#2-architecture-trace)
3. [Crime / Incident Reporting Audit](#3-crime--incident-reporting-audit)
4. [SOS Feature Audit](#4-sos-feature-audit)
5. [Hotspot Mapping Audit](#5-hotspot-mapping-audit)
6. [Location & GPS Audit](#6-location--gps-audit)
7. [Admin Incident Management](#7-admin-incident-management)
8. [Incident Status & Workflow](#8-incident-status--workflow-audit)
9. [User & Role Security Audit](#9-user--role-security-audit)
10. [Evidence & File Security](#10-evidence--file-security)
11. [Database / Firestore Schema Audit](#11-database--firestore-schema-audit)
12. [Data Integrity Audit](#12-data-integrity-audit)
13. [Security Audit](#13-security-audit)
14. [SOS Abuse & Reliability Audit](#14-sos-abuse--reliability-audit)
15. [Hotspot Accuracy Audit](#15-hotspot-accuracy-audit)
16. [Dashboard & Analytics Audit](#16-dashboard--analytics-audit)
17. [Performance Audit](#17-performance-audit)
18. [Frontend & UX Audit](#18-frontend--ux-audit)
19. [Edge Case Test Matrix](#19-edge-case-test-matrix)
20. [Code Quality Review](#20-code-quality-review)
21. [Overall System Score](#21-overall-system-score)
22. [Critical Findings](#22-critical-findings)
23. [Final Development Recommendation](#23-final-development-recommendation)

---

## 1. System Overview

**What the system is:**
ThreatTrack is a community-level crime and emergency reporting application targeted at Valenzuela City, Philippines. It consists of three layers:

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo) |
| Admin Web Panel | Vanilla JS + Vite, hosted as static HTML |
| Backend | Firebase (Firestore, Auth, Storage, Cloud Functions v2) |

**User Roles (confirmed from `firestore.rules`):**

| Role | Description |
|---|---|
| `user` | Regular citizen — can report incidents and activate SOS |
| `admin` / `moderator` / `barangay` / `barangay_admin` / `Barangay Admin` | Barangay admin — manages incidents, users, settings |
| `police` / `police_admin` / `Police Admin` | Police admin — same as above + access to `operation.html` |

**Key collections confirmed in `firestore.rules` and code:**
- `users` — user profiles
- `incidents` — all incident reports
- `incidents_archive` — archived incidents
- `notifications` — push/in-app notifications
- `crime_statistics` — heatmap aggregated data
- `precincts` — police station records
- `settings` — admin system configuration
- `audit_logs` — admin action log
- `ai_suggestion_summaries` — Gemini-generated AI reports
- `suspicious_activity` — spam flagging log
- `userVerifications` — identity verification queue

---

## 2. Architecture Trace

The actual data flow confirmed from code inspection:

```
Mobile User
  ↓
ReportIncidentScreen.js / SOSReportScreen.js
  ↓
getReportEligibility() [auth.js] — checks accountStatus + falseReportAcknowledged
  ↓
getCurrentLocation() [location.js] — expo-location, Accuracy.Balanced
  ↓
addDoc(collection(db, 'incidents'), incidentData) — direct Firestore write
  ↓
Firestore Security Rules [firestore.rules] — isValidIncident(), canSubmitReports()
  ↓
Cloud Function: validateIncident.js (onDocumentCreated trigger)
  ↓
  - validateLocation(), validateType(), validateSeverity(), validateDescription()
  - checkSpamScore() — rate limit (5/hour per user), duplicate location check
  - calculateVerificationScore() — score 0-100
  - Status assigned: verified / under_review / spam / error
  - createAdminPriorityNotification() — for high-priority/SOS
  ↓
Admin Web Panel: admin-sos-alerts.js
  - onSnapshot() listener on incidents collection
  - isEligibleAlert() — isSOSReport === true + canRespondToIncident()
  - Alert shown to admin
  ↓
Admin Action: respondToIncident() [admin-response.js]
  - writeBatch: update incident status to "responding", set response details
  - Add notification to reporter (userId = incidentData.reporterId)
  ↓
Mobile User: StatusScreen.js / NotificationsScreen.js
  - User sees status update
```

This flow is **substantially correct and implemented**. However, several serious gaps exist within individual steps, documented below.

---

## 3. Crime / Incident Reporting Audit

### Evidence Source
`ReportIncidentScreen.js`, `SOSReportScreen.js`, `validateIncident.js`, `firestore.rules`

### What Is Implemented ✅

- **Incident types:** 10 types enforced in both client (`INCIDENT_TYPES` array) and Firestore rules (`isValidIncident()`) and Cloud Function (`validateType()`). Types are consistent across all layers.
- **Severity:** Three levels (`high`, `medium`, `low`). Severity is **auto-assigned** from incident type on both client screens, not freely chosen by user — reduces manipulation risk.
- **Description validation:** Minimum 10 characters, maximum 2000. Enforced on client (`validateReportDetails()`), in Firestore rules (`data.description.size() >= 10`), and in Cloud Function (`validateDescription()`).
- **Location required:** Both `ReportIncidentScreen` and `SOSReportScreen` block submission when location is null or invalid.
- **Eligibility gate:** `getReportEligibility()` checks `accountStatus === 'active'` and `falseReportAcknowledged === true` before allowing submission. This is re-checked at submit time, not only on page load.
- **Anti-spam (Cloud Function):** Rate limit of 5 reports per hour per user. Duplicate location check within 50 meters and 10 minutes. Spam incidents are flagged automatically.
- **Verification score:** Cloud Function calculates 0–100 score from location, type, severity, description, and spam checks. Reports scoring ≥80 are auto-verified; <30 are auto-marked spam.
- **Reporter identity on record:** `reporterId: currentUser.uid` stored on every incident.
- **Confirmation dialog:** `ReportIncidentScreen` shows a legal disclaimer ("false reporting may result in penalties") before final submission.
- **Evidence photos:** Inline JPEG via base64, compressed through multiple quality variants to stay under 650KB. MIME type, width, height, and size stored and validated in Firestore rules.
- **Photo cleared on completion:** When admin marks incident as `done`, `buildStatusUpdatePayload()` in `incident-modal.js` uses `deleteField()` to remove `photoDataUrl`, `photoMimeType`, etc.

### What Is Missing or Problematic ⚠️

**Duplicate report prevention is weak:**
- The spam check catches duplicate *locations* within 10 minutes and flags if a user submits >5 reports/hour.
- However, there is **no check for the same user reporting the same incident type at the same location** across different hours. A determined bad actor could submit 5 reports per hour indefinitely.

**No anonymous reporting:**
- `reporterSummary()` in `incident-modal.js` checks for `isAnonymous === true`, and `SOSReportScreen` says "your identity remains protected," but anonymous reporting is **never set in the actual submission payloads** — both `incidentData` objects in `ReportIncidentScreen` and `SOSReportScreen` always include `reporterId: currentUser.uid`. The anonymous flag is cosmetic only.

**SOS description is truly optional, with an automatic default:**
In `SOSReportScreen.js`, line 267:
```js
const safeDescription = description.trim() ||
  `SOS quick report: ${selectedIncident?.label || 'Incident'} reported via emergency flow.`;
```
The Firestore rule requires `description.size() >= 10`, which this default satisfies. However, the auto-generated description is boilerplate and carries no actual incident-specific information. An SOS report can enter the system with zero real detail about the emergency.

**`reportedAt == request.time` check can fail:**
In `firestore.rules` line 275, the rule for regular users is:
```
request.resource.data.reportedAt == request.time
```
However, the client sends `serverTimestamp()` for `reportedAt`. Firestore evaluates `request.time` at the moment the write request is processed, and `serverTimestamp()` fields evaluate to the same timestamp. This is expected to work, but it is sensitive to edge cases and is **not documented** — making the rule fragile during future maintenance.

**Incident code (`TR-XXXX`) is not unique and is cosmetic:**
`formatIncidentCode()` in `incidents-list.js` and `incident-modal.js` generates a 4-digit hash from the Firestore document ID. Two different incidents can produce the same code (`hash % 10000`). The displayed code is **not stored in the database**. It exists purely for UI display and is not a reliable incident identifier.

---

## 4. SOS Feature Audit

### Evidence Source
`SOSGatewayScreen.js`, `SOSReportScreen.js`, `admin-sos-alerts.js`, `admin-response.js`, `validateIncident.js`, `firestore.rules`

### SOS Activation

**Hold-to-activate implemented:** `SOSGatewayScreen.js` uses a 3-second hold animation (`HOLD_DURATION = 3000`). Releasing before 3 seconds cancels the action. This **correctly prevents accidental activation**.

**After hold completes:**
```js
navigation.navigate('SOSReport');
```
The user is sent to `SOSReportScreen`, where they must still select an incident type and press a submit button. **SOS is NOT a one-press emergency signal.** It requires multiple additional user interactions after the hold completes. In a real emergency, this multi-step flow could delay or prevent the report from being sent.

**SOS workflow trace confirmed:**
```
Hold 3 seconds → SOSGatewayScreen
  ↓
Navigate to SOSReportScreen
  ↓
User selects incident type (required — submit is disabled without it)
  ↓
User optionally enters description
  ↓
User presses "Send SOS Report"
  ↓
addDoc() to Firestore with isSOSReport: true, status: 'under_review'
  ↓
Cloud Function: validateIncident.js
  - isHighPriorityIncident() returns true (isSOSReport === true)
  - If valid location + valid type → status = "verified"
  - createAdminPriorityNotification() → notifications collection
  ↓
Admin: admin-sos-alerts.js
  - onSnapshot() triggers, isEligibleAlert() → isSOSReport === true
  - Alert displayed in admin panel
  ↓
Admin responds → respondToIncident() → status = "responding"
  ↓
Notification written for reporter (userId = reporterId)
  ↓
Mobile: StatusScreen.js / NotificationsScreen.js shows update
```

### SOS Status States (Confirmed from Code)

| Status | Where Set |
|---|---|
| `under_review` | Client sends on creation |
| `verified` | Cloud Function upgrades if valid + high priority |
| `responding` | Admin action via `respondToIncident()` |
| `done` | Admin marks complete via `incident-modal.js` |
| `rejected` / `spam` | Cloud Function or admin moderation |
| `error` | Cloud Function validation failure |

There is **no "acknowledged" state** separate from "responding." The admin jumps directly from seeing the alert to dispatching a precinct. This is acceptable for a barangay-level system.

### SOS Location

**Location is captured before submission** — `SOSReportScreen` fetches location on mount. The submit button is **disabled** until `locationReady` is true. The submit handler re-validates with `isValidReportLocation()` before calling Firestore.

**What `isValidReportLocation()` checks (line 132–138, SOSReportScreen.js):**
```js
Number.isFinite(Number(location.latitude)) &&
Number.isFinite(Number(location.longitude))
```
This checks that lat/lon are finite numbers. It does **not** check coordinate range (e.g., `(0, 0)` would pass the client-side check). However, the Cloud Function's `validateLocation()` correctly rejects `(0, 0)` and out-of-range values.

**No timestamp is stored with the SOS location.** The `location` object stored in Firestore contains only `{latitude, longitude, address}`. There is no `locationCapturedAt` timestamp. If the user's GPS fix is stale from a previous screen, the system cannot distinguish it from a fresh fix.

**There is no fallback to last-known location.** If GPS fails, the submission is blocked. This is the correct behavior but means: if GPS is unavailable during an emergency, the user cannot submit an SOS report at all. This is a reliability concern but is safer than using stale coordinates.

### SOS Admin Dismissal Is Stored Only in localStorage

In `admin-sos-alerts.js`:
```js
function isDismissed(id, data) {
    return localStorage.getItem(dismissalKey(id, data)) === "1";
}
```
Dismissal state is stored **only in the browser's localStorage**. If an admin:
- Clears browser data
- Switches to a different browser or machine
- Has multiple admin tabs open

...the dismissed SOS alert **reappears** and can be processed again by a different admin — or the same admin unknowingly triggers a duplicate response.

### SOS Abuse: No Per-User SOS Rate Limit in Firestore Rules

The Firestore rules do not have a specific SOS rate limit. The Cloud Function's `checkSpamScore()` applies a 5-reports-per-hour limit across **all** report types. A user could send 5 SOS reports in one hour before being flagged. Each one generates an admin priority alert popup. This is a manageable but real abuse vector.

---

## 5. Hotspot Mapping Audit

### Evidence Source
`aggregateHeatmapData.js`, `getHeatmapData.js`, `calculateRiskLevel.js`, `admin-map.js`

### How Hotspot Data Is Generated (Confirmed)

**Two parallel systems exist:**

**System 1 — Scheduled Aggregation (`aggregateHeatmapData.js`)**
- Runs on Cloud Scheduler: `"every 1 hours"`
- Fetches all incidents with `status in ["verified", "under_review", "pending", "submitted", "open", "responding"]`
- Groups by rounded coordinates (3 decimal places = ~111 meters grid)
- Weighted score: `high×3 + medium×2 + low×1`
- Stores in `crime_statistics` collection
- Creates `7d` and `30d` period aggregations

**System 2 — HTTP endpoint (`getHeatmapData.js`)**
- Direct Firestore query of `incidents` collection
- Filters by status: same list as above
- Filters by geographic bounds and time range (default 7 days, max 30 days)
- Groups into `GRID_SIZE = 0.002` degree cells
- Normalizes weight: `count / maxCount`

**System 3 — Risk Level Calculation (`calculateRiskLevel.js`)**
- HTTP endpoint
- Queries only `["verified", "under_review"]` incidents (last 30 days)
- Uses `geofire-common` for distance-based filtering
- Risk thresholds: `high` = 3+ high-severity OR 10+ incidents last 7 days

### What the Hotspot Map Includes

| Category | Included |
|---|---|
| Verified incidents | ✅ Yes |
| Under_review incidents | ✅ Yes |
| Pending / submitted incidents | ✅ Yes |
| Responding incidents | ✅ Yes |
| Resolved (done) incidents | ❌ No (not in VISIBLE_STATUSES) |
| Rejected incidents | ❌ No |
| Spam incidents | ❌ No |
| SOS reports | ✅ Yes (if status is in the list) |

### Issues Found

**Unverified ("pending", "under_review") incidents inflate hotspot intensity:**
The `VISIBLE_STATUSES` array includes `pending`, `under_review`, and `submitted`. Unverified reports that may be false, spam, or duplicate are included in heatmap calculations. A user could deliberately place 4 reports just below the spam threshold to create a false hotspot in any location.

**No deduplication of related incident reports:**
If 10 citizens report the same real incident from slightly different GPS positions, all 10 contribute independently to the heatmap. The spam check catches exact duplicates within 50 meters/10 minutes, but the same incident can receive many legitimate reports outside that window.

**`resolved` status is absent:**
Once an incident is resolved (`done`), it disappears from the heatmap. This means the heatmap shows only active/open incidents, not historical crime density. The `7d` and `30d` aggregations include the `done` status check only by omission — any incident marked `done` was removed from `crime_statistics` queries. **This design choice means the heatmap shows current active incidents, not crime pattern hotspots.** This is a significant conceptual gap if the goal is identifying dangerous areas over time.

**The two hotspot systems use different grid sizes:**
- `aggregateHeatmapData.js` uses `GRID_PRECISION = 3` (3 decimal places, ~111m grid)
- `getHeatmapData.js` uses `GRID_SIZE = 0.002` degrees (~222m grid)

These two systems will produce different hotspot shapes for the same data.

**No explicit minimum incident threshold for "hotspot" designation:**
There is no rule saying "an area needs at least N incidents to be displayed as a hotspot." A single incident creates a grid cell with weight 1.0 (if it's the only incident in the dataset). The map may show "hotspots" with a single low-severity incident.

---

## 6. Location & GPS Audit

### Evidence Source
`location.js`, `SOSReportScreen.js`, `ReportIncidentScreen.js`, `validateIncident.js`, `firestore.rules`

### Permission Handling ✅
`getCurrentLocation()` calls `checkLocationPermission()` first, then `requestLocationPermission()` if needed. Returns `null` on denial — screens handle this gracefully.

### Accuracy Setting
```js
accuracy: Location.Accuracy.Balanced
```
`Accuracy.Balanced` is appropriate for incident reporting (uses both GPS and network). However, for SOS/emergency, `Location.Accuracy.High` or `Location.Accuracy.BestForNavigation` would be significantly more precise. In an emergency, a 100-meter accuracy difference matters.

### Coordinate Validation (Multi-Layer)

| Layer | Checks |
|---|---|
| Client (`isValidReportLocation`) | `Number.isFinite()` on lat and lon |
| Firestore Rules (`isValidIncident`) | Number type + range (-90/90, -180/180) |
| Cloud Function (`validateLocation`) | Type, range, and rejects `(0,0)` |

**Gap:** The client-side check (`Number.isFinite()`) allows `(0, 0)` to pass. This is caught by the Cloud Function, but an incident with `(0, 0)` coordinates can be **written to Firestore** with an `under_review` or `pending` status momentarily before the Cloud Function runs and updates it. In that window, the invalid location exists in the database.

### Location Staleness
- No `locationCapturedAt` timestamp stored in the incident location object
- No GPS accuracy (`coords.accuracy`) stored
- Cannot distinguish a fresh GPS fix from a location that was captured 5 minutes ago when the user first opened the app

### Reverse Geocoding
`getAddressFromCoordinates()` uses Expo's `Location.reverseGeocodeAsync()`. If it fails (no internet, API error), the fallback is hardcoded: `'Valenzuela City, Philippines'`. This means an incident near the city boundary or in a different area would show a misleading address in the admin panel.

---

## 7. Admin Incident Management

### Evidence Source
`admin-auth.js`, `incidents-list.js`, `incident-modal.js`, `incidents.html`

### Authentication Gate (Confirmed)
`initAdminPage()` uses `onAuthStateChanged()`. If no authenticated user, redirects to `login.html`. After auth, `loadAdminProfile()` fetches the Firestore user document and calls `isAllowedAdminRole()`. Only `admin` and `police` roles proceed. Non-admin roles are signed out and redirected. **This is correctly implemented.**

### Inactivity Timer ✅
Admin pages load a session timeout from `settings/system.securitySettings.sessionTimeoutMinutes`. If idle > timeout, the admin is signed out. This is a positive security feature.

### Incident List

- Loads last 150 incidents (`LIST_LIMIT = 150`) ordered by `timestamp desc`
- **No real-time listener** — uses `getDocs()` once on page load. Admin must manually reload to see new incidents.
- Filtering (status, severity, search) is done client-side on the 150 loaded documents
- **Incidents beyond 150 are invisible** without manual date filtering

### Admin Status Actions (Confirmed from `incident-modal.js`)

Available admin status transitions:
- `pending` → any
- `under_review` → any
- `verified` → any
- `responding` → `done`, `rejected`
- `done` (terminal — no reverse implemented in UI)
- `rejected` (terminal)

**Admins can skip any status.** There is no state machine validation. An admin can change `pending` directly to `done` without going through `verified` or `responding`. This is permitted by the Firestore rules (`isAdmin() || isPoliceAdmin()` → allow update, delete).

**Resolved incidents can be reopened:** The `done` status is terminal only in the UI. An admin who directly opens the Firestore console (or uses the API) can change status back from `done`. The Firestore rules do not prevent this.

### Audit Logging
`logAudit()` in `audit.js` is called for `auth.logout` and `auth.session_timeout`. However, audit logging for **incident status changes** is not confirmed from code inspection. The `buildStatusUpdatePayload()` function in `incident-modal.js` does **not** call `logAudit()`. Admin actions on incidents are not systematically audit-logged.

> I cannot confirm that incident status changes, user account changes, or evidence deletions produce audit log entries from the available implementation.

---

## 8. Incident Status & Workflow Audit

### Confirmed Status Values

From code (Cloud Function, Firestore rules, status screen):
`pending`, `under_review`, `verified`, `responding`, `done`, `rejected`, `spam`, `error`, `submitted`, `open`

### Valid Transitions (From Implementation)

```
Client creates incident → status: 'under_review'
    ↓
Cloud Function runs:
  - Score ≥80       → 'verified'
  - Score 30–79     → 'under_review'
  - Score <30       → 'spam'
  - High priority   → 'verified' (+ priority flag)
  - Error           → 'error'

Admin panel:
  - Can set any status to any other status (no enforced state machine)
  - respondToIncident() forces → 'responding'
  - Mark done → 'done'
```

### Issues

**Users cannot change their own report status.** The Firestore rule for user updates is:
```
resource.data.status == 'pending' &&
request.resource.data.status == resource.data.status
```
Users can only update their own `pending` incidents, and the status must remain the same. This is correctly implemented.

**`status: 'under_review'` is set by the client on submit.** The Cloud Function then overwrites it. However, if the Cloud Function fails, the incident remains `under_review` indefinitely with no indication. The Cloud Function sets `status: 'error'` in the catch block, which surfaces in the admin panel.

**No status change history is recorded.** When an admin changes a status, only `moderatedBy`, `moderatedAt`, and `updatedAt` are stored. There is no array of prior status values. If an incident goes from `pending` → `verified` → `rejected`, only the final change is traceable.

---

## 9. User & Role Security Audit

### Evidence Source
`firestore.rules`, `admin-auth.js`, `users-list.js`

### Role Check Mechanism

Admin panel: role is fetched from `users/{uid}` in Firestore on every page load. If the role is not `admin` or `police`, the user is signed out. **This is correct.**

**However, the role is also cached in `localStorage`:**
```js
localStorage.setItem(ADMIN_ROLE_CACHE_KEY, normalized);
```
`applyCachedAdminRole()` is called immediately on script load (before the auth check completes) to show/hide the Operations nav link. This cached value has no security function — it affects only UI rendering — but it could confuse someone investigating the code into thinking the role check is client-side only.

### IDOR Vulnerabilities

**Incidents are globally readable (no auth check):**
```
// firestore.rules line 266
allow read: if true;
```
**Any unauthenticated user can read all incidents.** This includes incident location, description, reporter ID, and any inline photo evidence. This is a significant privacy exposure.

The comment says "Allow public reads so the app can fetch incidents for display." This may be intentional for the map feature, but it means all incident data — including the reporter's UID, exact GPS coordinates, and incident photos — is publicly accessible without any authentication.

**Users collection is readable by any authenticated user:**
```
allow read: if isAuthenticated();
```
Any logged-in user can read any other user's complete profile, including their address, phone number, barangay, age, and sex.

**Notifications are globally readable and writable by any authenticated user:**
```
allow read: if true;
allow update, delete: if isAuthenticated();
allow create: if isAuthenticated();
```
Any authenticated user can read, create, update, or delete any notification. A malicious user could delete SOS response notifications intended for another user, modify notification content, or flood the notifications collection. The comment says "The admin UI already gates access" — but this is a client-side gate only; the Firestore rule provides no protection.

### User-to-User Incident Access

A user can read another user's incident (including location and photos) because incidents are fully public. A user cannot modify another user's incident (Firestore rules enforce `isOwner(resource.data.reporterId)` for updates), but they can read it all.

### Admin User Creation Flow

`users-list.js` creates admin accounts by:
1. Creating a secondary Firebase Auth app instance
2. Calling `createUserWithEmailAndPassword(secondary.auth, email, password)`
3. Writing the user document to Firestore
4. Deleting the secondary app

This is a workaround for Firebase's limitation that creating a user signs the creator out. The implementation is functional but **creates the admin user without email verification** and with no Firebase Admin SDK involvement. The new user's Auth record and Firestore profile are created from the admin's browser.

**Risk:** If the Firestore step fails (step 3), the Auth user exists without a corresponding profile. The cleanup code attempts `deleteUser(createdAuthUser)` but this could also fail — leaving an orphaned Auth account.

---

## 10. Evidence & File Security

### Evidence Source
`storage.rules`, `ReportIncidentScreen.js`, `incident-modal.js`

### Current Evidence Approach

The system primarily uses **inline base64 JPEG stored directly in Firestore** (not Firebase Storage) for incident photos. Key constraints enforced in Firestore rules:
- `photoDataUrl.size() <= 650 * 1024` (≤650KB)
- Must start with `data:image/jpeg;base64,`
- `photoMimeType == 'image/jpeg'` (only JPEG allowed)
- `photoStorage == 'firestore_inline'`

### What Is Correctly Implemented ✅

- **File size limit:** 650KB hard limit enforced in Firestore rules
- **MIME type enforcement:** Only `image/jpeg` accepted for inline photos
- **Evidence cleared on completion:** `done` status triggers `deleteField()` for all photo fields
- **Client-side compression:** Multiple quality variants tried to stay under limit

### What Is Not Correctly Implemented ⚠️

**No MIME type validation against actual binary content:**
The Firestore rule checks that `photoMimeType == 'image/jpeg'`, but this is a field the client supplies. The client compresses the image and generates a `data:image/jpeg;base64,...` string. The rule validates the string prefix, but cannot verify the actual binary content is a valid JPEG. An attacker with a valid account could submit a non-JPEG file disguised as a JPEG.

**Storage rules are set but Storage upload flow is unclear:**
`storage.rules` exists and correctly scopes uploads to `incident-photos/{userId}/{incidentId}/{fileName}` with 5MB limit and `image/*` content type check. However, the current mobile implementation **bypasses Firebase Storage entirely** — photos go directly into Firestore as base64. The Storage rules exist but are not exercised by the current photo flow.

**Inline base64 photos in Firestore are globally readable:**
Since `allow read: if true` on incidents, all inline photos are publicly accessible without authentication. Any person who knows (or guesses) an incident document ID can fetch the full JPEG image.

---

## 11. Database / Firestore Schema Audit

### What Can Be Confirmed from Code

**No explicit schema document exists.** `DATABASE_SCHEMA.md` exists in the root but was not read for this audit (code was inspected directly). The following is derived from actual read/write operations.

### Incidents Collection

Required fields (enforced by Firestore rules):
`type`, `severity`, `location`, `description`, `timestamp`, `reportedAt`

Optional but present in code:
`typeLabel`, `reportingAs`, `status`, `clientTimestamp`, `reporterId`, `reporterEmailVerified`, `reporterAccountStatus`, `isSOSReport`, `photoDataUrl`, `photoMimeType`, `photoStorage`, `photoSizeChars`, `photoWidth`, `photoHeight`

Added by Cloud Function:
`verificationScore`, `validatedAt`, `priority`, `responseStatus`, `autoValidated`, `autoValidatedReason`, `autoValidatedAt`

Added by admin response:
`moderatedBy`, `moderatedAt`, `respondedBy`, `respondedAt`, `responder`, `response`, `status: 'responding'`

### Issues

**No Firestore schema enforcement for nullable vs. required beyond the creation rule.** After an incident is created, subsequent updates (from Cloud Functions or admins) can add arbitrary fields.

**No foreign key enforcement.** `reporterId` in an incident is not validated against an actual existing user document. A user who deletes their account leaves `reporterId` dangling. The Cloud Function's `updateReporterStats()` uses `set({ ..., merge: true })` which will recreate a minimal user document if the original was deleted.

**`crime_statistics` batch commit bug (potential):**
In `aggregateHeatmapData.js`:
```js
if (batchCount >= MAX_BATCH_SIZE) {
    await batch.commit();
    batchCount = 0;
}
```
After committing, the code does not create a **new batch object** — it attempts to reuse the same `batch` variable and continue adding to it. In Firestore JS SDK, a committed batch cannot be reused. This will throw an error on datasets with more than 500 grid cells.

---

## 12. Data Integrity Audit

### Issues Found

**Incident can exist without location after creation:**
The Firestore rule enforces location on creation. However, the Cloud Function can update an incident's status to `error` without changing the location. An incident in `error` status has valid location (required at creation) but no `validatedAt`. This is acceptable.

**Deleted user's reports remain in Firestore:**
The rules allow `isOwner(userId) || canManageUserProfiles()` to delete users. Deleting a user document does not cascade-delete their incidents. Those incidents remain in the database with a now-orphaned `reporterId`.

**SOS dismissal only in localStorage:**
Admin SOS dismissals are not persisted to Firestore. Dismissed alerts can reappear on browser refresh, browser change, or different admin session.

**`suspicious_activity` collection has no Firestore rule:**
The Cloud Function writes to `db.collection("suspicious_activity")` using Admin SDK (bypasses rules). No Firestore security rule is defined for this collection. Client-side access is effectively undefined (will default to deny via the fallback rule).

**`userVerifications` collection referenced in `users-list.js` but has no Firestore rule:**
The admin code reads from `userVerifications` and catches `permission-denied`. This collection is not defined in `firestore.rules`. The admin either must have permission via Admin SDK (which the web panel does not use) or will receive permission denied consistently — the error handling in `fetchVerificationDocs()` displays a message saying to "deploy the updated Firestore rules." This feature appears incomplete.

---

## 13. Security Audit

### Summary of Confirmed Security Issues

| Vulnerability | Severity | Evidence |
|---|---|---|
| Incidents fully publicly readable (no auth required) | 🔴 Critical | `firestore.rules` line 266 |
| Notifications fully readable and writable by any authenticated user | 🔴 Critical | `firestore.rules` lines 331–336 |
| User profiles (including address, phone) readable by any authenticated user | 🟠 High | `firestore.rules` line 177 |
| SOS dismissal state stored only in localStorage | 🟠 High | `admin-sos-alerts.js` |
| No audit trail for incident status changes | 🟠 High | `incident-modal.js` |
| GPS accuracy not stored with incident | 🟡 Medium | `location.js` |
| Hotspot includes unverified incidents | 🟡 Medium | `aggregateHeatmapData.js` |
| `hasNotExceededRateLimit()` always returns `true` in Firestore rules | 🟡 Medium | `firestore.rules` line 171 |
| Inline photos publicly accessible | 🟠 High | Follows from incident public read |
| Firestore batch commit reuse bug | 🟠 High | `aggregateHeatmapData.js` |
| No CSRF protection (Firebase Auth tokens handle this for API calls) | 🟢 Low | Firebase SDK handles this |
| XSS: Admin panel uses `escapeHtml()` consistently | ✅ Mitigated | `incident-modal.js`, `incidents-list.js`, etc. |
| SQL injection: Not applicable (Firestore) | ✅ N/A | |
| Mass assignment: Firestore rules use allowlist diffing | ✅ Mitigated | `firestore.rules` update rules |
| Authentication bypass: Not found | ✅ Not found | `admin-auth.js` |

### `hasNotExceededRateLimit()` is a stub

`firestore.rules` line 169–172:
```js
function hasNotExceededRateLimit() {
    // Simplified; production should enforce via Cloud Functions or server
    return true;
}
```
This function **always returns `true`**. The comment acknowledges it. The Cloud Function does perform rate limiting post-write, but the Firestore rule provides no pre-write rate protection. Any authenticated user can write as many incidents as they can send requests, up to the Cloud Function's after-the-fact spam detection.

---

## 14. SOS Abuse & Reliability Audit

### Repeated SOS Activation

A user can activate SOS repeatedly:
1. Hold 3 seconds → SOSReport
2. Submit report
3. Navigate back
4. Hold 3 seconds again
5. Repeat

Each submission generates a new incident, triggers the Cloud Function, and creates an admin priority alert popup. The admin panel has a queue mechanism (`alertQueue`), but there is no global cooldown preventing a single user from generating dozens of SOS alerts.

### What Happens If Network Fails During SOS

Firebase SDK with offline persistence (if enabled): the write is queued locally and submitted when connectivity is restored.

**However:** The mobile app's Firebase configuration (`mobile/utils/firebase.js`) was not read in this audit session. I cannot confirm whether `enableIndexedDbPersistence()` or equivalent is configured.

> I cannot confirm from the available implementation whether offline persistence is enabled for the mobile Firebase SDK.

If offline persistence is not enabled, a failed `addDoc()` call throws an error. The screen's `catch` block shows: `showAlert('Error', 'Failed to submit SOS report. Please try again.', 'error')`. The user is informed, which is correct.

### Notification Failure

If `createAdminPriorityNotification()` fails in the Cloud Function, the error is logged but **the incident update still proceeds** (the notification write is not in a transaction). The incident gets `verified` status but no admin alert is created. The admin's `onSnapshot()` listener on the incidents collection would still pick up the verified SOS incident (since it listens to all recent incidents), but the priority popup might not appear if `isEligibleAlert()` filtering has edge cases.

### App Termination During SOS

If the user kills the app after `addDoc()` is called but before receiving confirmation, the write is already committed to Firestore (Firebase SDK sends writes immediately over the network). The incident exists in the database. The user would not see a confirmation, but the data is safe.

---

## 15. Hotspot Accuracy Audit

### Confirmed Risks

| Risk | Evidence |
|---|---|
| Unverified reports in heatmap | `VISIBLE_STATUSES` includes `pending`, `under_review` |
| Single report creates a "hotspot" cell | No minimum threshold in `buildHeatmapCells()` |
| Resolved incidents excluded | `done` not in `VISIBLE_STATUSES` |
| Two grid systems with different resolutions | 111m vs 222m discrepancy |
| No deduplication of community reports of same incident | Not implemented |
| GPS inaccuracy not factored | No `accuracy` field considered |

### Misleading Information Risk

The heatmap can show a "hotspot" in any of the following false scenarios:
1. A single user submits 5 slightly-offset reports of the same incident before the spam check catches them (one per 15+ minutes to avoid the 10-minute window)
2. A neighborhood of 50 people all report the same visible event (e.g., a car accident) — each report adds independently to the weight
3. A disputed or false report that stays `under_review` (not yet marked spam) contributes to the heatmap

---

## 16. Dashboard & Analytics Audit

### Evidence Source
`incidents-list.js` (stats section), `analytics.js`, `dashboard.js`

### Incident Stats on Incidents Page

`updateIncidentStats()` in `incidents-list.js`:
```js
// "resolved" count:
if (status === 'done' || status === 'verified') acc.resolved += 1;
```
**`verified` incidents are counted as "resolved."** This is incorrect. `verified` means the report passed validation and is waiting for response — it is not resolved. This will overstate the "resolved" count on the admin dashboard.

### Incidents List Limit

The admin incidents page loads only 150 incidents. The stat counters on the page reflect only those 150 loaded documents. If there are 1,000 incidents, the displayed stats (`Total`, `High Priority`, `Pending`, `Resolved`) are wrong — they represent only the most recent 150.

> The analytics page (`analytics.js`, 77KB) was not fully read in this audit. Deep analytics query accuracy cannot be confirmed without further inspection.

---

## 17. Performance Audit

### Confirmed Performance Issues

**`getHeatmapData.js` fetches all matching incidents without pagination:**
```js
const incidentsSnapshot = await db.collection("incidents")
    .where("status", "in", VISIBLE_STATUSES)
    .where("timestamp", ">=", startDate)
    .where("timestamp", "<=", endDate)
    .get();
```
With 30 days of data and a growing dataset, this could return thousands of documents in a single read. At 10,000+ incidents, this endpoint will be slow and expensive.

**`aggregateHeatmapData.js` fetches all active incidents at once:**
No pagination. At scale this is a full collection scan. The hourly scheduler will become expensive.

**`checkSpamScore()` in Cloud Function issues two Firestore queries per incident:**
1. Recent reports by the same user (last hour)
2. All recent reports system-wide (last 10 minutes, limit 100)

With high submission volume, the second query scans up to 100 documents on every new submission. This is N reads per submission, where N is up to 100.

**Admin incidents list is not real-time:**
`loadIncidentsTable()` uses `getDocs()` (one-time fetch). Admins will not see new incidents without a manual page reload. The SOS alert listener works separately and triggers the popup, but the table itself goes stale.

**No database indexes confirmed:**
`firestore.indexes.json` exists in the root but was not read. Query performance (especially `where status in [...] + where timestamp >=`) requires composite indexes. Without them, queries will fail or be slow.

---

## 18. Frontend & UX Audit

### Mobile App

**SOS button requires too many steps:**
1. Open app
2. Navigate to SOS tab
3. Hold button for 3 seconds
4. Wait for navigation
5. Select incident type
6. (Optional) Enter description
7. Press "Send SOS Report"

In a genuine emergency, steps 4–7 may be impossible. Ideally, the SOS hold completes and the report is sent immediately with only location and a default "Emergency" type — with optional details on the next screen.

**Location status indicator is cosmetic in SOSGatewayScreen:**
The `SOSGatewayScreen` does not show GPS status. The user does not know if GPS is ready before starting the hold. Location is only fetched on `SOSReportScreen` mount, after the hold completes. The user could complete the hold, navigate to `SOSReportScreen`, and then wait for GPS or see it fail.

**StatusScreen clearly shows incident status:** ✅
The `STATUS_META` configuration in `StatusScreen.js` covers all status values with user-friendly labels and step indicators.

**`rejected` status is shown as "Needs Attention" instead of "Rejected":**
While friendly, this may confuse users about whether their report was dismissed. Users may resubmit the same incident thinking it's pending.

### Admin Web Panel

**No real-time incident list.** Admin must refresh to see new reports, except for the SOS popup which uses `onSnapshot()`.

**`window.prompt()` used for rejection reason in user verification:**
```js
const reason = window.prompt("Reason for rejection:", "ID photo is unclear...");
```
`window.prompt()` is a native browser dialog — inconsistent with the admin panel's custom UI and blocks the main thread.

**Incident code `TR-XXXX` is not a reliable identifier and is not stored.** Two different incidents can have the same code.

---

## 19. Edge Case Test Matrix

| Feature | Scenario | Expected Result | Actual Result | Severity | Status |
|---|---|---|---|---|---|
| Incident Reporting | No incident type selected | Blocked with alert | ✅ Blocked | — | Pass |
| Incident Reporting | Description < 10 chars | Blocked with alert | ✅ Blocked (client + rule + CF) | — | Pass |
| Incident Reporting | GPS disabled | Blocked with alert, retry option | ✅ Blocked, retry shown | — | Pass |
| Incident Reporting | `(0,0)` coordinates | Should be blocked | ⚠️ Passes client check, caught by CF after write | Medium | Partial |
| Incident Reporting | 6+ reports in 1 hour | Spam flagged | ✅ CF flags as spam | — | Pass |
| Incident Reporting | Duplicate location within 10 min | Spam flagged | ✅ CF checks duplicates | — | Pass |
| Incident Reporting | User reads another user's report | Should be blocked | ❌ Allowed — incidents are public | Critical | Fail |
| Incident Reporting | Normal user modifies another user's report | Should be blocked | ✅ Blocked by Firestore rules | — | Pass |
| SOS | GPS unavailable at submit time | SOS blocked until GPS ready | ✅ Submit button disabled | — | Pass |
| SOS | User sends 5 SOS alerts rapidly | Rate limited after 5 | ⚠️ CF flags after 5 total reports (mixed SOS + normal) | Medium | Partial |
| SOS | Admin dismisses alert, refreshes page | Alert should not reappear | ❌ Reappears (localStorage only) | High | Fail |
| SOS | Network failure during submit | User informed, no data loss | ✅ Error shown; no confirmed offline persistence | — | Partial |
| Hotspot | Single incident in area | Should not show intense hotspot | ❌ Shows max weight = 1.0 (weight = count/maxCount) | Medium | Fail |
| Hotspot | Unverified report | Should be excluded | ❌ Included in `pending`, `under_review` | High | Fail |
| Hotspot | 500+ grid cells | Aggregation completes | ❌ Batch reuse bug crashes function | High | Fail |
| Security | Unauthenticated user reads incidents | Should be blocked | ❌ Allowed — public read | Critical | Fail |
| Security | Authenticated user reads all user profiles | Should be blocked | ❌ Allowed | High | Fail |
| Security | Authenticated user modifies any notification | Should be blocked | ❌ Allowed | Critical | Fail |
| Security | Normal user accesses admin page | Blocked, redirected | ✅ Blocked by admin-auth.js | — | Pass |
| Security | Normal user updates incident status via API | Should be blocked | ✅ Blocked by Firestore rule | — | Pass |
| Admin | Admin marks `done`, photo should be deleted | Photo fields deleted | ✅ `deleteField()` called | — | Pass |
| Admin | Admin changes status without audit log | Audit log should capture | ❌ No audit log for status changes | High | Fail |
| Data Integrity | User deleted, incidents remain | Orphaned reporterId | ❌ No cascade, confirmed gap | Medium | Fail |
| Code | `verificationUsers` used before declaration | `users-list.js` runtime error | ⚠️ Variable `verificationUsers` is referenced without declared scope visible in read range | High | Review |

---

## 20. Code Quality Review

### Positives

- **XSS prevention is consistent:** All admin panel modules use `escapeHtml()` and `escapeAttr()` on dynamic content before inserting into DOM. This is done correctly.
- **`writeBatch()` is used for multi-document atomicity** in `respondToIncident()` — updating the incident and creating the notification as a unit. This is the right pattern.
- **Error handling is present** throughout — almost all `async` functions have `try/catch`.
- **Separation of concerns is reasonable:** location logic in `utils/location.js`, auth logic in `utils/auth.js`, admin response in `admin-response.js`.

### Issues

**Many backup and fix scripts left in the screens directory:**
```
HomeScreen.backup.js, HomeScreen.full.js.backup, HomeScreen.old.js, HomeScreen.simple.js
fix_aggressive.py, fix_binary.py, fix_correct.py, fix_final.py, fix_home_direct.py ...
```
These should not be in the production codebase. The `screens/` directory has 11 Python fix scripts and 3 backup files, indicating a difficult development history.

**`hasNotExceededRateLimit()` stub:**
A security function that returns `true` unconditionally creates a false sense of protection and will confuse future maintainers.

**Hardcoded geographic fallback:**
`'Valenzuela City, Philippines'` is hardcoded in both `SOSReportScreen.js` and `ReportIncidentScreen.js` as the address fallback. Any incident reported outside Valenzuela City gets this label.

**`verificationUsers` in `users-list.js`:**
`verificationUsers` is referenced in `buildVerificationCard()` and `getVerificationUser()` but is declared as a module-level variable (`let verificationUsers = ...`) in an area not shown in the read range. If the variable is not properly initialized before these functions are called, it will throw a `ReferenceError`. This requires confirmation.

**Incident code hash collision is unacknowledged:**
The `formatIncidentCode()` function uses `% 10000`, which guarantees collisions at any scale. The code is displayed as if it uniquely identifies an incident, but with 10,001+ incidents, there are guaranteed duplicates.

**No input sanitization on description:**
The description field allows any Unicode content. While XSS is not a risk in Firestore, very long strings, control characters, or emoji-heavy inputs could cause display issues in the admin panel.

---

## 21. Overall System Score

```
Architecture:          7/10  — Clean 3-tier Firebase architecture, well-organized modules.
                               Minor: no real-time admin list, two conflicting hotspot systems.

Database:              5/10  — No defined schema enforcement, public incident reads,
                               unprotected notifications, missing `userVerifications` rule,
                               batch commit bug.

Incident Reporting:    7/10  — Good multi-layer validation (client + rules + CF).
                               Gaps: anonymous flag is fake, coord (0,0) passes client,
                               TR code not unique.

SOS:                   6/10  — Hold-to-activate and location gate are correct.
                               Too many steps for a real emergency. Dismissal not persisted.
                               No confirmed offline persistence.

Hotspot Mapping:       4/10  — Two systems with different grid sizes. Includes unverified
                               reports. No minimum threshold. Batch commit bug crashes
                               aggregation at 500+ cells. Resolved incidents excluded entirely.

Location/GPS:          6/10  — Multi-layer coordinate validation is good. No location timestamp
                               stored. Accuracy set to Balanced (not High for SOS). Reverse
                               geocoding falls back to hardcoded city name.

Security:              4/10  — Incidents publicly readable without auth. Notifications writable
                               by any authenticated user. User profiles exposed to all users.
                               Rate limit function is a stub. No incident audit trail.

Data Integrity:        5/10  — Good use of writeBatch for response. No cascade deletes.
                               Batch commit reuse bug. No status history. `userVerifications`
                               collection has no Firestore rules.

Performance:           5/10  — Full collection scans for heatmap. Admin list not real-time.
                               No confirmed indexes. Spam check does 2 Firestore reads per
                               submission.

Admin Workflow:        6/10  — Auth gate is solid. Inactivity timeout is good. No real-time
                               list. `window.prompt()` for rejection. No audit log for status
                               changes. Stat counters limited to 150 loaded docs.

UX:                    6/10  — SOS has too many steps. Status screen is clear and well-labeled.
                               Error states are shown. Admin panel is visually organized.
                               `rejected` shown as "Needs Attention" is misleading.

Maintainability:       5/10  — Backup and fix scripts pollute source directories. Rate limit
                               stub is a trap. Two hotspot systems that conflict. Incident code
                               collision unacknowledged.

Reliability:           6/10  — Core incident submission path is reliable. Cloud Function
                               failure handling sets `error` status correctly. SOS dismissal
                               not persistent. Notification failure does not affect incident.

Overall:               5.5/10
```

---

## 22. Critical Findings

### 🔴 P0 — Critical

---

**FINDING 001 — All incident data is publicly readable without authentication**

```
Issue: Unauthenticated public read on incidents collection
Feature: Incident Reporting, Privacy, SOS
Location in Code: firestore.rules line 266
Severity: Critical
Evidence:
  allow read: if true;
  // Comment: "Allow public reads so the app can fetch incidents for display"
Why It Matters:
  Every incident report — including reporter UID, exact GPS coordinates, incident description,
  and inline JPEG photos — is readable by anyone with internet access, no account required.
  A malicious actor can enumerate all incidents, build a database of reporter locations,
  or extract evidence photos.
Current Behavior: Full incident data returned to unauthenticated requests.
Expected Behavior: Read access requires authentication. Map view data should be stripped of
  reporter identity and personal location data.
Recommended Fix:
  Change to: allow read: if isAuthenticated();
  For map/heatmap: create a separate sanitized read path that strips reporterId, exact GPS,
  and photos, or use Cloud Functions to serve map data.
```

---

**FINDING 002 — Any authenticated user can create, update, or delete any notification**

```
Issue: Notifications collection has no effective security
Feature: Notifications, SOS Response
Location in Code: firestore.rules lines 331–336
Severity: Critical
Evidence:
  allow read: if true;
  allow update, delete: if isAuthenticated();
  allow create: if isAuthenticated();
Why It Matters:
  An attacker with a regular user account can delete SOS response notifications intended
  for other users, preventing them from knowing help is on the way. They can also
  create fake emergency notifications or flood the system.
Current Behavior: Any logged-in user has full write access to all notifications.
Expected Behavior: Users can only read/update their own notifications (userId == request.auth.uid).
  Admins can read all. Only Cloud Functions (via Admin SDK) or admins should create notifications.
Recommended Fix:
  allow read: if isAuthenticated() && (resource.data.userId == request.auth.uid || isAdmin());
  allow create: if false; // Only Cloud Functions via Admin SDK
  allow update: if isAuthenticated() && resource.data.userId == request.auth.uid;
  allow delete: if isAdmin();
```

---

### 🟠 P1 — High

---

**FINDING 003 — Firestore batch commit reuse bug crashes heatmap aggregation at scale**

```
Issue: Committed batch object is reused after commit
Feature: Hotspot Mapping
Location in Code: aggregateHeatmapData.js lines 122–128
Severity: High
Evidence:
  if (batchCount >= MAX_BATCH_SIZE) {
      await batch.commit();
      batchCount = 0;
      // batch is NOT re-created here
  }
  // Next loop iteration calls batch.set() on the already-committed batch
Why It Matters:
  Once the system accumulates more than 500 daily grid cells, the scheduled heatmap
  aggregation function throws an error on every run. The heatmap stops updating silently.
Current Behavior: Crashes with Firestore SDK error on any dataset > 500 grid cells.
Expected Behavior: A new batch is created after each commit.
Recommended Fix:
  if (batchCount >= MAX_BATCH_SIZE) {
      await batch.commit();
      batch = db.batch(); // Re-initialize
      batchCount = 0;
  }
```

---

**FINDING 004 — SOS admin dismissal is not persisted; alerts can be processed by multiple admins**

```
Issue: SOS alert dismissal stored only in localStorage
Feature: SOS, Admin Workflow
Location in Code: admin-sos-alerts.js lines 114–139
Severity: High
Evidence:
  function isDismissed(id, data) {
      return localStorage.getItem(dismissalKey(id, data)) === "1";
  }
Why It Matters:
  If two admin sessions are open, or an admin refreshes their browser, dismissed SOS alerts
  reappear. Two admins could independently dispatch two precincts to the same incident.
  The reporter receives two "help is on the way" messages with conflicting ETA and responder info.
Current Behavior: Dismissal stored in localStorage; not visible to other sessions or browsers.
Expected Behavior: Dismissal state should be stored in Firestore (e.g., on the incident document)
  so all admin sessions see consistent state.
Recommended Fix:
  Add a `acknowledgedBy` and `acknowledgedAt` field to the incident document when an admin
  dismisses/responds. Use this field in `isEligibleAlert()` to suppress the alert globally.
```

---

**FINDING 005 — No audit trail for incident status changes**

```
Issue: Admin incident status changes are not logged
Feature: Admin Workflow, Audit
Location in Code: incident-modal.js — buildStatusUpdatePayload() does not call logAudit()
Severity: High
Evidence:
  // audit.js logAudit() is only called for:
  //   auth.logout
  //   auth.session_timeout
  // No call exists in incident-modal.js, incident-modal.js status updates, user changes
Why It Matters:
  In a crime reporting system, every admin action on an incident must be traceable.
  Without logs, there is no way to investigate why an incident was rejected, who marked it done,
  or whether an incident was improperly deleted.
Current Behavior: Status changes, deletions, and evidence clearing happen with no audit record.
Expected Behavior: Every status change records: who changed it, from what status, to what status,
  when, and with what incident ID.
Recommended Fix:
  Call logAudit() in buildStatusUpdatePayload() and in the delete/archive handlers.
  Log: action, incidentId, oldStatus, newStatus, moderatedBy, timestamp.
```

---

**FINDING 006 — User profiles including address, phone, and sex are readable by all authenticated users**

```
Issue: Users collection readable by any logged-in user
Feature: Privacy, User Management
Location in Code: firestore.rules line 177
Severity: High
Evidence:
  allow read: if isAuthenticated();
Why It Matters:
  Any user who creates an account can read the full profile of every other user —
  including home address, phone number, barangay, age, and sex.
  This is a serious privacy violation in a crime reporting context where reporter
  identity is sensitive.
Current Behavior: Full user profiles exposed to all authenticated users.
Expected Behavior: Users can read their own profile. Admins can read all profiles.
  Other users should not be able to read personal details.
Recommended Fix:
  allow read: if isOwner(userId) || canManageUserProfiles();
```

---

### 🟡 P2 — Medium

---

**FINDING 007 — SOS requires too many steps for a real emergency**

```
Issue: SOS flow requires 3 seconds hold + incident type selection + manual submit
Feature: SOS
Location in Code: SOSGatewayScreen.js, SOSReportScreen.js
Severity: Medium
Evidence:
  After hold completes → navigate('SOSReport')
  SOSReportScreen: submit button disabled until incidentType is selected
  handleSubmit() called manually by user
Why It Matters:
  In a genuine emergency, the user may be unable to complete a 7-step process.
  The SOS hold is a good anti-accidental-activation measure, but the subsequent
  mandatory steps reduce reliability in extreme situations.
Current Behavior: User must select type and press submit after hold completes.
Expected Behavior: Consider auto-submitting on hold completion with a generic "Emergency"
  type and showing the detail form as an optional post-submission step.
Recommended Fix:
  On hold completion, immediately submit a minimal SOS report (type="emergency", current location).
  Then navigate to a "details" screen where additional info can be added as an amendment.
```

---

**FINDING 008 — Unverified incidents included in heatmap calculations**

```
Issue: VISIBLE_STATUSES includes pending, under_review — unverified reports inflate hotspots
Feature: Hotspot Mapping
Location in Code: aggregateHeatmapData.js line 13, getHeatmapData.js line 20
Severity: Medium
Evidence:
  const VISIBLE_STATUSES = ["verified", "under_review", "pending", "submitted", "open", "responding"];
Why It Matters:
  Unverified reports, including potentially false or duplicate reports, directly affect
  hotspot intensity. Users and authorities may act on misleading hotspot data.
Current Behavior: All non-rejected, non-done incidents count toward hotspot intensity.
Expected Behavior: Only verified incidents should be used for hotspot calculations.
  Under_review could be included but weighted lower.
Recommended Fix:
  Use VISIBLE_STATUSES = ["verified", "responding"] for heatmap calculation.
  Optionally include "under_review" with half weight.
```

---

**FINDING 009 — `verificationUsers` collection has no Firestore security rules**

```
Issue: userVerifications collection missing from firestore.rules
Feature: User Verification Workflow
Location in Code: users-list.js line 452 (updateDoc), firestore.rules (absent)
Severity: Medium
Evidence:
  await updateDoc(doc(db, "userVerifications", userId), {...})
  // No match /userVerifications/{docId} rule in firestore.rules
Why It Matters:
  Without a rule, the default fallback (deny all) applies, causing permission errors.
  The admin panel already shows a message: "Deploy the updated Firestore rules."
  This feature is broken in the current deployment.
Current Behavior: Admin reads/writes to userVerifications fail with permission-denied.
Expected Behavior: Admin roles can read and update userVerifications documents.
Recommended Fix:
  Add to firestore.rules:
  match /userVerifications/{userId} {
    allow read: if canManageUserProfiles();
    allow update: if canManageUserProfiles();
    allow create: if false;
    allow delete: if isAdmin();
  }
```

---

**FINDING 010 — Incident code `TR-XXXX` has hash collisions and is not stored**

```
Issue: Display-only incident code is not unique
Feature: Admin Workflow, Incident Management
Location in Code: incidents-list.js formatIncidentCode(), incident-modal.js formatIncidentCode()
Severity: Medium
Evidence:
  hash = (hash * 31 + s.charCodeAt(i)) % 10000;
  return `TR-${String(hash).padStart(4, '0')}`;
Why It Matters:
  Two different incidents can display the same TR-XXXX code. If admins or users
  reference incidents by this code verbally or in documentation, they may reference
  the wrong record. The code is also not stored — it cannot be searched in Firestore.
Current Behavior: Hash-derived codes that repeat every 10,000 incidents.
Expected Behavior: A unique, sequential, or UUID-based identifier stored in the database.
Recommended Fix:
  Generate a unique identifier on incident creation (e.g., auto-increment via Cloud Function,
  or store a short UUID segment) and store it as an `incidentCode` field in Firestore.
```

---

### 🟢 P3 — Low

---

**FINDING 011 — Reverse geocoding fallback is hardcoded to one city**

```
Issue: Failed reverse geocoding returns 'Valenzuela City, Philippines' for all incidents
Feature: Location, Incident Reporting
Location in Code: ReportIncidentScreen.js line 496, SOSReportScreen.js line 257
Severity: Low
Evidence:
  let locationAddress = 'Valenzuela City, Philippines';
Why It Matters: Incidents near the city boundary or in adjacent municipalities display
  a misleading address in the admin panel.
Recommended Fix: Show "Address unavailable" or the raw coordinates when reverse geocoding fails.
```

---

**FINDING 012 — GPS accuracy set to Balanced for SOS (should be High)**

```
Issue: SOS uses Location.Accuracy.Balanced instead of High
Feature: SOS, Location
Location in Code: location.js line 63
Severity: Low
Evidence:
  accuracy: Location.Accuracy.Balanced
Why It Matters: In an emergency, a 100–500m accuracy difference can matter to responders.
Recommended Fix: For SOS specifically, request Location.Accuracy.High or BestForNavigation.
  This can be passed as a parameter to getCurrentLocation().
```

---

**FINDING 013 — Backup and fix scripts in production source directories**

```
Issue: Development artifacts left in screens/ directory
Feature: Code Quality, Maintainability
Location in Code: mobile/screens/ — 11 Python fix scripts, 3 JS backup files
Severity: Low
Evidence:
  HomeScreen.backup.js, HomeScreen.full.js.backup, HomeScreen.old.js, HomeScreen.simple.js
  fix_aggressive.py, fix_binary.py, fix_correct.py, fix_final.py, fix_home_direct.py, ...
Why It Matters: These confuse future maintainers, inflate repository size, and suggest
  the development process relied on ad-hoc patching rather than version control.
Recommended Fix: Delete all backup and fix scripts. Use git history for recovery.
  Add *.backup, *.bak, fix_*.py to .gitignore.
```

---

## 23. Final Development Recommendation

Based on the actual implementation, the following priority sequence is recommended. Do not skip steps — each depends on the previous.

---

### Step 1 — Fix Critical Security Issues (Do Before Any Deployment)

**Why first:** Public incident reads and open notification writes are exploitable immediately.

1. Restrict `incidents` read to authenticated users. Create a separate sanitized endpoint (Cloud Function) for the public map view that strips reporter identity.
2. Lock `notifications` collection: only the owner user and admins can read; only Cloud Functions (Admin SDK) can create; users can only mark their own as read.
3. Lock `users` collection reads: owner or admin only.

---

### Step 2 — Fix the Hotspot Batch Commit Bug

**Why second:** The heatmap is broken at any significant scale. Fix before the system grows.

1. Re-initialize the Firestore batch after each commit in `aggregateHeatmapData.js`.
2. Reconcile the two grid size systems (111m vs 222m). Pick one and document it.
3. Remove unverified statuses from `VISIBLE_STATUSES` in heatmap calculations.

---

### Step 3 — Fix Data Integrity and Missing Rules

**Why third:** Broken features (userVerifications) and orphan risks need resolution before users encounter them.

1. Add `userVerifications` collection to `firestore.rules`.
2. Persist SOS alert dismissal in Firestore (add `adminAcknowledgedBy`, `adminAcknowledgedAt` to incident document).
3. Add status change history (subcollection or array field `statusHistory`).

---

### Step 4 — Add Incident Audit Logging

**Why fourth:** Once the security model is correct, ensure accountability for admin actions.

1. Call `logAudit()` in `buildStatusUpdatePayload()`, archive/delete handlers, and user profile changes in `user-modal.js`.
2. Log: `action`, `incidentId`, `from`, `to`, `moderatedBy`, `timestamp`.

---

### Step 5 — Improve SOS Reliability

**Why fifth:** Once security is sound, make the emergency feature truly reliable.

1. Change SOS to auto-submit on hold completion with a minimal default payload (type = `emergency`, current location). Show the detail form as a post-submission amendment screen.
2. Use `Location.Accuracy.High` for SOS location requests.
3. Store `locationCapturedAt` and `locationAccuracy` in the incident location object.
4. Confirm and enable Firebase offline persistence in the mobile SDK configuration.

---

### Step 6 — Fix Admin Workflow Issues

1. Convert `incidents-list.js` from `getDocs()` to `onSnapshot()` for real-time updates.
2. Fix stat counters: remove `verified` from the "resolved" count.
3. Replace `window.prompt()` in verification rejection with a proper modal.
4. Generate and store a unique `incidentCode` field in Firestore on incident creation.

---

### Step 7 — Fix Location and GPS

1. Add `locationCapturedAt` and `locationAccuracyMeters` fields to all incident location objects.
2. Store GPS accuracy for SOS reports.
3. Replace the hardcoded city fallback with "Address unavailable" when reverse geocoding fails.

---

### Step 8 — Hotspot Accuracy Improvements

1. Set a minimum incident threshold (e.g., ≥ 2 incidents) before displaying a heatmap cell.
2. Consider weighting unverified incidents at 0.3× rather than 1× to reduce false hotspot risk.
3. Document the hotspot algorithm in code and in the admin panel for operator awareness.

---

### Step 9 — Performance Optimization

1. Add pagination or time-windowed queries to `getHeatmapData.js` for large datasets.
2. Verify composite indexes in `firestore.indexes.json` for all multi-field queries.
3. Consider moving heatmap computation entirely to Cloud Functions to avoid heavy client-side reads.

---

### Step 10 — Code Cleanup

1. Delete all `.backup.js`, `.old.js`, `.simple.js`, and `fix_*.py` files from `mobile/screens/`.
2. Remove the `hasNotExceededRateLimit()` stub or implement real pre-write rate limiting.
3. Standardize the role string handling (there are 8 variant strings for "barangay admin" in the rules — normalize at write time).

---

### Step 11 — Security Testing

1. Attempt to read incidents without authentication. Verify it is blocked after Step 1.
2. Attempt to write to `notifications` as a regular user. Verify it is blocked.
3. Attempt to read another user's profile as a regular user. Verify it is blocked.
4. Submit 6 incidents in one hour and verify all subsequent ones are flagged spam.
5. Submit an incident with coordinates `(0, 0)` and verify it is rejected at the Firestore rule level (after fixing the client check).
6. Verify that two admins cannot both respond to the same SOS alert independently.

---

### Step 12 — UX and Final Polish

1. Add a visual GPS accuracy indicator to the SOS screen.
2. Change `rejected` label back to "Rejected" or "Report Rejected" in `StatusScreen.js`.
3. Add real-time update to the admin incidents table.
4. Display a warning when the admin incidents table shows fewer than the total incident count.

---

*End of Audit Report*

---

> **Audit Methodology Note:** Every finding in this report is based on direct inspection of the following files: `firestore.rules`, `storage.rules`, `functions/index.js`, `functions/src/validateIncident.js`, `functions/src/aggregateHeatmapData.js`, `functions/src/getHeatmapData.js`, `functions/src/calculateRiskLevel.js`, `mobile/screens/SOSGatewayScreen.js`, `mobile/screens/SOSReportScreen.js`, `mobile/screens/ReportIncidentScreen.js`, `mobile/screens/StatusScreen.js`, `mobile/utils/auth.js`, `mobile/utils/location.js`, `web-admin/js/admin-auth.js`, `web-admin/js/admin-sos-alerts.js`, `web-admin/js/admin-response.js`, `web-admin/js/incidents-list.js`, `web-admin/js/incident-modal.js`, `web-admin/js/users-list.js`, `web-admin/js/notifications-list.js`, `web-admin/js/audit.js`. No assumptions were made from screenshots, documentation, or the existence of UI buttons alone.
