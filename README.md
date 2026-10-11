<div align="center">
  <img src="web-admin/assets/logo-red.png" alt="ThreatTrack Logo" width="120" />
  <h1>ThreatTrack</h1>
  <p><strong>Official Community Crime Awareness, Emergency SOS & Incident Dispatch Platform</strong></p>
  <p><em>Valenzuela City Public Safety & Police Coordination System</em></p>

  [![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?logo=node.js)](https://nodejs.org/)
  [![Vite](https://img.shields.io/badge/Vite-v5.4-646CFF?logo=vite)](https://vitejs.dev/)
  [![React Native](https://img.shields.io/badge/Mobile-React%20Native%20%2F%20Expo-61DAFB?logo=react)](https://reactnative.dev/)
  [![Firebase](https://img.shields.io/badge/Backend-Firebase%20Cloud-FFCA28?logo=firebase)](https://firebase.google.com/)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

---

## 📌 Overview

**ThreatTrack** is an integrated public safety platform designed to bridge the communication gap between citizens and emergency responders across **Valenzuela City**. It empowers residents to report active crimes, hazardous threats, and trigger instant SOS alerts, while equipping police dispatchers and barangay administrators with a real-time web command center for triage, automated verification, and coordinated dispatch.

---

## 🏛️ System Architecture

| Tier | Technologies | Primary Responsibilities |
| :--- | :--- | :--- |
| **Mobile App** | React Native, Expo, React Native Maps | Citizen SOS gateway, live distress streaming, incident reporting, photo evidence, and push notifications. |
| **Web Admin** | Vanilla JS (ES Modules), HTML5, CSS3, Vite | Real-time incident triage, automated legitimacy rating, precinct dispatch coordination, Leaflet heatmaps, and audit logs. |
| **Cloud Services** | Firebase Firestore, Cloud Storage, Firebase Auth | Real-time NoSQL data synchronization, photo storage, and secure authentication. |
| **Backend & AI** | Firebase Cloud Functions (Node 20), Google Gemini | Automated server-side validation, notification dispatch, and AI-assisted hotspot analysis. |

---

## ✨ Key Features

### 📱 Resident Mobile Application
- **3-Second Hold SOS Gateway**: Prevents accidental triggers while allowing rapid emergency distress activation.
- **Real-Time GPS Broadcast**: Transmits coordinates and allows citizens to mark themselves safe once assistance arrives.
- **Incident Reporting with Media Evidence**: Categorized reports (theft, assault, domestic violence, vandalism, etc.) with photo uploads.
- **Interactive Safety Map**: Live markers for reported threats, active incidents, and police substations.
- **Transparency & Case Tracking**: Live status updates (*Pending*, *Under Review*, *Verified*, *Responding*, *Done*).

### 🖥️ Web Admin Command Center
- **Real-Time Incident Queue**: Instant live-stream updates via Firestore listeners without manual refreshing.
- **Automated Legitimacy Assessment**: Heuristic scoring evaluating GPS coordinates against Valenzuela boundaries and report consistency.
- **Nearest Precinct Dispatch**: Calculates distance and ETA buffers across covered substations for rapid assignment.
- **GIS Crime Heatmap**: Interactive Leaflet maps displaying crime density, clusters, and historical hotspots.
- **Role-Based Access Control (RBAC)**: Distinct permissions for Super Admins, Police Station Admins, and Barangay Desks.
- **Audit Logging**: Comprehensive activity history tracking all status modifications and response actions.

---

## 📁 Repository Structure

```text
ThreatTrackCap1/
├── mobile/             # React Native / Expo citizen application
├── web-admin/          # Web admin command center (Vite + Vanilla JS)
│   ├── css/            # Modular stylesheets (dashboard, incidents, readability)
│   ├── js/             # ES module controllers (incident triage, GIS, auth)
│   └── public/         # Static assets and icons
├── functions/          # Firebase Cloud Functions backend microservices
├── shared/             # Shared constants, barangay boundaries, and helpers
└── firestore.rules     # Granular Firestore security and access rules
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20 LTS or higher
- **Package Manager**: npm or yarn
- **Firebase Account**: Active Firebase project configured with Firestore and Storage

### 1. Web Admin Portal
```bash
# Clone the repository
git clone https://github.com/BrightReyes/ThreatTrackCap1.git
cd ThreatTrackCap1

# Start the Web Admin development server
npm run admin:dev
```
Access the application at `http://localhost:3000` (or `http://localhost:3000/incidents.html` for the admin portal).

### 2. Citizen Mobile App
```bash
cd mobile
npm install

# Start development with Expo
npx expo start
```

---

## 🔒 Security & Privacy
- **Environment Isolation**: All sensitive credentials are managed via environment variables (`.env`).
- **Role Enforcement**: Strict Firestore security rules restrict dispatch commands to verified police admins.
- **Audit Trail**: Every verification, rejection reason, and unit assignment is recorded with admin IDs and timestamps.

---

## 📄 License
This project is developed as an academic capstone initiative. See the [LICENSE](LICENSE) file for details.