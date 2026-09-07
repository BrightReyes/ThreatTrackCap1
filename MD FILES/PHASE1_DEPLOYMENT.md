# Phase 1: Backend Infrastructure & Data Model - Setup Guide

## ✅ Completion Status: READY FOR DEPLOYMENT

This guide will walk you through deploying Phase 1 of the ThreatTrack Dashboard.

---

## 📦 What's Included in Phase 1

### Database Schema
- ✅ Firestore collections designed:
  - `users` - User profiles and preferences
  - `incidents` - Crime incident reports
  - `precincts` - Police precinct information
  - `crime_statistics` - Aggregated heatmap data
  - `notifications` - Push notification history
  - `suspicious_activity` - Spam/moderation logs

### Cloud Functions
- ✅ **validateIncident** - Auto-validates incident submissions
- ✅ **calculateRiskLevel** - HTTP API for risk calculation
- ✅ **aggregateHeatmapData** - Hourly heatmap data processing
- ✅ **findNearestPrecinct** - HTTP API for precinct lookup
- ✅ **sendNearbyIncidentAlert** - Push notifications for nearby incidents
- ✅ **healthCheck** - Service health monitoring

### Security Rules
- ✅ Firestore security rules configured
- ✅ Firebase Storage rules configured
- ✅ Rate limiting and spam prevention
- ✅ Role-based access control (user/admin/moderator)

### Test Data
- ✅ Sample data generator script
- ✅ 75 realistic test incidents
- ✅ 8 NYC police precincts
- ✅ Test user account

---

## 🚀 Deployment Steps

### Prerequisites Check

Before starting, ensure you have:

- [x] Node.js 20.x installed
- [x] Firebase CLI installed: `npm install -g firebase-tools`
- [x] Firebase project created (threattrackcap1)
- [x] Firebase Authentication enabled (Email/Password)
- [x] Firestore Database created

### Step 1: Install Firebase CLI (if not already installed)

```powershell
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```powershell
firebase login
```

This will open a browser window for authentication.

### Step 3: Initialize Firebase Project

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1
firebase use threattrackcap1
```

### Step 4: Install Cloud Functions Dependencies

```powershell
cd functions
npm install
```

Expected output:
```
added XX packages in XXs
```

### Step 5: Get Service Account Key (for test data generation)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select **threattrackcap1** project
3. Click ⚙️ **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the downloaded file as:
   ```
   c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1\functions\serviceAccountKey.json
   ```
7. **IMPORTANT:** This file is already in `.gitignore` - never commit it!

### Step 6: Deploy Firestore Security Rules

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1
firebase deploy --only firestore:rules
```

Expected output:
```
✔  firestore: deployed rules
```

### Step 7: Deploy Firebase Storage Rules

```powershell
firebase deploy --only storage
```

Expected output:
```
✔  storage: deployed rules
```

### Step 8: Deploy Cloud Functions

```powershell
firebase deploy --only functions
```

**Note:** First deployment may take 5-10 minutes.

Expected output:
```
✔  functions[validateIncident(us-central1)] Successful create operation.
✔  functions[calculateRiskLevel(us-central1)] Successful create operation.
✔  functions[aggregateHeatmapData(us-central1)] Successful create operation.
✔  functions[findNearestPrecinct(us-central1)] Successful create operation.
✔  functions[sendNearbyIncidentAlert(us-central1)] Successful create operation.
✔  functions[healthCheck(us-central1)] Successful create operation.
```

### Step 9: Enable Cloud Scheduler (for heatmap aggregation)

1. Go to [Google Cloud Console - Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
2. Select your project
3. Click **Enable API** (if not already enabled)
4. The scheduler should auto-create when the function deploys

**Or manually verify:**
```powershell
gcloud scheduler jobs list --project=threattrackcap1
```

### Step 10: Generate Test Data

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1\functions
node generateTestData.js
```

Expected output:
```
🚀 Starting test data generation...

✅ Test user created
📍 Generating precincts...
✅ Created 8 precincts

🚨 Generating incidents...
  ✅ Created 75 / 75 incidents

✅ Created 75 incidents

🎉 Test data generation complete!

Summary:
  - Users: 1
  - Precincts: 8
  - Incidents: 75
```

### Step 11: Verify Deployment

**Test Health Check:**
```powershell
curl https://us-central1-threattrackcap1.cloudfunctions.net/healthCheck
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-24T...",
  "service": "ThreatTrack Cloud Functions",
  "version": "1.0.0"
}
```

**Test Calculate Risk Level:**
```powershell
curl -X POST https://us-central1-threattrackcap1.cloudfunctions.net/calculateRiskLevel `
  -H "Content-Type: application/json" `
  -d '{\"latitude\": 40.7128, \"longitude\": -74.0060, \"radius\": 5}'
```

**Test Find Nearest Precinct:**
```powershell
curl -X POST https://us-central1-threattrackcap1.cloudfunctions.net/findNearestPrecinct `
  -H "Content-Type: application/json" `
  -d '{\"latitude\": 40.7128, \"longitude\": -74.0060}'
```

