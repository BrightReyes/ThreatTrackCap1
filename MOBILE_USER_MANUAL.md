# THREATTRACK MOBILE APPLICATION
## SYSTEM USER MANUAL & TECHNICAL HARDWARE SPECIFICATIONS

---

**Document Control:**
- **Document Title:** ThreatTrack Mobile Application User Manual & Technical Hardware Specifications
- **Application Name:** ThreatTrack Mobile (`threattrack-mobile`)
- **Target Deployment Area:** Valenzuela City, Metro Manila, Philippines
- **Target Audience:** Valenzuela City Residents, Commuters, and Community Stakeholders
- **Supported Platforms:** Android (v8.0+) and iOS (v14.0+)
- **Core Technology Stack:** React Native, Expo Framework, Google Firebase (Auth, Firestore, Cloud Storage)
- **Version:** 1.0.0 (Production Release)

---

## TABLE OF CONTENTS
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Hardware & Software Specifications](#2-hardware--software-specifications)
   - 2.1 [Client Device Hardware Requirements](#21-client-device-hardware-requirements)
   - 2.2 [Software & Operating System Requirements](#22-software--operating-system-requirements)
   - 2.3 [Device Permissions Matrix](#23-device-permissions-matrix)
3. [Step-by-Step User Operating Manual](#3-step-by-step-user-operating-manual)
   - 3.1 [Citizen Account Registration (Sign Up)](#31-citizen-account-registration-sign-up)
   - 3.2 [User Authentication (Log In)](#32-user-authentication-log-in)
   - 3.3 [Emergency SOS Gateway (3-Second Safety Hold)](#33-emergency-sos-gateway-3-second-safety-hold)
   - 3.4 [Filing an Emergency SOS Report](#34-filing-an-emergency-sos-report)
   - 3.5 [Standard Incident Reporting with Photo Evidence](#35-standard-incident-reporting-with-photo-evidence)
   - 3.6 [Navigating the Valenzuela Threat Map & Heatmaps](#36-navigating-the-valenzuela-threat-map--heatmaps)
   - 3.7 [1-Tap Emergency Police Precinct Directory](#37-1-tap-emergency-police-precinct-directory)
   - 3.8 [Real-Time Incident Tracking ("My Reports")](#38-real-time-incident-tracking-my-reports)
   - 3.9 [Alerts & Responder Dispatch Notifications](#39-alerts--responder-dispatch-notifications)
   - 3.10 [Profile Management & Notification Settings](#310-profile-management--notification-settings)
4. [Troubleshooting Guide & Frequently Asked Questions (FAQ)](#4-troubleshooting-guide--frequently-asked-questions-faq)
5. [Legal Compliance & Anti-False Reporting Policy](#5-legal-compliance--anti-false-reporting-policy)

---

## 1. SYSTEM OVERVIEW & ARCHITECTURE

ThreatTrack is an integrated crime reporting, emergency response, and community safety monitoring mobile application engineered specifically for the jurisdiction of Valenzuela City, Philippines.

### Key Functional Capabilities:
- **Instant Emergency SOS:** A dedicated 3-second hold gateway that eliminates accidental triggers while ensuring rapid transmission of distress signals during critical life-threatening situations.
- **Geolocated Incident Reporting:** Capture and submission of incident evidence (camera photos, structured descriptions, categorization) automatically tagged with real-time GPS coordinates and Valenzuela street addresses.
- **Dynamic Threat Heatmap:** A visual density overlay on the interactive city map illustrating verified and under-review incidents from the preceding 7 days to guide citizen situational awareness.
- **Police Precinct Directory:** Interactive geolocated map markers and direct 1-tap telephony dialers for Valenzuela City Police Community Precincts (PCP 1 through PCP 12) and sub-stations.
- **Live Dispatch & Status Tracking:** Real-time synchronization with police dispatchers, allowing citizens to monitor report verification and view dispatched responder units with estimated arrival times (ETA).

---

## 2. HARDWARE & SOFTWARE SPECIFICATIONS

### 2.1 Client Device Hardware Requirements

The table below outlines the minimum and recommended mobile device hardware specifications needed to run the ThreatTrack mobile application smoothly:

| Hardware Component | Minimum Requirement | Recommended Specification | Technical Justification |
| :--- | :--- | :--- | :--- |
| **Processor (CPU)** | Quad-Core 1.8 GHz 64-bit | Octa-Core 2.0 GHz or higher | Smooth execution of map rendering engines, JavaScript runtime, and client-side image compression. |
| **System Memory (RAM)** | 2.0 GB RAM | 4.0 GB RAM or higher | Ensures uninterrupted background listening for police alerts while rendering vector map tiles. |
| **Internal Storage** | 150 MB free space | 500 MB free space | Accommodates the application installation package, cached map tiles, and temporary image evidence buffers. |
| **Display Screen** | 5.0 inches, HD (720 × 1280 px) | 6.0 inches+, FHD+ (1080 × 2400 px) | Provides sufficient display area for reading emergency alerts, status timelines, and map overlays. |
| **Touchscreen Type** | Capacitive multi-touch | Capacitive multi-touch with high polling rate | Required for fluid pinch-to-zoom map navigation and the 3-second SOS touch-and-hold gesture. |
| **Primary Rear Camera** | 5.0 Megapixels with Autofocus | 12.0 Megapixels or higher with LED Flash | Needed to capture clear, legible evidence of incident scenes, vehicles, physical injuries, or property damage. |
| **Location Hardware** | Cellular Triangulation / A-GPS | Dedicated GPS, GLONASS, and Galileo Receiver | Essential for locking high-precision latitude/longitude coordinates required for emergency response dispatch. |
| **Network Interface** | 3G / 4G LTE or Wi-Fi (802.11 b/g/n) | 4G LTE / 5G Mobile Data or Wi-Fi (802.11 ac/ax)| Guarantees immediate two-way data synchronization with Google Firebase servers during emergency dispatches. |
| **Cellular Telephony** | Active GSM/LTE SIM card slot | Active SIM card with outgoing voice call capability | Required to utilize the 1-tap police precinct hotline dialer functionality (`8352-4000`). |

---

### 2.2 Software & Operating System Requirements

| Specification | Android Platform | iOS Platform |
| :--- | :--- | :--- |
| **Supported OS Version** | Android 8.0 (Oreo, API Level 26) or higher | iOS 14.0 or higher |
| **Recommended OS Version**| Android 11.0, 12.0, 13.0, or 14.0 | iOS 16.0 or higher |
| **Core Runtime Engine** | Google Play Services v21.0+ (Google Maps engine) | Apple Maps Core Location Framework |
| **Application Package Format** | Android Package Kit (`.apk`) / Android App Bundle (`.aab`) | iOS App Store Package (`.ipa`) |
| **Network Protocols** | HTTPS (TLS 1.3), WebSockets (WSS for Firebase listeners) | HTTPS (TLS 1.3), WebSockets (WSS for Firebase listeners) |

---

### 2.3 Device Permissions Matrix

ThreatTrack requires specific mobile system permissions to function reliably. The table below details each permission and its operational necessity:

| Permission Name | System Identifier | Status | Operational Justification |
| :--- | :--- | :--- | :--- |
| **Precise Location (Foreground)** | `ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION` | **Mandatory** | Captures accurate GPS coordinates for emergency SOS dispatch and verifies user proximity within Valenzuela City. |
| **Camera Access** | `CAMERA` | **Optional** | Enables real-time photographic evidence capture directly from the incident reporting screen. |
| **Media & Photo Library** | `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` | **Optional** | Permits uploading previously captured evidence photos stored on the device’s internal gallery. |
| **Telephony / Dialing** | `ACTION_DIAL` (Android Intent) / `tel:` scheme | **Optional** | Automatically populates the device phone dialer with official Valenzuela Police precinct telephone numbers. |
| **Network State** | `ACCESS_NETWORK_STATE` & `INTERNET` | **Mandatory** | Maintains a live data stream with cloud databases to receive instant notifications when police respond to reports. |

---

## 3. STEP-BY-STEP USER OPERATING MANUAL

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SYSTEM WORKFLOW DIAGRAM                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   [ Citizen Sign Up / Log In ]                                         │
│                 │                                                      │
│                 ▼                                                      │
│   [ Emergency SOS Gateway ] ────(Hold 3s)────► [ Emergency SOS Report ]│
│                 │                                                      │
│            (Tap Home)                                                  │
│                 ▼                                                      │
│   [ Home Safety Dashboard ]                                            │
│         ├── Live Valenzuela Crime Heatmap & City Boundary              │
│         ├── 1-Tap Police Community Precinct (PCP 1-12) Hotlines        │
│         ├── Standard Incident Report (Photo Evidence + Form)           │
│         ├── Status Tracking Screen (Submitted -> Review -> Responding) │
│         ├── Alerts & Police Broadcasts Notification Feed               │
│         └── Citizen Settings & Profile Management                      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3.1 Citizen Account Registration (Sign Up)

To ensure that emergency services are responding to verified citizens and to discourage malicious false reporting, every user must create a verified account.

1. Launch the **ThreatTrack** application on your smartphone.
2. If you are on the Sign-In screen, tap **"Don't have an account? Sign Up"** located at the bottom.
3. Complete the registration form with accurate legal details:
   - **Full Name:** Enter your complete legal First Name, Middle Initial, and Last Name.
   - **Email Address:** Provide an active personal email address. This email will be used for account authentication and password recovery.
   - **Mobile Number:** Enter your active 11-digit Philippine mobile phone number (e.g., `09171234567`).
   - **Barangay:** Tap the dropdown selector and pick your official barangay in Valenzuela City (all 33 barangays are supported, including *Malinta, Gen. T. de Leon, Marulas, Karuhatan, Paso de Blas*, etc.).
   - **Complete Home Address:** Enter your exact house number, building, street, and subdivision (minimum 8 characters).
   - **Password:** Enter a strong password with a minimum length of 6 characters.
   - **Confirm Password:** Re-type your password to prevent spelling errors.
4. **False Reporting Policy Agreement:**
   - Read the statutory declaration notice.
   - Check the box confirming that you acknowledge the Philippine legal sanctions against filing false emergency reports.
5. Tap **Sign Up**. A confirmation popup will notify you that your registration was successful and an email verification has been initiated.

---

### 3.2 User Authentication (Log In)

1. Open the application.
2. On the **Welcome Back** screen:
   - Type your registered **Email Address**.
   - Type your **Password**.
   - *(Optional)* Tap the **Eye Icon** on the right side of the password field to toggle password visibility.
3. Tap **Sign In**.
4. The application validates your credentials against Firebase Authentication. Once authenticated, your session is saved locally via encrypted storage, eliminating the need to log in repeatedly.

---

### 3.3 Emergency SOS Gateway (3-Second Safety Hold)

Upon logging in, ThreatTrack immediately presents the **Emergency Hold Gateway** (`SOSGatewayScreen`). This screen serves as an intentional safety buffer for citizens facing imminent danger.

```
          ┌────────────────────────────────────────┐
          │             EMERGENCY HOLD             │
          │                                        │
          │              ╭──────────╮              │
          │             (    SOS     )             │
          │              ╰──────────╯              │
          │           HOLD FOR 3 SECONDS           │
          │                                        │
          │          [  Back to Home  ]            │
          └────────────────────────────────────────┘
```

#### Purpose of the 3-Second Hold:
In high-stress situations or when handling a phone in a pocket/bag, single taps can easily occur by accident. A continuous 3-second hold requires deliberate human intent, eliminating accidental dispatches while maintaining rapid access for genuine emergencies.

#### How to Trigger Emergency SOS:
1. Place and **hold your finger firmly** on the circular red **SOS** button.
2. An animated red halo will pulse and an internal circular progress bar will fill up.
3. **If pressed accidentally:** Release your finger before the 3 seconds elapse. The progress resets to zero immediately, and **no report is transmitted**.
4. **If a genuine emergency exists:** Maintain continuous touch contact for the full **3 seconds**.
5. Once 3 seconds are completed, the application triggers a transition vibration and navigates directly to the **SOS Report Screen**.

#### If Not in an Emergency:
- Tap the **"Back to Home"** button at the bottom (or the Home icon in the top header) to proceed to the regular safety dashboard.

---

### 3.4 Filing an Emergency SOS Report

When arriving from the 3-second emergency gateway:

1. **Automatic Geolocation Lock:** The mobile app immediately queries your device’s GPS receiver. It captures your exact latitude and longitude and performs reverse geocoding to resolve your street address in Valenzuela City.
2. **Select Incident Category:** Tap the card that describes your active emergency:
   - 🚨 **Robbery / Hold-up** *(High Severity)*
   - 🤕 **Physical Assault / Injury** *(High Severity)*
   - 🏠 **Domestic Violence** *(High Severity)*
   - 🚑 **Traffic Accidents** *(High Severity)*
   - ⚠️ **Illegal Weapons** *(High Severity)*
   - 🎒 **Theft / Snatching** *(Medium Severity)*
   - 📢 **Public Disturbance** *(Medium Severity)*
3. **Select Reporting Status:** Tap **Victim** (if you are the target) or **Witness** (if you are an observer).
4. **Emergency Description (Optional):** If time permits, type a short critical note (e.g., *"Armed robbery at corner store, suspects on red scooter heading north"*). If you cannot type, the system automatically inserts a default emergency text string.
5. Tap **Send SOS Report**.
6. An instant confirmation dialog will appear. Your report is flagged with `isSOSReport: true` and dispatched to the Valenzuela Police Command Desk with top priority.

---

### 3.5 Standard Incident Reporting with Photo Evidence

For non-emergency incidents, past events, or situations where photographic evidence has been gathered:

1. Navigate to the **Home Screen** and tap the red **"Report Incident"** button.
2. **Step 1: Choose Crime / Threat Type:** Select from the 10 standardized categories (Theft, Robbery, Assault, Domestic Violence, Illegal Drugs, Traffic Accidents, Illegal Weapons, Public Disturbance, Suspicious Activity, or Vandalism).
3. **Step 2: Choose Reporting Role:** Indicate whether you are submitting as a **Victim** or a **Witness**.
4. **Step 3: Attach Photographic Evidence:**
   - Tap **"Take Photo"** to launch your device camera and take an immediate photograph.
   - Tap **"Choose from Gallery"** to select an existing photograph from your device storage.
   - *Technical Note:* ThreatTrack automatically resizes and compresses image evidence down to under 650 KB using progressive client-side scaling. This ensures instantaneous uploads even in low-reception mobile network zones.
5. **Step 4: Detailed Narrative:**
   - Type a comprehensive narrative of the event into the text box (minimum 10 characters, maximum 2,000 characters).
   - Detail suspect appearances, clothing, weapons involved, vehicle descriptions, license plate numbers, or property taken.
6. **Step 5: Verify Location:**
   - The app verifies your GPS coordinate lock. If you are reporting from a different location than where the incident occurred, review the detected street address. Tap **"Retry"** if your GPS signal was obstructed.
7. **Step 6: Legal Declaration & Submission:**
   - Tap **"Submit Incident Report"**.
   - Read the confirmation prompt reminding you of legal accountability under Philippine statutes against fraudulent reporting.
   - Tap **"Confirm & Submit"**. Your incident is recorded into the central database under the initial status of `under_review`.

---

### 3.6 Navigating the Valenzuela Threat Map & Heatmaps

The **Home Screen** features an interactive tactical map of Valenzuela City designed for daily situational awareness:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [ThreatTrack Logo]                   (Alerts)    (Status)   (Settings) │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                      VALENZUELA CITY THREAT MAP                        │
│                                                                        │
│   • Red Border Line: Official Valenzuela City Territorial Boundary     │
│   • Heatmap Clusters: Color-coded density of recent incidents          │
│   • Blue Shield Icons: Police Community Precincts (PCP 1 - 12)         │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│   [ 🚨 EMERGENCY SOS ]                 [ 📝 REPORT INCIDENT ]          │
├────────────────────────────────────────────────────────────────────────┤
│   POLICE PRECINCT DIRECTORY                                            │
│   PCP 4 - Malinta Station    •  8352-4000     [ 📞 Call Precinct ]     │
│   PCP 1 - Paso De Blas       •  8352-4000     [ 📞 Call Precinct ]     │
└────────────────────────────────────────────────────────────────────────┘
```

#### Map Visual Elements:
- **Territorial Boundary Polygon:** A red outline demarcates the official boundary coordinates of Valenzuela City based on OpenStreetMap Relation 307470.
- **Incident Heatmap Density Layer:**
  - **Green / Light Yellow:** Low incident density (minimal reports in the past 7 days).
  - **Yellow / Orange:** Moderate threat cluster (exercise caution when commuting).
  - **Intense Red / Crimson:** High incident concentration (multiple verified incidents reported recently; avoid unlit routes).
- **Map Interaction:** Use two fingers to pinch and zoom in on specific streets, subdivisions, or intersections. Drag with one finger to pan across different barangays.

---

### 3.7 1-Tap Emergency Police Precinct Directory

ThreatTrack maintains a verified directory of all Philippine National Police (PNP) Community Precincts across Valenzuela:

- **PCP 1:** Paso De Blas (Near Paso De Blas Barangay Hall / West Service Rd)
- **PCP 2:** Gen. T. de Leon
- **PCP 3:** Marulas (Doña Ata Subdivision)
- **PCP 4:** Malinta Station (Gov. I. Santiago Road)
- **PCP 5:** Polo (Poblacion Road, 3S Center)
- **PCP 6:** Karuhatan (3S Building, MacArthur Highway)
- **PCP 7:** Punturin (155 P. Faustino Street)
- **PCP 8:** Ugong (3S Center, Que Grande)
- **PCP 9, 10, 11, 12 & Sub-stations:** Distributed throughout the remaining industrial and residential sectors.

#### How to Call a Police Station:
1. Locate the **"Nearby Police Precincts"** list beneath the map on the Home Screen.
2. Tap the blue telephone link or the **"Call Precinct"** button on the precinct card.
3. ThreatTrack will launch your device’s native phone dialer with the station desk landline (`8352-4000`) or mobile hotline number (`0906-419-7676`) pre-populated.
4. Press the green call button on your phone to connect immediately with desk officers.

---

### 3.8 Real-Time Incident Tracking ("My Reports")

To track the progress of reports you have submitted:

1. Tap the **Status** icon in the navigation bar (or open the status screen).
2. The dashboard displays four live metrics: **Total Filed**, **Under Review**, **Verified**, and **Resolved**.
3. Each report card features a visual **3-Stage Lifecycle Progress Bar**:

```
[ Stage 1: Submitted ] ───► [ Stage 2: Under Review ] ───► [ Stage 3: Responding / Done ]
```

- **Stage 1 (Submitted):** The incident document has been written to the server queue and awaits police admin triage.
- **Stage 2 (Under Review):** Desk officers are evaluating attached photos, checking for duplicate reports, and assessing severity.
- **Stage 3 (Responding / Verified / Completed):**
  - If units are dispatched, the card updates with the **Assigned Police Unit**, the **Responding Precinct Name**, and the **Estimated Time of Arrival (ETA in minutes)**.
  - When the response operation concludes, the status is updated to **Completed / Resolved**.
4. **Detailed Inspection:** Tap any report card to open the inspection sheet. You can review your submitted evidence photo thumbnail, full narrative, and official administrator feedback notes.

---

### 3.9 Alerts & Responder Dispatch Notifications

ThreatTrack includes background listeners that alert you when dispatchers respond:

1. **Immediate Dispatch Pop-Up (`ResponseAlertListener`):**
   - Whenever an administrator dispatches an emergency responder to your report, an animated high-priority modal automatically overlays your screen, regardless of which tab you are currently viewing.
   - Example Notification:
     > *"Help is on the way from Police Community Precinct 4 (Malinta). Distance: 1.4 km. ETA: 5 min."*
   - Tap **"OK"** to acknowledge the message.
2. **Community Safety Alerts Feed (`AlertsScreen`):**
   - Tap the **Bell Icon** on the navigation bar to inspect public safety advisories issued by the Valenzuela City Police Station or Barangay authorities.
   - Use the filter tabs: **All** or **Unread**.
   - Tap **"Mark All Read"** to clear notification badges once reviewed.

---

### 3.10 Profile Management & Notification Settings

Accessible by tapping the **Gear Icon** on the upper navigation bar:

1. **Citizen Profile Information:** View your registered Legal Name, Email Address, Contact Number, Home Barangay, and **Citizen Trust Score** (maintaining an accurate reporting history preserves a high trust rating).
2. **Notification Preference Toggles:**
   - **Push Notifications:** Enable or disable routine community alerts.
   - **High-Priority Alerts:** Toggle critical broadcasts regarding active armed robbery or violent incidents.
   - **Location-Based Alerts:** Toggle proximity warnings for incidents occurring within a 5 km radius of your live position.
3. **Change Password:**
   - Tap **"Change Password"**.
   - Input your **Current Password**, followed by your **New Password** and **Confirmation Password**.
   - Tap **"Update Password"**. Re-authentication is handled securely without losing session context.
4. **Support & Hotlines Modal:** Tap to view emergency contacts for the Philippine Red Cross, Valenzuela Rescue, and Bureau of Fire Protection (BFP).
5. **Sign Out:** Tap **"Logout"** and confirm to safely terminate your active user session.

---

## 4. TROUBLESHOOTING GUIDE & FREQUENTLY ASKED QUESTIONS (FAQ)

### Troubleshooting Common Issues:

| Symptom / Error Message | Root Cause | Step-by-Step Resolution |
| :--- | :--- | :--- |
| **"Location Required" or Location Timeout error** | GPS location services are disabled or satellite reception is blocked by thick building roofs. | 1. Open phone **Settings** > **Location** and turn location **ON**.<br>2. Set location mode to **High Accuracy**.<br>3. Move near an exterior window or step outdoors and tap **"Retry"**. |
| **"Map is not available in web preview"** | The app is being viewed on a desktop browser emulator instead of an Android/iOS device. | Native map SDKs require mobile device rendering engines. Test the application via **Expo Go** on a physical smartphone or Android Studio emulator. |
| **Evidence photo fails to upload** | The selected file is corrupted or mobile data connection dropped during upload. | ThreatTrack compresses photos under 650 KB automatically. Ensure your phone has active mobile data or Wi-Fi, retake the photo, and tap submit. |
| **"Account Restricted" alert on report submit** | The user profile was flagged by system administrators for repeated false submissions. | Contact the Valenzuela City Police Station administrative desk to appeal account restriction. |
| **App crashes when pressing the SOS button** | Outdated Expo runtime or missing native gesture permissions. | Ensure your device runs Android 8.0+ / iOS 14.0+ and update the Expo Go client or install the latest standalone APK build. |

---

### Frequently Asked Questions (FAQ):

**Q1: Can other app users see my name, address, or phone number on the map?**  
*Answer:* **No.** Public users only see anonymized, aggregated heatmaps and generalized incident markers. Your personal identity, full name, phone number, and home address are strictly restricted to authenticated PNP Police Administrators and Barangay Desk Officers for response coordination.

**Q2: What should I do if I held the SOS button by mistake?**  
*Answer:* As long as you release your finger before the 3-second progress ring completes, the action cancels automatically and **no alert is sent**. If you accidentally held it for the full 3 seconds and navigated to the SOS screen, simply tap the back arrow without tapping "Send SOS Report".

**Q3: Can I report an incident that occurred outside Valenzuela City?**  
*Answer:* ThreatTrack is officially integrated with the local government units and police precincts of **Valenzuela City**. Submissions located outside the city territorial boundary polygon will be flagged as out-of-jurisdiction and referred to national PNP emergency hotlines (`911`).

**Q4: Do I need an internet connection to use the app?**  
*Answer:* Yes. An active mobile data connection (3G/4G/5G) or Wi-Fi is necessary to synchronize incident reports with the cloud database and receive real-time dispatcher arrival alerts. However, the direct police phone numbers in the directory can always be dialed via regular cellular voice calls.

---

## 5. LEGAL COMPLIANCE & ANTI-FALSE REPORTING POLICY

ThreatTrack operates in strict compliance with the statutory laws and penal codes of the Republic of the Philippines.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   LEGAL WARNING: FALSE REPORTING                       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Filing fictitious incident reports, fraudulent SOS distress calls,    │
│  or malicious pranks is strictly illegal under Philippine Law.        │
│                                                                        │
│  Applicable Sanctions:                                                 │
│  1. Presidential Decree No. 1727 (Anti-Bomb Joke & False Reports)      │
│  2. Article 154 of the Revised Penal Code (Unlawful Publication of    │
│     False News Causing Public Panic or Disturbance)                    │
│  3. Republic Act No. 10175 (Cybercrime Prevention Act of 2012)        │
│                                                                        │
│  Violators are subject to permanent account blacklisting, civil        │
│  liabilities, criminal prosecution, fines, and imprisonment.          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

Every submitted report is cryptographically bound to the authenticated user's UID, verified mobile number, timestamp, and device GPS coordinates. This audit trail is made available to law enforcement authorities whenever fraudulent reporting is investigated.

---

*End of User Manual & Hardware Specifications Document.*
