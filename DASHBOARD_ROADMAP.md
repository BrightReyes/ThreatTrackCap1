# ThreatTrack Dashboard & Heatmap Development Roadmap

## 🎯 Project Overview
Development of a comprehensive crime mapping dashboard with real-time heatmap visualization, incident reporting, and precinct locator features.

**Estimated Timeline:** 8-10 weeks  
**Team Size:** 1-2 developers

---

## 📋 Feature Breakdown (Based on Design)

### Core Components
1. **Interactive Heatmap** - Crime density visualization
2. **Report Incident System** - User-submitted crime reports
3. **Risk Level Dashboard** - High/Medium/Low risk statistics
4. **Nearest Precinct Locator** - GPS-based precinct finder
5. **Recent Incidents Feed** - Real-time incident list
6. **Bottom Navigation** - Home, Status, Alerts, Settings tabs

---

## 🗺️ Development Phases

### **Phase 1: Backend Infrastructure & Data Model** (Week 1-2) ✅ COMPLETE
**Priority:** Critical  
**Dependencies:** Firebase setup complete  
**Status:** ✅ Deployed and Ready

#### Tasks:
- [x] Design Firestore database schema
  - `incidents` collection (location, type, severity, timestamp, reporter)
  - `precincts` collection (name, address, coordinates, contact)
  - `users` collection (already exists, expand with role)
  - `crime_statistics` collection (aggregated data for heatmap)
  - `notifications` collection (push notification history)
  - `suspicious_activity` collection (spam detection logs)
  
- [x] Create Cloud Functions for:
  - Incident submission validation (validateIncident)
  - Automated risk level calculation (calculateRiskLevel - HTTP)
  - Heatmap data aggregation (aggregateHeatmapData - hourly)
  - Nearest precinct calculation (findNearestPrecinct - HTTP)
  - Nearby incident alerts (sendNearbyIncidentAlert)
  - Health check endpoint (healthCheck - HTTP)
  
- [x] Set up Firebase Storage for:
  - Incident photos/evidence
  - User uploads
  - Profile pictures
  
- [x] Implement security rules:
  - Authenticated users can submit incidents
  - Read-only access to precinct data
  - Admin role for incident moderation
  - Input validation and rate limiting
  - File type/size restrictions

**Deliverables:**
- ✅ Database schema document (DATABASE_SCHEMA.md)
- ✅ 6 Cloud Functions deployed
- ✅ Security rules configured (Firestore + Storage)
- ✅ Sample test data (75 incidents, 8 precincts)
- ✅ Deployment guide (PHASE1_DEPLOYMENT.md)
- ✅ Implementation summary (PHASE1_SUMMARY.md)

**Actual Time:** 10-12 days (on schedule)  
**Completion Date:** February 24, 2026

---

### **Phase 2: Map Integration** (Week 3) ✅ COMPLETE
**Priority:** Critical  
**Dependencies:** Phase 1 complete  
**Status:** ✅ Implemented and Ready for Testing

#### Tasks:
- [x] Install react-native-maps
  ```bash
  npx expo install react-native-maps
  ```
  
- [x] Install expo-location
  ```bash
  npx expo install expo-location
  ```
  
- [x] Create `HomeScreen.js` component
  - Map view with initial region (user location)
  - Request location permissions
  - Center on user's current location
  
- [x] Implement map customization:
  - Dark theme map style (matches UI)
  - Disable unnecessary POIs
  - Custom zoom controls (Center button)
  
- [x] Add map markers for:
  - User location (blue dot - native feature)
  - Recent incidents (colored pins by severity)
  - Police precincts (shield icon)
  
- [x] Create location utilities module
  - Permission handling
  - GPS services
  - Distance calculations
  
- [x] Test on both iOS and Android

**Deliverables:**
- ✅ Functional map component with dark theme
- ✅ Location permission handling with user-friendly alerts
- ✅ Custom map styling (dark mode)
- ✅ Marker rendering for incidents and precincts
- ✅ Location utilities module (utils/location.js)
- ✅ Risk statistics dashboard
- ✅ Nearest precinct calculator
- ✅ Recent incidents feed

