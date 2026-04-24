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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { collection, query, where, getDocs, onSnapshot, orderBy, limit } from 'firebase/firestore';
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
  const mapRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const rotationValue = useRef(new Animated.Value(0)).current;

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
    showAlert('Call Precinct', 
      '🚓 Valenzuela City Police Station\n\n8352-4000  •  0906-419-7676  •  0998-598-7868', 
      'info', 
      [
        { 
          text: '📞 8352-4000', 
          onPress: () => Linking.openURL('tel:8352-4000')
        },
        { 
          text: '📱 0906-419-7676', 
          onPress: () => Linking.openURL('tel:0906-419-7676')
        },
        { 
          text: '📱 0998-598-7868', 
          onPress: () => Linking.openURL('tel:0998-598-7868')
        },
        { 
          text: 'Close', 
          style: 'cancel' 
        },
      ]
    );
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
    const spin = rotationValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    return (
      <View style={styles.container}>
        <View style={styles.headerNew}>
          <Text style={styles.headerNewTitle}>HOME NEW</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Image 
              source={require('../assets/icons/police-station.png')}
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
      {/* Header with "HOME NEW" */}
      <View style={styles.headerNew}>
        <Text style={styles.headerNewTitle}>HOME NEW</Text>
        <View style={styles.headerIconsContainer}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerIconButton}>
            <View style={styles.settingsIconWrapper}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => navigation.navigate('Alerts')} style={styles.headerIconButton}>
            <View style={styles.notificationBellWrapper}>
              <Text style={styles.bellIcon}>🔔</Text>
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
          <Image source={require('../assets/icons/report.png')} style={styles.reportButtonWireIcon} />
          <Text style={styles.reportButtonWireText}>Report an Incident</Text>
        </TouchableOpacity>

        {/* Quick Action Cards: Nearest Precinct + Call 911 */}
        <View style={styles.quickCardsRow}>
          <TouchableOpacity style={styles.quickCard} onPress={() => showAlert('Nearest Precinct', nearestPrecinct ? `${nearestPrecinct.name}\n${nearestPrecinct.address}` : 'No precinct found')}>
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
              <Text style={styles.quickCardNumber}>📞</Text>
              <Text style={styles.quickCardLabel}>Call Precinct</Text>
            </View>
          </TouchableOpacity>
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
          <View style={styles.sosButtonInner}>
            <Text style={styles.sosTextBottom}>SOS</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>

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
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  loadingSpinner: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  
  /* New Header Styles */
  headerNew: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerNewTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  notificationBellWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  bellIcon: {
    fontSize: 24,
  },
  headerIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: -1,
  },
  headerIconButton: {
    padding: 4,
  },
  settingsIconWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  settingsIcon: {
    fontSize: 22,
  },
  redBadge: {
    position: 'absolute',
    top: -2,
    right: 0,
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
  reportButtonWireIcon: {
    width: 28,
    height: 28,
    marginRight: 12,
    tintColor: '#fff',
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
    fontSize: 20,
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
    backgroundColor: '#dc2626',
  },
  
  // Bottom Navigation Bar
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: '#dc2626',
    paddingBottom: 14,
    paddingTop: 12,
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
    top: -50,
    left: '50%',
    marginLeft: -50,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#7f1d1d',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.9,
    shadowRadius: 28,
    elevation: 35,
  },
  sosButtonInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#dc2626',
    borderWidth: 3,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#fca5a5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
  },
  sosTextBottom: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
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

