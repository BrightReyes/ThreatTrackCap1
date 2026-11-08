import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Linking,
  Image,
  Animated,
  StatusBar,
  AppState,
} from 'react-native';
// [QA-FIX #6] useFocusEffect import removed: the focus-refetch it powered was
// tearing down and re-downloading the live incidents listener on every return to Home.
import * as Location from 'expo-location';
import { collection, query, where, getDocs, onSnapshot, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { goToMainScreen } from '../utils/navigation';
import ActiveEmergencyModal, { getStatusMeta } from '../components/ActiveEmergencyModal';
import MapView, { Marker, Polygon, Circle } from '../components/maps';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT } from '../theme/colors';
import { auth, db } from '../utils/firebase';
import { getCurrentLocation, getFastLocation, requestLocationPermission, calculateDistance, formatDistance, watchLocation } from '../utils/location';
import CustomAlert from '../components/CustomAlert';
import SmoothModal from '../components/SmoothModal';
import GlobalBottomBar from '../components/GlobalBottomBar';
import { VALENZUELA_POLICE_PRECINCTS } from '../data/valenzuelaPrecincts';
import { COVERED_SUBSTATIONS } from '../utils/responderEta';

const { width, height } = Dimensions.get('window');

const APP_LOGO = require('../assets/icons/threattrack-logo-tight.png');
const BELL_ICON = require('../assets/icons/bell.png');
const CAMERA_ICON = require('../assets/icons/camera.png');
const GEAR_ICON = require('../assets/icons/gear.png');
const POLICE_STATION_ICON = require('../assets/icons/police-station.png');
const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

// Valenzuela City center and viewport based on OSM boundary relation 307470.
const VALENZUELA_CENTER = {
  latitude: 14.7136,
  longitude: 120.9752,
  latitudeDelta: 0.082,
  longitudeDelta: 0.088,
};

const DEFAULT_HEATMAP_DAYS = 7;
const HEATMAP_VISIBLE_STATUSES = new Set([
  'verified',
  'under_review',
  'pending',
  'submitted',
  'open',
  'responding',
]);

const INCIDENT_TYPE_LABELS = {
  theft_snatching: 'Theft / Snatching',
  robbery_holdup: 'Robbery / Hold-up',
  physical_assault_injury: 'Physical Assault / Injury',
  domestic_violence: 'Domestic Violence',
  drug_related_activity: 'Drug-Related Activity',
  public_disturbance: 'Public Disturbance',
  vandalism_property_damage: 'Vandalism / Property Damage',
  traffic_accident: 'Traffic Accidents',
  illegal_weapons: 'Illegal Possession of Weapons',
  suspicious_activity: 'Suspicious Activity / Persons',
};


const normalizePrecinctForMap = (precinct) => {
  const latitude = Number(precinct?.location?.latitude ?? precinct?.latitude ?? precinct?.lat);
  const longitude = Number(precinct?.location?.longitude ?? precinct?.longitude ?? precinct?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    ...precinct,
    location: {
      ...(precinct?.location || {}),
      latitude,
      longitude,
    },
  };
};

const normalizePrecinctKeyPart = (value) => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
);

const getPrecinctMergeKeys = (precinct) => {
  const keys = [
    precinct?.code && `code:${normalizePrecinctKeyPart(precinct.code)}`,
    precinct?.id && `id:${normalizePrecinctKeyPart(precinct.id)}`,
    precinct?.name && `name:${normalizePrecinctKeyPart(precinct.name)}`,
    precinct?.sourceId && `source:${normalizePrecinctKeyPart(precinct.sourceId)}`,
  ].filter(Boolean);

  return keys.length > 0 ? keys : ['id:unknown'];
};

// Two entries this close are the same building listed under different
// names/codes (e.g. "Balangkas Police Sub-station (PCP 5)" vs "PCP 5"), and
// render as stacked duplicate pins. Distinct Valenzuela precincts are 400 m+ apart.
const PRECINCT_DUPLICATE_RADIUS_KM = 0.075;

const findNearbyPrecinctKey = (precinctsByKey, precinct) => {
  const coord = getPrecinctCoordinate(precinct);
  if (!coord) return null;
  for (const [key, existing] of precinctsByKey) {
    // Two admin-managed (Firestore) precincts are never merged by distance:
    // the admin team may deliberately add separate posts close together.
    // Proximity only folds duplicates into the built-in directory entries.
    if (precinct._adminManaged && existing._adminManaged) continue;
    const existingCoord = getPrecinctCoordinate(existing);
    if (existingCoord && calculateDistance(coord, existingCoord) <= PRECINCT_DUPLICATE_RADIUS_KM) {
      return key;
    }
  }
  return null;
};

/**
 * Adds a precinct, merging it into an existing entry that matches by
 * code/id/name/sourceId OR sits within PRECINCT_DUPLICATE_RADIUS_KM.
 * - preferIncoming=true (Firestore/admin data): incoming fields win, so admin
 *   coordinates and names override the built-in list.
 * - preferIncoming=false (secondary directories): the existing entry's
 *   name/code/coordinates are kept; incoming only fills missing fields.
 */
const setMergedPrecinct = (precinctsByKey, precinctKeyAliases, precinct, { preferIncoming = true } = {}) => {
  const mergeKeys = getPrecinctMergeKeys(precinct);
  const existingPrimaryKey =
    mergeKeys.map((key) => precinctKeyAliases.get(key)).find(Boolean) ||
    findNearbyPrecinctKey(precinctsByKey, precinct);
  const primaryKey = existingPrimaryKey || mergeKeys[0];
  const existing = existingPrimaryKey ? precinctsByKey.get(existingPrimaryKey) : null;

  const merged = !existing
    ? precinct
    : preferIncoming
    ? { ...existing, ...precinct }
    : { ...precinct, ...existing };

  precinctsByKey.set(primaryKey, merged);
  mergeKeys.forEach((key) => precinctKeyAliases.set(key, primaryKey));
};

const getMapPrecincts = (firestorePrecincts = []) => {
  const precinctsByKey = new Map();
  const precinctKeyAliases = new Map();

  // 1. Baseline Valenzuela PCP 1-12 directory
  VALENZUELA_POLICE_PRECINCTS.forEach((precinct) => {
    setMergedPrecinct(precinctsByKey, precinctKeyAliases, precinct);
  });

  // 2. Official police substations (e.g. Balangkas PCP 5, Mapulang Lupa PCP 10)
  (COVERED_SUBSTATIONS || [])
    .map(normalizePrecinctForMap)
    .filter(Boolean)
    .forEach((precinct) => {
      // Substations duplicate PCP 5 / PCP 10 / HQ at the same spot: keep the
      // baseline name and (OSM-checked) coordinates, drop the second pin.
      setMergedPrecinct(precinctsByKey, precinctKeyAliases, {
        ...precinct,
        category: 'police_substation',
        source: 'Substation Directory',
      }, { preferIncoming: false });
    });

  // 3. Dynamic Firestore-managed precincts
  firestorePrecincts
    .map(normalizePrecinctForMap)
    .filter(Boolean)
    .forEach((precinct) => {
      setMergedPrecinct(precinctsByKey, precinctKeyAliases, {
        ...precinct,
        source: precinct.source || 'Firestore',
        _adminManaged: true,
      });
    });

  return Array.from(precinctsByKey.values());
};