**Actual Time:** 1 day (greatly ahead of 5-7 day estimate)  
**Completion Date:** March 2, 2026

---

### **Phase 3: Heatmap Visualization** (Week 4-5)
**Priority:** High  
**Dependencies:** Phase 2 complete

#### Tasks:
- [ ] Install heatmap library
  ```bash
  npm install react-native-maps-heatmap
  ```
  
- [ ] Create heatmap data processing:
  - Fetch incidents from Firestore
  - Convert to coordinate points with weights
  - Apply severity-based weighting (High=3, Medium=2, Low=1)
  
- [ ] Implement heatmap overlay:
  - Gradient colors (green → yellow → orange → red)
  - Radius and opacity settings
  - Performance optimization for 500+ points
  
- [ ] Add heatmap controls:
  - Toggle heatmap on/off
  - Time range filter (24h, 7d, 30d, All)
  - Crime type filter (theft, assault, vandalism, etc.)
  
- [ ] Create data caching:
  - Cache heatmap data in AsyncStorage
  - Refresh strategy (pull-to-refresh + auto-refresh)

**Deliverables:**
- Working heatmap overlay
- Filter controls
- Data caching system
- Performance benchmarks

**Estimated Time:** 10-14 days

---

### **Phase 4: Risk Level Dashboard** (Week 5-6)
**Priority:** High  
**Dependencies:** Phase 3 complete

#### Tasks:
- [ ] Create risk statistics component:
  - Three cards showing High/Medium/Low counts
  - Color-coded (red/yellow/green)
  - Real-time updates
  
- [ ] Implement location-based risk calculation:
  - Calculate risk within user's area (5km radius)
  - Aggregate incidents by severity
  - Update every 30 seconds
  
- [ ] Add risk level algorithm:
  ```javascript
  // High Risk: 3+ high severity OR 10+ total incidents
  // Medium Risk: 1-2 high severity OR 5-9 total incidents
  // Low Risk: 0 high severity AND <5 total incidents
  ```
  
- [ ] Create trend indicators:
  - Arrow up/down showing change from previous period
  - Percentage change display

**Deliverables:**
- Risk statistics cards
- Real-time calculation logic
- Trend indicators
- Location-based filtering

**Estimated Time:** 7-10 days

---

### **Phase 5: Incident Reporting System** (Week 6-7)
**Priority:** Critical  
**Dependencies:** Phase 1, 2 complete

#### Tasks:
- [ ] Create `ReportIncidentScreen.js`:
  - Crime type selector (Theft, Assault, Vandalism, Robbery, etc.)
  - Severity level (High, Medium, Low)
  - Location picker (use current location or select on map)
  - Description text area
  - Photo upload (optional)
  - Anonymous reporting option
  
- [ ] Implement form validation:
  - Required fields check
  - Location verification
  - Photo size limits (5MB max)
  
- [ ] Create submission flow:
  - Upload photo to Firebase Storage
  - Save incident to Firestore
  - Show success confirmation
  - Return to home with map centered on reported incident
  
- [ ] Add incident moderation:
  - Admin dashboard (web-admin) to review reports
  - Approve/reject workflow
  - Spam detection (basic)

**Deliverables:**
- Report incident form
- Photo upload functionality
- Submission validation
- Admin moderation panel

**Estimated Time:** 10-12 days

---

### **Phase 6: Precinct Locator** (Week 7-8)
**Priority:** Medium  
**Dependencies:** Phase 2 complete

#### Tasks:
- [ ] Create precinct data seeding:
  - Research local police precincts
  - Add 10-20 precincts to Firestore
  - Include: name, address, coordinates, phone, hours
  
- [ ] Implement nearest precinct finder:
  - Calculate distance from user location
  - Sort by proximity
  - Display top 3 nearest precincts
  
- [ ] Create precinct card component:
  - Shield icon
  - Precinct name
  - Address with location pin
  - "Navigate" button (opens Google Maps)
  - Distance display
  
- [ ] Add "View All" precincts feature:
  - Full list screen
  - Search functionality
  - Filter by area/district

**Deliverables:**
- Precinct database populated
- Nearest precinct card
- Navigation integration
- Full precinct list screen

