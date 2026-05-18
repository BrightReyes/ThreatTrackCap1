# ThreatTrack Defense Review Guide

Prepared for: Capstone defense discussion  
System: ThreatTrack public safety reporting mobile app and web admin dashboard  
Main audience: Panelists, developers, barangay administrators, police administrators

## 1. Overall System Explanation

ThreatTrack is a public safety and incident reporting system for Valenzuela City. It has two main sides:

- **User side:** a mobile application where residents can sign up, log in, report incidents, send SOS reports with location, receive notifications, and track the status of their submitted reports.
- **Admin side:** a web dashboard where authorized staff can monitor incident reports, view analytics, manage users, review notifications, configure settings, and coordinate responses.

The system is built around real-time reporting. A user submits an incident from the mobile app, the report is stored in Firebase Firestore, Cloud Functions validate or process the report, and the admin dashboard updates from the same database. When an admin responds to an urgent report, the user side receives status updates through Firestore notifications and live report tracking.

ThreatTrack is useful because it connects community reporting, location-based incident data, admin review, police response coordination, analytics, and AI-assisted recommendations in one system. It helps reduce the delay between a resident reporting a threat and an authorized responder seeing the report.

## 2. System Architecture

ThreatTrack uses a client-cloud architecture:

| Layer | Technology | Purpose |
| --- | --- | --- |
| Mobile client | React Native, Expo | User-facing Android/iOS-style app for reports, SOS, notifications, and status tracking |
| Web admin client | HTML, CSS, JavaScript ES modules, Vite | Browser-based dashboard for admins and police admins |
| Backend | Firebase Cloud Functions, Node.js 20 | Server-side validation, analytics aggregation, risk calculation, AI summary generation, and notification processing |
| Database | Firebase Firestore | Stores users, incidents, precincts, notifications, settings, audit logs, analytics summaries |
| Storage | Firebase Storage | Stores uploaded incident evidence photos |
| Authentication | Firebase Authentication | Handles user/admin sign-in accounts |
| Maps | React Native Maps, Leaflet, Leaflet Heat, Leaflet MarkerCluster | Displays reports, precincts, boundaries, markers, and heatmap-style views |
| AI provider | Google Gemini API | Generates admin decision-support summaries and hotspot action plans |

The mobile app and admin dashboard do not use a traditional custom REST backend for every feature. Most live data is handled through Firebase SDKs. Backend logic that must be trusted or automated is placed in Firebase Cloud Functions.

## 3. Main Data Flow

1. A user logs in through Firebase Authentication.
2. The user submits a regular incident report or an SOS report from the mobile app.
3. The app collects incident type, severity, role as reporter, description, evidence photo if provided, and GPS location.
4. The report is saved to the `incidents` collection in Firestore.
5. If a photo is attached, it is uploaded to Firebase Storage under `incident-photos`.
6. Cloud Functions validate the report, score it, update its status, and create priority admin notifications when needed.
7. Admin pages listen to Firestore and display reports, dashboard stats, notifications, maps, and analytics.
8. For urgent reports, an admin can assign/respond using the nearest police precinct options.
9. The response is written back to Firestore and a notification is created for the reporting user.
10. The user sees the updated status in the mobile Status screen and can receive response alerts.

## 4. User Side Modules

### 4.1 Authentication Module

Files: `mobile/LoginScreen.js`, `mobile/SignUpScreen.js`, `mobile/utils/auth.js`, `mobile/utils/firebase.js`

Purpose:
- Allows residents to create accounts and log in.
- Stores user profile data in Firestore.
- Uses Firebase Authentication for account identity.

Important fields stored for users include name, email, barangay, role, account status, report counters, notification preferences, and profile metadata.

Usefulness:
- Keeps reports connected to authenticated users.
- Allows the system to track report history and prevent abuse.
- Supports admin-side user management and account review.

### 4.2 Home and Map Module

Files: `mobile/screens/HomeScreen.js`, `mobile/components/maps/index.js`, `mobile/components/maps/index.web.js`, `mobile/data/valenzuelaPrecincts.js`

Purpose:
- Shows the user-facing map experience.
- Uses location and precinct/boundary data for Valenzuela.
- Helps users understand nearby public safety context.

Usefulness:
- Makes incident reporting location-aware.
- Helps residents see safety information geographically instead of only as text.

### 4.3 Regular Incident Reporting Module

File: `mobile/screens/ReportIncidentScreen.js`

