# ThreatTrack Firestore Database Schema

## Collections Overview

### 1. `users` Collection
Stores user profile and preference data.

**Document ID:** User's Firebase Auth UID

**Fields:**
```javascript
{
  uid: string,              // Firebase Auth UID
  email: string,            // User email
  firstName: string,        // User's first name
  lastName: string,         // User's last name
  role: string,             // "user" | "admin" | "moderator"
  createdAt: timestamp,     // Account creation date
  alertRadius: number,      // Alert radius in km (default: 5)
  alertPreferences: {
    enabled: boolean,       // Push notifications enabled
    highSeverity: boolean,  // Alert for high severity
    mediumSeverity: boolean,// Alert for medium severity
    lowSeverity: boolean    // Alert for low severity
  },
  fcmToken: string,         // Firebase Cloud Messaging token
  location: {
    latitude: number,       // Last known latitude
    longitude: number       // Last known longitude
  }
}
```

**Indexes:**
- `email` (ascending)
- `role` (ascending)

---

### 2. `incidents` Collection
Stores crime incident reports submitted by users.

**Document ID:** Auto-generated

**Fields:**
```javascript
{
  id: string,               // Auto-generated document ID
  reporterId: string,       // User UID who reported (null if anonymous)
  type: string,             // "theft" | "assault" | "vandalism" | "robbery" | "burglary" | "other"
  severity: string,         // "high" | "medium" | "low"
  description: string,      // Incident description
  location: {
    latitude: number,       // Incident latitude
    longitude: number,      // Incident longitude
    address: string         // Human-readable address (optional)
  },
  timestamp: timestamp,     // When incident occurred
  reportedAt: timestamp,    // When report was submitted
  status: string,           // "pending" | "under_review" | "verified" | "rejected" | "spam"
  isAnonymous: boolean,     // Whether reporter chose to be anonymous
  photoUrls: array,         // Array of Firebase Storage URLs
  moderatedBy: string,      // Admin UID who moderated (null if not moderated)
  moderatedAt: timestamp,   // When moderation occurred
  verificationScore: number,// Algorithm score 0-100 (for spam detection)
  viewCount: number,        // Number of times viewed
  reportCount: number       // Number of times flagged by users
}
```

**Indexes:**
- `timestamp` (descending)
- `severity` (ascending), `timestamp` (descending)
- `type` (ascending), `timestamp` (descending)
- `status` (ascending), `timestamp` (descending)
- Composite: `location.latitude` (ascending), `location.longitude` (ascending), `timestamp` (descending)

---

### 3. `precincts` Collection
Stores police precinct information.

**Document ID:** Auto-generated or precinct code

**Fields:**
```javascript
{
  id: string,               // Document ID
  name: string,             // "1st Police Precinct"
  code: string,             // "PCT-001"
  address: string,          // Full street address
  location: {
    latitude: number,       // Precinct latitude
    longitude: number       // Precinct longitude
  },
  contact: {
    phone: string,          // Main phone number
    emergency: string,      // Emergency contact
    email: string           // Precinct email
  },
  hours: string,            // "24/7" or specific hours
  district: string,         // District/Area name
  jurisdictionArea: array,  // Array of GeoPoints defining coverage area
  services: array,          // ["emergency", "reporting", "community_outreach"]
  isActive: boolean,        // Whether precinct is operational
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Indexes:**
- `isActive` (ascending), `district` (ascending)
- `location.latitude` (ascending), `location.longitude` (ascending)

---

### 4. `crime_statistics` Collection
Aggregated crime data for heatmap visualization (updated hourly by Cloud Function).

**Document ID:** `{date}_{grid_cell}` (e.g., "2026-02-24_40.7128_-74.0060")

**Fields:**
```javascript
{
  id: string,               // Document ID
  gridCell: {
    latitude: number,       // Grid cell center latitude (rounded to 3 decimals ~111m)
    longitude: number       // Grid cell center longitude
  },
  date: string,             // "YYYY-MM-DD"
  incidentCount: number,    // Total incidents in this grid cell
  severityBreakdown: {
    high: number,           // Count of high severity
    medium: number,         // Count of medium severity
    low: number             // Count of low severity
  },
  typeBreakdown: {
    theft: number,
    assault: number,
    vandalism: number,
    robbery: number,
    burglary: number,
    other: number
  },
  weightedScore: number,    // Calculated score: (high*3 + medium*2 + low*1)
  lastUpdated: timestamp,   // When this aggregation was last updated
  period: string            // "24h" | "7d" | "30d" | "all"
}
```

**Indexes:**
- `date` (descending)
- `weightedScore` (descending)
- Composite: `gridCell.latitude` (ascending), `gridCell.longitude` (ascending), `date` (descending)

---

### 5. `notifications` Collection
Stores push notification history.

**Document ID:** Auto-generated

**Fields:**
```javascript
{
  id: string,               // Document ID
  userId: string,           // User UID who received notification
  incidentId: string,       // Related incident ID
  title: string,            // Notification title
  body: string,             // Notification body
  type: string,             // "nearby_incident" | "status_update" | "system"
  sentAt: timestamp,        // When notification was sent
  readAt: timestamp,        // When user read it (null if unread)
  actionUrl: string,        // Deep link to incident/screen
  priority: string          // "high" | "normal" | "low"
}
```

**Indexes:**
- `userId` (ascending), `sentAt` (descending)
- `userId` (ascending), `readAt` (ascending)

---

## Security Rules

### Firestore Rules
See `firestore.rules` file for complete rules.

**Key Principles:**
- Users can only edit their own data
- All authenticated users can read incidents and precincts
- Only admins can moderate incidents
- Crime statistics are read-only (generated by Cloud Functions)
- Spam prevention: rate limiting on incident creation

### Storage Rules
See `storage.rules` file for complete rules.

**Key Principles:**
- Authenticated users can upload incident photos
- File size limit: 5MB per file
- Allowed types: image/jpeg, image/png, image/webp
- Users can only delete their own uploads

---

## Data Relationships

```
users (1) -----(many) incidents (reporterId)
incidents (many) -----(1) precincts (nearest)
incidents (many) -----(many) crime_statistics (aggregated)
users (1) -----(many) notifications (userId)
incidents (1) -----(many) notifications (incidentId)
```

---

## Sample Queries

### Get incidents within radius
```javascript
// Note: Requires geohash or external calculation
const incidents = await db.collection('incidents')
  .where('status', '==', 'verified')
  .orderBy('timestamp', 'desc')
  .limit(50)
  .get();
// Then filter by distance in client
```

### Get user's reported incidents
```javascript
const userIncidents = await db.collection('incidents')
  .where('reporterId', '==', userId)
  .orderBy('reportedAt', 'desc')
  .get();
```

### Get nearest precincts
```javascript
const precincts = await db.collection('precincts')
  .where('isActive', '==', true)
  .get();
// Then sort by distance in client or Cloud Function
```

### Get heatmap data for date range
```javascript
const heatmapData = await db.collection('crime_statistics')
  .where('date', '>=', startDate)
  .where('date', '<=', endDate)
  .orderBy('date', 'desc')
  .orderBy('weightedScore', 'desc')
  .get();
```

---

## Migration Notes

**From existing setup:**
- `users` collection already exists (keep structure)
- `crimes` collection → rename to `incidents` (more professional)
- `police_precincts` collection → rename to `precincts` (consistency)

**New collections to create:**
- `crime_statistics` (for heatmap performance)
- `notifications` (for alert system)

---

**Version:** 1.0  
**Last Updated:** February 24, 2026  
**Status:** Implementation Ready
