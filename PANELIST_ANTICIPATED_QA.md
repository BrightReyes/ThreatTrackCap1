# ThreatTrack Anticipated Panelist Questions And Answers

Purpose: Quick preparation guide for capstone defense Q&A.  
System: ThreatTrack public safety reporting mobile app and web admin dashboard.  
Recommended style: Answer directly first, then explain the feature, limitation, and future improvement if needed.

## 1. Why Do You Need To Develop This Kind Of App?

**Answer:**

We developed ThreatTrack because public safety reporting can be slow, scattered, and difficult to monitor when reports are handled manually or through separate communication channels. In many situations, residents may know about an incident first, but the information does not immediately become organized data for administrators or responders.

ThreatTrack helps solve that gap by giving residents a mobile app for reporting incidents and SOS cases, while giving admins a web dashboard for monitoring, reviewing, mapping, and responding to those reports. The goal is not to replace the police or barangay process, but to support it with faster reporting, real-time updates, location data, analytics, and AI-assisted recommendations.

## 2. What Makes ThreatTrack Different From Other Apps?

**Answer:**

ThreatTrack is different because it combines several public safety functions into one connected workflow. It is not only a report form. It includes user incident reporting, SOS reporting, real-time report status tracking, admin incident review, responder or precinct selection, map visualization, heatmap analytics, notifications, and AI-assisted action plans.

Another difference is that the system is designed around the local public safety context of Valenzuela City. It uses incident categories, barangay/location data, precinct response options, and admin workflows that are relevant to local monitoring. The AI is also used as decision support, not as an automatic final decision-maker.

## 3. How Can We Make Sure That The AI Decision Is Accurate?

**Answer:**

The AI in ThreatTrack does not make final decisions by itself. It only provides decision-support summaries for admins, such as hotspot patterns, possible risks, and recommended actions. The final validation and action still come from authorized human staff.

To improve accuracy, the system uses structured incident data such as incident type, severity, location, timestamp, and report counts instead of relying on random text alone. The AI output should also be reviewed against actual reports, map data, and admin judgment before any action is taken.

For production, we would further improve AI accuracy by adding more validation rules, comparing AI recommendations with historical outcomes, logging admin accept/reject actions, and regularly reviewing incorrect suggestions. So our defense position is: the AI is helpful for analysis, but it is not treated as an unquestionable authority.

## 4. How Is Severity Computed?

**Answer:**

Severity is assigned based on the selected incident type. The system classifies incident categories into high, medium, or low severity depending on urgency and potential harm.

Examples:

| Severity | Incident types |
| --- | --- |
| High | Robbery / Hold-up, Physical Assault / Injury, Domestic Violence, Traffic Accident, Illegal Weapons |
| Medium | Theft / Snatching, Drug-Related Activity, Public Disturbance, Suspicious Activity |
| Low | Vandalism / Property Damage |

This makes reporting more consistent because users do not freely decide the severity. Instead, the selected incident type automatically maps to a predefined severity level. SOS reports and high-severity reports are treated as high priority so admins can respond faster.

## 5. How Does The Heatmap Formula Work?

**Answer:**

The heatmap works by grouping incident reports into geographic grid cells. Each report must have a valid latitude and longitude. The system rounds the coordinates to create a grid cell, then counts how many incidents happened in that area.

The heatmap also uses severity weighting:

```text
Weighted Score = (High incidents x 3) + (Medium incidents x 2) + (Low incidents x 1)
```

For example, if one grid cell has 2 high incidents, 3 medium incidents, and 4 low incidents:

```text
Weighted Score = (2 x 3) + (3 x 2) + (4 x 1)
Weighted Score = 6 + 6 + 4
Weighted Score = 16
```

A higher score means that area has more serious or more frequent incidents. The map can then show stronger heat intensity for cells with higher scores.

## 6. How Does The Score Work?

**Answer:**

ThreatTrack uses a verification score from 0 to 100 to help classify report quality. The score is computed from validation checks:

| Validation check | Points |
| --- | ---: |
| Valid location | 25 |
| Valid incident type | 15 |
| Valid severity | 15 |
| Valid description | 25 |
| Not detected as spam | 20 |
| Total | 100 |

The system then uses the score to decide the initial report status:

| Score or condition | Result |
| --- | --- |
| SOS or high severity with valid location and type | Verified / priority review |
| Score 80 and above | Verified |
| Score below 30 | Spam |
| Score 30 to 79 | Under review |

This score does not mean the incident is legally proven. It only means the report has enough required data to be useful for admin review.

## 7. How Is Risk Level Computed?

**Answer:**

Risk level is based on recent incidents within a selected location radius. The system counts incidents by severity and by time period, especially the last 7 days.

The current rule is:

| Risk level | Condition |
| --- | --- |
| High | 3 or more high-severity incidents, or 10 or more total incidents in the last 7 days |
| Medium | 1 to 2 high-severity incidents, or 5 to 9 total incidents in the last 7 days |
| Low | No high-severity incident and fewer than 5 incidents in the last 7 days |

This approach is easy to explain and audit because the risk level is not hidden. It comes from clear thresholds.

## 8. Is The AI Replacing Police Or Barangay Decision-Making?

**Answer:**

No. The AI only assists admins by summarizing patterns and suggesting possible actions. It cannot approve reports, reject reports, dispatch responders, or close cases by itself.

The human admin still checks the report details, evidence, location, and context before taking action. This is important because public safety decisions require accountability and local judgment.

## 9. What Data Is Sent To The AI?

**Answer:**

The intended AI flow uses aggregated public safety data, not personal user information. The AI should receive data such as incident counts, severity breakdown, incident types, hotspot areas, time patterns, and risk levels.

Sensitive information such as names, phone numbers, emails, exact private profile data, and account credentials should not be sent to the AI. For production, the AI request should run through Firebase Cloud Functions so the API key is protected and the data can be sanitized before being processed.

## 10. What If A User Sends A Fake Report?

**Answer:**

ThreatTrack reduces fake reports in several ways. First, reports are connected to authenticated accounts. Second, the report is validated for location, type, severity, description, and spam patterns. Third, suspicious reports can be marked as spam or placed under review. Fourth, admins can review the report before taking final action.

The system also keeps reporter metadata such as report count and last report time, which can support future trust scoring and abuse monitoring. For a production version, we would add stricter server-side rate limiting and stronger audit logs.

## 11. How Do You Protect User Privacy?

**Answer:**

The system uses Firebase Authentication so each user has a verified identity in the system. Private user data and report details should be protected by Firestore security rules, and evidence photos should be protected through Firebase Storage rules.

For defense, we should clearly say that ThreatTrack is a capstone prototype and privacy hardening is part of the production roadmap. The production version should restrict incident details to the report owner and authorized staff, use sanitized public map summaries, and avoid exposing exact personal information to other users.

## 12. Why Did You Use Firebase?

**Answer:**

We used Firebase because it supports the main needs of our system: authentication, real-time database updates, cloud storage for evidence photos, and server-side Cloud Functions. It also helps us build both the mobile app and admin dashboard faster without creating a full custom backend from zero.

Firebase is useful for ThreatTrack because incident reports and status updates need to appear in near real time. When a user submits a report, the admin dashboard can immediately display it, and when the admin updates the status, the user can see the update from the mobile app.

## 13. Why Do You Need Both A Mobile App And A Web Admin Dashboard?

**Answer:**

The mobile app and web dashboard serve different users. The mobile app is for residents who need to submit reports, send SOS alerts, view nearby safety information, and track their submitted reports. The web dashboard is for admins or authorized staff who need a wider operational view, filtering tools, analytics, incident review, user management, and response coordination.

Separating the two sides makes the system clearer. Residents get a simple reporting experience, while administrators get tools for monitoring and decision-making.

## 14. How Does The SOS Feature Work?

**Answer:**

The SOS feature is a faster emergency reporting path. It requires the user's current location and flags the report as an SOS report. Since it is urgent, the system treats it as high priority and creates an admin alert so staff can review it immediately.

The admin can then choose an appropriate responder or nearby precinct option. Once the admin responds, the user receives a status update that help is on the way.

## 15. What Happens After A User Submits A Report?

**Answer:**

After submission, the report is saved to Firestore with details such as incident type, severity, description, timestamp, reporter ID, and location. If there is photo evidence, it is uploaded to Firebase Storage.