Purpose:
- Lets users submit structured incident reports.
- Supports incident category selection, reporter role selection, description, current GPS location, reverse geocoded address, severity assignment, and optional evidence photo.

Incident types include:
- Robbery / Hold-up
- Physical Assault / Injury
- Domestic Violence
- Traffic Accidents
- Illegal Weapons
- Theft / Snatching
- Drug-Related Activity
- Public Disturbance
- Suspicious Activity
- Vandalism / Property Damage

Usefulness:
- Standardizes incident reports so admins can analyze them.
- Reduces vague submissions by forcing type, severity, reporter role, and location.
- Evidence uploads can help validation.

### 4.4 SOS / Emergency Reporting Module

Files: `mobile/screens/SOSGatewayScreen.js`, `mobile/screens/SOSReportScreen.js`

Purpose:
- Provides a faster emergency path than the regular report form.
- Requires a valid current location before sending.
- Automatically flags the report with `isSOSReport: true`.

Usefulness:
- Helps urgent incidents reach the admin dashboard faster.
- Prioritizes high-risk reports for response coordination.
- Sends location immediately, even when details are short.

### 4.5 Report Status Tracking Module

File: `mobile/screens/StatusScreen.js`

Purpose:
- Shows the user all reports they submitted.
- Listens to Firestore in real time using `onSnapshot`.
- Displays report stages such as submitted, under review, responding, completed, rejected, or spam.
- Shows assigned responder details when help is on the way.

Usefulness:
- Gives transparency to the user after submitting a report.
- Confirms that admin response updates are reaching the citizen side.
- Reduces uncertainty during urgent reports.

### 4.6 Notifications Module

Files: `mobile/screens/AlertsScreen.js`, `mobile/components/ResponseAlertListener.js`

Purpose:
- Shows user notifications from Firestore.
- Marks notifications as read.
- Displays urgent response updates, police urgent reports, and report-related alerts.

Usefulness:
- Keeps users informed without manually refreshing.
- Allows responders/admin actions to be reflected on the user side.

### 4.7 Settings Module

File: `mobile/screens/SettingsScreen.js`

Purpose:
- Contains user preferences and logout access.
- Supports notification preference concepts used by the response listener.

Usefulness:
- Gives users control over their account and alert behavior.

## 5. Admin Side Modules

The admin side is located in `web-admin/`. It is a Vite web application using plain HTML, CSS, and JavaScript modules with Firebase SDK integration.

### 5.1 Admin Login and Session Module

Files: `web-admin/login.html`, `web-admin/js/login.js`, `web-admin/js/admin-auth.js`

Purpose:
- Allows dashboard users to sign in.
- Loads the signed-in user profile from Firestore.
- Applies role labels and role-based navigation.
- Handles sign out and session timeout.

Usefulness:
- Separates dashboard access from the mobile user flow.
- Supports different admin experiences depending on the account role.

### 5.2 Dashboard Module

Files: `web-admin/dashboard.html`, `web-admin/js/dashboard.js`, `web-admin/js/admin-stats.js`, `web-admin/js/admin-map.js`

Purpose:
- Provides the main admin overview.
- Displays statistics, map information, recent activity, and navigation to incidents, users, analytics, and notifications.

Usefulness:
- Gives administrators a quick operational view.
- Helps identify whether there are open reports, recent incidents, or urgent activity.

### 5.3 Incident Management Module

Files: `web-admin/incidents.html`, `web-admin/js/incidents.js`, `web-admin/js/incidents-list.js`, `web-admin/js/incident-modal.js`

Purpose:
- Displays submitted reports.
- Supports filtering, reviewing, opening report details, moderating status, and handling incident workflows.

Usefulness:
- Converts raw reports into admin-reviewable cases.
- Allows staff to verify, reject, monitor, or respond to incidents.

### 5.4 SOS and Admin Response Module

Files: `web-admin/js/admin-sos-alerts.js`, `web-admin/js/admin-response.js`

Purpose:
- Detects urgent reports and presents priority admin alerts.
- Finds responder options from active precinct data and built-in Valenzuela precinct data.
- Calculates distance and estimated response time.
- Writes response details back to the incident and creates a user notification.

Usefulness:
- Helps admins act on urgent incidents quickly.
- Avoids always assigning one fixed station by showing nearest precinct options.
- Gives the user a visible “help is on the way” update.

### 5.5 User Management Module

