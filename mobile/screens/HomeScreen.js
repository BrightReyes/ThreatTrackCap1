import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Linking,
  Image,
  Animated,
  Modal,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { collection, query, where, getDocs, onSnapshot, orderBy, limit } from 'firebase/firestore';
import MapView, { Marker, Polygon, Heatmap, Circle } from '../components/maps';
import { LinearGradient } from 'expo-linear-gradient';
import { db } from '../utils/firebase';
import { getCurrentLocation, requestLocationPermission, calculateDistance, formatDistance } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

const { width, height } = Dimensions.get('window');

const APP_LOGO = require('../assets/icons/Threat Track Logo Reversed.png');
const BELL_ICON = require('../assets/icons/bell.png');
const CAMERA_ICON = require('../assets/icons/camera.png');
const GEAR_ICON = require('../assets/icons/gear.png');
const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

// Valenzuela City boundaries and center
const VALENZUELA_CENTER = {
  latitude: 14.6991,
  longitude: 120.9820,
  latitudeDelta: 0.05, // Approximately 5.5km north-south
  longitudeDelta: 0.05, // Approximately 5.5km east-west
};

const DEFAULT_HEATMAP_DAYS = 7;
const HEATMAP_NATIVE_RADIUS = 50;
const MAX_HEATMAP_MARKERS = 45;
const HEATMAP_GRID_SIZE = 0.002;
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

const PRECINCT_CONTACTS = [
  { label: 'Station Desk', number: '8352-4000', tel: '8352-4000' },
  { label: 'Mobile Hotline', number: '0906-419-7676', tel: '09064197676' },
  { label: 'Mobile Hotline', number: '0998-598-7868', tel: '09985987868' },
];

const SEVERITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
};

const HEATMAP_GRADIENT = {
  colors: ['#39ff14', '#a7ff00', '#ffe600', '#ff9f00', '#ff2f00'],
  startPoints: [0.08, 0.34, 0.56, 0.78, 1],
  colorMapSize: 256,
};

const getNormalizedHeatmapWeight = (weight) => {
  const numericWeight = Number(weight);
  const safeWeight = Number.isFinite(numericWeight) ? numericWeight : 0.35;
  return Math.min(Math.max(safeWeight, 0.12), 1);
};

const getHeatmapMarkerRadius = (weight) => {
  const normalizedWeight = getNormalizedHeatmapWeight(weight);
  return 55 + normalizedWeight * 95;
};

const getHeatmapMarkerPoints = (points) => {
  if (!points || points.length === 0) return [];

  return [...points]
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .sort((a, b) => getNormalizedHeatmapWeight(b.weight) - getNormalizedHeatmapWeight(a.weight))
    .slice(0, MAX_HEATMAP_MARKERS);
};

// Valenzuela City approximate boundaries
const VALENZUELA_BOUNDS = {
  northEast: { latitude: 14.7500, longitude: 121.0200 },
  southWest: { latitude: 14.6500, longitude: 120.9500 },
};

// Valenzuela City boundary polygon coordinates (approximate outline)
const VALENZUELA_BOUNDARY = [
  { latitude: 14.7480, longitude: 120.9650 }, // North - Marulas/Malinta area
  { latitude: 14.7450, longitude: 120.9850 }, // Northeast - Punturin area
  { latitude: 14.7400, longitude: 121.0150 }, // East - Lingunan/Canumay area
  { latitude: 14.7200, longitude: 121.0180 }, // East - Paso de Blas area
  { latitude: 14.6950, longitude: 121.0100 }, // Southeast - Ugong area
  { latitude: 14.6700, longitude: 121.0050 }, // Southeast - Gen. T. de Leon area
  { latitude: 14.6550, longitude: 120.9900 }, // South - Marulas area
  { latitude: 14.6520, longitude: 120.9700 }, // Southwest - Karuhatan area
  { latitude: 14.6600, longitude: 120.9550 }, // Southwest - Polo area
  { latitude: 14.6750, longitude: 120.9520 }, // West - Baritan/Bignay area
  { latitude: 14.7000, longitude: 120.9500 }, // West - Malinta area
  { latitude: 14.7250, longitude: 120.9530 }, // Northwest - Meycauayan border
  { latitude: 14.7400, longitude: 120.9600 }, // Northwest - Malinta area
];

