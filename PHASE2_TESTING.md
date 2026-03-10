# Phase 2 Testing Checklist

## 🧪 Pre-Testing Setup

- [ ] Phase 1 backend is deployed
- [ ] Test data generated (75 incidents, 8 precincts)
- [ ] Dependencies installed (`npm install --legacy-peer-deps`)
- [ ] Mobile device or emulator ready
- [ ] Location services enabled on device

---

## 📱 Start the App

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1\mobile
npm start
```

Choose platform:
- [ ] Android: Press `a` or `npm run android`
- [ ] iOS: Press `i` or `npm run ios`
- [ ] Web: Press `w` (limited features)

---

## ✅ Test Checklist

### 1. Location Permission
- [ ] Permission prompt appears on first launch
- [ ] Grant location permission
- [ ] Map initializes and loads
- [ ] Loading spinner appears briefly
- [ ] Map centers on your location

### 2. Map View
- [ ] Dark themed map appears
- [ ] Map is interactive (pan, zoom)
- [ ] "📍 Center" button visible in header
- [ ] Blue dot shows your location
- [ ] Smooth animations when moving map

### 3. Incident Markers
- [ ] Incident markers appear on map
- [ ] Markers are color-coded:
  - [ ] Red markers (high severity)
  - [ ] Orange markers (medium severity)
  - [ ] Green markers (low severity)
- [ ] Emoji icons visible in markers
- [ ] Tap a marker → shows incident type and description
- [ ] At least 10-20 markers visible (depends on zoom level)

### 4. Precinct Markers
- [ ] Blue shield markers appear
- [ ] Markers larger than incident markers
- [ ] Tap a marker → shows precinct name and address
- [ ] 3-5 precinct markers visible (depends on location)

### 5. Risk Statistics Cards
- [ ] Three risk cards displayed
- [ ] Numbers show actual counts:
  - [ ] High Risk count > 0
  - [ ] Medium Risk count > 0
  - [ ] Low Risk count > 0
- [ ] Cards have colored borders (red/orange/green)
- [ ] Numbers match Firestore data

### 6. Nearest Precinct Card
- [ ] Precinct card appears below risk cards
- [ ] Shows precinct name
- [ ] Shows address
- [ ] Shows distance (in km or m)
- [ ] Navigate button (▶️) is clickable
- [ ] Tap navigate → alert appears

### 7. Recent Incidents Feed
- [ ] "Recent Incidents" section appears
- [ ] Shows 3 incident cards
- [ ] Each card shows:
  - [ ] Colored icon matching severity
  - [ ] Incident type (Theft, Assault, etc.)
  - [ ] Location/address
  - [ ] Time ago (e.g., "3 hours ago")
- [ ] "See All (X)" shows total count
- [ ] Tap a card → shows full description

### 8. Interaction Tests
- [ ] Scroll page up and down smoothly
- [ ] Tap "📍 Center" → map recenters on you
- [ ] Zoom in → markers become more spread out
- [ ] Zoom out → markers cluster closer
- [ ] Pan map → can explore different areas
- [ ] Tap "Report an Incident" → "Coming Soon" alert

### 9. Error Handling
- [ ] Deny location permission → shows "Enable Location" button
- [ ] Tap "Enable Location" → re-requests permission
- [ ] Turn off location services → shows alert
- [ ] Disconnect internet → shows error gracefully
- [ ] No crashes or freezes

### 10. Performance
- [ ] App loads within 3 seconds
- [ ] Map appears within 2 seconds
- [ ] Data loads within 1 second
- [ ] No lag when scrolling
- [ ] No lag when zooming map
- [ ] Smooth marker rendering

---

## 🔍 Visual Quality Check

### Map
- [ ] Dark theme matches app gradient
- [ ] Roads visible but muted
- [ ] Water appears black
- [ ] Labels readable
- [ ] No visual glitches

### Markers
- [ ] Clear and visible
- [ ] White borders visible
- [ ] Emoji icons centered
- [ ] Appropriate sizes
- [ ] No overlapping text

### UI Elements
- [ ] Cards have rounded corners
- [ ] Proper spacing between elements
- [ ] Text readable on dark background
- [ ] Icons display correctly
- [ ] Colors match design (blues, reds, oranges, greens)

---

## 🚨 Common Issues & Solutions

### Issue: "Location permission not granted"
**Solution:**
- Go to device Settings → Apps → ThreatTrack → Permissions
- Enable Location
- Or tap "Enable Location" button in app

### Issue: "Map not loading"
**Solution:**
```powershell
# Clear cache
npx expo start -c
```

### Issue: "No markers appearing"
**Solution:**
- Verify Phase 1 test data was generated
- Check Firestore Console → incidents collection
- Should have ~75 documents

### Issue: "App crashes when opening"
**Solution:**
```powershell
# Reinstall dependencies
cd mobile
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Issue: "TypeError: undefined is not an object"
**Solution:**
- Check internet connection
- Verify Firebase config is correct
- Check console logs for specific error

---

## 📊 Expected Results

### Data Counts
- **Incidents:** ~50 visible on map (limited by query)
- **Precincts:** ~8 visible
- **Risk Stats:**
  - High: ~10-20
  - Medium: ~20-30
  - Low: ~20-30

### Load Times
- Initial load: < 3 seconds
- Map ready: < 2 seconds
- Data fetch: < 1 second
- Marker render: < 500ms

### Memory
- Initial: ~40-60 MB
- With map: ~70-90 MB
- Acceptable range: < 150 MB

---

## ✅ Test Completion

### All Tests Passed?
- [ ] Yes - Proceed to Phase 3
- [ ] No - Document issues below

### Issues Found:
```
(List any issues discovered during testing)

1. 
2. 
3. 
```

### Screenshots Taken:
- [ ] Map with markers
- [ ] Risk statistics cards
- [ ] Nearest precinct
- [ ] Recent incidents feed
- [ ] Location permission prompt

---

## 📝 Testing Notes

**Device Used:**
- [ ] Physical device (recommended)
- [ ] Emulator/simulator

**Platform:**
- [ ] Android
- [ ] iOS
- [ ] Web

**Date Tested:** __________

**Tester:** __________

**Overall Result:**
- [ ] ✅ All tests passed
- [ ] ⚠️ Minor issues (non-blocking)
- [ ] ❌ Major issues (blocking)

---

## 🎉 Success Criteria

Phase 2 is successful if:

1. ✅ Map loads and displays correctly
2. ✅ Location permission granted and working
3. ✅ Incident markers appear and are interactive
4. ✅ Precinct markers appear correctly
5. ✅ Risk statistics show real data
6. ✅ Nearest precinct calculated correctly
7. ✅ Recent incidents display properly
8. ✅ No crashes or major bugs
9. ✅ Performance is acceptable
10. ✅ UI looks polished and professional

---

**Ready for Phase 3?** If all tests pass, you're ready to implement Heatmap Visualization! 🚀

---

*Last Updated: March 2, 2026*