### Step 12: Verify in Firebase Console

1. **Check Firestore Data:**
   - Go to [Firestore Console](https://console.firebase.google.com/project/threattrackcap1/firestore)
   - Verify collections exist: `users`, `incidents`, `precincts`
   - Check that test data is visible

2. **Check Cloud Functions:**
   - Go to [Functions Console](https://console.firebase.google.com/project/threattrackcap1/functions)
   - Verify all 6 functions are deployed
   - Status should be "Healthy"

3. **Check Storage:**
   - Go to [Storage Console](https://console.firebase.google.com/project/threattrackcap1/storage)
   - Verify storage bucket exists

---

## 🧪 Testing the Backend

### Test Incident Validation

Create a test incident in Firestore Console:

```javascript
{
  reporterId: "test_user_123",
  type: "theft",
  severity: "high",
  description: "Test incident for validation",
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    address: "123 Test St, New York, NY"
  },
  timestamp: [current timestamp],
  reportedAt: [current timestamp],
  status: "pending",
  isAnonymous: false,
  photoUrls: [],
  viewCount: 0,
  reportCount: 0
}
```

The `validateIncident` function should automatically:
- Calculate `verificationScore`
- Update `status` (to verified/under_review/spam)
- Add `validatedAt` timestamp

### Test API Endpoints

Use Postman, Thunder Client, or curl to test HTTP functions.

---

## 📊 Monitor Functions

### View Logs

**All functions:**
```powershell
firebase functions:log
```

**Specific function:**
```powershell
firebase functions:log --only validateIncident
```

**Live streaming logs:**
```powershell
firebase functions:log --tail
```

### View Metrics

Go to [Firebase Console - Functions](https://console.firebase.google.com/project/threattrackcap1/functions) to see:
- Invocation count
- Execution time
- Error rate
- Memory usage

---

## 🐛 Troubleshooting

### "Permission denied" errors

**Solution:**
```powershell
firebase login --reauth
```

### Cloud Functions deployment fails

**Check Node.js version:**
```powershell
node --version  # Should be 20.x
```

**Clear and reinstall:**
```powershell
cd functions
rm -rf node_modules package-lock.json
npm install
```

### Test data generation fails

**Common causes:**
- Service account key not found
- Firestore not enabled
- Incorrect file path

**Solution:**
- Verify `serviceAccountKey.json` exists in `functions/` folder
- Check Firestore is enabled in Firebase Console

### Scheduler not running

**Enable Cloud Scheduler API:**
1. Go to [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
2. Enable the API
3. Redeploy: `firebase deploy --only functions:aggregateHeatmapData`

---

## 💰 Cost Monitoring

### Set Up Billing Alerts

1. Go to [Google Cloud Billing](https://console.cloud.google.com/billing)
2. Select your project
3. Click **Budgets & alerts**
4. Create budget alert at $10, $25, $50

### Expected Costs (Monthly)

Based on 1,000 active users:

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Functions | ~70K invocations | $0-3 (under free tier) |
| Firestore | ~100K reads, ~10K writes | $0-5 |
| Storage | ~1GB files | $0.03 |
| Cloud Scheduler | ~720 jobs | $0.10 |
| **Total** | | **$0.13-8** |

*Note: Free tier covers most development usage*

---

## ✅ Phase 1 Completion Checklist

- [ ] Firebase CLI installed and logged in
- [ ] Cloud Functions deployed (6 functions)
- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Test data generated (75 incidents, 8 precincts)
- [ ] Health check endpoint tested
- [ ] API endpoints tested (calculateRiskLevel, findNearestPrecinct)
- [ ] Firestore Console verified (data visible)
- [ ] Cloud Scheduler enabled
- [ ] Function logs checked (no errors)
- [ ] Billing alerts configured

---

## 🎉 Success Criteria

Phase 1 is complete when:

1. ✅ All 6 Cloud Functions are deployed and healthy
2. ✅ Security rules are active (Firestore + Storage)
3. ✅ Test data is visible in Firestore Console
4. ✅ HTTP endpoints respond correctly
5. ✅ Incident validation triggers automatically
6. ✅ Heatmap aggregation scheduled (hourly)
7. ✅ No errors in function logs

---

## 📝 Next Steps (Phase 2)

After completing Phase 1:

1. **Install map dependencies:**
   ```powershell
   cd mobile
   npx expo install react-native-maps expo-location
   ```

2. **Start Phase 2:** Map Integration
   - Implement HomeScreen with map
   - Request location permissions
   - Display basic markers

See [DASHBOARD_ROADMAP.md](../DASHBOARD_ROADMAP.md) for Phase 2 details.

---

## 📞 Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Firebase Console logs
3. Check [functions/README.md](README.md) for function-specific docs
4. Consult [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) for data structure

---

**Phase 1 Status:** ✅ COMPLETE - READY FOR DEPLOYMENT  
**Estimated Deployment Time:** 30-45 minutes  
**Last Updated:** February 24, 2026