Then the backend validates the report, calculates a verification score, and assigns an initial status such as verified, under review, or spam. The admin dashboard listens to the same database, so the report becomes visible for monitoring and action.

## 16. How Do You Know The Location Is Reliable?

**Answer:**

The app collects the user's GPS location using the mobile device location service. The backend checks whether the coordinates are valid numbers, within valid latitude and longitude ranges, and not equal to the invalid default of 0,0.

However, GPS location is not perfect. It can be affected by device permissions, signal strength, and user environment. That is why the system also allows admins to review the address, map position, description, and evidence before deciding.

## 17. Why Is There A Heatmap?

**Answer:**

The heatmap helps admins and users understand incident concentration visually. A list of reports can show individual cases, but a heatmap shows patterns, such as areas with repeated theft, disturbance, or high-severity reports.

This is useful for planning patrols, public advisories, barangay coordination, CCTV review, and identifying areas that may need more attention.

## 18. How Accurate Is The Heatmap?

**Answer:**

The heatmap accuracy depends on the accuracy of submitted reports, GPS location, and the number of incidents collected. The formula itself is transparent because it uses location grouping and severity weights.

It should be interpreted as a decision-support visualization, not a final crime statistic. Admins should still verify actual reports and compare the heatmap with official records before making operational decisions.

## 19. What Are The System Limitations?

**Answer:**

ThreatTrack is currently a capstone prototype. The main limitations are security hardening, stronger privacy rules, server-side rate limiting, full automated testing, dependency audit fixes, and production deployment readiness.

The core features are demo-capable, but before real deployment, the system must be hardened for public use. This includes stricter Firestore rules, secure AI key handling, better audit logs, push notification setup, and formal validation with actual stakeholders.

## 20. What Is Your Future Enhancement?

**Answer:**

Future improvements include stronger server-side security rules, automated Firestore rules testing, push notification integration, verified responder accounts, admin audit trails, improved AI evaluation, report trust scoring, official police/barangay validation workflows, and deployment hardening.

We can also improve analytics by comparing current incidents with historical patterns and generating more explainable recommendations for patrol planning and public advisories.

## 21. What If The Internet Is Unavailable?

**Answer:**

Because ThreatTrack uses Firebase and online map services, the full system depends on internet connectivity. If the internet is unavailable, real-time submission, admin monitoring, and notifications may not work properly.

As a future enhancement, the mobile app can support offline draft reports. Once the connection returns, the app can submit the saved report automatically or ask the user to confirm before sending.

## 22. How Do You Prevent Unauthorized Admin Access?

**Answer:**

Admin access uses Firebase Authentication and role-based account records. Only approved admin or police-admin accounts should be allowed to access the dashboard pages.

For production, this must be enforced both in the user interface and in Firestore security rules. The UI can hide pages, but the database rules must be the real protection.

## 23. Why Is The Admin Still Needed If Reports Can Be Auto-Verified?

**Answer:**

Auto-verification only means that the report has complete and valid required fields. It does not mean the incident is fully confirmed. Admins are still needed to check the report, review the context, decide whether to respond, reject invalid reports, or mark the case as completed.

This keeps the system efficient without removing human responsibility.

## 24. What Makes The System Useful To The Community?

**Answer:**

ThreatTrack is useful because it gives residents a direct way to report safety concerns and receive updates. It also gives administrators organized information instead of scattered messages or manual logs.

For the community, this means faster reporting, better transparency, and more awareness of local safety patterns. For admins, it means better monitoring, prioritization, and planning.

## 25. What Is The Main Contribution Of Your Study?

**Answer:**

The main contribution is an integrated public safety reporting and monitoring prototype that connects residents, administrators, maps, analytics, notifications, and AI-assisted decision support in one workflow.

Instead of focusing only on incident submission, ThreatTrack covers the full cycle: report creation, validation, admin review, response coordination, user status tracking, and analytics-based planning.

## Quick Defense Reminders

- Do not say the AI is always accurate. Say it is decision support and needs human review.
- Do not say the heatmap proves crime rates. Say it visualizes reported incident concentration.
- Do not say auto-verified means legally confirmed. Say it means the report passed system validation.
- Be honest that the system is a capstone prototype and needs hardening before production.
- Emphasize that ThreatTrack improves speed, visibility, organization, and decision support.
