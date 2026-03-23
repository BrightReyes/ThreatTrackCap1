import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getCurrentLocation, calculateDistance, formatDistance } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

const NEARBY_RADIUS_KM = 5; // Alert for incidents within 5km

const AlertsScreen = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

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

  useEffect(() => {
    fetchNearbyIncidents();
  }, []);

  const fetchNearbyIncidents = async () => {
    try {
      // Get user location
      const location = await getCurrentLocation();
      if (!location) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setUserLocation(location);

      // Fetch recent incidents
      const incidentsRef = collection(db, 'incidents');
      const q = query(
        incidentsRef,
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      const querySnapshot = await getDocs(q);
      const nearbyIncidents = [];
      
      querySnapshot.forEach((doc) => {
        const incident = { id: doc.id, ...doc.data() };
        
        // Filter locally for verified/under_review
        if (incident.location && (incident.status === 'verified' || incident.status === 'under_review')) {
          const distance = calculateDistance(
            location.latitude,
            location.longitude,
            incident.location.latitude,
            incident.location.longitude
          );

          // Only include incidents within radius
          if (distance <= NEARBY_RADIUS_KM) {
            nearbyIncidents.push({
              ...incident,
              distance,
            });
          }
        }
      });

      // Sort by distance (closest first)
      nearbyIncidents.sort((a, b) => a.distance - b.distance);
      
      setAlerts(nearbyIncidents);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error fetching nearby incidents:', error);
      setLoading(false);
      setRefreshing(false);
      showAlert('Error', 'Failed to load nearby incidents', 'error');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNearbyIncidents();
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getIncidentIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'theft': return '⚠️';
      case 'assault': return '🚨';
      case 'vandalism': return '🔨';
      case 'robbery': return '💰';
      case 'burglary': return '🏠';
      default: return 'ℹ️';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return '#dc2626';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const handleAlertPress = (alert) => {
    showAlert(
      `${alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Nearby`,
      `Distance: ${formatDistance(alert.distance)}\n\n${alert.description}\n\nReported: ${formatTimestamp(alert.timestamp)}`,
      'warning',
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
        locations={[0, 0.3, 0.6, 0.85, 1]}
        style={styles.container}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6a8eef" />
          <Text style={styles.loadingText}>Finding nearby incidents...</Text>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6a8eef" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>NEARBY ALERTS</Text>
          {alerts.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{alerts.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.radiusInfo}>
          <Text style={styles.radiusText}>📍 Within {NEARBY_RADIUS_KM}km of your location</Text>
        </View>

        <View style={styles.content}>
          {alerts.length > 0 ? (
            alerts.map((alert) => (
              <TouchableOpacity 
                key={alert.id}
                style={styles.alertCard}
                onPress={() => handleAlertPress(alert)}
              >
                <View style={styles.alertHeader}>
                  <View style={[styles.alertIcon, { backgroundColor: getSeverityColor(alert.severity) }]}>
                    <Text style={styles.alertIconText}>{getIncidentIcon(alert.type)}</Text>
                  </View>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertType}>
                      {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
                    </Text>
                    <View style={styles.alertMeta}>
                      <Text style={styles.alertDistance}>{formatDistance(alert.distance)} away</Text>
                      <Text style={styles.alertDot}> • </Text>
                      <Text style={styles.alertTime}>{formatTimestamp(alert.timestamp)}</Text>
                    </View>
                  </View>
                  <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(alert.severity) }]}>
                    <Text style={styles.severityText}>{alert.severity.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.alertDescription} numberOfLines={2}>
                  {alert.description}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>All Clear</Text>
              <Text style={styles.emptySubtitle}>
                No incidents reported within {NEARBY_RADIUS_KM}km of your location
              </Text>
            </View>
          )}
        </View>
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
    marginTop: 12,
    fontSize: 14,
    color: '#8b95a8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8b95a8',
    letterSpacing: 1,
  },
  badge: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  radiusInfo: {
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  radiusText: {
    fontSize: 13,
    color: '#9ba5b8',
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  alertCard: {
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertIconText: {
    fontSize: 20,
  },
  alertInfo: {
    flex: 1,
  },
  alertType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertDistance: {
    fontSize: 12,
    color: '#6a8eef',
    fontWeight: '600',
  },
  alertDot: {
    fontSize: 12,
    color: '#6b7280',
  },
  alertTime: {
    fontSize: 12,
    color: '#8b95a8',
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 10,
  },
  severityText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
  },
  alertDescription: {
    fontSize: 13,
    color: '#9ba5b8',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8b95a8',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default AlertsScreen;