**Estimated Time:** 5-7 days

---

### **Phase 7: Recent Incidents Feed** (Week 8)
**Priority:** Medium  
**Dependencies:** Phase 5 complete

#### Tasks:
- [ ] Create incident list component:
  - Card design with icon, title, location, time
  - Color-coded by severity
  - Swipeable for details
  
- [ ] Implement real-time updates:
  - Firestore snapshot listener
  - Auto-scroll to new incidents
  - Badge notification for new items
  
- [ ] Add incident detail modal:
  - Full description
  - Exact location on mini-map
  - Timestamp
  - User comments (optional future feature)
  
- [ ] Create filtering:
  - By crime type
  - By time range
  - By distance from user

**Deliverables:**
- Scrollable incident feed
- Real-time updates
- Detail view modal
- Filter controls

**Estimated Time:** 5-7 days

---

### **Phase 8: Bottom Navigation & Screens** (Week 8-9)
**Priority:** High  
**Dependencies:** Phase 1-7 complete

#### Tasks:
- [ ] Install navigation library:
  ```bash
  npx expo install @react-navigation/native @react-navigation/bottom-tabs
  ```
  
- [ ] Create navigation structure:
  - `HomeScreen` (heatmap + dashboard)
  - `StatusScreen` (user's reported incidents)
  - `AlertsScreen` (push notifications from nearby incidents)
  - `SettingsScreen` (profile, preferences, notifications)
  
- [ ] Implement tab navigation:
  - Custom icons for each tab
  - Active/inactive states
  - Badge for alerts count
  
- [ ] Create remaining screens:
  - **Status Screen:**
    - List of user's submitted reports
    - Status tracking (Pending, Under Review, Verified)
    - Edit/delete functionality
  
  - **Alerts Screen:**
    - Notifications for incidents near user
    - Configurable alert radius (1km, 5km, 10km)
    - Mark as read functionality
  
  - **Settings Screen:**
    - Profile info editing
    - Alert preferences
    - Theme toggle (dark/light)
    - Logout button

**Deliverables:**
- Working bottom tab navigation
- 4 complete screens
- Smooth navigation flow
- Settings persistence

**Estimated Time:** 8-10 days

---

### **Phase 9: Real-time Features & Push Notifications** (Week 9-10)
**Priority:** Medium  
**Dependencies:** Phase 8 complete

#### Tasks:
- [ ] Set up Firebase Cloud Messaging (FCM):
  ```bash
  npx expo install expo-notifications
  ```
  
- [ ] Implement push notifications:
  - Request notification permissions
  - Generate and store FCM token
  - Send notifications on new incidents nearby
  
- [ ] Create notification triggers:
  - Cloud Function to detect nearby incidents
  - Check user's alert radius preference
  - Send targeted notifications
  
- [ ] Add real-time data sync:
  - Firestore snapshot listeners for live updates
  - Optimistic UI updates
  - Conflict resolution
  
- [ ] Implement background location:
  - Periodic location updates (every 15 min)
  - Battery-efficient tracking
  - Privacy controls

**Deliverables:**
- Push notification system
- Real-time data sync
- Background location tracking
- Permission management

**Estimated Time:** 8-10 days

---

### **Phase 10: Analytics Dashboard (Web Admin)** (Week 10)
**Priority:** Low  
**Dependencies:** Phase 1-9 complete

#### Tasks:
- [ ] Create admin analytics page:
  - Total incidents chart (line graph)
  - Crime type breakdown (pie chart)
  - Heat zones ranking (bar chart)
  - User engagement metrics
  
- [ ] Implement data export:
  - Export to CSV/Excel
  - Date range selection
  - Filter by criteria
  
- [ ] Add admin controls:
  - Ban users
  - Delete incidents
  - Edit precinct data
  - Moderate reports

**Deliverables:**
- Analytics dashboard
- Data export functionality
- Admin moderation tools

**Estimated Time:** 5-7 days

---

### **Phase 11: Testing & Optimization** (Week 10-11)
**Priority:** Critical  
**Dependencies:** All phases complete

#### Tasks:
- [ ] Performance testing:
  - Load test with 1000+ incidents
  - Check heatmap render time (<2 sec)
  - Memory leak detection
  - Battery usage optimization
  
- [ ] User acceptance testing:
  - Beta testing with 10-20 users
  - Collect feedback
  - Fix critical bugs
  
- [ ] Security audit:
  - Review Firestore rules
  - Check API key exposure
  - Test authentication flows
  
- [ ] Accessibility:
  - Screen reader support
  - Color contrast check
  - Touch target sizes (min 44px)
  
- [ ] Cross-platform testing:
  - iOS testing (iPhone 12+)
  - Android testing (Android 10+)
  - Web responsiveness

**Deliverables:**
- Performance benchmarks report
- Bug fix list (completed)
- Security audit report
- Accessibility compliance

**Estimated Time:** 10-14 days

---

## 📦 Technology Stack

### Frontend (Mobile)
- React Native (Expo SDK 50)
- expo-linear-gradient
- react-native-maps
- react-native-maps-heatmap
- @react-navigation/native
- expo-notifications
- expo-location
- expo-image-picker

### Backend
- Firebase Authentication
- Cloud Firestore
- Cloud Functions (Node.js 20)
- Firebase Cloud Messaging
- Firebase Storage

### Web Admin
- React + Vite
- Chart.js / Recharts
- Firebase Admin SDK

---

## 🎯 Success Metrics

| Metric | Target | Priority |
|--------|--------|----------|
| Heatmap load time | <2 seconds | High |
| Incident submission success rate | >95% | Critical |
| Real-time update latency | <5 seconds | High |
| App crash rate | <1% | Critical |
| User engagement (daily active) | >30% | Medium |
| Incident report accuracy | >85% | High |

---

## 🚨 Risk Mitigation

### Technical Risks
1. **Map Performance** - Solution: Implement clustering for 100+ markers
2. **Firebase Costs** - Solution: Set up billing alerts, optimize queries
3. **Location Accuracy** - Solution: Fallback to network location, user can manually adjust
4. **Real-time Scaling** - Solution: Use Firestore pagination, limit to 50 items per fetch

### Timeline Risks
1. **API Limitations** - Buffer: +2 days per phase for unexpected issues
2. **Design Changes** - Lock design after Phase 2
3. **Testing Delays** - Parallel testing with development starting Phase 6

---

## 💰 Estimated Costs (Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Firebase Blaze Plan | $25-50 | Based on 1000 active users |
| Google Maps API | $0-200 | 28,000 map loads free tier |
| Cloud Functions | $5-15 | Minimal usage initially |
| Firebase Storage | $5-10 | For incident photos |
| **Total** | **$35-275/mo** | Scales with users |

---

## 📝 Next Steps

### Week 1-2 Actions:
1. ✅ Complete authentication (DONE)
2. ✅ Set up Firestore collections & rules (DONE)
3. ✅ Create sample incident data (DONE)
4. ✅ Implement Cloud Functions (DONE)
5. ✅ Deploy backend infrastructure (DONE)

### Week 3 Actions:
1. ✅ Install react-native-maps (DONE)
2. ✅ Install expo-location (DONE)
3. ✅ Create HomeScreen component (DONE)
4. ✅ Implement location permissions (DONE)
5. ✅ Add map markers for incidents and precincts (DONE)

### Week 4-5 Immediate Actions (Phase 3):
1. 🔄 Install react-native-maps-heatmap
2. 🔄 Create heatmap data processing
3. 🔄 Implement heatmap overlay
4. 🔄 Add heatmap filter controls
5. 🔄 Implement data caching

### Quick Start Command:
```bash
cd mobile
npx expo install react-native-maps expo-location
npm install @react-navigation/native @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
```

---

## 🎓 Learning Resources

- [React Native Maps Docs](h4, 2026  
**Version:** 1.1  
**Status:** Phase 1 Complete - Phase 2 Ready to Beginhttps://firebase.google.com/docs/functions)
- [Expo Location API](https://docs.expo.dev/versions/latest/sdk/location/)

---

**Last Updated:** March 2, 2026  
**Version:** 1.2  
**Status:** Phase 2 Complete - Phase 3 Ready to Begin

