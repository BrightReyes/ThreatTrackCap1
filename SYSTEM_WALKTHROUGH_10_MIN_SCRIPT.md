# ThreatTrack 10-Minute Persuasive System Walkthrough Script

Purpose: Voice-over script for a screen-recorded video presentation.

Style: Promotional, confident, informative, and panel-ready. The tone should make ThreatTrack feel useful, practical, and worth supporting, while still explaining the actual system clearly.

Structure:

1. User Side: 0:00 to 3:30
2. Admin Side: 3:30 to 7:20
3. AI Implementation: 7:20 to 10:00

Recommended pacing: Read naturally at around 135 to 145 words per minute. Pause briefly while tapping buttons, switching pages, loading maps, submitting forms, or showing AI results.

## 0:00-0:25 - Opening

Screen action:
Show the ThreatTrack logo, then transition between the mobile app and the admin dashboard.

Voice-over:
Good day. This is ThreatTrack, a smart public safety reporting and monitoring system designed for Valenzuela City. ThreatTrack is more than a reporting app. It is a connected safety platform that helps residents report incidents faster, helps administrators monitor reports in real time, and helps responders make better decisions using maps, notifications, analytics, and AI-assisted recommendations. In this walkthrough, we will show how ThreatTrack turns community reports into useful, organized, and actionable public safety information.

## Part 1 - User Side

## 0:25-0:55 - User Login And Access

Screen action:
Open the mobile app. Show the login screen, then log in using a test user account.

Voice-over:
We begin with the user side. This mobile app is built for residents who need a fast and reliable way to report safety concerns. Users can securely log in using Firebase Authentication, and new users can register with their basic profile information, including their name, contact details, barangay, and address. This is important because every report becomes traceable to an authenticated account, which improves accountability and helps reduce fake or careless submissions.

## 0:55-1:25 - SOS Gateway

Screen action:
Show the SOS gateway screen. Demonstrate the hold action without submitting, or continue using test data.

Voice-over:
The first major feature is the SOS gateway. In an emergency, speed matters. ThreatTrack provides a dedicated SOS path so users do not need to go through a long form during urgent situations. The button requires a short hold before continuing, which helps prevent accidental emergency reports. This small interaction makes the feature safer and more intentional. With SOS, the app gives residents a faster way to send an urgent alert with their location.

## 1:25-2:00 - Home Map And Safety Overview

Screen action:
Go to the home screen. Pan around the map. Show incident markers, nearby precinct details, recent reports, and risk counts.

Voice-over:
This is the home screen, where ThreatTrack becomes informative, not just functional. The user can see a location-based safety overview through the map. Incident heatmap, nearby precinct information, recent activity, and severity counts help residents understand what is happening around them. Instead of giving users only a blank report form, ThreatTrack gives them context. This makes the app useful even before a report is submitted because it improves safety awareness in the community.

## 2:00-2:45 - Regular Incident Report

Screen action:
Tap Report Incident. Show the report form. Select incident type, reporter role, description, location, optional evidence photo, and the confirmation step.

Voice-over:
For non-emergency cases, users can submit a regular incident report. The form guides the user step by step: choose the incident type, select whether they are reporting as a victim or witness, add a clear description, include optional photo evidence, and confirm the location. This structure is one of the strengths of ThreatTrack. It helps convert scattered community concerns into standardized reports that administrators can review properly. The user also confirms that the report is true and accurate, which reinforces responsible reporting.

## 2:45-3:15 - Report Status Tracking

Screen action:
Open the reports or status screen. Show submitted reports and their statuses.

Voice-over:
After a report is submitted, the user can track its progress. This is a big improvement over traditional reporting, where residents may not know what happened after they raised a concern. In ThreatTrack, report statuses such as submitted, under review, verified, responding, done, or rejected give users transparency. For urgent cases, the user may also receive responder information, such as the assigned precinct or response update. This builds trust because the reporting process becomes visible.

## 3:15-3:30 - User Notifications

Screen action:
Open notifications or alerts. Show unread and read notifications.

Voice-over:
The user side also includes notifications. These updates keep residents informed when their report changes status, when an admin responds, or when a relevant safety alert is created. This completes the citizen experience: report, track, and receive updates from one mobile app.

## Part 2 - Admin Side

## 3:30-4:00 - Admin Login

Screen action:
Switch to the web admin portal. Show login, then sign in as an admin or police admin test account.

Voice-over:
Now we move to the admin side, where ThreatTrack becomes a command center for public safety monitoring. The web dashboard is designed for authorized barangay administrators, police administrators, and approved personnel. This separation is important because residents use the mobile app for reporting, while authorized staff use the dashboard for review, coordination, and decision-making. The admin portal turns incoming reports into organized cases that can be acted on.

## 4:00-4:40 - Dashboard Overview

Screen action:
Show the dashboard. Point to summary cards, incident counts, recent activity, the map, and filters.

Voice-over:
The dashboard gives administrators an instant overview of the safety situation. Instead of manually checking separate records, admins can immediately see total incidents, open reports, recent reports, registered users, and risk indicators. The map shows where incidents are concentrated, while recent activity helps staff notice new or urgent cases. This makes the dashboard valuable during real monitoring because it reduces information overload and helps admins prioritize what needs attention first.

## 4:40-5:35 - Incident Management

Screen action:
Open the Incidents page. Use filters or search. Open one incident modal and show its details.

