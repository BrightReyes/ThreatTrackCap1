# ThreatTrack - Phase 1 Backend Quick Start

## 🎉 Phase 1 Complete!

Your backend infrastructure is ready for deployment. This guide provides quick access to all Phase 1 resources.

---

## 📚 Documentation Index

| Document | Purpose | Use When |
|----------|---------|----------|
| **[PHASE1_DEPLOYMENT.md](PHASE1_DEPLOYMENT.md)** | Step-by-step deployment guide | Ready to deploy to Firebase |
| **[PHASE1_SUMMARY.md](PHASE1_SUMMARY.md)** | Complete implementation summary | Want overview of what was built |
| **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** | Database structure reference | Need to understand data model |
| **[functions/README.md](functions/README.md)** | Cloud Functions documentation | Working with backend functions |
| **[DASHBOARD_ROADMAP.md](DASHBOARD_ROADMAP.md)** | Full project roadmap | Planning next phases |

---

## ⚡ Quick Deploy (30 minutes)

### Prerequisites
- Node.js 20.x installed
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project created (threattrackcap1)

### Deploy in 5 Steps

1. **Install Functions Dependencies:**
   ```powershell
   cd functions
   npm install
   ```

2. **Login to Firebase:**
   ```powershell
   firebase login
   firebase use threattrackcap1
   ```

3. **Deploy Security Rules:**
   ```powershell
   firebase deploy --only firestore:rules,storage
   ```

4. **Deploy Cloud Functions:**
   ```powershell
   firebase deploy --only functions
   ```

5. **Generate Test Data:**
   ```powershell
   # Get service account key from Firebase Console first
   # Save as functions/serviceAccountKey.json
   node functions/generateTestData.js
   ```

**Done!** ✅ Your backend is live.

---

## 🧪 Quick Test

Test your deployment:

```powershell
# Health check
curl https://us-central1-threattrackcap1.cloudfunctions.net/healthCheck

# Calculate risk level
curl -X POST https://us-central1-threattrackcap1.cloudfunctions.net/calculateRiskLevel `
  -H "Content-Type: application/json" `
  -d '{\"latitude\": 40.7128, \"longitude\": -74.0060, \"radius\": 5}'
```

---

## 📦 What Was Built

### 6 Cloud Functions
- ✅ **validateIncident** - Auto-validates submissions with spam detection
- ✅ **calculateRiskLevel** - HTTP API for risk calculation
- ✅ **aggregateHeatmapData** - Hourly heatmap data processing
- ✅ **findNearestPrecinct** - HTTP API for precinct lookup
- ✅ **sendNearbyIncidentAlert** - Push notifications for nearby incidents
- ✅ **healthCheck** - Service monitoring

### 6 Firestore Collections
- `users` - User profiles and preferences
- `incidents` - Crime incident reports
- `precincts` - Police precinct information
- `crime_statistics` - Aggregated heatmap data
- `notifications` - Push notification history
- `suspicious_activity` - Spam detection logs

### Security & Storage
- ✅ Firestore security rules (role-based access)
- ✅ Storage rules (file validation)
- ✅ Rate limiting and spam prevention

---

## 🎯 API Endpoints

### Calculate Risk Level
```
POST https://us-central1-threattrackcap1.cloudfunctions.net/calculateRiskLevel
Body: {"latitude": 40.7128, "longitude": -74.0060, "radius": 5}
```

### Find Nearest Precinct
```
POST https://us-central1-threattrackcap1.cloudfunctions.net/findNearestPrecinct
Body: {"latitude": 40.7128, "longitude": -74.0060, "limit": 3}
```

### Health Check
```
GET https://us-central1-threattrackcap1.cloudfunctions.net/healthCheck
```

---

## 🐛 Common Issues

**Functions deployment fails:**
```powershell
cd functions
rm -rf node_modules package-lock.json
npm install
```

**Test data generation fails:**
- Ensure `serviceAccountKey.json` is in `functions/` folder
- Check Firestore is enabled in Firebase Console

**Permission denied:**
```powershell
firebase login --reauth
```

For more troubleshooting, see [PHASE1_DEPLOYMENT.md](PHASE1_DEPLOYMENT.md#-troubleshooting)

---

## 📊 Monitor Your Deployment

### Firebase Console Links
- **Functions:** https://console.firebase.google.com/project/threattrackcap1/functions
- **Firestore:** https://console.firebase.google.com/project/threattrackcap1/firestore
- **Storage:** https://console.firebase.google.com/project/threattrackcap1/storage
- **Authentication:** https://console.firebase.google.com/project/threattrackcap1/authentication

### View Logs
```powershell
firebase functions:log
firebase functions:log --only validateIncident
```

---

## 💰 Expected Costs

For 1,000 active users:
- **Cloud Functions:** $0-3/month (under free tier)
- **Firestore:** $0-5/month
- **Storage:** $0.03/month
- **Total:** ~$0.13-8/month

Set up billing alerts at $10, $25, $50 to monitor costs.

---

## ✅ Deployment Checklist

- [ ] Node.js 20.x installed
- [ ] Firebase CLI installed
- [ ] Logged into Firebase
- [ ] Functions dependencies installed
- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Cloud Functions deployed
- [ ] Service account key downloaded
- [ ] Test data generated
- [ ] Endpoints tested
- [ ] Firebase Console verified
- [ ] Billing alerts set up

---

## 🚀 What's Next?

### Ready for Phase 2: Map Integration

**Install dependencies:**
```powershell
cd mobile
npx expo install react-native-maps expo-location
npm install @react-navigation/native @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
```

**Start building:**
1. Create `HomeScreen.js` with map component
2. Implement location permissions
3. Add map markers for incidents
4. Display precincts on map

See [DASHBOARD_ROADMAP.md](DASHBOARD_ROADMAP.md#phase-2-map-integration-week-3) for Phase 2 details.

---

## 📞 Need Help?

1. Check the [troubleshooting guide](PHASE1_DEPLOYMENT.md#-troubleshooting)
2. Review [function docs](functions/README.md)
3. Check [database schema](DATABASE_SCHEMA.md)
4. View Firebase Console logs

---

## 🎓 Key Files Reference

```
ThreatTrackCap1/
├── PHASE1_DEPLOYMENT.md     ← Deployment guide
├── PHASE1_SUMMARY.md        ← What was built
├── DATABASE_SCHEMA.md       ← Database structure
├── firebase.json            ← Firebase config
├── firestore.rules          ← Firestore security
├── storage.rules            ← Storage security
└── functions/
    ├── README.md            ← Functions guide
    ├── index.js             ← Functions entry
    ├── generateTestData.js  ← Test data script
    └── src/
        ├── validateIncident.js
        ├── calculateRiskLevel.js
        ├── aggregateHeatmapData.js
        ├── findNearestPrecinct.js
        └── sendNearbyIncidentAlert.js
```

---

**Status:** ✅ Phase 1 Complete - Ready for Phase 2  
**Last Updated:** February 24, 2026  

**Happy Coding! 🚀**