Files: `web-admin/users.html`, `web-admin/js/users.js`, `web-admin/js/users-list.js`, `web-admin/js/user-modal.js`

Purpose:
- Lets admins view and manage user profile records.
- Supports role/account review workflows.

Usefulness:
- Helps identify users, manage account states, and moderate abuse.
- Supports defense explanation of how false reports or suspicious accounts can be handled.

### 5.6 Notifications Module

Files: `web-admin/notifications.html`, `web-admin/js/notifications.js`, `web-admin/js/notifications-list.js`

Purpose:
- Displays system and report notifications for the dashboard.
- Allows read/archive/delete style notification actions.

Usefulness:
- Gives admins a centralized event log for alerts and system messages.

### 5.7 Analytics Module

Files: `web-admin/analytics.html`, `web-admin/js/analytics.js`

Purpose:
- Reads incident data and generates analytics summaries.
- Shows totals, severity breakdowns, status workload, hourly patterns, hotspot evidence, and recommended actions.
- Supports AI-generated hotspot action plans using Gemini in local demo mode.

Usefulness:
- Helps administrators move from individual reports to patterns.
- Makes the system useful for planning patrols, warnings, lighting, CCTV, barangay coordination, and public safety interventions.

### 5.8 Police Operation Module

Files: `web-admin/operation.html`, `web-admin/js/operation.js`

Purpose:
- Provides a police-admin-only operation page.
- Lets police admins create police-originated reports and notifications.
- Geocodes entered locations and publishes reports to Firestore.

Usefulness:
- Allows police staff to publish official operational reports, not only respond to citizen reports.
- Helps active app users receive police-originated high-priority notifications.

### 5.9 Settings, Branding, Audit, and Data Tools

Files: `web-admin/settings.html`, `web-admin/js/settings.js`, `web-admin/js/admin-branding.js`, `web-admin/js/audit.js`

Purpose:
- Manages system name/branding, incident categories, barangay lists, map settings, notification settings, role/access settings, data import/export, and audit logs.

Usefulness:
- Makes the system configurable for the barangay/city context.
- Gives administrators tools to maintain the system without editing source code.

## 6. Barangay Admin vs Police Admin

ThreatTrack separates dashboard responsibilities by role.

| Feature Area | Barangay Admin | Police Admin |
| --- | --- | --- |
| Dashboard overview | Can access admin dashboard | Can access admin dashboard |
| Incident monitoring | Can review and manage reports | Can review and manage reports |
| User management | Can assist in profile/account moderation depending on rules | Can assist in operational account/report review depending on rules |
| Notifications | Can view and manage dashboard notifications | Can view and manage dashboard notifications |
| Analytics | Can use analytics and recommendations for barangay planning | Can use analytics and recommendations for police deployment planning |
| Settings | Can manage barangay/system settings depending on configured permissions | Can manage operational/security-related settings depending on configured permissions |
| Operation page | Not shown by default | Available only to police admin role |
| Police-originated reports | Not the main role | Can create official police operation reports |
| Response coordination | Can monitor urgent reports and support local coordination | Main role for assigning/dispatching police responders |

Defense explanation:

- **Barangay Admin** focuses on local monitoring, barangay-level coordination, resident reports, prevention actions, and community safety planning.
- **Police Admin** focuses on urgent response, police operation reporting, responder assignment, and high-priority public safety alerts.

In the code, roles such as `barangay`, `barangay_admin`, and `moderator` are normalized as admin-like roles, while `police_admin` is normalized as police. The Police Operation page is restricted with `requirePolice`.

## 7. Backend and Cloud Function Modules

Cloud Functions are located in `functions/` and run on Node.js 20.

| Function | Type | Purpose |
| --- | --- | --- |
| `validateIncident` | Firestore trigger | Validates new incident reports, checks quality/spam signals, updates status, and creates priority notifications |
| `calculateRiskLevel` | HTTP function | Calculates risk level for a location based on nearby recent incidents |
| `aggregateHeatmapData` | Scheduled function | Aggregates incident data into heatmap/grid statistics |
| `getHeatmapData` | HTTP function | Returns heatmap data for dashboard/map use |
| `findNearestPrecinct` | HTTP function | Finds nearest active precincts from a given location |
| `sendNearbyIncidentAlert` | Firestore trigger | Sends/records nearby incident alerts when incidents become verified |
| `generateAnalyticsSolutionSummary` | Callable/HTTP-style backend support | Generates analytics solution summaries |
| `generateAdminAISummary` | Callable function | Builds privacy-safe analytics data, calls Gemini, and stores AI draft summaries |
| `healthCheck` | HTTP function | Confirms the Cloud Functions service is running |

