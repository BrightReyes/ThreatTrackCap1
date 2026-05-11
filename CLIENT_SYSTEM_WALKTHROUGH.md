# ThreatTrack Client System Walkthrough

## Simple App Explanation

ThreatTrack is a community safety system. It helps citizens report incidents through a mobile app, and it helps authorized admins or responders monitor, verify, and respond to those reports through a web admin portal.

The system is focused on Valenzuela City. It uses location, incident details, report status, notifications, and map views to make incident reporting and monitoring faster and easier.

## Main Users

### Mobile App User

The mobile user can:

- Create an account or log in.
- View incident activity on the map.
- Send a normal incident report.
- Send an urgent SOS report.
- Track the status of submitted reports.
- Receive notifications and response updates.

### Admin User

The admin user can:

- Log in to the admin portal.
- View overall incident statistics.
- Monitor reports on a map.
- Review incident details.
- Verify, reject, complete, or respond to reports.
- Manage users and notifications.
- Adjust system settings.

## Overall System Flow

1. A user opens the mobile app and logs in.
2. The user views the safety map and nearby incident information.
3. The user submits an incident report or uses the SOS button for urgent help.
4. The report is saved to Firebase with the user's location and incident details.
5. The system checks the report and assigns a status such as under review, verified, responding, done, or rejected.
6. The admin sees the report in the web portal.
7. The admin reviews the report and can send a response update.
8. The mobile user receives the update and can track the report status.

## Mobile App Walkthrough

### 1. Login and Sign Up

The first screen allows users to log in. New users can create an account by entering their name, email, and password.

### 2. SOS Gateway

After logging in, the user first sees the SOS screen. The user can hold the SOS button for 3 seconds to start an urgent report. This prevents accidental emergency reports.

The user can also go to the Home page if there is no emergency.

### 3. Home Page

The Home page shows the main safety overview. It includes:

- A map of Valenzuela City.
- Incident markers and heatmap areas.
- Nearby police precinct information.
- Recent incidents.
- Risk counts for high, medium, and low severity reports.
- A button to report an incident.
- Quick access to SOS, reports, notifications, and settings.

### 4. Report Incident

For a normal report, the user follows three simple steps:

1. Select the incident type, such as robbery, theft, traffic accident, suspicious activity, or vandalism.
2. Select if they are reporting as a victim or witness.
3. Add a description and optional photo evidence.

Before submitting, the user confirms that the report is true and accurate. After submission, the report is sent securely for review.

### 5. SOS Report

The SOS report is for urgent situations. The app gets the user's location, asks for the incident type, and allows optional quick details. It sends the report faster than the normal reporting process.

### 6. Report Status

The user can open the Reports screen to track submitted reports. They can see if a report is:

- Submitted
- Under Review
- Responding
- Verified
- Done
- Rejected

If help is on the way, the user can see responder information such as precinct name, distance, and estimated arrival time.

### 7. Notifications

The app shows notifications for safety alerts and response updates. Users can view unread notifications and mark them as read.

### 8. Settings

The Settings screen allows users to view their profile, manage notification preferences, enable or disable location-based alerts, and log out.

## Web Admin Walkthrough

### 1. Admin Login

Authorized personnel log in through the ThreatTrack Admin Portal. This area is restricted to approved admin or law enforcement users.

### 2. Dashboard

The dashboard gives a quick overview of the system. It shows:

- Open incidents
- Reports from the last 24 hours
- Registered users
- Average risk score
- Total incidents
- Incident map
- Recent activity

The map can be filtered by incident type, severity, and time range.

### 3. Incidents Page

The Incidents page is where admins review reports. Admins can search and filter reports by status or severity.

When an admin opens an incident, they can see:

- Incident code
- Type and severity
- Status
- Description
- Reported time
- Location and address
- Reporter summary
- Uploaded photos, if available

Admins can update the incident status to under review, verified, done, or rejected.

For urgent or high-priority reports, admins can click Respond. This sends a response update to the user and marks the report as responding.

### 4. Users Page

The Users page shows registered accounts. Admins can search users and filter by role.

### 5. Notifications Page

The Notifications page shows alerts that were sent to users. Admins can review notification history, mark notifications as read, or delete them.

### 6. Settings Page

The Settings page contains system controls. Admins can manage:

- System name and description
- Default city and covered barangays
- Map settings
- Incident settings
- Notification settings
- Security settings
- Data export, backup, import, and cleanup

## Behind the Scenes

ThreatTrack uses Firebase for the main backend:

- Firebase Authentication handles user login and account access.
- Firestore stores users, incidents, notifications, settings, and activity logs.
- Firebase Storage stores uploaded incident photos.
- Cloud Functions validate reports, calculate risk, prepare heatmap data, find nearby precincts, and send notifications.

## Simple Demo Script for Clients

Use this short script when presenting the system:

1. "ThreatTrack is a safety reporting and monitoring system for the community and responders."
2. "On the mobile app, users can log in, view the safety map, and report incidents."
3. "For emergencies, the user can hold the SOS button for 3 seconds to send an urgent report with their location."
4. "For normal reports, the user selects the incident type, chooses if they are a victim or witness, adds details, and submits."
5. "The report is saved in the system and appears in the admin portal."
6. "On the admin dashboard, authorized users can monitor incidents, view statistics, and check the map."
7. "Admins can open a report, verify it, reject it, mark it done, or respond if help is needed."
8. "When an admin responds, the mobile user receives a notification and can track the response status."
9. "This creates a simple flow from citizen reporting to admin monitoring and response."

## Key Benefits

- Faster incident reporting.
- Location-based safety information.
- SOS reporting for urgent situations.
- Admin review and response workflow.
- Report status tracking for users.
- Better visibility of incident patterns through maps and statistics.

## One-Sentence Summary

ThreatTrack helps citizens report safety incidents and helps authorized admins monitor, verify, and respond to those reports in one connected system.