// Mock data generators for demo when Firestore is empty
const generateMockIncidents = () => {
  const types = Object.keys(INCIDENT_TYPE_LABELS);
  const severities = ['high', 'medium', 'low'];
  const baseLocation = { latitude: 14.6991, longitude: 120.9820 }; // Valenzuela City
  
  return Array.from({ length: 15 }, (_, i) => ({
    id: `mock-incident-${i}`,
    type: types[Math.floor(Math.random() * types.length)],
    severity: severities[Math.floor(Math.random() * severities.length)],
    description: `Sample incident #${i + 1} - Demo data for testing`,
    location: {
      latitude: baseLocation.latitude + (Math.random() - 0.5) * 0.04, // Keep within Valenzuela
      longitude: baseLocation.longitude + (Math.random() - 0.5) * 0.04,
    },
    timestamp: { toDate: () => new Date(Date.now() - Math.random() * 86400000 * 7) },
    status: 'verified',
  }));
};

const generateMockPrecincts = () => {
  return [
    {
      id: 'precinct-1',
      name: 'Police Community Precinct 2',
      address: 'Gen. T. de Leon, Valenzuela, 1442 Metro Manila',
      location: { latitude: 14.6700, longitude: 121.0050 },
      isActive: true,
    },
    {
      id: 'precinct-2', 
      name: 'Police Community Precinct 4 (Malinta)',
      address: 'Governor I. Santiago Rd., Malinta, Valenzuela, Metro Manila',
      location: { latitude: 14.7100, longitude: 120.9600 },
      isActive: true,
    },
    {
      id: 'precinct-3',
      name: 'Police Community Precinct 7',
      address: 'Maysan Rd., Valenzuela, 1440 Metro Manila',
      location: { latitude: 14.7200, longitude: 120.9700 },
      isActive: true,
    },
    {
      id: 'substation-1',
      name: 'Sub-Station 7 Bignay Police',
      address: 'Phase 2B, Block 1 Lot 1, Northville 1, Brgy. Bignay, Valenzuela',
      location: { latitude: 14.6750, longitude: 120.9520 },
      isActive: true,
    },
    {
      id: 'clearance-section',
      name: 'Valenzuela City Police Clearance Section',
      address: 'Near MacArthur Highway, Brgy. Karuhatan, Valenzuela',
      location: { latitude: 14.6850, longitude: 120.9750 },
      isActive: true,
    },
    {
      id: 'community-relations',
      name: 'Police Community Relations Division (Valenzuela)',
      address: 'Maysan Rd., Valenzuela',
      location: { latitude: 14.7250, longitude: 120.9700 },
      isActive: true,
    },
    {
      id: 'environmental-unit',
      name: 'Environmental Police Unit Valenzuela',
      address: 'Valenzuela City Action Center, MacArthur Hwy, Valenzuela',
      location: { latitude: 14.6991, longitude: 120.9820 },
      isActive: true,
    },
  ];
};