Voice-over:
The Incidents page is the heart of the admin workflow. Every report submitted by a user can be reviewed here with its type, severity, description, time, address, location, reporter summary, and uploaded evidence if available. Admins can filter reports, open details, verify information, reject invalid submissions, mark incidents as done, or move reports into a response workflow. This shows that ThreatTrack is not only collecting data. It supports actual moderation and case handling, which is essential for a responsible public safety system.

## 5:35-6:15 - SOS And Response Coordination

Screen action:
Show an urgent or high-priority incident. Open the response action. Show responder or precinct options and the response update flow.

Voice-over:
For urgent reports, ThreatTrack supports response coordination. When an SOS or high-priority incident appears, the admin can review the location, check the incident details, and select a responder or nearby precinct option. Once the response is confirmed, the incident can be marked as responding, and the reporting user receives an update. This is one of the strongest parts of the system because it connects three things in one flow: the resident's urgent report, the admin's review, and the user's real-time response notification.

## 6:15-6:45 - Users And Notifications

Screen action:
Open the Users page briefly, then the Notifications page. Show search, roles, status fields, and notification records.

Voice-over:
ThreatTrack also gives admins tools for user and notification management. The Users page helps staff review registered accounts, roles, account status, and report-related profile data. This is useful for accountability, especially when checking repeated false reports or suspicious activity. The Notifications page provides a central record of alerts and report updates. Together, these features help administrators manage the system with better visibility and control.

## 6:45-7:20 - Analytics, Settings, And Police Operation

Screen action:
Open Analytics, then Settings. If available, briefly show the Police Operation page using a police admin account.

Voice-over:
The Analytics page gives the system long-term value. It helps administrators understand patterns, not just individual reports. They can review incident counts, location trends, severity distribution, and hotspot areas. The Settings page makes the system configurable for the local context, including barangays, incident categories, map options, and notification settings. For police administrators, the Operation module can create police-originated reports or high-priority safety notifications. This means ThreatTrack supports both community reporting and official public safety communication.

## Part 3 - AI Implementation

## 7:20-7:55 - AI Purpose

Screen action:
Stay on Analytics. Show hotspot cards, risk summaries, or the AI recommendation area.

Voice-over:
The third part is the AI implementation. This is where ThreatTrack becomes smarter and more useful for planning. The AI is not used to replace human judgment. Instead, it works as a decision-support assistant for admins and police personnel. When many reports are coming in, it can be difficult to manually identify which areas need attention. The AI helps summarize patterns, highlight hotspots, and suggest practical actions based on the incident data.

## 7:55-8:40 - Data Sent To AI

Screen action:
Show analytics filters, heatmap or hotspot cards, and an AI summary area if available.

Voice-over:
The AI uses aggregated analytics data, not private personal information. Instead of sending names, phone numbers, emails, or sensitive reporter details, the system prepares a safer summary based on report counts, locations, severity levels, incident types, and peak hours. For example, the system may detect that a street or barangay has repeated theft reports during evening hours. This is the type of information that can help admins plan patrols, advisories, lighting checks, CCTV review, or coordination with barangay personnel.

## 8:40-9:20 - Gemini And Cloud Function Flow

Screen action:
Click Generate Action Plan or Generate AI Summary if available. Show loading, then the generated result.

Voice-over:
The intended production flow uses a Firebase Cloud Function called generateAdminAISummary. This function checks that the caller is an authorized admin, loads recent incident data from Firestore, converts it into a privacy-safe analytics summary, sends that summary to Google Gemini, validates the response, and stores the draft result in Firestore. This is a better approach because the AI key can stay protected on the backend through a secret such as GEMINI_API_KEY, instead of being exposed inside the client application.

## 9:20-9:45 - AI Output And Human Review

Screen action:
Show the generated AI recommendation. Highlight hotspot, pattern, risk level, suggested action, and admin review notes.

Voice-over:
The AI output is designed to be clear and useful. It can identify a hotspot, explain the pattern, estimate the risk level, and recommend actions such as increased patrol visibility, barangay coordination, CCTV review, public advisories, or prioritizing open reports from the affected area. But the final decision still belongs to authorized human staff. This makes the AI feature practical and responsible: it informs admins, but it does not make official decisions on its own.

## 9:45-10:00 - Closing

Screen action:
Return to the dashboard or show a final transition between the mobile app and admin dashboard.

Voice-over:
To conclude, ThreatTrack brings together the most important parts of a modern public safety system: fast resident reporting, SOS alerts, location-based monitoring, admin review, response coordination, notifications, analytics, and AI-assisted recommendations. It is useful because it helps reduce the gap between what residents experience and what authorities can see and act on. ThreatTrack turns reports into information, information into action, and action into a safer, more aware community.

## Optional Panelist Q&A Notes

Use these only if asked, not necessarily in the main 10-minute recording.

- Main value: ThreatTrack connects residents, administrators, and responders in one reporting and monitoring workflow.
- AI role: The AI is decision support only. It does not replace barangay or police judgment.
- Privacy: The AI should receive aggregated incident counts and hotspot data, not names, phone numbers, emails, or private reporter details.
- Backend: Firebase Authentication handles accounts, Firestore stores records, Firebase Storage stores incident photos, and Cloud Functions handle trusted backend logic.
- Security: Production AI calls should run server-side using a Firebase Functions secret for the Gemini API key.
- Reports: Incident status changes are reviewed by admins, so submitted reports are not treated as automatically verified.
- SOS: The SOS flow is faster than regular reporting and is designed for urgent cases with location-based response coordination.
