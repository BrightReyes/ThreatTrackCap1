import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Linking,
} from 'react-native';
import MapView, { Marker, Polygon } from '../components/maps';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getCurrentLocation, requestLocationPermission, calculateDistance, formatDistance } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

const { width, height } = Dimensions.get('window');

// Valenzuela City boundaries and center
const VALENZUELA_CENTER = {
  latitude: 14.6991,
  longitude: 120.9820,
  latitudeDelta: 0.05, // Approximately 5.5km north-south
  longitudeDelta: 0.05, // Approximately 5.5km east-west
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
  const types = ['Theft', 'Assault', 'Vandalism', 'Robbery', 'Burglary', 'Other'];
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
      id: 'mock-precinct-1',
      name: 'Valenzuela City Police Station',
      address: 'MacArthur Highway, Valenzuela City',
      location: { latitude: 14.6991, longitude: 120.9820 },
      isActive: true,
    },
    {
      id: 'mock-precinct-2', 
      name: 'Karuhatan Police Station',
      address: 'Karuhatan, Valenzuela City',
      location: { latitude: 14.6850, longitude: 120.9750 },
      isActive: true,
    },
    {
      id: 'mock-precinct-3',
      name: 'Malinta Police Station',
      address: 'Malinta, Valenzuela City',
      location: { latitude: 14.7100, longitude: 120.9600 },
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
  const mapRef = useRef(null);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
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

  // Initialize location and data on mount
  useEffect(() => {
    initializeApp();
  }, []);

  // Recalculate nearest precinct when location or precincts change
  useEffect(() => {
    if (userLocation && precincts.length > 0) {
      findNearestPrecinct();
    }
  }, [userLocation, precincts]);

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

      const snapshot = await getDocs(q);
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
    } catch (error) {
      console.error('Error fetching incidents:', error);
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

  const getIncidentIcon = (type) => {
    const icons = {
      theft: '⚠️',
      assault: '🚨',
      vandalism: '🔨',
      robbery: '💰',
      burglary: '🏠',
      other: 'ℹ️',
    };
    return icons[type] || icons.other;
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

  // Get recent incidents for the list (top 3)
  const recentIncidents = incidents.slice(0, 3);

  if (loading) {
    return (
      <LinearGradient
        colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
        locations={[0, 0.3, 0.6, 0.85, 1]}
        style={styles.container}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6a8eef" />
          <Text style={styles.loadingText}>Loading map data...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <>
    <LinearGradient
      colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
      locations={[0, 0.3, 0.6, 0.85, 1]}
      style={styles.container}
    >
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>CRIME MAP</Text>
          {userLocation && (
            <TouchableOpacity style={styles.locationButton} onPress={centerMapOnUser}>
              <Text style={styles.locationButtonText}>📍 Center</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Map Container */}
        <View style={styles.mapContainer}>
          {userLocation ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={VALENZUELA_CENTER}
              showsUserLocation={true}
              showsMyLocationButton={false}
              customMapStyle={darkMapStyle}
              onMapReady={() => setMapReady(true)}
              onRegionChangeComplete={handleRegionChange}
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

              {/* Incident Markers */}
              {incidents.map((incident) => (
                incident.location && incident.location.latitude && incident.location.longitude && (
                  <Marker
                    key={incident.id}
                    coordinate={{
                      latitude: incident.location.latitude,
                      longitude: incident.location.longitude,
                    }}
                    pinColor={getMarkerColor(incident.severity)}
                    title={incident.type.charAt(0).toUpperCase() + incident.type.slice(1)}
                    description={incident.description}
                  >
                    <View style={[styles.customMarker, { backgroundColor: getMarkerColor(incident.severity) }]}>
                      <Text style={styles.markerText}>{getIncidentIcon(incident.type)}</Text>
                    </View>
                  </Marker>
                )
              ))}

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
                    <View style={styles.precinctMarker}>
                      <Text style={styles.precinctMarkerText}>🛡️</Text>
                    </View>
                  </Marker>
                )
              ))}
            </MapView>
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
          style={styles.reportButton}
          onPress={() => navigation.navigate('ReportIncident')}
        >
          <Text style={styles.reportButtonIcon}>📷</Text>
          <Text style={styles.reportButtonText}>Report an Incident</Text>
        </TouchableOpacity>

        {/* Risk Level Cards */}
        <View style={styles.riskSection}>
          <View style={styles.riskRow}>
            <View style={[styles.riskCard, styles.riskHighCard]}>
              <Text style={styles.riskNumber}>{riskStats.high}</Text>
              <Text style={styles.riskLabel}>High Risk</Text>
            </View>
            
            <View style={[styles.riskCard, styles.riskMediumCard]}>
              <Text style={styles.riskNumber}>{riskStats.medium}</Text>
              <Text style={styles.riskLabel}>Medium</Text>
            </View>
            
            <View style={[styles.riskCard, styles.riskLowCard]}>
              <Text style={styles.riskNumber}>{riskStats.low}</Text>
              <Text style={styles.riskLabel}>Low Risk</Text>
            </View>
          </View>
        </View>

        {/* Nearest Precinct Section */}
        {nearestPrecinct && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nearest Precinct</Text>
              <TouchableOpacity onPress={() => showAlert('Precincts', `Showing all ${precincts.length} police precincts on the map`, 'info')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.precinctCard}>
              <View style={styles.precinctIcon}>
                <Text style={styles.precinctIconText}>🛡️</Text>
              </View>
              <View style={styles.precinctInfo}>
                <Text style={styles.precinctName}>{nearestPrecinct.name}</Text>
                <View style={styles.precinctLocation}>
                  <Text style={styles.locationIcon}>📍</Text>
                  <Text style={styles.precinctAddress} numberOfLines={1}>
                    {nearestPrecinct.address} • {formatDistance(nearestPrecinct.distance)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.navigateIcon}
                onPress={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${nearestPrecinct.location.latitude},${nearestPrecinct.location.longitude}`;
                  showAlert('Navigate', `Open in Google Maps?\n${nearestPrecinct.name}`, 'info', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open', onPress: () => Linking.openURL(url) }
                  ]);
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
            <TouchableOpacity onPress={() => showAlert('All Incidents', `Showing all ${incidents.length} incidents on the map. Scroll to view more details.`, 'info')}>
              <Text style={styles.viewAllText}>See All ({incidents.length})</Text>
            </TouchableOpacity>
          </View>

          {recentIncidents.length > 0 ? (
            recentIncidents.map((incident) => (
              <TouchableOpacity 
                key={incident.id}
                style={styles.incidentCard}
                onPress={() => {
                  showAlert(
                    incident.type.charAt(0).toUpperCase() + incident.type.slice(1),
                    incident.description,
                    'info',
                    [{ text: 'OK' }]
                  );
                }}
              >
                <View style={[
                  styles.incidentIcon,
                  { backgroundColor: getMarkerColor(incident.severity) }
                ]}>
                  <Text style={styles.incidentIconText}>{getIncidentIcon(incident.type)}</Text>
                </View>
                <View style={styles.incidentInfo}>
                  <Text style={styles.incidentTitle}>
                    {incident.type.charAt(0).toUpperCase() + incident.type.slice(1)}
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
    </LinearGradient>

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
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8b95a8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
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
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  map: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapPlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#1a2d52',
    borderWidth: 2,
    borderColor: '#3d5a8c',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: {
    fontSize: 48,
    marginBottom: 8,
  },
  mapPlaceholderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  mapPlaceholderSubtext: {
    fontSize: 12,
    color: '#8b95a8',
    marginBottom: 16,
  },
  enableLocationButton: {
    backgroundColor: '#6a8eef',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  enableLocationButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  customMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    overflow: 'hidden',
  },
  markerText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  precinctMarker: {
    width: 40,
    height: 40,
    backgroundColor: '#5178e8',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    overflow: 'hidden',
  },
  precinctMarkerText: {
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Report Button
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  reportButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  reportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  
  // Risk Cards
  riskSection: {
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  viewAllText: {
    fontSize: 13,
    color: '#6a8eef',
    fontWeight: '600',
  },
  
  // Precinct Card
  precinctCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 16,
  },
  precinctIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#5178e8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  precinctIconText: {
    fontSize: 24,
  },
  precinctInfo: {
    flex: 1,
  },
  precinctName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  precinctLocation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  precinctAddress: {
    fontSize: 12,
    color: '#8b95a8',
    flex: 1,
  },
  navigateIcon: {
    padding: 8,
  },
  navigateIconText: {
    fontSize: 16,
    color: '#6a8eef',
  },
  
  // Incident Cards
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  incidentIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  incidentIconText: {
    fontSize: 20,
  },
  incidentInfo: {
    flex: 1,
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  incidentDetails: {
    fontSize: 12,
    color: '#8b95a8',
    marginBottom: 2,
  },
  incidentTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  incidentArrow: {
    padding: 8,
  },
  incidentArrowText: {
    fontSize: 18,
    color: '#6a8eef',
  },
  
  // Empty State
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#8b95a8',
  },
  
  // Bottom Spacer
  bottomSpacer: {
    height: 100,
  },
});

export default HomeScreen;