const HomeScreen = ({ navigation }) => {
  // State management
  const [userLocation, setUserLocation] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [precincts, setPrecincts] = useState([]);
  const [nearestPrecinct, setNearestPrecinct] = useState(null);
  const [riskStats, setRiskStats] = useState({ high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState(VALENZUELA_CENTER);
  const mapRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const heatmapRequestIdRef = useRef(0);
  const heatmapEndpointUnavailableRef = useRef(false);
  const rotationValue = useRef(new Animated.Value(0)).current;

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

  const showAlert = (title, message, type = 'info', buttons = []) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      buttons,
    });
  };

  const hideAlert = () => {
    setAlertConfig({ ...alertConfig, visible: false });
  };

  const openHomeModal = (type, item = null) => {
    setHomeModal({ visible: true, type, item });
  };

  const closeHomeModal = () => {
    setHomeModal({ visible: false, type: null, item: null });
  };

  const handleSOSPress = async () => {
    try {
      const location = await getCurrentLocation();
      navigation.navigate('SOSReport', { userLocation: location });
    } catch (error) {
      console.error('Error getting location for SOS:', error);
      // Navigate anyway without location, SOS screen will handle it
      navigation.navigate('SOSReport');
    }
  };

  const handleCallPrecinct = () => {
    openHomeModal('call');
  };

  // Initialize location and data on mount
  useEffect(() => {
    initializeApp();

    // Cleanup function to unsubscribe from real-time listener on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Recalculate nearest precinct when location or precincts change
  useEffect(() => {
    if (userLocation && precincts.length > 0) {
      findNearestPrecinct();
    }
  }, [userLocation, precincts]);

  // Rotate spinner while loading
  useEffect(() => {
    if (loading) {
      rotationValue.setValue(0);
      Animated.loop(
        Animated.timing(rotationValue, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotationValue.setValue(0);
    }
  }, [loading, rotationValue]);

  // Refresh incidents when screen comes into focus (after reporting incident)
  useFocusEffect(
    useCallback(() => {
      // Refresh incidents by re-fetching when user returns to Home
      if (!loading) {
        console.log('HomeScreen focused - refreshing incidents');
        fetchIncidents();
      }
    }, [loading])
  );

  const initializeApp = async () => {
    try {
      setLoading(true);

      // Request location permission
      const hasPermission = await requestLocationPermission();
      
      if (hasPermission) {
        // Get user location
        const location = await getCurrentLocation();
        if (location) {
          // Check if user is within or near Valenzuela, otherwise default to center
          const isNearValenzuela = 
            location.latitude >= VALENZUELA_BOUNDS.southWest.latitude - 0.05 &&
            location.latitude <= VALENZUELA_BOUNDS.northEast.latitude + 0.05 &&
            location.longitude >= VALENZUELA_BOUNDS.southWest.longitude - 0.05 &&
            location.longitude <= VALENZUELA_BOUNDS.northEast.longitude + 0.05;
          
          setUserLocation(isNearValenzuela ? location : VALENZUELA_CENTER);
        } else {
          // Default to Valenzuela center if location fetch fails
          setUserLocation(VALENZUELA_CENTER);
        }
      } else {
        // Default to Valenzuela center if permission denied
        setUserLocation(VALENZUELA_CENTER);
      }

      // Fetch data from Firestore
      await Promise.all([
        fetchIncidents(),
        fetchPrecincts(),
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      // Ensure map shows even on error
      if (!userLocation) {
        setUserLocation(VALENZUELA_CENTER);
      }
      setLoading(false);
      showAlert('Error', 'Failed to load data. Please try again.', 'error');
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

        // If no data from Firestore, use mock data for demo
        if (incidentData.length === 0) {
          console.log('No Firestore data found - using mock data');
          const mockIncidents = generateMockIncidents();
          setIncidents(mockIncidents);
          
          // Count mock data by severity
          mockIncidents.forEach(inc => {
            if (inc.severity === 'high') highCount++;
            else if (inc.severity === 'medium') mediumCount++;
            else if (inc.severity === 'low') lowCount++;
          });
        } else {
          setIncidents(incidentData);
        }
        
        setRiskStats({ high: highCount, medium: mediumCount, low: lowCount });
      }, (error) => {
        console.error('Error fetching incidents with real-time listener:', error);
        // Fallback to mock data on error
        const mockIncidents = generateMockIncidents();
        setIncidents(mockIncidents);
        
        let highCount = 0, mediumCount = 0, lowCount = 0;
        mockIncidents.forEach(inc => {
          if (inc.severity === 'high') highCount++;
          else if (inc.severity === 'medium') mediumCount++;
          else if (inc.severity === 'low') lowCount++;
        });
        setRiskStats({ high: highCount, medium: mediumCount, low: lowCount });
      });
    } catch (error) {
      console.error('Error setting up incidents listener:', error);
      // Fallback to mock data on error
      const mockIncidents = generateMockIncidents();
      setIncidents(mockIncidents);
      
      let highCount = 0, mediumCount = 0, lowCount = 0;
      mockIncidents.forEach(inc => {
        if (inc.severity === 'high') highCount++;
        else if (inc.severity === 'medium') mediumCount++;
        else if (inc.severity === 'low') lowCount++;
      });
      setRiskStats({ high: highCount, medium: mediumCount, low: lowCount });
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

      // If no data from Firestore, use mock data
      if (precinctData.length === 0) {
        console.log('No precinct data found - using mock data');
        setPrecincts(generateMockPrecincts());
      } else {
        setPrecincts(precinctData);
      }
    } catch (error) {
      console.error('Error fetching precincts:', error);
      // Fallback to mock data
      setPrecincts(generateMockPrecincts());
    }
  };

  const findNearestPrecinct = () => {
    if (!userLocation || precincts.length === 0) return;

    let nearest = null;
    let minDistance = Infinity;

    precincts.forEach((precinct) => {
      if (precinct.location && precinct.location.latitude && precinct.location.longitude) {
        const distance = calculateDistance(userLocation, precinct.location);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = { ...precinct, distance };
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
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      }, 1000);
    }
  };

  // Constrain map to Valenzuela bounds
  const handleRegionChange = (region) => {
    if (!mapRef.current) return;

    let constrainedRegion = { ...region };
    let needsAdjustment = false;

    // Keep latitude within bounds
    if (region.latitude < VALENZUELA_BOUNDS.southWest.latitude) {
      constrainedRegion.latitude = VALENZUELA_BOUNDS.southWest.latitude;
      needsAdjustment = true;
    } else if (region.latitude > VALENZUELA_BOUNDS.northEast.latitude) {
      constrainedRegion.latitude = VALENZUELA_BOUNDS.northEast.latitude;
      needsAdjustment = true;
    }

    // Keep longitude within bounds
    if (region.longitude < VALENZUELA_BOUNDS.southWest.longitude) {
      constrainedRegion.longitude = VALENZUELA_BOUNDS.southWest.longitude;
      needsAdjustment = true;
    } else if (region.longitude > VALENZUELA_BOUNDS.northEast.longitude) {
      constrainedRegion.longitude = VALENZUELA_BOUNDS.northEast.longitude;
      needsAdjustment = true;
    }

    // Animate back to constrained region if user panned too far
    if (needsAdjustment) {
      mapRef.current.animateToRegion(constrainedRegion, 300);
    }
  };

  const getMarkerColor = (severity) => {
    switch (severity) {
      case 'high': return '#dc2626';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
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

  const getIncidentIcon = (type) => {
    const icons = {
      theft_snatching: '👜',
      robbery_holdup: '🚨',
      physical_assault_injury: '⚕️',
      domestic_violence: '🏠',
      drug_related_activity: '🔥',
      public_disturbance: '⚠️',
      vandalism_property_damage: '🧱',
      traffic_accident: '🚗',
      illegal_weapons: '🔒',
      suspicious_activity: '👁️',
    };
    return icons[type] || '!';
  };

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

  const getIncidentDate = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getIncidentHeatmapDate = (incident) => {
    return (
      getIncidentDate(incident.timestamp) ||
      getIncidentDate(incident.clientTimestamp) ||
      getIncidentDate(incident.createdAt) ||
      getIncidentDate(incident.submittedAt)
    );
  };

  const getBoundsFromRegion = (region) => ({
    north: region.latitude + region.latitudeDelta / 2,
    south: region.latitude - region.latitudeDelta / 2,
    east: region.longitude + region.longitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
  });

  const getPrecinctDistance = (precinct) => {
    if (typeof precinct?.distance === 'number') {
      return precinct.distance;
    }

    if (
      userLocation &&
      precinct?.location &&
      Number.isFinite(Number(precinct.location.latitude)) &&
      Number.isFinite(Number(precinct.location.longitude))
    ) {
      return calculateDistance(userLocation, precinct.location);
    }

    return null;
  };

  const confirmPrecinctNavigation = (precinct) => {
    if (!precinct?.location) return;

    const url = `https://www.google.com/maps/dir/?api=1&destination=${precinct.location.latitude},${precinct.location.longitude}`;
    showAlert('Navigate', `Open in Google Maps?\n${precinct.name}`, 'info', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Maps', onPress: () => Linking.openURL(url) },
    ]);
  };

  const handlePrecinctNavigation = (precinct) => {
    closeHomeModal();
    confirmPrecinctNavigation(precinct);
  };

  const handlePrecinctCall = (contact) => {
    closeHomeModal();
    Linking.openURL(`tel:${contact.tel}`);
  };

  const buildHeatmapPointsFromIncidents = (sourceIncidents, bounds, days) => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    const gridCells = new Map();
    let maxCount = 0;

    sourceIncidents.forEach((incident) => {
      const location = incident.location;
      const latitude = Number(location?.latitude);
      const longitude = Number(location?.longitude);
      const incidentDate = getIncidentHeatmapDate(incident);
      const status = incident.status || 'verified';

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !incidentDate ||
        !HEATMAP_VISIBLE_STATUSES.has(status) ||
        incidentDate < startDate ||
        incidentDate > endDate ||
        latitude < bounds.south ||
        latitude > bounds.north ||
        longitude < bounds.west ||
        longitude > bounds.east
      ) {
        return;
      }

      const cellLat = (Math.floor(latitude / HEATMAP_GRID_SIZE) + 0.5) * HEATMAP_GRID_SIZE;
      const cellLng = (Math.floor(longitude / HEATMAP_GRID_SIZE) + 0.5) * HEATMAP_GRID_SIZE;
      const cellKey = `${cellLat.toFixed(3)}_${cellLng.toFixed(3)}`;
      const currentCount = (gridCells.get(cellKey)?.count || 0) + 1;

      gridCells.set(cellKey, {
        latitude: cellLat,
        longitude: cellLng,
        count: currentCount,
      });
      maxCount = Math.max(maxCount, currentCount);
    });

    return Array.from(gridCells.values()).map((cell) => ({
      latitude: cell.latitude,
      longitude: cell.longitude,
      weight: maxCount > 0 ? cell.count / maxCount : 0.5,
    }));
  };

  const fetchHeatmapData = async (region = mapRegion, days = DEFAULT_HEATMAP_DAYS) => {
    if (!region) return;

    const requestId = heatmapRequestIdRef.current + 1;
    heatmapRequestIdRef.current = requestId;
    const bounds = getBoundsFromRegion(region);
    const localHeatmapPoints = buildHeatmapPointsFromIncidents(incidents, bounds, days);

    if (localHeatmapPoints.length > 0) {
      setHeatmapData(localHeatmapPoints);
    }

    if (heatmapEndpointUnavailableRef.current) {
      setHeatmapData(localHeatmapPoints);
      return;
    }

    setHeatmapLoading(true);
    try {
      // Get Cloud Function URL - update this with your actual Firebase Functions URL
      const functionsUrl = 'https://us-central1-threattrackcap1.cloudfunctions.net/getHeatmapData';

      const response = await fetch(functionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds, days }),
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const result = await response.json();

      if (requestId !== heatmapRequestIdRef.current) {
        return;
      }

      if (result.success && result.data && result.data.cells) {
        // Convert cells to heatmap points format
        const heatmapPoints = result.data.cells.map((cell) => ({
          latitude: cell.latitude,
          longitude: cell.longitude,
          weight: cell.weight || 0.5,
        }));
        setHeatmapData(localHeatmapPoints.length > 0 ? localHeatmapPoints : heatmapPoints);
      } else {
        console.log('No heatmap data returned:', result);
        setHeatmapData(localHeatmapPoints);
      }
    } catch (error) {
      if (error.status === 404) {
        heatmapEndpointUnavailableRef.current = true;
      } else {
        console.log('Heatmap service unavailable, using local incident data:', error.message);
      }

      if (requestId === heatmapRequestIdRef.current) {
        setHeatmapData(localHeatmapPoints);
      }
    } finally {
      if (requestId === heatmapRequestIdRef.current) {
        setHeatmapLoading(false);
      }
    }
  };

  // Auto-load heatmap data when map region changes
  useEffect(() => {
    if (mapReady && mapRegion) {
      fetchHeatmapData(mapRegion, DEFAULT_HEATMAP_DAYS);
    }
  }, [mapReady]);

  useEffect(() => {
    if (mapReady && mapRegion) {
      fetchHeatmapData(mapRegion, DEFAULT_HEATMAP_DAYS);
    }
  }, [incidents, mapReady]);

  // Get recent incidents for the list (top 3)
  const recentIncidents = incidents.slice(0, 3);
  const precinctsByDistance = precincts
    .map((precinct) => ({
      ...precinct,
      distance: getPrecinctDistance(precinct),
    }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const incidentsByPriority = [...incidents].sort((a, b) => {
    const severityDifference = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (severityDifference !== 0) return severityDifference;

    const dateA = getIncidentDate(a.timestamp)?.getTime() || 0;
    const dateB = getIncidentDate(b.timestamp)?.getTime() || 0;
    return dateB - dateA;
  });

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

  const renderCallModal = () => (
    <>
      {renderModalHeader('PRECINCT CONTACT', 'Call Precinct', 'Valenzuela City Police Station')}
      <View style={styles.homeModalHeroCard}>
        <View style={styles.homeModalHeroIcon}>
          <Text style={styles.homeModalHeroIconText}>☎️</Text>
        </View>
        <View style={styles.homeModalHeroCopy}>
          <Text style={styles.homeModalHeroTitle}>Select a direct line</Text>
          <Text style={styles.homeModalHeroText}>Choose the fastest available number for police assistance.</Text>
        </View>
      </View>
      <View style={styles.callLineList}>
        {PRECINCT_CONTACTS.map((contact) => (
          <TouchableOpacity
            key={contact.number}
            style={styles.callLineButton}
            onPress={() => handlePrecinctCall(contact)}
          >
            <View>
              <Text style={styles.callLineLabel}>{contact.label}</Text>
              <Text style={styles.callLineNumber}>{contact.number}</Text>
            </View>
            <View style={styles.callLineAction}>
              <Text style={styles.callLineActionText}>Call</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </>
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
                  {getPrecinctDistance(precinct) !== null ? formatDistance(getPrecinctDistance(precinct)) : 'Distance unavailable'}
                </Text>
              </View>
            </View>
            <View style={styles.homeModalActionRow}>
              <TouchableOpacity style={styles.homeModalSecondaryAction} onPress={() => openHomeModal('call')}>
                <Text style={styles.homeModalSecondaryActionText}>Call</Text>
              </TouchableOpacity>
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
                <Text style={styles.modalListTitle} numberOfLines={1}>{precinct.name}</Text>
                {nearestPrecinct?.id === precinct.id ? (
                  <View style={styles.nearestBadge}>
                    <Text style={styles.nearestBadgeText}>Nearest</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.modalListSubtext} numberOfLines={2}>{precinct.address || 'Address unavailable'}</Text>
              <View style={styles.modalListMetaRow}>
                <Text style={styles.modalDistanceText}>
                  {precinct.distance !== null ? formatDistance(precinct.distance) : 'Distance unavailable'}
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
        <View style={[styles.incidentModalIcon, { backgroundColor: severityColor }]}>
          <Text style={styles.incidentModalIconText}>{getIncidentIcon(incident.type)}</Text>
        </View>
        <View style={styles.modalListBody}>
          <View style={styles.modalListTopLine}>
            <Text style={styles.modalListTitle} numberOfLines={1}>{formatIncidentType(incident)}</Text>
            <View style={[styles.severityBadge, { borderColor: severityColor }]}>
              <Text style={[styles.severityBadgeText, { color: severityColor }]}>
                {getSeverityLabel(incident.severity)}
              </Text>
            </View>
          </View>
          <Text style={styles.modalListSubtext} numberOfLines={1}>
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
          <View style={[styles.incidentDetailIcon, { backgroundColor: severityColor }]}>
            <Text style={styles.incidentDetailIconText}>{getIncidentIcon(incident.type)}</Text>
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
      case 'call':
        return renderCallModal();
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
    const loadingScale = rotationValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.96, 1.08],
    });
    const loadingOpacity = rotationValue.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.72, 1, 0.72],
    });

    return (
      <View style={styles.container}>
        <View style={styles.headerNew}>
          <Text style={styles.headerNewTitle}>THREAT TRACK</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Animated.View style={[
            styles.loadingLogoShell,
            { opacity: loadingOpacity, transform: [{ scale: loadingScale }] },
          ]}>
            <Image
              source={APP_LOGO}
              style={styles.loadingSpinner}
            />
          </Animated.View>
          <Text style={styles.loadingText}>Loading map data...</Text>
        </View>
        <View style={styles.bottomNavBarContainer}>
            <View style={styles.bottomNavBar}>
            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Home')}>
              <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />
              <Text style={styles.navBottomLabel}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Status')}>
              <Image source={require('../assets/icons/report.png')} style={styles.navBottomIconImage} />
              <Text style={styles.navBottomLabel}>Reports</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.sosButtonBottom} onPress={handleSOSPress}>
            <View style={styles.sosGlowRing} />
            <View style={styles.sosButtonInner}>
              <Text style={styles.sosTextBottom}>SOS</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerNew}>
        <Text style={styles.headerNewTitle}>THREAT TRACK</Text>
        <View style={styles.headerIconsContainer}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerIconButton}>
            <View style={styles.settingsIconWrapper}>
              <Image source={GEAR_ICON} style={styles.headerActionIcon} />
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => navigation.navigate('Alerts')} style={styles.headerIconButton}>
            <View style={styles.notificationBellWrapper}>
              <Image source={BELL_ICON} style={styles.headerActionIcon} />
              {riskStats.high > 0 && (
                <View style={styles.redBadge}>
                  <Text style={styles.redBadgeText}>{riskStats.high}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Map Container */}
        <View style={styles.mapContainer}>
          {userLocation ? (
            <>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={VALENZUELA_CENTER}
                showsUserLocation={true}
                showsMyLocationButton={false}
                customMapStyle={darkMapStyle}
                onMapReady={() => setMapReady(true)}
                onRegionChangeComplete={(region) => {
                  setMapRegion(region);
                  handleRegionChange(region);
                  // Refresh heatmap when region changes (7-day span)
                  fetchHeatmapData(region, DEFAULT_HEATMAP_DAYS);
                }}
                minZoomLevel={12}
                maxZoomLevel={17}
                pitchEnabled={false}
                rotateEnabled={false}
                mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                {/* Valenzuela City Boundary Outline */}
                <Polygon
                  coordinates={VALENZUELA_BOUNDARY}
                  strokeColor="#6a8eef"
                  strokeWidth={3}
                  fillColor="rgba(106, 142, 239, 0.1)"
                  tappable={false}
                />

                {/* Heatmap Layer - Always Visible with 7-Day Span */}
                {heatmapData && heatmapData.length > 0 && (
                  <>
                    <Heatmap
                      points={heatmapData}
                      radius={HEATMAP_NATIVE_RADIUS}
                      opacity={0.78}
                      maxIntensity={1}
                      gradient={HEATMAP_GRADIENT}
                    />

                    {getHeatmapMarkerPoints(heatmapData).map((point, index) => (
                      <Circle
                        key={`heatmap-marker-${index}-${point.latitude}-${point.longitude}`}
                        center={{
                          latitude: point.latitude,
                          longitude: point.longitude,
                        }}
                        radius={getHeatmapMarkerRadius(point.weight)}
                        strokeColor="#ffffff"
                        strokeWidth={2}
                        fillColor="rgba(239, 45, 19, 0.9)"
                        zIndex={2}
                      />
                    ))}
                  </>
                )}

                {/* Precinct Markers */}
                {precincts.map((precinct) => (
                  precinct.location && precinct.location.latitude && precinct.location.longitude && (
                    <Marker
                      key={precinct.id}
                      coordinate={{
                        latitude: precinct.location.latitude,
                        longitude: precinct.location.longitude,
                      }}
                      title={precinct.name}
                      description={precinct.address}
                    >
                      <Image
                        source={require('../assets/icons/police-station.png')}
                        style={styles.policeStationMarker}
                      />
                    </Marker>
                  )
                ))}
              </MapView>
              {heatmapLoading && (
                <View style={styles.heatmapLoadingBadge}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.heatmapLoadingText}>Updating heatmap</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.mapPlaceholder}>
              <Text style={styles.mapPlaceholderText}>📍</Text>
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
          style={styles.reportButtonWire}
          onPress={() => navigation.navigate('ReportIncident')}
        >
          <View style={styles.reportButtonIconWrap}>
            <Image source={CAMERA_ICON} style={styles.reportButtonWireIcon} />
          </View>
          <Text style={styles.reportButtonWireText}>Report an Incident</Text>
        </TouchableOpacity>

        {/* Quick Action Cards: Nearest Precinct + Call 911 */}
        <View style={styles.quickCardsRow}>
          <TouchableOpacity style={styles.quickCard} onPress={() => openHomeModal('nearest')}>
            <Image 
              source={require('../assets/icons/police-station.png')}
              style={styles.quickCardIconImage}
            />
            <View style={styles.quickCardTextWrap}>
              <Text style={styles.quickCardNumber}>{nearestPrecinct ? formatDistance(nearestPrecinct.distance) : '—'}</Text>
              <Text style={styles.quickCardLabel}>Nearest Station</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={handleCallPrecinct}>
            <Text style={styles.quickCardIcon}>☎️</Text>
            <View style={styles.quickCardTextWrap}>
              <Text style={styles.quickCardNumber}>Hotline</Text>
              <Text style={styles.quickCardLabel}>Call Precinct</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Nearest Precinct Section */}
        {nearestPrecinct && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nearest Precinct</Text>
              <TouchableOpacity onPress={() => openHomeModal('precincts')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.precinctCard}>
              <View style={styles.precinctIcon}>
                <Image 
                  source={require('../assets/icons/police-station.png')}
                  style={styles.precinctIconImage}
                />
              </View>
              <View style={styles.precinctInfo}>
                <Text style={styles.precinctName}>{nearestPrecinct.name}</Text>
                <View style={styles.precinctLocation}>
                  <Image 
                    source={require('../assets/icons/police-station.png')}
                    style={styles.precinctLocationIcon}
                  />
                  <Text style={styles.precinctAddress} numberOfLines={1}>
                    {nearestPrecinct.address} • {formatDistance(nearestPrecinct.distance)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.navigateIcon}
                onPress={() => {
                  confirmPrecinctNavigation(nearestPrecinct);
                }}
              >
                <Text style={styles.navigateIconText}>▶️</Text>
              </TouchableOpacity>
            </View>
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
                <View style={[
                  styles.incidentIcon,
                  { backgroundColor: getMarkerColor(incident.severity) }
                ]}>
                  <Text style={styles.incidentIconText}>{getIncidentIcon(incident.type)}</Text>
                </View>
                <View style={styles.incidentInfo}>
                  <Text style={styles.incidentTitle}>
                    {formatIncidentType(incident)}
                  </Text>
                  <Text style={styles.incidentDetails} numberOfLines={1}>
                    {incident.location?.address || 'Location not specified'}
                  </Text>
                  <Text style={styles.incidentTime}>{formatTimeAgo(incident.timestamp)}</Text>
                </View>
                <View style={styles.incidentArrow}>
                  <Text style={styles.incidentArrowText}>→</Text>
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
      <View style={styles.bottomNavBarContainer}>
        <View style={styles.bottomNavBar}>
          <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Home')}>
            <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />
            <Text style={styles.navBottomLabel}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Status')}>
            <Image source={require('../assets/icons/report.png')} style={styles.navBottomIconImage} />
            <Text style={styles.navBottomLabel}>Reports</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.sosButtonBottom} onPress={handleSOSPress}>
          <View style={styles.sosGlowRing} />
          <View style={styles.sosButtonInner}>
            <Text style={styles.sosTextBottom}>SOS</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>

    <Modal
      visible={homeModal.visible}
      transparent
      animationType="slide"
      onRequestClose={closeHomeModal}
    >
      <View style={styles.homeModalBackdrop}>
        <View style={styles.homeModalSheet}>
          <View style={styles.homeModalHandle} />
          {renderHomeModalContent()}
        </View>
      </View>
    </Modal>

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
  },
  loadingText: {
    marginTop: 18,
    fontSize: 16,
    color: '#991b1b',
    fontWeight: '800',
  },
  loadingLogoShell: {
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: '#fff7f7',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  loadingSpinner: {
    width: 72,
    height: 82,
    resizeMode: 'contain',
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
  headerNewTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  notificationBellWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fee2e2',
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
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  settingsIcon: {
    fontSize: 22,
  },
  redBadge: {
    position: 'absolute',
    top: -5,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  redBadgeText: {
    color: '#ffffff',
    fontSize: 11,
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
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Map Section
  mapContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  map: {
    width: '100%',
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
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
  heatmapLoadingBadge: {
    position: 'absolute',
    top: 32,
    right: 28,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heatmapLoadingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
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
  
  // Report Button - Red Button Style
  reportButtonWire: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  reportButtonIconWrap: {
    width: 34,
    height: 34,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reportButtonWireIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    tintColor: '#ffffff',
  },
  reportButtonWireText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Quick cards row
  quickCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 14,
  },
  quickCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  quickCardIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  quickCardIconImage: {
    width: 36,
    height: 36,
    marginBottom: 12,
    resizeMode: 'contain',
  },
  quickCardTextWrap: {
    alignItems: 'center',
  },
  quickCardNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#dc2626',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  quickCardLabel: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '700',
  },
  
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
    borderColor: '#10b981',
  },
  riskNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  riskLabel: {
    fontSize: 12,
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
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '700',
  },
  
  // Precinct Card
  precinctCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  precinctIcon: {
    width: 52,
    height: 52,
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
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
    fontSize: 13,
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
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
    fontWeight: '500',
  },
  navigateIcon: {
    padding: 10,
  },
  navigateIconText: {
    fontSize: 18,
    color: '#dc2626',
  },
  
  // Incident Cards (white)
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  incidentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
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
    color: '#111827',
    marginBottom: 3,
  },
  incidentDetails: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 3,
    fontWeight: '500',
  },
  incidentTime: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  incidentArrow: {
    padding: 10,
  },
  incidentArrowText: {
    fontSize: 18,
    color: '#dc2626',
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
    borderColor: '#fee2e2',
    shadowColor: '#dc2626',
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
    backgroundColor: '#fecaca',
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
    fontSize: 11,
    fontWeight: '900',
    color: '#dc2626',
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
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
    lineHeight: 19,
  },
  homeModalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
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
  homeModalHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7f7',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  homeModalHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  homeModalHeroIconText: {
    fontSize: 26,
  },
  homeModalHeroCopy: {
    flex: 1,
  },
  homeModalHeroTitle: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 4,
  },
  homeModalHeroText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
    fontWeight: '600',
  },
  callLineList: {
    gap: 10,
  },
  callLineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 15,
  },
  callLineLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  callLineNumber: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '900',
  },
  callLineAction: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  callLineActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  precinctFeatureCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
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
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '600',
    marginBottom: 12,
  },
  precinctFeatureMeta: {
    backgroundColor: '#fef2f2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  precinctFeatureMetaText: {
    color: '#dc2626',
    fontSize: 13,
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
  homeModalSecondaryAction: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  homeModalSecondaryActionText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '900',
  },
  homeModalScroll: {
    maxHeight: height * 0.58,
  },
  modalListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    borderRadius: 18,
    padding: 13,
    marginBottom: 10,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  modalListIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
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
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 17,
    fontWeight: '600',
  },
  modalListMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDistanceText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '900',
  },
  modalRouteButton: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalRouteButtonText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '900',
  },
  nearestBadge: {
    backgroundColor: '#dc2626',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  nearestBadgeText: {
    color: '#ffffff',
    fontSize: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  severityBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  modalIncidentTime: {
    marginTop: 5,
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '800',
  },
  incidentDetailCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
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
    fontSize: 12,
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
    backgroundColor: '#fee2e2',
    marginVertical: 16,
  },
  incidentDetailLabel: {
    fontSize: 11,
    color: '#dc2626',
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
    height: 120,
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
    fontSize: 13,
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
    width: 40,
    height: 40,
    resizeMode: 'contain',
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

