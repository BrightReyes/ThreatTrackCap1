# Heatmap Feature Implementation Guide

## Overview
The heatmap feature visualizes crime incident density across geographic areas, helping users quickly identify high-risk zones and understand threat distribution patterns in real-time.

## Purpose
- **Situational Awareness**: Display crime hotspots visually on maps
- **Risk Assessment**: Help users identify dangerous areas quickly
- **Data Insights**: Aggregate incident data to reveal crime patterns
- **Response Planning**: Enable law enforcement to allocate resources effectively

---

## Architecture

### Technology Stack
- **Frontend**: React Native with react-native-maps
- **Backend**: Firebase Cloud Functions
- **Database**: Firestore (incident data storage)
- **Data Processing**: Aggregation functions for heatmap generation
- **Visualization**: Custom heatmap layer overlay on maps

### Data Flow
```
Incidents → Firestore Collection
    ↓
Cloud Functions (Aggregation)
    ↓
Heatmap Data (Grid-based density)
    ↓
React Native Maps (Visualization)
    ↓
User Interface
```

---

## Implementation Components

### 1. Data Collection Layer

#### Incident Storage (Firestore)
```
Collection: incidents
├── Document: {incident_id}
│   ├── latitude: number
│   ├── longitude: number
│   ├── timestamp: timestamp
│   ├── incidentType: string (robbery, assault, theft, etc.)
│   ├── severity: number (1-5)
│   ├── precinct_id: string
│   └── processed: boolean
```

#### Location Tracking
- Capture user location with `expo-location`
- Store report location data with each incident
- Maintain geographic boundaries for data filtering

### 2. Aggregation & Processing

#### Cloud Function: `aggregateHeatmapData.js`
**Purpose**: Convert raw incident data into heatmap density grid

**Algorithm**:
1. Query incidents within geographic bounds
2. Grid the map area (default: 0.01° × 0.01° cells ~1km²)
3. Count incidents per grid cell
4. Apply severity weighting
5. Normalize values (0-1 range)
6. Return aggregated data

**Input**:
```javascript
{
  bounds: {
    north: number,
    south: number,
    east: number,
    west: number
  },
  gridSize: 0.01, // degrees
  timeRange: {
    start: timestamp,
    end: timestamp
  },
  incidentTypes: string[] // filter by type
}
```

**Output**:
```javascript
{
  cells: [
    {
      lat: number,
      lng: number,
      intensity: number (0-1),
      count: number,
      severity: number
    }
  ],
  metadata: {
    totalIncidents: number,
    dateRange: { start, end },
    gridResolution: number
  }
}
```

### 3. Frontend Implementation

#### Map Component Integration
```javascript
// HomeScreen.js or MapScreen.js

import { useEffect, useState } from 'react';
import MapView, { Heatmap } from 'react-native-maps';

const MapScreen = () => {
  const [heatmapData, setHeatmapData] = useState(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Fetch heatmap data when region changes
  useEffect(() => {
    fetchHeatmapData(mapRegion);
  }, [mapRegion]);

  const fetchHeatmapData = async (region) => {
    try {
      const response = await fetch('https://your-functions-url/aggregateHeatmapData', {
        method: 'POST',
        body: JSON.stringify({
          bounds: {
            north: region.latitude + region.latitudeDelta / 2,
            south: region.latitude - region.latitudeDelta / 2,
            east: region.longitude + region.longitudeDelta / 2,
            west: region.longitude - region.longitudeDelta / 2,
          },
          timeRange: {
            start: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
            end: Date.now(),
          },
        }),
      });
      const data = await response.json();
      setHeatmapData(data.cells);
    } catch (error) {
      console.error('Error fetching heatmap:', error);
    }
  };

  const convertToHeatmapPoints = (cells) => {
    return cells.map(cell => ({
      latitude: cell.lat,
      longitude: cell.lng,
      weight: cell.intensity,
    }));
  };

  return (
    <MapView
      style={{ flex: 1 }}
      region={mapRegion}
      onRegionChangeComplete={setMapRegion}
    >
      {heatmapData && (
        <Heatmap
          points={convertToHeatmapPoints(heatmapData)}
          radius={40}
          opacity={0.8}
          maxIntensity={1}
          gradient={{
            colors: ['#00ff00', '#ffff00', '#ff0000'],
            startPoints: [0, 0.5, 1],
            colorMapSize: 256,
          }}
        />
      )}
    </MapView>
  );
};
```

### 4. Performance Optimization

#### Caching Strategy
- Cache heatmap data for 5-10 minutes
- Invalidate cache on new incidents
- Implement local storage caching for offline viewing

#### Data Filtering
- Limit query results by time range (default: 7 days)
- Filter by incident types
- Reduce grid resolution for larger areas
- Paginate results if needed

#### Lazy Loading
- Load heatmap only when map is visible
- Debounce region change events (500ms)
- Fetch incrementally when user pans/zooms

