# ThreatTrack Cloud Functions

Cloud Functions for ThreatTrack crime mapping dashboard backend infrastructure.

## 📋 Functions Overview

### 1. **validateIncident** (Firestore Trigger)
- **Trigger:** `onCreate` - incidents collection
- **Purpose:** Validates incident reports and calculates verification score
- **Features:**
  - Data validation (location, type, severity, description)
  - Spam detection (rate limiting, duplicate detection)
  - Auto-verification for high-quality reports
  - Suspicious activity logging

### 2. **calculateRiskLevel** (HTTP Function)
- **Trigger:** HTTP POST/GET request
- **Purpose:** Calculates risk levels for specific locations
- **Endpoint:** `https://REGION-PROJECT_ID.cloudfunctions.net/calculateRiskLevel`
- **Parameters:**
  - `latitude` (number, required)
  - `longitude` (number, required)
  - `radius` (number, optional, default: 5km)
- **Response:** Risk level (high/medium/low) with statistics

### 3. **aggregateHeatmapData** (Scheduled)
- **Trigger:** Cloud Scheduler (every 1 hour)
- **Purpose:** Aggregates incident data into grid cells for heatmap
- **Features:**
  - Grid-based aggregation (~111m cells)
  - Time-based aggregations (daily, 7d, 30d)
  - Weighted scoring by severity
  - Automatic cleanup of old data (90+ days)

### 4. **findNearestPrecinct** (HTTP Function)
- **Trigger:** HTTP POST/GET request
- **Purpose:** Finds nearest police precincts
- **Endpoint:** `https://REGION-PROJECT_ID.cloudfunctions.net/findNearestPrecinct`
- **Parameters:**
  - `latitude` (number, required)
  - `longitude` (number, required)
  - `limit` (number, optional, default: 3)
- **Response:** Array of nearest precincts with distances

### 5. **sendNearbyIncidentAlert** (Firestore Trigger)
- **Trigger:** `onUpdate` - incidents collection (status → verified)
- **Purpose:** Sends push notifications for nearby incidents
- **Features:**
  - Distance-based filtering
  - User preference checking (severity levels)
  - FCM push notifications
  - Notification history tracking

### 6. **healthCheck** (HTTP Function)
- **Trigger:** HTTP GET request
- **Purpose:** Service health check endpoint
- **Endpoint:** `https://REGION-PROJECT_ID.cloudfunctions.net/healthCheck`

---

## 🚀 Setup & Deployment

### Prerequisites
- Node.js 20.x
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase project created
- Service account key downloaded

### Installation

1. **Install dependencies:**
   ```bash
   cd functions
   npm install
   ```

2. **Configure service account (for test data):**
   - Download service account key from Firebase Console
   - Save as `functions/serviceAccountKey.json`
   - **DO NOT COMMIT THIS FILE** (already in .gitignore)

3. **Log in to Firebase:**
   ```bash
   firebase login
   ```

4. **Select your project:**
   ```bash
   firebase use threattrackcap1
   ```

### Deployment

**Deploy all functions:**
```bash
firebase deploy --only functions
```

**Deploy specific function:**
```bash
firebase deploy --only functions:validateIncident
```

**Deploy Firestore rules:**
```bash
firebase deploy --only firestore:rules
```

**Deploy Storage rules:**
```bash
firebase deploy --only storage
```

**Deploy everything:**
```bash
firebase deploy
```

---

## 🧪 Testing

### Local Testing

1. **Start Firebase emulators:**
   ```bash
   cd functions
   npm run serve
   ```

2. **Test HTTP functions:**
   ```bash
   # Calculate risk level
   curl -X POST http://localhost:5001/threattrackcap1/us-central1/calculateRiskLevel \
     -H "Content-Type: application/json" \
     -d '{"latitude": 40.7128, "longitude": -74.0060, "radius": 5}'

   # Find nearest precinct
   curl -X POST http://localhost:5001/threattrackcap1/us-central1/findNearestPrecinct \
     -H "Content-Type: application/json" \
     -d '{"latitude": 40.7128, "longitude": -74.0060}'
   ```

### Generate Test Data

1. **Create sample incidents and precincts:**
   ```bash
   cd functions
   node generateTestData.js
   ```

   This will create:
   - 1 test user
   - 8 police precincts (NYC)
   - 75 sample incidents with realistic data

---

## 📊 Cloud Scheduler Setup

The `aggregateHeatmapData` function requires Cloud Scheduler to run hourly.

### Enable Cloud Scheduler

1. **Go to Google Cloud Console:**
   - https://console.cloud.google.com/cloudscheduler

2. **Enable Cloud Scheduler API**

3. **Create scheduler job (auto-created on first deploy, or manually):**
   ```bash
   firebase deploy --only functions:aggregateHeatmapData
   ```

### Manual Scheduler Creation

If needed, create manually in Google Cloud Console:
- **Name:** `aggregateHeatmapData-schedule`
- **Frequency:** `0 * * * *` (every hour)
- **Timezone:** Your timezone
- **Target:** Cloud Function `aggregateHeatmapData`

---

## 🔐 Environment Variables

Set environment variables for production:

```bash
firebase functions:config:set app.env="production"
firebase functions:config:set app.admin_email="admin@threattrack.com"
```

View current config:
```bash
firebase functions:config:get
```

---

## 📝 Monitoring & Logs

### View logs in Firebase Console
1. Go to Firebase Console → Functions
2. Click on a function
3. View **Logs** tab

### View logs in terminal
```bash
firebase functions:log
```

### View specific function logs
```bash
firebase functions:log --only validateIncident
```

---

## 💰 Cost Estimation

Based on 1,000 active users:

| Function | Invocations/Month | Cost |
|----------|-------------------|------|
| validateIncident | ~5,000 | ~$0.20 |
| calculateRiskLevel | ~50,000 | ~$2.00 |
| aggregateHeatmapData | ~720 (hourly) | ~$0.10 |
| findNearestPrecinct | ~10,000 | ~$0.40 |
| sendNearbyIncidentAlert | ~5,000 | ~$0.20 |
| **Total** | **~70,720** | **~$2.90/mo** |

*Note: Free tier includes 2M invocations/month*

---

## 🐛 Troubleshooting

### Function deployment fails
```bash
# Check Node.js version
node --version  # Should be 20.x

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Permission denied errors
```bash
# Re-authenticate
firebase login --reauth

# Check project
firebase projects:list
firebase use threattrackcap1
```

### Test data generation fails
- Ensure `serviceAccountKey.json` exists in functions directory
- Check Firebase project permissions
- Verify Firestore is enabled

---

## 📚 Additional Resources

- [Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Cloud Scheduler Pricing](https://cloud.google.com/scheduler/pricing)

---

**Last Updated:** February 24, 2026  
**Version:** 1.0.0  
**Maintainer:** ThreatTrack Team