Usefulness:
- Keeps sensitive or automated logic off the client side.
- Allows incident validation and analytics tasks to happen automatically.
- Supports real-time admin and user workflows.

## 8. Database Collections

Main Firestore collections used by the system:

| Collection | Purpose |
| --- | --- |
| `users` | User/admin profiles, roles, account status, preferences, barangay data |
| `incidents` | All submitted user reports, SOS reports, police operation reports, response status, location, severity |
| `incidents_archive` | Archived incident records |
| `precincts` | Police precinct data, locations, contact info, active state |
| `notifications` | User/admin notifications, response updates, urgent alerts |
| `settings` | System settings, branding, incident categories, map/notification/security settings |
| `audit_logs` | Admin action logs |
| `crime_statistics` | Aggregated heatmap/statistical data |
| `ai_suggestion_summaries` | Stored AI-generated admin decision-support drafts |

## 9. APIs and External Services Used

### Firebase APIs

- **Firebase Authentication:** login, signup, current user identity, sign out.
- **Cloud Firestore:** real-time database for users, incidents, notifications, settings, analytics output, audit logs.
- **Firebase Storage:** uploaded evidence photos.
- **Firebase Cloud Functions:** backend validation, analytics, AI, risk, heatmap, and precinct services.
- **Firebase Admin SDK:** trusted backend access inside Cloud Functions.
- **Firebase Cloud Messaging concept:** backend notification support through Firebase Admin messaging and notification records.

### Expo and Mobile APIs

- **Expo Location (`expo-location`):** asks location permission, gets current GPS location, watches location, reverse geocodes coordinates into addresses.
- **Expo Image Picker (`expo-image-picker`):** lets users take or choose evidence photos.
- **React Navigation:** manages mobile screen navigation.
- **React Native Maps:** mobile map rendering.

### Web Map and Data APIs/Libraries

- **Leaflet:** web admin map rendering.
- **Leaflet Heat:** heatmap visualization.
- **Leaflet MarkerCluster:** marker grouping on admin maps.
- **PapaParse:** CSV import/export parsing for data tools.
- **SweetAlert2:** admin alerts, confirmations, and toast-style feedback.

### AI API

- **Google Gemini API:** used for AI-generated admin summaries and hotspot action plans.
- The server-side callable function `generateAdminAISummary` uses the `GEMINI_API_KEY` secret so the key does not need to be exposed in client code.
- The analytics page also contains a local demo mode that can call Gemini from the browser for hotspot plans. For defense, explain this as demo-only unless fully moved server-side.

## 10. Languages and Tech Stack

| Area | Stack |
| --- | --- |
| Mobile app | JavaScript, React Native, Expo |
| Mobile UI | React Native components, custom styles, Ionicons, image assets |
| Admin dashboard | HTML, CSS, JavaScript ES modules |
| Admin build tool | Vite |
| Backend | Node.js 20, Firebase Cloud Functions |
| Database | Firebase Firestore |
| File storage | Firebase Storage |
| Authentication | Firebase Authentication |
| Maps | React Native Maps, Leaflet |
| AI | Google Gemini API |
| Package manager | npm |
| Native Android project | Gradle / Android project files |

## 11. AI Implementation

ThreatTrack uses AI as decision support for administrators, not as an automatic final decision maker.

   ### 11.1 What the AI Does

   The AI reads aggregated incident analytics, not private raw victim/suspect details, and produces:

   - Overall risk summary
   - Priority hotspot list
   - Main observed crime patterns
   - Evidence-based recommendations
   - Suggested public advisory text
   - Data quality warnings
   - Next data to collect
   - Hotspot-specific action plans

### 11.2 How the AI Works

The `generateAdminAISummary` Cloud Function:

1. Verifies the caller is signed in.
2. Checks the caller role from `users/{uid}`.
3. Loads recent incident data from Firestore.
4. Aggregates totals, severity counts, statuses, type breakdowns, hotspots, trends, peak hours, and nearest precinct context.
5. Builds a privacy-safe analytics payload.
6. Sends that payload to Gemini with rules such as:
   - Do not identify private people.
   - Do not claim certainty.
   - Do not recommend vigilante action.
   - Use cautious, non-alarmist language.
   - Recommend actions admins, police, barangay responders, or the system can review.