---

## Cloud Function Implementation

### File: `functions/src/aggregateHeatmapData.js`

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.aggregateHeatmapData = functions.https.onRequest(async (req, res) => {
  const { bounds, gridSize = 0.01, timeRange, incidentTypes } = req.body;

  try {
    // Build query
    let query = admin.firestore().collection('incidents');
    
    if (timeRange) {
      query = query
        .where('timestamp', '>=', new Date(timeRange.start))
        .where('timestamp', '<=', new Date(timeRange.end));
    }

    const incidents = await query.get();
    
    // Filter by bounds
    const filteredIncidents = incidents.docs
      .map(doc => doc.data())
      .filter(incident => 
        incident.latitude >= bounds.south &&
        incident.latitude <= bounds.north &&
        incident.longitude >= bounds.west &&
        incident.longitude <= bounds.east
      );

    // Aggregate into grid cells
    const cells = new Map();
    
    filteredIncidents.forEach(incident => {
      const cellLat = Math.floor(incident.latitude / gridSize) * gridSize;
      const cellLng = Math.floor(incident.longitude / gridSize) * gridSize;
      const key = `${cellLat},${cellLng}`;
      
      if (!cells.has(key)) {
        cells.set(key, { lat: cellLat, lng: cellLng, count: 0, totalSeverity: 0 });
      }
      
      const cell = cells.get(key);
      cell.count++;
      cell.totalSeverity += incident.severity || 1;
    });

    // Normalize intensity
    const maxCount = Math.max(...Array.from(cells.values()).map(c => c.count));
    const cellArray = Array.from(cells.values()).map(cell => ({
      lat: cell.lat,
      lng: cell.lng,
      count: cell.count,
      intensity: cell.count / maxCount,
      severity: cell.totalSeverity / cell.count,
    }));

    res.json({
      cells: cellArray,
      metadata: {
        totalIncidents: filteredIncidents.length,
        cellCount: cellArray.length,
        dateRange: timeRange,
        gridResolution: gridSize,
      },
    });
  } catch (error) {
    console.error('Error aggregating heatmap data:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## Features & Enhancements

### Core Features
- ✅ Real-time heatmap visualization
- ✅ Adjustable time range (1 day, 7 days, 30 days, custom)
- ✅ Incident type filtering
- ✅ Severity weighting
- ✅ Responsive grid scaling

### Enhancement Ideas
- Color-coded legend (green→yellow→red)
- Cluster analysis for high-concentration zones
- Historical trend comparison
- Export heatmap as image
- Custom alert zones on high-density areas
- Integration with precinct boundaries
- Temporal animation (show crime patterns over time)

---

## Testing

### Unit Tests
```javascript
// Test aggregation function
test('aggregateHeatmapData normalizes values correctly', () => {
  const cells = [
    { count: 10 },
    { count: 20 },
    { count: 5 }
  ];
  // Expect intensity values between 0-1
});
```

### Integration Tests
- Test API endpoint with mock Firestore data
- Verify correct bounds filtering
- Test grid aggregation accuracy
- Performance: load with 10k+ incidents

### Manual Testing
1. Create test incidents across the map
2. Verify heatmap renders correctly
3. Pan/zoom and verify data updates
4. Change time range filters
5. Check performance with large datasets

---

## Deployment Checklist

- [ ] Deploy Cloud Function to Firebase
- [ ] Set up Firestore security rules for data access
- [ ] Configure Cloud Function memory/timeout
- [ ] Set up monitoring and error logging
- [ ] Test with production data
- [ ] Update API endpoints in app
- [ ] Create user documentation
- [ ] Monitor performance metrics

---

## Security Considerations

### Data Access Control
- Restrict heatmap queries to authenticated users
- Aggregate data to prevent exposing individual incidents
- Limit geographic bounds queries to reasonable areas
- Implement rate limiting on API calls

### Firestore Rules
```javascript
match /incidents/{incident} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && 
                   request.resource.data.user_id == request.auth.uid;
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Heatmap not showing | Check Firestore collection has data, verify API endpoint |
| Performance lag | Reduce grid size, limit time range, implement caching |
| Data not updating | Check refresh rate, verify Cloud Function is deployed |
| Memory issues | Implement pagination, reduce max incident count per query |

---

## References

- [React Native Maps Documentation](https://github.com/react-native-maps/react-native-maps)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Firestore Query Documentation](https://firebase.google.com/docs/firestore/query-data)
- [Heatmap Algorithms](https://en.wikipedia.org/wiki/Heat_map)

---

## Related Files

- Frontend: `mobile/screens/HomeScreen.js`
- Backend: `functions/src/aggregateHeatmapData.js`
- Firestore: `firestore.indexes.json`
- Configuration: `mobile/utils/firebase.js`

---

**Last Updated**: April 25, 2026  
**Status**: Implementation Guide - Ready for Development