const getPrecinctCoordinate = (precinct) => {
  const latitude = Number(precinct?.location?.latitude ?? precinct?.latitude ?? precinct?.lat);
  const longitude = Number(precinct?.location?.longitude ?? precinct?.longitude ?? precinct?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

// Pure date parsing helpers for incident timestamps
const getIncidentDate = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getIncidentHeatmapDate = (incident) => {
  return (
    getIncidentDate(incident?.timestamp) ||
    getIncidentDate(incident?.clientTimestamp) ||
    getIncidentDate(incident?.createdAt) ||
    getIncidentDate(incident?.submittedAt)
  );
};

// Spatial clustering algorithm: computes exact geodesic circles for MapView
const buildGeographicHotspotCircles = (sourceIncidents, days = DEFAULT_HEATMAP_DAYS) => {
  if (!Array.isArray(sourceIncidents) || sourceIncidents.length === 0) {
    return [];
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const validIncidents = sourceIncidents.filter((incident) => {
    const lat = Number(incident?.location?.latitude ?? incident?.latitude);
    const lng = Number(incident?.location?.longitude ?? incident?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const status = incident.status || 'verified';
    if (!HEATMAP_VISIBLE_STATUSES.has(status)) return false;

    const incidentDate = getIncidentHeatmapDate(incident);
    if (!incidentDate || incidentDate < startDate || incidentDate > endDate) return false;

    return true;
  });

  if (validIncidents.length === 0) {
    return [];
  }

  // Group into spatial clusters within ~120m (about one street block), so
  // incidents a few streets apart stay separate hotspots.
  const clusters = [];
  const CLUSTER_DISTANCE_KM = 0.12;

  validIncidents.forEach((incident) => {
    const lat = Number(incident?.location?.latitude ?? incident?.latitude);
    const lng = Number(incident?.location?.longitude ?? incident?.longitude);
    const point = { latitude: lat, longitude: lng };

    let closestCluster = null;
    let minDistance = Infinity;

    for (const cluster of clusters) {
      const dist = calculateDistance(point, {
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      });
      if (dist < minDistance) {
        minDistance = dist;
        closestCluster = cluster;
      }
    }

    if (closestCluster && minDistance <= CLUSTER_DISTANCE_KM) {
      closestCluster.points.push(incident);
      const total = closestCluster.points.length;
      closestCluster.latitude = (closestCluster.latitude * (total - 1) + lat) / total;
      closestCluster.longitude = (closestCluster.longitude * (total - 1) + lng) / total;
      if (incident.severity === 'high') closestCluster.hasHigh = true;
    } else {
      clusters.push({
        id: `cluster-${clusters.length + 1}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        latitude: lat,
        longitude: lng,
        points: [incident],
        hasHigh: incident.severity === 'high',
      });
    }
  });

  return clusters.map((cluster) => {
    const count = cluster.points.length;
    // Neighborhood-street scale radii in meters (originally 130-380 m, which
    // read as a whole barangay; 45-120 m was too small to notice).
    let radius = 98;
    let auraRadius = 150;
    let severity = 'low';

    if (count >= 5 || cluster.hasHigh) {
      radius = 170;
      auraRadius = 245;
      severity = 'high';
    } else if (count >= 2) {
      radius = 130;
      auraRadius = 195;
      severity = 'medium';
    }

    // Grow to cover how far the cluster's incidents actually spread, so a
    // hotspot along one street stays tight and a wider one is still covered.
    let spreadMeters = 0;
    cluster.points.forEach((p) => {
      const d = calculateDistance(
        { latitude: cluster.latitude, longitude: cluster.longitude },
        {
          latitude: Number(p?.location?.latitude ?? p?.latitude),
          longitude: Number(p?.location?.longitude ?? p?.longitude),
        }
      ) * 1000;
      if (Number.isFinite(d) && d > spreadMeters) spreadMeters = d;
    });
    radius = Math.max(radius, Math.min(spreadMeters + 50, 260));
    auraRadius = Math.max(auraRadius, radius * 1.4);

    return {
      id: cluster.id,
      center: {
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      },
      radius,
      auraRadius,
      count,
      severity,
      // Individual incident spots (capped) so the glow follows where the
      // incidents actually happened instead of being a perfect disc.
      points: cluster.points.slice(0, MAX_HOTSPOT_SUBPOINTS).map((p) => ({
        latitude: Number(p?.location?.latitude ?? p?.latitude),
        longitude: Number(p?.location?.longitude ?? p?.longitude),
      })),
    };
  });
};

// Overlay budget: each hotspot draws 6 falloff + 1 core Circle, plus 2 per
// incident spot. 40 hotspots x (7 + 2*6) stays well under ~800 overlays.
const MAX_HOTSPOT_SUBPOINTS = 6;
const MAX_RENDERED_HOTSPOTS = 40;

// Neutral incident icon styling (red is reserved for urgent UI; severity is
// shown with a badge or a small colored dot instead of a red icon).
const NEUTRAL_ICON_COLOR = '#7f1d1d';
const NEUTRAL_ICON_TILE = {
  backgroundColor: '#f1f5f9',
  borderWidth: 1,
  borderColor: '#e2e8f0',
};

// Active-report auto-open guard, shared across HomeScreen mounts for the app
// session (see autoOpenedReportIdsRef in HomeScreen).
const AUTO_OPENED_REPORT_IDS_REF = { current: new Set() };
const SOS_AUTO_OPEN_WINDOW_MS = 2 * 60 * 1000;

// Soft radial falloff: stacked stroke-less circles whose translucent fills
// add up toward the center, so the hotspot fades out instead of ending at a
// hard edge. Each entry = [fraction of auraRadius, alpha multiplier].
// A flatter curve (edge 0.6 vs 0.35 before) keeps the outer glow visible
// when zoomed out instead of fading to nothing.
const HOTSPOT_FALLOFF_LAYERS = [
  [1.0, 0.6],
  [0.85, 0.7],
  [0.7, 0.8],
  [0.55, 0.9],
  [0.4, 1.0],
  [0.26, 1.1],
];

const HOTSPOT_RGB = {
  high: '220, 38, 38',
  medium: '249, 115, 22',
  low: '234, 179, 8',
};

const HOTSPOT_CORE_RGB = {
  high: '153, 27, 27',
  medium: '234, 88, 12',
  low: '202, 138, 4',
};

// Per-layer base alpha. Stacked, the center reaches ~0.77 / 0.70 / 0.65
// opacity and the outer edge ~0.12 / 0.10 / 0.09, so hotspots stay
// recognizable at city zoom while the map still shows through.
const HOTSPOT_LAYER_ALPHA = {
  high: 0.2,
  medium: 0.17,
  low: 0.15,
};

const SEVERITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
};


// Valenzuela City bounds matching web-admin admin-map.js with tight city bounding
const VALENZUELA_BOUNDS = {
  northEast: { latitude: 14.775, longitude: 121.035 },
  southWest: { latitude: 14.655, longitude: 120.915 },
};

const VALENZUELA_ALLOWED_LIMITS = {
  minLat: 14.655,
  maxLat: 14.775,
  minLng: 120.915,
  maxLng: 121.035,
  maxLatitudeDelta: 0.085,
  maxLongitudeDelta: 0.092,
};

// Simplified Valenzuela City boundary polygon from OSM relation 307470.
const VALENZUELA_BOUNDARY = [
  { latitude: 14.7199238, longitude: 120.9595390 },
  { latitude: 14.7198627, longitude: 120.9626954 },
  { latitude: 14.7214998, longitude: 120.9631697 },
  { latitude: 14.7240004, longitude: 120.9678352 },
  { latitude: 14.7219855, longitude: 120.9699383 },
  { latitude: 14.7241847, longitude: 120.9726704 },
  { latitude: 14.7249460, longitude: 120.9757667 },
  { latitude: 14.7257627, longitude: 120.9755775 },
  { latitude: 14.7241913, longitude: 120.9777744 },
  { latitude: 14.7256761, longitude: 120.9832024 },
  { latitude: 14.7356309, longitude: 120.9778053 },
  { latitude: 14.7359804, longitude: 120.9810471 },
  { latitude: 14.7407873, longitude: 120.9815152 },
  { latitude: 14.7460613, longitude: 120.9847552 },
  { latitude: 14.7507821, longitude: 120.9858093 },
  { latitude: 14.7535728, longitude: 120.9891238 },
  { latitude: 14.7572354, longitude: 120.9890091 },
  { latitude: 14.7563539, longitude: 120.9947747 },
  { latitude: 14.7569171, longitude: 120.9968660 },
  { latitude: 14.7583971, longitude: 120.9977900 },
  { latitude: 14.7561006, longitude: 120.9982151 },
  { latitude: 14.7534132, longitude: 121.0009133 },
  { latitude: 14.7488391, longitude: 121.0028856 },
  { latitude: 14.7459224, longitude: 121.0067655 },
  { latitude: 14.7144576, longitude: 121.0004642 },
  { latitude: 14.7087550, longitude: 121.0161294 },
  { latitude: 14.7004239, longitude: 121.0180124 },
  { latitude: 14.6938891, longitude: 121.0244795 },
  { latitude: 14.6911428, longitude: 121.0238923 },
  { latitude: 14.6904010, longitude: 121.0214365 },
  { latitude: 14.6920903, longitude: 121.0181582 },
  { latitude: 14.6920089, longitude: 121.0151422 },
  { latitude: 14.6898689, longitude: 121.0130231 },
  { latitude: 14.6847643, longitude: 121.0138837 },
  { latitude: 14.6823280, longitude: 121.0119213 },
  { latitude: 14.6864310, longitude: 121.0062421 },
  { latitude: 14.6869794, longitude: 121.0028764 },
  { latitude: 14.6841972, longitude: 120.9994412 },
  { latitude: 14.6788132, longitude: 120.9984466 },
  { latitude: 14.6785866, longitude: 120.9973024 },
  { latitude: 14.6756887, longitude: 120.9965121 },
  { latitude: 14.6688141, longitude: 120.9865698 },
  { latitude: 14.6708899, longitude: 120.9833824 },
  { latitude: 14.6710897, longitude: 120.9800252 },
  { latitude: 14.6747976, longitude: 120.9785673 },
  { latitude: 14.6752678, longitude: 120.9744964 },
  { latitude: 14.6782153, longitude: 120.9738097 },
  { latitude: 14.6791702, longitude: 120.9685740 },
  { latitude: 14.6749959, longitude: 120.9648511 },
  { latitude: 14.6825185, longitude: 120.9644397 },
  { latitude: 14.6864835, longitude: 120.9610180 },
  { latitude: 14.6962110, longitude: 120.9561885 },
  { latitude: 14.6942028, longitude: 120.9524492 },
  { latitude: 14.7217088, longitude: 120.9309270 },
  { latitude: 14.7297406, longitude: 120.9257944 },
  { latitude: 14.7365862, longitude: 120.9266896 },
  { latitude: 14.7333934, longitude: 120.9345981 },
  { latitude: 14.7370977, longitude: 120.9367599 },
  { latitude: 14.7374023, longitude: 120.9414571 },
  { latitude: 14.7337942, longitude: 120.9442251 },
  { latitude: 14.7340427, longitude: 120.9495509 },
];

const HomeScreen = ({ navigation, route }) => {
  // State management
  const [userLocation, setUserLocation] = useState(VALENZUELA_CENTER);
  const [incidents, setIncidents] = useState([]);
  const [precincts, setPrecincts] = useState(() => getMapPrecincts([]));
  const [tracksPcpViewChanges, setTracksPcpViewChanges] = useState(true);
  const [nearestPrecinct, setNearestPrecinct] = useState(null);
  const [riskStats, setRiskStats] = useState({ high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapDays, setHeatmapDays] = useState(DEFAULT_HEATMAP_DAYS);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [mapRegion, setMapRegion] = useState(VALENZUELA_CENTER);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  // [QA-FIX #3] The last REAL GPS fix (null until the phone reports one).
  // `userLocation` above starts as the Valenzuela map center and is also
  // replaced by it when the user is outside the city, so it must never be sent
  // as an emergency location. Only this value is handed to the SOS screen.
  const [lastRealFix, setLastRealFix] = useState(null);
  // [QA-FIX #10] True while ThreatTrack is not in the foreground. GPS streaming
  // is foreground-only, so the SOS card says "Paused" instead of "Live".
  const [isAppInBackground, setIsAppInBackground] = useState(AppState.currentState !== 'active');

  // Capped to the most severe/largest hotspots: each one draws several
  // native Circle overlays, and too many make the map stutter on Android.
  const hotspotCircles = useMemo(() => {
    const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
    return buildGeographicHotspotCircles(incidents, heatmapDays)
      .sort((a, b) =>
        (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
        b.count - a.count
      )
      .slice(0, MAX_RENDERED_HOTSPOTS);
  }, [incidents, heatmapDays]);

  useEffect(() => {
    setTracksPcpViewChanges(true);
    const timer = setTimeout(() => {
      setTracksPcpViewChanges(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [precincts]);
  const mapRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const notificationsUnsubscribeRef = useRef(null);
  const heatmapEndpointUnavailableRef = useRef(false);
  const rotationValue = useRef(new Animated.Value(0)).current;
  const radarRipple1 = useRef(new Animated.Value(0)).current;
  const radarRipple2 = useRef(new Animated.Value(0)).current;
  const progressRunner = useRef(new Animated.Value(0)).current;

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });
  const [homeModal, setHomeModal] = useState({
    visible: false,
    type: null,
    item: null,
  });

  // Active Emergency Report & Distress Stream states
  const [activeSOSIncident, setActiveSOSIncident] = useState(null);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [distressPingsCount, setDistressPingsCount] = useState(1);
  const [lastDistressBroadcastTime, setLastDistressBroadcastTime] = useState('');
  const stickyPulseAnim = useRef(new Animated.Value(1)).current;
  const lastSyncedCoordsRef = useRef(null);
  const lastSyncTimeRef = useRef(0);
  const locationTrailRef = useRef([]);

  // Pulse animation for sticky preview card
  useEffect(() => {
    let anim;
    if (activeSOSIncident) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(stickyPulseAnim, {
            toValue: 1.25,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(stickyPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [activeSOSIncident]);

  // Ids the user marked safe this session. A queued (offline) or stale
  // snapshot can still show them as active, so ignore them explicitly.
  const resolvedReportIdsRef = useRef(new Set());
  // SOS ids whose tracking modal was already auto-opened. Module-level (not a
  // ref) so it survives Home being unmounted/remounted when switching between
  // Home and Reports; a ref reset on remount and re-popped the modal.
  const autoOpenedReportIdsRef = AUTO_OPENED_REPORT_IDS_REF;

  // Real-time listener for the user's active report (SOS or regular).
  // SOS reports get live GPS streaming + "I Am Safe"; regular reports only
  // show the card and a read-only preview.
  useEffect(() => {
    let unsubscribeSnapshot = null;

    const clearActive = () => {
      setActiveSOSIncident(null);
      setEmergencyModalVisible(false);
    };

    const getDocMillis = (d) => {
      if (!d) return 0;
      if (d.timestamp?.toMillis) return d.timestamp.toMillis();
      if (d.timestamp?.toDate) return d.timestamp.toDate().getTime();
      if (d.timestamp) {
        const t = new Date(d.timestamp).getTime();
        if (!Number.isNaN(t)) return t;
      }
      if (d.reportedAt?.toMillis) return d.reportedAt.toMillis();
      if (d.reportedAt?.toDate) return d.reportedAt.toDate().getTime();
      if (d.reportedAt) {
        const t = new Date(d.reportedAt).getTime();
        if (!Number.isNaN(t)) return t;
      }
      if (d.clientTimestamp) {
        const t = new Date(d.clientTimestamp).getTime();
        if (!Number.isNaN(t)) return t;
      }
      return 0;
    };

    const isReportActive = (d, millis) => {
      const rawStatus = String(d.status || '').toLowerCase().trim();
      const rawResponseStatus = String(
        d.responseStatus || d.response?.status || ''
      ).toLowerCase().trim();
      const isTerminal =
        ['done', 'completed', 'resolved', 'closed', 'rejected', 'spam', 'cancelled', 'deleted'].includes(rawStatus) ||
        ['completed', 'resolved', 'closed', 'rejected'].includes(rawResponseStatus);
      const isSafe = d.liveStreamingActive === false || Boolean(d.distressResolvedAt);
      const isDeleted = d.isDeleted === true || Boolean(d.deletedAt);
      // Pending server timestamps resolve to 0 here only if every fallback is
      // missing; treat that as "just now" rather than stale.
      const isStale = millis > 0 && Date.now() - millis > 24 * 60 * 60 * 1000;
      return !isTerminal && !isSafe && !isDeleted && !isStale;
    };

    const subscribe = (uid) => {
      const q = query(collection(db, 'incidents'), where('reporterId', '==', uid));

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          // Most recent active report; an active SOS always wins over a
          // regular report because it drives live GPS + "I Am Safe".
          let best = null;
          let bestMillis = -1;
          let bestIsSOS = false;

          snapshot.forEach((docSnap) => {
            if (resolvedReportIdsRef.current.has(docSnap.id)) return;
            const data = docSnap.data();
            const m = getDocMillis(data);
            if (!isReportActive(data, m)) return;
            const isSOS = data.isSOSReport === true;
            const effectiveMillis = m > 0 ? m : Date.now();
            if (
              !best ||
              (isSOS && !bestIsSOS) ||
              (isSOS === bestIsSOS && effectiveMillis >= bestMillis)
            ) {
              best = { id: docSnap.id, ...data };
              bestMillis = effectiveMillis;
              bestIsSOS = isSOS;
            }
          });

          if (!best) {
            clearActive();
            return;
          }

          setActiveSOSIncident(best);
          // Auto-open only for an SOS that was just sent. Older active SOS
          // reports (app relaunch, Home remount) just show the card.
          const isFreshSOS = bestIsSOS && Date.now() - bestMillis <= SOS_AUTO_OPEN_WINDOW_MS;
          if (!autoOpenedReportIdsRef.current.has(best.id)) {
            autoOpenedReportIdsRef.current.add(best.id);
            if (isFreshSOS) setEmergencyModalVisible(true);
          }
        },
        (error) => {
          // Keep the last known card; a transient error shouldn't hide it.
          console.warn('Active report listener error:', error?.code || error?.message || error);
        }
      );
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
      if (!user) {
        clearActive();
        return;
      }
      subscribe(user.uid);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  // "Track Status" (dispatch popup) navigates here with the incident id.
  // Open that report's tracking preview once the active-report listener has
  // it; if it isn't the active report (e.g. already resolved), fall back to
  // the Reports page after a short wait.
  const openActiveReportId = route?.params?.openActiveReportId;
  const openActiveReportAt = route?.params?.openActiveReportAt;
  // Depend on the active report's id, not the object: every GPS/status
  // snapshot creates a new object, which used to restart the fallback timer
  // so it could never fire while an SOS was streaming.
  const activeReportId = activeSOSIncident?.id || null;
  useEffect(() => {
    if (!openActiveReportAt) return undefined;

    const clearRequest = () => {
      navigation.setParams({ openActiveReportId: undefined, openActiveReportAt: undefined });
    };

    const matches = activeReportId &&
      (!openActiveReportId || activeReportId === openActiveReportId);
    if (matches) {
      setEmergencyModalVisible(true);
      clearRequest();
      return undefined;
    }

    const timer = setTimeout(() => {
      clearRequest();
      goToMainScreen(navigation, 'Status');
    }, 2500);
    return () => clearTimeout(timer);
  }, [openActiveReportAt, openActiveReportId, activeReportId, navigation]);

  // [QA-FIX #10] Track foreground/background so the SOS UI is honest about
  // when live location is (and isn't) being shared.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setIsAppInBackground(nextState !== 'active');
    });
    return () => sub?.remove?.();
  }, []);

  // Foreground GPS streaming watcher while SOS report is active.
  // [QA-FIX #8] HomeScreen is the ONLY writer of live SOS coordinates (the
  // unused duplicate in SOSReportScreen was removed). It runs while the app is
  // open; see [QA-FIX #10] for how the UI says so.
  useEffect(() => {
    let locationSubscription = null;
    let isSubscribed = true;

    // [QA-FIX #8] Reset per-incident tracking state. These refs used to keep
    // the previous SOS's breadcrumb trail, which was then written into a new SOS.
    lastSyncedCoordsRef.current = null;
    lastSyncTimeRef.current = 0;
    locationTrailRef.current = [];

    // Live GPS streaming is SOS-only; regular reports just show the card.
    if (
      activeSOSIncident &&
      activeSOSIncident.id &&
      activeSOSIncident.isSOSReport === true &&
      activeSOSIncident.liveStreamingActive !== false
    ) {
      const startStreaming = async () => {
        try {
          const sub = await watchLocation(async (newCoords) => {
            if (!isSubscribed) return;
            setUserLocation(newCoords);
            // [QA-FIX #3] Streamed coordinates are real fixes.
            setLastRealFix(newCoords);
            setDistressPingsCount((prev) => prev + 1);
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLastDistressBroadcastTime(timeStr);

            // Free-Tier Guard (Spark plan): Only write if moved >= ~10m or 20s elapsed
            const now = Date.now();
            const lastCoords = lastSyncedCoordsRef.current;
            const hasMoved = !lastCoords ||
              Math.abs(newCoords.latitude - lastCoords.latitude) > 0.0001 ||
              Math.abs(newCoords.longitude - lastCoords.longitude) > 0.0001;
            const timeSinceLastSync = now - lastSyncTimeRef.current;

            if (hasMoved || timeSinceLastSync >= 20000) {
              lastSyncedCoordsRef.current = newCoords;
              lastSyncTimeRef.current = now;

              try {
                const incidentRef = doc(db, 'incidents', activeSOSIncident.id);
                const updatePayload = {
                  'location.latitude': newCoords.latitude,
                  'location.longitude': newCoords.longitude,
                  lastGpsStreamAt: serverTimestamp(),
                };
                // [QA-FIX #3] Share fix accuracy (metres) with responders. It is
                // nested in `location`, which the live-GPS rule already allows.
                if (Number.isFinite(newCoords.accuracy)) {
                  updatePayload['location.accuracy'] = newCoords.accuracy;
                }
                // [QA-FIX #3] A streamed fix is live, so clear the "approximate"
                // flag SOSReportScreen sets when it had to use a cached fix.
                updatePayload['location.isApproximate'] = false;

                // Track physical displacement breadcrumbs (capped at last 15 points)
                if (hasMoved) {
                  const newBreadcrumb = {
                    latitude: newCoords.latitude,
                    longitude: newCoords.longitude,
                    timestamp: now,
                  };
                  const currentTrail = locationTrailRef.current && locationTrailRef.current.length > 0
                    ? locationTrailRef.current
                    : (activeSOSIncident.locationTrail || []);
                  const updatedTrail = [...currentTrail.slice(-14), newBreadcrumb];
                  locationTrailRef.current = updatedTrail;
                  updatePayload.locationTrail = updatedTrail;
                }

                await updateDoc(incidentRef, updatePayload);
              } catch (syncErr) {
                console.warn('GPS stream sync pending Firestore rules update:', syncErr.message);
              }
            }
          // [QA-FIX #3] High accuracy while an SOS is active (was Balanced).
          }, { accuracy: Location.Accuracy.High });

          if (isSubscribed) {
            locationSubscription = sub;
          } else if (sub && typeof sub.remove === 'function') {
            sub.remove();
          }
        } catch (err) {
          console.warn('Location streaming watcher warning:', err.message);
        }
      };

      startStreaming();
    }

    return () => {
      isSubscribed = false;
      if (locationSubscription && typeof locationSubscription.remove === 'function') {
        locationSubscription.remove();
      }
    };
  }, [activeSOSIncident?.id]);

  const showAlert = (title, message, type = 'info', buttons = []) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      buttons,
    });
  };

  // [QA-FIX #13] Functional update. Spreading a captured `alertConfig` could
  // overwrite a newer alert that a button's onPress had just opened.
  const hideAlert = useCallback(() => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  const openHomeModal = (type, item = null) => {
    setHomeModal({ visible: true, type, item });
  };

  const closeHomeModal = () => {
    setHomeModal({ visible: false, type: null, item: null });
  };

  // [QA-FIX #3, #4] Open SOS immediately (it used to await a GPS fix with no
  // timeout first). SOSReportScreen takes its own fresh fix; a real last fix,
  // if any, is passed only as an instant preview. Never the map default.
  const handleSOSPress = () => {
    navigation.navigate('SOSReport', lastRealFix ? { userLocation: lastRealFix } : undefined);
  };

  // Initialize location and data on mount
  useEffect(() => {
    initializeApp();

    // Cleanup function to unsubscribe from real-time listener on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (notificationsUnsubscribeRef.current) {
        notificationsUnsubscribeRef.current();
      }
    };
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      setUnreadNotifications(0);
      return undefined;
    }

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where('userId', '==', currentUser.uid));

    notificationsUnsubscribeRef.current = onSnapshot(
      q,
      (snapshot) => {
        const unread = snapshot.docs.filter((snap) => {
          const data = snap.data();
          return !data.read && !data.readAt;
        }).length;
        setUnreadNotifications(unread);
      },
      (error) => {
        console.error('Error loading notification badge:', error);
        setUnreadNotifications(0);
      }
    );

    return () => {
      if (notificationsUnsubscribeRef.current) {
        notificationsUnsubscribeRef.current();
        notificationsUnsubscribeRef.current = null;
      }
    };
  }, []);

  // Recalculate nearest precinct when the real GPS fix or precincts change.
  // Uses lastRealFix, not userLocation: userLocation falls back to the city
  // center before GPS locks or when outside Valenzuela, which made the
  // "nearest" distance measure from the wrong place.
  useEffect(() => {
    if (lastRealFix && precincts.length > 0) {
      findNearestPrecinct();
    } else {
      setNearestPrecinct(null);
    }
  }, [lastRealFix, precincts]);

  // Radar ripple and progress animations while loading
  useEffect(() => {
    let radarAnim1, radarAnim2, progressAnim;
    let timer;
    if (loading) {
      radarRipple1.setValue(0);
      radarRipple2.setValue(0);
      progressRunner.setValue(0);

      radarAnim1 = Animated.loop(
        Animated.timing(radarRipple1, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        })
      );
      radarAnim1.start();

      timer = setTimeout(() => {
        radarAnim2 = Animated.loop(
          Animated.timing(radarRipple2, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          })
        );
        radarAnim2.start();
      }, 700);

      progressAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(progressRunner, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(progressRunner, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      progressAnim.start();
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (radarAnim1) radarAnim1.stop();
      if (radarAnim2) radarAnim2.stop();
      if (progressAnim) progressAnim.stop();
    };
  }, [loading, radarRipple1, radarRipple2, progressRunner]);

  // [QA-FIX #6] Removed the useFocusEffect that called fetchIncidents() on
  // every focus. fetchIncidents() sets up a live onSnapshot listener that stays
  // subscribed while Home is in the stack, so new reports already appear. The
  // refetch tore it down and downloaded all 50 incidents again on every return.

  const initializeApp = async () => {
    try {
      setLoading(true);

      // Fast location acquisition (<50ms cached or 1400ms balanced timeout)
      const fastLocPromise = (async () => {
        try {
          const loc = await getFastLocation();
          if (loc) {
            // [QA-FIX #3] Remember the real fix even when outside the city
            // (the map below is clamped to Valenzuela, the SOS location is not).
            setLastRealFix(loc);
            const isNearValenzuela =
              loc.latitude >= VALENZUELA_BOUNDS.southWest.latitude - 0.05 &&
              loc.latitude <= VALENZUELA_BOUNDS.northEast.latitude + 0.05 &&
              loc.longitude >= VALENZUELA_BOUNDS.southWest.longitude - 0.05 &&
              loc.longitude <= VALENZUELA_BOUNDS.northEast.longitude + 0.05;
            const validLoc = isNearValenzuela ? loc : VALENZUELA_CENTER;
            setUserLocation(validLoc);
            return validLoc;
          }
        } catch (err) {
          console.warn('Fast location check warning:', err.message);
        }
        return VALENZUELA_CENTER;
      })();

      // Parallel data fetching
      const dataPromise = Promise.all([
        fetchIncidents(),
        fetchPrecincts(),
      ]);

      // Race against a 900ms ceiling so emergency app never blocks citizen
      await Promise.race([
        Promise.all([fastLocPromise, dataPromise]),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);

      setLoading(false);

      // Silent background high-accuracy GPS refinement without blocking the UI
      getCurrentLocation()
        .then((accurateLoc) => {
          if (accurateLoc) {
            // [QA-FIX #3] Real fix for the SOS preview, inside or outside the city.
            setLastRealFix(accurateLoc);
            const isNearValenzuela =
              accurateLoc.latitude >= VALENZUELA_BOUNDS.southWest.latitude - 0.05 &&
              accurateLoc.latitude <= VALENZUELA_BOUNDS.northEast.latitude + 0.05 &&
              accurateLoc.longitude >= VALENZUELA_BOUNDS.southWest.longitude - 0.05 &&
              accurateLoc.longitude <= VALENZUELA_BOUNDS.northEast.longitude + 0.05;
            if (isNearValenzuela) {
              setUserLocation(accurateLoc);
            }
          }
        })
        .catch(() => {});
    } catch (error) {
      console.warn('App initialization warning:', error.message);
      if (!userLocation) {
        setUserLocation(VALENZUELA_CENTER);
      }
      setLoading(false);
    }
  };

  const fetchIncidents = async () => {
    try {
      const incidentsRef = collection(db, 'incidents');
      const q = query(
        incidentsRef,
        orderBy('timestamp', 'desc'),
        limit(50)
      );

      // Set up real-time listener with onSnapshot
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      unsubscribeRef.current = onSnapshot(q, (snapshot) => {
        const incidentData = [];
        let highCount = 0, mediumCount = 0, lowCount = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          incidentData.push({ id: doc.id, ...data });

          // Count by severity
          if (data.severity === 'high') highCount++;
          else if (data.severity === 'medium') mediumCount++;
          else if (data.severity === 'low') lowCount++;
        });

        setIncidents(incidentData);
        
        setRiskStats({ high: highCount, medium: mediumCount, low: lowCount });
      }, (error) => {
        console.error('Error fetching incidents with real-time listener:', error);
        setIncidents([]);
        setRiskStats({ high: 0, medium: 0, low: 0 });
      });
    } catch (error) {
      console.error('Error setting up incidents listener:', error);
      setIncidents([]);
      setRiskStats({ high: 0, medium: 0, low: 0 });
    }
  };

  const fetchPrecincts = async () => {
    try {
      const precinctsRef = collection(db, 'precincts');
      const q = query(precinctsRef, where('isActive', '==', true));
      const snapshot = await getDocs(q);

      const precinctData = [];
      snapshot.forEach((doc) => {
        precinctData.push({ id: doc.id, ...doc.data() });
      });

      const mapPrecincts = getMapPrecincts(precinctData);
      setPrecincts(mapPrecincts);
      if (mapPrecincts.length === 0) {
        setNearestPrecinct(null);
      }
    } catch (error) {
      console.error('Error fetching precincts:', error);
      setPrecincts(getMapPrecincts([]));
    }
  };

  const findNearestPrecinct = () => {
    if (!lastRealFix || precincts.length === 0) return;

    let nearest = null;
    let minDistance = Infinity;

    precincts.forEach((precinct) => {
      const coord = getPrecinctCoordinate(precinct);
      if (coord) {
        const distance = calculateDistance(lastRealFix, coord);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = { ...precinct, distance, location: coord };
        }
      }
    });

    setNearestPrecinct(nearest);
  };

  const centerMapOnUser = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.082,
        longitudeDelta: 0.088,
      }, 1000);
    }
  };

  // Constrain map strictly to Valenzuela bounds and zoom limits
  const handleRegionChange = (region) => {
    if (!mapRef.current || !region) return;

    let constrainedRegion = { ...region };
    let needsAdjustment = false;

    // Constrain zoom out delta to keep city strictly in focus
    if (constrainedRegion.latitudeDelta > VALENZUELA_ALLOWED_LIMITS.maxLatitudeDelta) {
      constrainedRegion.latitudeDelta = VALENZUELA_ALLOWED_LIMITS.maxLatitudeDelta;
      needsAdjustment = true;
    }
    if (constrainedRegion.longitudeDelta > VALENZUELA_ALLOWED_LIMITS.maxLongitudeDelta) {
      constrainedRegion.longitudeDelta = VALENZUELA_ALLOWED_LIMITS.maxLongitudeDelta;
      needsAdjustment = true;
    }

    // Keep latitude within Valenzuela city limits
    if (constrainedRegion.latitude < VALENZUELA_ALLOWED_LIMITS.minLat) {
      constrainedRegion.latitude = VALENZUELA_ALLOWED_LIMITS.minLat;
      needsAdjustment = true;
    } else if (constrainedRegion.latitude > VALENZUELA_ALLOWED_LIMITS.maxLat) {
      constrainedRegion.latitude = VALENZUELA_ALLOWED_LIMITS.maxLat;
      needsAdjustment = true;
    }

    // Keep longitude within Valenzuela city limits
    if (constrainedRegion.longitude < VALENZUELA_ALLOWED_LIMITS.minLng) {
      constrainedRegion.longitude = VALENZUELA_ALLOWED_LIMITS.minLng;
      needsAdjustment = true;
    } else if (constrainedRegion.longitude > VALENZUELA_ALLOWED_LIMITS.maxLng) {
      constrainedRegion.longitude = VALENZUELA_ALLOWED_LIMITS.maxLng;
      needsAdjustment = true;
    }

    // If user flings or moves far outside city boundaries, instantly snap back to Valenzuela Center
    const isFarOutside =
      region.latitude < VALENZUELA_ALLOWED_LIMITS.minLat - 0.05 ||
      region.latitude > VALENZUELA_ALLOWED_LIMITS.maxLat + 0.05 ||
      region.longitude < VALENZUELA_ALLOWED_LIMITS.minLng - 0.05 ||
      region.longitude > VALENZUELA_ALLOWED_LIMITS.maxLng + 0.05;

    if (isFarOutside) {
      constrainedRegion = { ...VALENZUELA_CENTER };
      needsAdjustment = true;
    }

    // Smoothly animate back to constrained region if user panned or zoomed too far
    if (needsAdjustment) {
      mapRef.current.animateToRegion(constrainedRegion, 250);
      setMapRegion(constrainedRegion);
    }
  };

  const getMarkerColor = (severity) => {
    switch (severity) {
      case 'high': return '#dc2626';
      case 'medium': return '#f97316';
      case 'low': return '#eab308';
      default: return '#6b7280';
    }
  };

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'high': return 'High priority';
      case 'medium': return 'Medium priority';
      case 'low': return 'Low priority';
      default: return 'Pending review';
    }
  };

  const getIncidentIconName = (type) => {
    const icons = {
      theft_snatching: 'bag-handle-outline',
      robbery_holdup: 'alert-circle-outline',
      physical_assault_injury: 'medkit-outline',
      domestic_violence: 'home-outline',
      drug_related_activity: 'flame-outline',
      public_disturbance: 'megaphone-outline',
      vandalism_property_damage: 'construct-outline',
      traffic_accident: 'car-outline',
      illegal_weapons: 'shield-outline',
      suspicious_activity: 'eye-outline',
    };
    return icons[type?.toLowerCase()] || 'alert-outline';
  };

  const getIncidentIcon = (type) => getIncidentIconName(type);

  const formatIncidentType = (incident) => {
    return incident.typeLabel || INCIDENT_TYPE_LABELS[incident.type] || 'Incident';
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Less than 1 hour ago';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Straight-line distance from the user's real GPS fix. Google Maps shows the
  // road route, which is usually longer (one-ways, rivers, NLEX crossings).
  const getPrecinctDistance = (precinct) => {
    const coord = getPrecinctCoordinate(precinct);
    if (lastRealFix && coord) {
      return calculateDistance(lastRealFix, coord);
    }

    return null;
  };

  const confirmPrecinctNavigation = (precinct) => {
    const coord = getPrecinctCoordinate(precinct);
    if (!coord) return;

    const url = `https://www.google.com/maps/dir/?api=1&destination=${coord.latitude},${coord.longitude}`;
    showAlert('Navigate', `Open in Google Maps?\n${precinct.name}`, 'info', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Maps', onPress: () => Linking.openURL(url) },
    ]);
  };

  const handlePrecinctNavigation = (precinct) => {
    closeHomeModal();
    confirmPrecinctNavigation(precinct);
  };

  // Hotspots are computed locally from incidents (hotspotCircles), so the
  // time filter only needs to update the window.
  const handleSelectHeatmapDays = (days) => {
    setHeatmapDays(days);
  };

  // Get recent incidents for the list (top 3)
  // [QA-FIX #18] Memoized. These were rebuilt and re-sorted on every render,
  // and during an SOS every GPS ping re-renders Home.
  const recentIncidents = useMemo(() => incidents.slice(0, 3), [incidents]);
  const precinctsByDistance = useMemo(() => precincts
    .map((precinct) => {
      const coord = getPrecinctCoordinate(precinct);
      // Real GPS fix only (see getPrecinctDistance).
      const distance = lastRealFix && coord ? calculateDistance(lastRealFix, coord) : null;
      return { ...precinct, distance };
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)),
  [precincts, lastRealFix]);
  const incidentsByPriority = useMemo(() => [...incidents].sort((a, b) => {
    const severityDifference = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (severityDifference !== 0) return severityDifference;

    const dateA = getIncidentDate(a.timestamp)?.getTime() || 0;
    const dateB = getIncidentDate(b.timestamp)?.getTime() || 0;
    return dateB - dateA;
  }), [incidents]);

  // [QA-FIX #18] Stable handler for the memoized MapOverlays component.
  const handlePrecinctMarkerPress = useCallback((precinct) => {
    setHomeModal({ visible: true, type: 'nearest', item: precinct });
  }, []);

  const renderModalHeader = (eyebrow, title, subtitle) => (
    <View style={styles.homeModalHeader}>
      <View style={styles.homeModalTitleBlock}>
        <Text style={styles.homeModalEyebrow}>{eyebrow}</Text>
        <Text style={styles.homeModalTitle}>{title}</Text>
        {subtitle ? <Text style={styles.homeModalSubtitle}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity style={styles.homeModalCloseButton} onPress={closeHomeModal}>
        <Text style={styles.homeModalCloseText}>X</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNearestModal = () => {
    const precinct = homeModal.item || nearestPrecinct;

    return (
      <>
        {renderModalHeader('NEAREST STATION', precinct ? precinct.name : 'No Precinct Found', precinct ? 'Closest available police station' : 'Location data is still unavailable')}
        {precinct ? (
          <>
            <View style={styles.precinctFeatureCard}>
              <Image source={require('../assets/icons/police-station.png')} style={styles.precinctFeatureIcon} />
              <Text style={styles.precinctFeatureName}>{precinct.name}</Text>
              <Text style={styles.precinctFeatureAddress}>{precinct.address || 'Address unavailable'}</Text>
              <View style={styles.precinctFeatureMeta}>
                <Text style={styles.precinctFeatureMetaText}>
                  {getPrecinctDistance(precinct) !== null
                    ? `${formatDistance(getPrecinctDistance(precinct))} straight-line · road route may be longer`
                    : 'Locating you…'}
                </Text>
              </View>
            </View>
            <View style={styles.homeModalActionRow}>
              <TouchableOpacity style={styles.homeModalPrimaryAction} onPress={() => handlePrecinctNavigation(precinct)}>
                <Text style={styles.homeModalPrimaryActionText}>Route</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.homeModalEmptyState}>
            <Text style={styles.homeModalEmptyText}>No active precinct is available yet.</Text>
          </View>
        )}
      </>
    );
  };

  const renderPrecinctsModal = () => (
    <>
      {renderModalHeader('POLICE NETWORK', 'All Precincts', `${precinctsByDistance.length} active stations on map`)}
      <ScrollView style={styles.homeModalScroll} showsVerticalScrollIndicator={false}>
        {precinctsByDistance.map((precinct) => (
          <View key={precinct.id} style={styles.modalListCard}>
            <View style={styles.modalListIconWrap}>
              <Image source={require('../assets/icons/police-station.png')} style={styles.modalListIconImage} />
            </View>
            <View style={styles.modalListBody}>
              <View style={styles.modalListTopLine}>
                <Text style={styles.modalListTitle} numberOfLines={2}>{precinct.name}</Text>
                {nearestPrecinct?.id === precinct.id ? (
                  <View style={styles.nearestBadge}>
                    <Text style={styles.nearestBadgeText}>Nearest</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.modalListSubtext} numberOfLines={3}>{precinct.address || 'Address unavailable'}</Text>
              <View style={styles.modalListMetaRow}>
                <Text style={styles.modalDistanceText}>
                  {precinct.distance !== null ? `${formatDistance(precinct.distance)} straight-line` : 'Locating you…'}
                </Text>
                <TouchableOpacity style={styles.modalRouteButton} onPress={() => handlePrecinctNavigation(precinct)}>
                  <Text style={styles.modalRouteButtonText}>Route</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );

  const renderIncidentRow = (incident) => {
    const severityColor = getMarkerColor(incident.severity);

    return (
      <TouchableOpacity
        key={incident.id}
        style={styles.modalListCard}
        onPress={() => openHomeModal('incident', incident)}
      >
        {/* Neutral icon tile; severity is shown by the badge next to it. */}
        <View style={[styles.incidentModalIcon, NEUTRAL_ICON_TILE]}>
          <Ionicons
            name={getIncidentIconName(incident.type)}
            size={22}
            color={NEUTRAL_ICON_COLOR}
          />
        </View>
        <View style={styles.modalListBody}>
          <View style={styles.modalListTopLine}>
            <Text style={styles.modalListTitle} numberOfLines={2}>{formatIncidentType(incident)}</Text>
            <View style={[styles.severityBadge, { borderColor: severityColor }]}>
              <Text style={[styles.severityBadgeText, { color: severityColor }]}>
                {getSeverityLabel(incident.severity)}
              </Text>
            </View>
          </View>
          <Text style={styles.modalListSubtext} numberOfLines={2}>
            {incident.location?.address || 'Location not specified'}
          </Text>
          <Text style={styles.modalIncidentTime}>{formatTimeAgo(incident.timestamp)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderIncidentsModal = () => (
    <>
      {renderModalHeader('INCIDENT FEED', 'All Incidents', 'High priority items stay at the top')}
      <ScrollView style={styles.homeModalScroll} showsVerticalScrollIndicator={false}>
        {incidentsByPriority.length > 0 ? (
          incidentsByPriority.map(renderIncidentRow)
        ) : (
          <View style={styles.homeModalEmptyState}>
            <Text style={styles.homeModalEmptyText}>No incident reports available yet.</Text>
          </View>
        )}
      </ScrollView>
    </>
  );

  const renderIncidentDetailModal = () => {
    const incident = homeModal.item;
    const severityColor = getMarkerColor(incident?.severity);

    if (!incident) {
      return (
        <>
          {renderModalHeader('INCIDENT DETAIL', 'Incident Unavailable', 'Report data could not be loaded')}
          <View style={styles.homeModalEmptyState}>
            <Text style={styles.homeModalEmptyText}>Open the incident list again to refresh details.</Text>
          </View>
        </>
      );
    }

    return (
      <>
        {renderModalHeader('INCIDENT DETAIL', formatIncidentType(incident), formatTimeAgo(incident.timestamp))}
        <View style={styles.incidentDetailCard}>
          <View style={[styles.incidentDetailIcon, NEUTRAL_ICON_TILE]}>
            <Ionicons
              name={getIncidentIconName(incident.type)}
              size={30}
              color={NEUTRAL_ICON_COLOR}
            />
          </View>
          <View style={[styles.incidentDetailSeverity, { borderColor: severityColor }]}>
            <Text style={[styles.incidentDetailSeverityText, { color: severityColor }]}>
              {getSeverityLabel(incident.severity)}
            </Text>
          </View>
          <Text style={styles.incidentDetailDescription}>
            {incident.description || 'No description provided.'}
          </Text>
          <View style={styles.incidentDetailDivider} />
          <Text style={styles.incidentDetailLabel}>Location</Text>
          <Text style={styles.incidentDetailValue}>
            {incident.location?.address || 'Location not specified'}
          </Text>
          <Text style={styles.incidentDetailLabel}>Status</Text>
          <Text style={styles.incidentDetailValue}>
            {(incident.status || 'under_review').replace(/_/g, ' ')}
          </Text>
        </View>
      </>
    );
  };

  const renderHomeModalContent = () => {
    switch (homeModal.type) {
      case 'nearest':
        return renderNearestModal();
      case 'precincts':
        return renderPrecinctsModal();
      case 'incidents':
        return renderIncidentsModal();
      case 'incident':
        return renderIncidentDetailModal();
      default:
        return null;
    }
  };

  if (loading) {
    const ring1Scale = radarRipple1.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 2.3],
    });
    const ring1Opacity = radarRipple1.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0.55, 0.28, 0],
    });

    const ring2Scale = radarRipple2.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 2.3],
    });
    const ring2Opacity = radarRipple2.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0.55, 0.28, 0],
    });

    const runnerTranslateX = progressRunner.interpolate({
      inputRange: [0, 1],
      outputRange: [-60, 140],
    });

    return (
      <View style={styles.container}>
        <View style={styles.headerNew}>
          <View style={styles.headerBrandContainer}>
            <Image source={APP_LOGO} style={styles.headerBrandLogo} />
            <Text style={styles.headerNewTitle}>
              Threat<Text style={styles.headerNewTitleRed}>Track</Text>
            </Text>
          </View>
        </View>

        <View style={styles.loadingContainer}>
          {/* Radar Ripple Beacon */}
          <View style={styles.radarContainer}>
            <Animated.View
              style={[
                styles.radarRing,
                { transform: [{ scale: ring1Scale }], opacity: ring1Opacity },
              ]}
            />
            <Animated.View
              style={[
                styles.radarRing,
                { transform: [{ scale: ring2Scale }], opacity: ring2Opacity },
              ]}
            />
            <View style={styles.radarBeacon}>
              <Ionicons name="shield" size={34} color="#ffffff" />
            </View>
          </View>

          {/* Typography */}
          <Text style={styles.loadingEyebrow}>● THREATTRACK SAFETY GRID</Text>
          <Text style={styles.loadingTitle}>Connecting Safety Network</Text>
          <Text style={styles.loadingSubtitle}>
            Syncing Valenzuela telemetry & radar...
          </Text>

          {/* Sleek Progress Bar Track */}
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarRunner,
                { transform: [{ translateX: runnerTranslateX }] },
              ]}
            />
          </View>
        </View>

        {/* [QA-FIX #3] Real fix only (null while loading -> SOS gets its own fix). */}
        <GlobalBottomBar navigation={navigation} activeTab="Home" userLocation={lastRealFix} />
      </View>
    );
  }

  return (
    <>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerNew}>
        <View style={styles.headerBrandContainer}>
          <Image source={APP_LOGO} style={styles.headerBrandLogo} />
          <Text style={styles.headerNewTitle}>
            Threat<Text style={styles.headerNewTitleRed}>Track</Text>
          </Text>
        </View>
        <View style={styles.headerIconsContainer}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Settings')} 
            style={styles.headerIconButton}
            activeOpacity={0.75}
            accessibilityLabel="Settings"
          >
            <View style={styles.settingsIconWrapper}>
              <Ionicons name="settings-outline" size={20} color="#334155" />
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => navigation.navigate('Alerts')} 
            style={styles.headerIconButton}
            activeOpacity={0.75}
            accessibilityLabel="Alerts"
          >
            <View style={styles.notificationBellWrapper}>
              <Ionicons name="notifications-outline" size={20} color="#334155" />
              {unreadNotifications > 0 && (
                <View style={styles.redBadge}>
                  <Text style={styles.redBadgeText}>
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
      <LinearGradient
        colors={['transparent', 'rgba(220, 38, 38, 0.45)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerLaserLine}
      />

      {/* Sticky Active Emergency Report Preview (Fixed at top under header while scrolling) */}
      {activeSOSIncident && (
        <TouchableOpacity
          style={styles.activeStickyPreview}
          onPress={() => setEmergencyModalVisible(true)}
          activeOpacity={0.88}
        >
          <View style={styles.activeStickyLeft}>
            <Animated.View
              style={[
                styles.activeStickyPulseRing,
                { transform: [{ scale: stickyPulseAnim }] },
              ]}
            />
            <View style={styles.activeStickyBeacon}>
              <Ionicons name="radio" size={15} color="#ffffff" />
            </View>
          </View>
          <View style={styles.activeStickyBody}>
            <View style={styles.activeStickyTopRow}>
              <View style={styles.activeStickyBadgeRow}>
                <Text style={styles.activeStickyEyebrow} numberOfLines={1}>
                  {activeSOSIncident.isSOSReport === true ? '● LIVE DISTRESS' : '● ACTIVE REPORT'}
                </Text>
              </View>
              <View style={styles.activeStickyStatusPill}>
                <Text style={styles.activeStickyStatusText} numberOfLines={1}>
                  {getStatusMeta(String(activeSOSIncident.status || '').toLowerCase().trim()).shortLabel.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.activeStickyTitle} numberOfLines={1}>
              {activeSOSIncident.typeLabel || activeSOSIncident.type || 'Emergency Report'}
            </Text>
            {/* [QA-FIX #10] Honest status: GPS sharing only runs while the app is open. */}
            <Text style={styles.activeStickyMeta} numberOfLines={1}>
              {activeSOSIncident.isSOSReport !== true
                ? 'Tap to view your report'
                : isAppInBackground
                ? 'Paused – app in background • Open to resume'
                : 'Live GPS while app is open • Tap to track'}
            </Text>
          </View>
          <View style={styles.activeStickyArrowWrap}>
            <Ionicons name="chevron-forward" size={18} color="#dc2626" />
          </View>
        </TouchableOpacity>
      )}

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Safety & Hotspot Radar Controls (Top of Map) */}
        <View style={styles.hotspotAdvisoryCard}>
          {/* Header: Full width, spacious text layout */}
          <View style={styles.hotspotAdvisoryHeader}>
            <View style={styles.hotspotAdvisoryIconWrap}>
              <Ionicons name="shield-checkmark" size={18} color="#7f1d1d" />
            </View>
            <View style={styles.hotspotAdvisoryCopy}>
              <Text style={styles.hotspotAdvisoryTitle}>Safety & Hotspot Radar</Text>
              <Text style={styles.hotspotAdvisorySubtitle}>
                {showHeatmap
                  ? `${hotspotCircles?.length || 0} active cluster${(hotspotCircles?.length || 0) === 1 ? '' : 's'} mapped in Valenzuela`
                  : 'Hotspot radar is currently on standby'}
              </Text>
            </View>
          </View>

          {/* Controls Bar: Prominent Hotspot Toggle + Timeframe Quick-Chips */}
          <View style={styles.hotspotControlsRow}>
            <TouchableOpacity
              style={[
                styles.hotspotToggleBtn,
                showHeatmap ? styles.hotspotToggleBtnActive : styles.hotspotToggleBtnInactive,
              ]}
              onPress={() => setShowHeatmap((prev) => !prev)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={showHeatmap ? 'flame' : 'flame-outline'}
                size={14}
                color={showHeatmap ? '#ffffff' : '#64748b'}
              />
              <Text
                style={[
                  styles.hotspotToggleBtnText,
                  showHeatmap ? styles.hotspotToggleBtnTextActive : styles.hotspotToggleBtnTextInactive,
                ]}
              >
                {showHeatmap ? 'HOTSPOTS ON' : 'HOTSPOTS OFF'}
              </Text>
            </TouchableOpacity>

            <View style={styles.hotspotTimeFilters}>
              <Text style={styles.hotspotTimeFiltersLabel}>TIME:</Text>
              {[
                { label: '24h', days: 1 },
                { label: '7d', days: 7 },
                { label: '30d', days: 30 },
              ].map((filter) => {
                const isActive = heatmapDays === filter.days;
                return (
                  <TouchableOpacity
                    key={`filter-${filter.days}`}
                    style={[styles.hotspotTimeChip, isActive && styles.hotspotTimeChipActive]}
                    onPress={() => handleSelectHeatmapDays(filter.days)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.hotspotTimeChipText, isActive && styles.hotspotTimeChipTextActive]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Severity legend for hotspot colors. Its own row: inside the
              controls row it overflowed off the right edge of the screen. */}
          <View style={styles.hotspotLegendBar}>
            <View style={[styles.hotspotLegendPill, styles.legendPillHigh]}>
              <View style={[styles.legendDot, styles.legendDotHigh]} />
              <Text style={styles.legendTextHigh}>High</Text>
            </View>
            <View style={[styles.hotspotLegendPill, styles.legendPillMed]}>
              <View style={[styles.legendDot, styles.legendDotMed]} />
              <Text style={styles.legendTextMed}>Medium</Text>
            </View>
            <View style={[styles.hotspotLegendPill, styles.legendPillLow]}>
              <View style={[styles.legendDot, styles.legendDotLow]} />
              <Text style={styles.legendTextLow}>Low</Text>
            </View>
          </View>
        </View>

        {/* Map Container */}
        <View style={styles.mapContainer}>
          {userLocation ? (
            <View style={styles.mapWrapper}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={VALENZUELA_CENTER}
                cameraBoundary={VALENZUELA_BOUNDS}
                showsUserLocation={true}
                showsMyLocationButton={false}
                // Hide Google's Android "Directions / Open in Maps" buttons
                // that appear bottom-right when a marker is tapped; the
                // precinct sheet already has a Route button.
                toolbarEnabled={false}
                customMapStyle={darkMapStyle}
                onMapReady={() => {
                  setMapReady(true);
                  if (mapRef.current && typeof mapRef.current.setMapBoundaries === 'function') {
                    mapRef.current.setMapBoundaries(
                      VALENZUELA_BOUNDS.northEast,
                      VALENZUELA_BOUNDS.southWest
                    );
                  }
                }}
                onRegionChangeComplete={(region) => {
                  setMapRegion(region);
                  handleRegionChange(region);
                }}
                minZoomLevel={12.5}
                maxZoomLevel={18}
                pitchEnabled={false}
                rotateEnabled={false}
                mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                {/* [QA-FIX #18] Overlays moved into the memoized MapOverlays component
                    (bottom of this file) so GPS pings / alerts / timers that re-render
                    HomeScreen no longer re-render every polygon, circle and marker. */}
                <MapOverlays
                  hotspotCircles={hotspotCircles}
                  showHeatmap={showHeatmap}
                  precincts={precincts}
                  tracksPcpViewChanges={tracksPcpViewChanges}
                  onPrecinctPress={handlePrecinctMarkerPress}
                />
              </MapView>

              {/* Quick Recenter Valenzuela Button */}
              <TouchableOpacity
                style={styles.recenterCityBtn}
                onPress={() => {
                  if (mapRef.current) {
                    mapRef.current.animateToRegion(VALENZUELA_CENTER, 350);
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="scan-outline" size={13} color="#ffffff" />
                <Text style={styles.recenterCityText}>VALENZUELA</Text>
              </TouchableOpacity>

              {/* Floating Futuristic Radar Badge */}
              <View style={styles.radarLiveBadge} pointerEvents="none">
                <View style={styles.radarLiveDot} />
                <Text style={styles.radarLiveText}>VALENZUELA LIVE RADAR</Text>
              </View>

            </View>
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="location-outline" size={38} color="#7f1d1d" style={{ marginBottom: 6 }} />
              <Text style={styles.mapPlaceholderLabel}>Location Required</Text>
              <Text style={styles.mapPlaceholderSubtext}>Enable location to view map</Text>
              <TouchableOpacity 
                style={styles.enableLocationButton}
                onPress={initializeApp}
              >
                <Text style={styles.enableLocationButtonText}>Enable Location</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Report Incident Button */}
        <TouchableOpacity
          style={styles.reportButtonTouch}
          onPress={() => navigation.navigate('ReportIncident')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={BRAND_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.reportButtonGradient}
          >
            <View style={styles.reportButtonLeft}>
              <View style={styles.reportButtonIconWrap}>
                <Ionicons name="camera" size={20} color="#ffffff" />
              </View>
              <View style={styles.reportButtonTextGroup}>
                <Text style={styles.reportButtonEyebrow}>COMMUNITY SAFETY</Text>
                <Text style={styles.reportButtonTitle}>Report an Incident</Text>
              </View>
            </View>
            <View style={styles.reportButtonArrowPill}>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Nearest Precinct Section (the separate "Nearest Station" quick card
            duplicated this and was removed; tapping this card opens the same
            precinct details sheet it used to). */}
        {nearestPrecinct && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nearest Precinct</Text>
              <TouchableOpacity onPress={() => openHomeModal('precincts')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.precinctCard}
              onPress={() => openHomeModal('nearest')}
              activeOpacity={0.85}
            >
              <View style={styles.precinctIcon}>
                <Ionicons name="shield" size={24} color="#7f1d1d" />
              </View>
              <View style={styles.precinctInfo}>
                <Text style={styles.precinctName}>{nearestPrecinct.name}</Text>
                <View style={styles.precinctLocation}>
                  <Ionicons name="location" size={14} color="#dc2626" style={{ marginRight: 4 }} />
                  <Text style={styles.precinctAddress} numberOfLines={2}>
                    {nearestPrecinct.address} • {formatDistance(nearestPrecinct.distance)} straight-line
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.navigateIcon}
                onPress={() => {
                  confirmPrecinctNavigation(nearestPrecinct);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate-circle" size={32} color="#7f1d1d" />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Incidents Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Incidents</Text>
            <TouchableOpacity onPress={() => openHomeModal('incidents')}>
              <Text style={styles.viewAllText}>See All ({incidents.length})</Text>
            </TouchableOpacity>
          </View>

          {recentIncidents.length > 0 ? (
            recentIncidents.map((incident) => (
              <TouchableOpacity 
                key={incident.id}
                style={styles.incidentCard}
                onPress={() => openHomeModal('incident', incident)}
              >
                {/* Neutral icon tile + small severity dot (red/orange/yellow). */}
                <View style={[styles.incidentIcon, NEUTRAL_ICON_TILE]}>
                  <Ionicons
                    name={getIncidentIconName(incident.type)}
                    size={22}
                    color={NEUTRAL_ICON_COLOR}
                  />
                  <View
                    style={[
                      styles.incidentSeverityDot,
                      { backgroundColor: getMarkerColor(incident.severity) },
                    ]}
                  />
                </View>
                <View style={styles.incidentInfo}>
                  <Text style={styles.incidentTitle}>
                    {formatIncidentType(incident)}
                  </Text>
                  <Text style={styles.incidentDetails} numberOfLines={2}>
                    {incident.location?.address || 'Location not specified'}
                  </Text>
                  <Text style={styles.incidentTime}>{formatTimeAgo(incident.timestamp)}</Text>
                </View>
                <View style={styles.incidentArrow}>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No recent incidents</Text>
            </View>
          )}
        </View>

        {/* Bottom Spacing for Tab Bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Navigation Bar */}
      {/* [QA-FIX #3] Pass only a real GPS fix (never the Valenzuela-center map default). */}
      <GlobalBottomBar navigation={navigation} activeTab="Home" userLocation={lastRealFix} />
    </View>

    <SmoothModal
      visible={homeModal.visible}
      onRequestClose={closeHomeModal}
      overlayStyle={styles.homeModalBackdrop}
      contentStyle={styles.homeModalSheet}
    >
      <View style={styles.homeModalHandle} />
      {renderHomeModalContent()}
    </SmoothModal>

    {/* Active Emergency Tracking & Distress Stream Modal */}
    <ActiveEmergencyModal
      incident={activeSOSIncident}
      visible={emergencyModalVisible}
      onClose={() => setEmergencyModalVisible(false)}
      onResolveSafe={() => {
        if (activeSOSIncident?.id) {
          resolvedReportIdsRef.current.add(activeSOSIncident.id);
        }
        setActiveSOSIncident(null);
        setEmergencyModalVisible(false);
      }}
      distressPingsCount={distressPingsCount}
      lastDistressBroadcastTime={lastDistressBroadcastTime}
      currentLocation={userLocation}
    />

    {/* Custom Alert Modal */}
    <CustomAlert
      visible={alertConfig.visible}
      title={alertConfig.title}
      message={alertConfig.message}
      type={alertConfig.type}
      buttons={alertConfig.buttons}
      onClose={hideAlert}
      autoCloseDelay={5000}
    />
  </>
  );
};

// [QA-FIX #18] Map overlays (city boundary, hotspot circles, heatmap, precinct
// pins), moved out of HomeScreen's render unchanged. React.memo means they only
// re-render when their own data changes, not on every HomeScreen state update.
const MapOverlays = React.memo(function MapOverlays({
  hotspotCircles,
  showHeatmap,
  precincts,
  tracksPcpViewChanges,
  onPrecinctPress,
}) {
  return (
    <>
    {/* Valenzuela City Boundary Outline */}
    <Polygon
      coordinates={VALENZUELA_BOUNDARY}
      strokeColor="#38bdf8"
      strokeWidth={2.5}
      fillColor="rgba(56, 189, 248, 0.08)"
      tappable={false}
    />

    {/* Geodesically Perfect Hotspot Circles (mathematically true circles at all zoom levels) */}
    {showHeatmap &&
      hotspotCircles.map((hotspot) => {
        const isHigh = hotspot.severity === 'high';
        const isMedium = hotspot.severity === 'medium';
        const severityKey = isHigh ? 'high' : isMedium ? 'medium' : 'low';
        const rgb = HOTSPOT_RGB[severityKey];
        const coreRgb = HOTSPOT_CORE_RGB[severityKey];
        const baseAlpha = HOTSPOT_LAYER_ALPHA[severityKey];

        const strokeColor = isHigh ? '#dc2626' : isMedium ? '#f97316' : '#eab308';
        const centerColor = isHigh ? '#991b1b' : isMedium ? '#ea580c' : '#ca8a04';

        // Each incident spot gets a small soft glow, so clusters look organic.
        const spotRadius = Math.max(52, hotspot.radius * 0.4);
        // A single-incident hotspot's spot sits exactly on its center, so it
        // adds nothing visible; only draw spots for multi-incident clusters.
        const spots = (hotspot.points || []).length > 1
          ? hotspot.points.filter(
              (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
            )
          : [];

        return (
          <React.Fragment key={`hotspot-circle-${hotspot.id}`}>
            {/* Radial falloff: no outlines, opacity builds toward the center */}
            {HOTSPOT_FALLOFF_LAYERS.map(([fraction, alphaMul], i) => (
              <Circle
                key={`hotspot-layer-${hotspot.id}-${i}`}
                center={hotspot.center}
                radius={hotspot.auraRadius * fraction}
                fillColor={`rgba(${rgb}, ${(baseAlpha * alphaMul).toFixed(3)})`}
                strokeColor="transparent"
                strokeWidth={0}
                zIndex={14}
              />
            ))}
            {/* Incident spots: outer haze + hot center per reported location */}
            {spots.map((p, i) => (
              <React.Fragment key={`hotspot-spot-${hotspot.id}-${i}`}>
                <Circle
                  center={p}
                  radius={spotRadius}
                  fillColor={`rgba(${rgb}, ${(baseAlpha * 0.6).toFixed(3)})`}
                  strokeColor="transparent"
                  strokeWidth={0}
                  zIndex={15}
                />
                <Circle
                  center={p}
                  radius={spotRadius * 0.45}
                  fillColor={`rgba(${coreRgb}, ${(baseAlpha * 0.9).toFixed(3)})`}
                  strokeColor="transparent"
                  strokeWidth={0}
                  zIndex={15}
                />
              </React.Fragment>
            ))}
            {/* Hot core at the cluster center */}
            <Circle
              center={hotspot.center}
              radius={hotspot.radius * 0.22}
              fillColor={`rgba(${coreRgb}, ${(baseAlpha * 1.4).toFixed(3)})`}
              strokeColor="transparent"
              strokeWidth={0}
              zIndex={16}
            />
            {/* Center Cluster Count Badge (Identical to Admin Map Cluster Indicator) */}
            <Marker
              coordinate={hotspot.center}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={18}
              tracksViewChanges={false}
            >
              <View style={[styles.hotspotClusterBadge, { borderColor: strokeColor }]}>
                <Text style={[styles.hotspotClusterCountText, { color: centerColor }]}>
                  {hotspot.count}
                </Text>
              </View>
            </Marker>
          </React.Fragment>
        );
      })}

    {/* The native <Heatmap> layer was removed: its radius is in screen pixels,
        so zoomed out it covered 1-2 km and spilled past the city border. The
        meter-based hotspot glow above replaces it. */}

    {/* Precinct & Sub-station Tactical Markers (Official Police Pin Logo) */}
    {precincts.map((precinct) => {
      const coordinate = getPrecinctCoordinate(precinct);

      if (!coordinate) return null;

      const pinKey = precinct.id || precinct.code || precinct.name;

      return (
        <Marker
          key={`precinct-marker-${pinKey}`}
          coordinate={coordinate}
          // No title/description: tapping opens the precinct bottom sheet,
          // so the native info bubble on the map is redundant.
          anchor={PCP_PIN_ANCHOR}
          zIndex={25}
          tracksViewChanges={tracksPcpViewChanges}
          onPress={() => onPrecinctPress(precinct)}
        >
          <View style={styles.pcpPinWrapper} collapsable={false}>
            <Image
              source={POLICE_STATION_ICON}
              style={styles.pcpPinMarkerImage}
              resizeMode="contain"
            />
          </View>
        </Marker>
      );
    })}
    </>
  );
});

// The marker is just the pin icon (styles.pcpPinWrapper = icon size), so the
// pin tip is at the bottom-center of the view.
const PCP_PIN_ANCHOR = { x: 0.5, y: 0.95 };

// Dark map style for night mode
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#181818' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1b1b1b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.fill',
    stylers: [{ color: '#2c2c2c' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8a8a8a' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#373737' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3c3c3c' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry',
    stylers: [{ color: '#4e4e4e' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#000000' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3d3d3d' }],
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 32,
  },
  radarContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 26,
    position: 'relative',
  },
  radarRing: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    borderColor: '#dc2626',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  radarBeacon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  loadingEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  loadingSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 22,
  },
  progressBarTrack: {
    width: 140,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fee2e2',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarRunner: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#dc2626',
  },
  
  /* New Header Styles */
  headerNew: {
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLaserLine: {
    height: 1.5,
    width: '100%',
  },
  headerBrandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBrandLogo: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  headerNewTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  headerNewTitleRed: {
    color: '#dc2626',
  },
  notificationBellWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bellIcon: {
    fontSize: 24,
  },
  headerActionIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  headerIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    padding: 2,
  },
  settingsIconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  settingsIcon: {
    fontSize: 22,
  },
  redBadge: {
    position: 'absolute',
    top: -5,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  redBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8b95a8',
    letterSpacing: 1,
  },
  locationButton: {
    backgroundColor: '#1a2d52',
    borderWidth: 1,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  locationButtonText: {
    color: '#6a8eef',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Map Section
  // Sticky Active Emergency Report Preview Styles
  activeStickyPreview: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100,
  },
  activeStickyLeft: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  activeStickyPulseRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(220, 38, 38, 0.22)',
  },
  activeStickyBeacon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStickyBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  activeStickyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  activeStickyBadgeRow: {
    flex: 1,
    minWidth: 0,
  },
  activeStickyEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 0.6,
  },
  activeStickyStatusPill: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  activeStickyStatusText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#991b1b',
    textTransform: 'uppercase',
  },
  activeStickyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 2,
  },
  activeStickyMeta: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  activeStickyArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    flexShrink: 0,
  },

  mapContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  mapWrapper: {
    position: 'relative',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  map: {
    width: '100%',
    height: 320,
    borderRadius: 22,
  },
  radarLiveBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 30,
    elevation: 10,
  },
  radarLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eab308',
    shadowColor: '#eab308',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
  },
  radarLiveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  // Hotspot Advisory & Time Filter Card (Above Map)
  hotspotAdvisoryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  hotspotAdvisoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  hotspotAdvisoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  hotspotAdvisoryCopy: {
    flex: 1,
  },
  hotspotAdvisoryTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  hotspotAdvisorySubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  // Prominent Hotspot Toggle & Controls Row
  hotspotControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  hotspotToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  hotspotToggleBtnActive: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  hotspotToggleBtnInactive: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  hotspotToggleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  hotspotToggleBtnTextActive: {
    color: '#ffffff',
  },
  hotspotToggleBtnTextInactive: {
    color: '#64748b',
  },
  hotspotTimeFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hotspotTimeFiltersLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.6,
  },
  hotspotTimeChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  hotspotTimeChipActive: {
    borderColor: '#0f172a',
    backgroundColor: '#f1f5f9',
  },
  hotspotTimeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
  },
  hotspotTimeChipTextActive: {
    color: '#0f172a',
    fontWeight: '800',
  },
  mapPlaceholder: {
    width: '100%',
    height: 320,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: {
    fontSize: 56,
    marginBottom: 12,
  },
  mapPlaceholderLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  mapPlaceholderSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 20,
  },
  enableLocationButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  enableLocationButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  customMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  markerText: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 22,
  },
  precinctMarker: {
    width: 44,
    height: 44,
    backgroundColor: '#3b82f6',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  precinctMarkerText: {
    fontSize: 22,
    textAlign: 'center',
    lineHeight: 24,
  },
  
  // Report Button - Gradient Card Style
  reportButtonTouch: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 18,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  reportButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
  },
  reportButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  reportButtonIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  reportButtonTextGroup: {
    justifyContent: 'center',
  },
  reportButtonEyebrow: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  reportButtonTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  reportButtonArrowPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Quick cards row
  
  // Risk Cards
  riskSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  riskCard: {
    width: (width - 60) / 3,
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskHighCard: {
    backgroundColor: '#1a2d52',
    borderColor: '#dc2626',
  },
  riskMediumCard: {
    backgroundColor: '#1a2d52',
    borderColor: '#f59e0b',
  },
  riskLowCard: {
    backgroundColor: '#1a2d52',
    borderColor: '#eab308',
  },
  riskNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  riskLabel: {
    fontSize: 14,
    color: '#8b95a8',
    fontWeight: '600',
  },
  
  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.3,
  },
  viewAllText: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  
  // Precinct Card
  precinctCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  precinctIcon: {
    width: 44,
    height: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  precinctIconText: {
    fontSize: 26,
    display: 'none',
  },
  precinctIconImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  precinctInfo: {
    flex: 1,
  },
  precinctName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 5,
  },
  precinctLocation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 5,
    display: 'none',
  },
  precinctLocationIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    resizeMode: 'contain',
  },
  precinctAddress: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
    fontWeight: '500',
  },
  navigateIcon: {
    padding: 10,
  },
  navigateIconText: {
    fontSize: 18,
    color: '#0f172a',
  },
  
  // Incident Cards (white)
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  incidentIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  incidentSeverityDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  incidentIconText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  incidentInfo: {
    flex: 1,
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 3,
  },
  incidentDetails: {
    fontSize: 13.5,
    color: '#64748b',
    marginBottom: 3,
    fontWeight: '500',
  },
  incidentTime: {
    fontSize: 12.5,
    color: '#94a3b8',
    fontWeight: '600',
  },
  incidentArrow: {
    padding: 10,
  },
  incidentArrowText: {
    fontSize: 18,
    color: '#0f172a',
  },

  // Home action modals
  homeModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  homeModalSheet: {
    maxHeight: height * 0.86,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 24,
  },
  homeModalHandle: {
    alignSelf: 'center',
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
  homeModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 16,
  },
  homeModalTitleBlock: {
    flex: 1,
  },
  homeModalEyebrow: {
    fontSize: 14,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  homeModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.2,
  },
  homeModalSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '700',
    lineHeight: 19,
  },
  homeModalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  homeModalCloseText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },

  precinctFeatureCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  precinctFeatureIcon: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  precinctFeatureName: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  precinctFeatureAddress: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '600',
    marginBottom: 12,
  },
  precinctFeatureMeta: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  precinctFeatureMetaText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  homeModalActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  homeModalPrimaryAction: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 8,
  },
  homeModalPrimaryActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  homeModalScroll: {
    maxHeight: height * 0.58,
  },
  modalListCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    borderRadius: 18,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  modalListIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    marginRight: 12,
  },
  modalListIconImage: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
  },
  modalListBody: {
    flex: 1,
  },
  modalListTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modalListTitle: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '900',
  },
  modalListSubtext: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    fontWeight: '600',
  },
  modalListMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDistanceText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  modalRouteButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalRouteButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  nearestBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  nearestBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  incidentModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  incidentModalIconText: {
    fontSize: 22,
  },
  severityBadge: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  severityBadgeText: {
    fontSize: 14,
    fontWeight: '900',
  },
  modalIncidentTime: {
    marginTop: 5,
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '800',
  },
  incidentDetailCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 22,
    padding: 18,
  },
  incidentDetailIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  incidentDetailIconText: {
    fontSize: 28,
  },
  incidentDetailSeverity: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  incidentDetailSeverityText: {
    fontSize: 14,
    fontWeight: '900',
  },
  incidentDetailDescription: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
    fontWeight: '700',
  },
  incidentDetailDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  incidentDetailLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  incidentDetailValue: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  homeModalEmptyState: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeModalEmptyText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  
  // Empty State
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
  },
  
  // Bottom Spacer
  bottomSpacer: {
    height: 140,
  },
  
  // Bottom Navigation Bar Container
  bottomNavBarContainer: {
    position: 'relative',
    backgroundColor: '#991b1b',
  },
  
  // Bottom Navigation Bar
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: '#991b1b',
    borderTopWidth: 1,
    borderTopColor: '#b91c1c',
    paddingBottom: 15,
    paddingTop: 13,
    paddingHorizontal: 20,
  },

  navBottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0,
    paddingHorizontal: 14,
  },
  navBottomIcon: {
    fontSize: 32,
    color: '#ffffff',
    marginBottom: 4,
  },
  navBottomIconImage: {
    width: 32,
    height: 32,
    marginBottom: 4,
    tintColor: '#ffffff',
  },
  navBottomLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '700',
  },
  sosButtonBottom: {
    position: 'absolute',
    top: -58,
    left: '50%',
    marginLeft: -56,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.68,
    shadowRadius: 28,
    elevation: 35,
  },
  sosGlowRing: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: '#ffe4e6',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  sosButtonInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#ff1238',
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  sosTextBottom: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
  
  // Police Station Marker
  policeStationMarker: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },

  // Tactical PCP & Sub-station Official Pin Markers
  // Android snapshots custom markers into a bitmap sized to this wrapper, so
  // give it a fixed width with side padding: auto-sized text + elevation
  // shadows were getting cropped ("PCP 1(", cut-off pill edges).
  // Explicit width AND height: on the new architecture Android crops the
  // marker bitmap to whatever size it measured first, so auto-sized content
  // got cut. Keep in sync with PCP_PIN_ANCHOR.
  pcpPinWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pcpPinMarkerImage: {
    width: 32,
    height: 32,
  },

  // Admin-Identical Hotspot Legend Bar
  hotspotLegendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  hotspotLegendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  legendPillHigh: {
    backgroundColor: '#fef2f2',
    borderColor: '#fee2e2',
  },
  legendPillMed: {
    backgroundColor: '#fff7ed',
    borderColor: '#ffedd5',
  },
  legendPillLow: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendDotHigh: {
    backgroundColor: '#dc2626',
  },
  legendDotMed: {
    backgroundColor: '#f97316',
  },
  legendDotLow: {
    backgroundColor: '#eab308',
  },
  legendTextHigh: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '800',
  },
  legendTextMed: {
    color: '#9a3412',
    fontSize: 11,
    fontWeight: '800',
  },
  legendTextLow: {
    color: '#854d0e',
    fontSize: 11,
    fontWeight: '800',
  },

  // Hotspot Center Cluster Badge
  hotspotClusterBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 6,
  },
  hotspotClusterCountText: {
    fontSize: 11.5,
    fontWeight: '900',
  },

  // Recenter City Floating Button
  recenterCityBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.65)',
    gap: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 30,
  },
  recenterCityText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  
  // Old location marker styles
  locationMarker: {
    display: 'none',
  },
  markerHead: {
    display: 'none',
  },
  markerPointer: {
    display: 'none',
  },
  
  // Old marker styles (removed)
  precinctMarkerContainer: {
    display: 'none',
  },
  precinctMarkerPulse: {
    display: 'none',
  },
  precinctMarkerOuter: {
    display: 'none',
  },
  precinctMarkerMiddle: {
    display: 'none',
  },
  precinctMarkerInner: {
    display: 'none',
  },
  precinctMarkerCenterDot: {
    display: 'none',
  },
  precinctMarkerText: {
    display: 'none',
  },
  
  // Old SOS Button (disabled, kept for reference)
  sosButton: {
    display: 'none',
  },
  sosText: {
    display: 'none',
  },
});

export default HomeScreen;