7. Receives structured JSON.
8. Saves the AI draft to `ai_suggestion_summaries` for review/audit.

### 11.3 Why AI Is Useful

AI is useful because admins may have many reports but limited time to interpret patterns. The AI can quickly summarize:

- Which areas need attention first
- What incident types are dominant
- Whether reports are increasing or stable
- What actions are practical for barangay or police teams
- What public advisory can be reviewed before posting

The AI does not replace human judgment. It supports faster analysis, clearer planning, and better explanation of data patterns.
   
### 11.4 Defense Statement About AI

You can say:

> The AI implementation is used as decision support. It reviews aggregated incident statistics and suggests possible actions, but final decisions remain with authorized barangay or police administrators. The system is designed to avoid exposing private identities to the AI prompt and stores generated summaries as drafts for admin review.

## 12. How Each Part Is Useful

| System Part | Usefulness |
| --- | --- |
| User reporting | Allows residents to report incidents directly from the field |
| SOS reporting | Provides faster reporting for urgent situations |
| GPS location | Gives admins and responders accurate incident location |
| Evidence photo upload | Helps verify or investigate reports |
| Real-time status tracking | Lets users know if their report is under review, responding, or completed |
| Admin dashboard | Gives staff a command center for monitoring reports |
| Incident management | Helps validate, moderate, and act on reports |
| Police response assignment | Connects urgent reports to nearest responder options |
| Notifications | Keeps users and admins updated |
| Analytics | Finds trends, workloads, hotspots, and severity patterns |
| Heatmap/risk tools | Shows geographic concentration of incidents |
| AI recommendations | Converts analytics into draft action plans |
| Settings/data tools | Makes the system configurable and maintainable |
| Audit logs | Supports accountability for admin actions |

## 13. Defense-Friendly Module Summary

### User Side Summary

The user side is a React Native mobile app. It is responsible for authentication, reporting incidents, sending SOS reports, uploading optional evidence, getting the user location, showing notifications, and tracking report status. It is useful because it gives residents a fast and structured way to report threats and receive updates.

### Barangay Admin Summary

The barangay admin side focuses on local monitoring, report review, analytics, resident management, settings, and barangay-level public safety planning. It is useful because barangay staff can identify repeated issues, coordinate community action, and support police response with better information.

### Police Admin Summary

The police admin side includes the normal dashboard functions plus the Operation module. Police admins can create police-originated reports, send high-priority notifications, and coordinate responder assignments. It is useful because police staff can act on urgent incidents and publish operational reports to app users.

### Backend Summary

The backend uses Firebase Cloud Functions and Firestore. It validates reports, calculates risk, aggregates heatmap data, finds precincts, sends notifications, and generates AI summaries. It is useful because it keeps important processing centralized and consistent.

## 14. Important Defense Notes

- Present the system as a capstone prototype with real Firebase integration.
- Emphasize that AI is advisory and requires admin review.
- Explain that user identity is not meant for public display.
- Explain that location is important because reports without location are less actionable.
- Mention that barangay admins and police admins have different responsibilities.
- Be ready to explain that Firebase is used as Backend-as-a-Service: authentication, database, storage, serverless functions, and notification support.
- If asked about production deployment, mention that production hardening should include stricter security rules, complete role enforcement, server-side rate limiting, dependency cleanup, testing, and secure AI key handling.

## 15. Short Defense Script

ThreatTrack is a public safety reporting and monitoring system composed of a React Native mobile app and a Vite web admin dashboard. Residents use the mobile app to submit regular incident reports or SOS reports with their current location and optional evidence photos. These reports are stored in Firebase Firestore and processed by Firebase Cloud Functions.

On the admin side, barangay administrators can monitor reports, manage users, view notifications, configure settings, and use analytics to identify hotspots. Police administrators have additional operational features, especially the Operation page and responder coordination. For urgent incidents, the system can show nearest precinct options, estimate response information, update the report status, and notify the user that help is on the way.

The system also includes AI-assisted analytics using Google Gemini. The AI summarizes reported patterns and suggests hotspot action plans for admin review. It does not make final decisions automatically. Its purpose is to help administrators understand data faster and prepare better prevention or response strategies.

Overall, ThreatTrack is useful because it connects citizen reporting, real-time database updates, admin monitoring, police response coordination, mapping, analytics, and AI recommendations into one public safety workflow.
