import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, Image } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import CustomAlert from '../components/CustomAlert';

const StatusScreen = ({ navigation }) => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ verified: 0, under_review: 0, rejected: 0, total: 0 });

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
    fetchMyIncidents();
  }, []);

  const fetchMyIncidents = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log('No user logged in');
        setLoading(false);
        return;
      }

      const incidentsRef = collection(db, 'incidents');
      const q = query(
        incidentsRef,
        where('reporterId', '==', currentUser.uid)
      );

      const querySnapshot = await getDocs(q);
      const fetchedIncidents = [];
      
      querySnapshot.forEach((doc) => {
        fetchedIncidents.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      // Sort locally by timestamp
      fetchedIncidents.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const bTime = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return bTime - aTime;
      });

      setIncidents(fetchedIncidents);
      
      // Calculate statistics
      const verified = fetchedIncidents.filter(i => i.status === 'verified').length;
      const under_review = fetchedIncidents.filter(i => i.status === 'under_review').length;
      const rejected = fetchedIncidents.filter(i => i.status === 'rejected').length;
      
      setStats({
        verified,
        under_review,
        rejected,
        total: fetchedIncidents.length
      });

      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error fetching incidents:', error);
      setLoading(false);
      setRefreshing(false);
      showAlert('Error', 'Failed to load your incidents', 'error');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyIncidents();
  };

  const handleSOSPress = async () => {
    try {
      // Import getCurrentLocation here since StatusScreen doesn't have it
      const { getCurrentLocation } = require('../utils/location');
      const location = await getCurrentLocation();
      navigation.navigate('SOSReport', { userLocation: location });
    } catch (error) {
      console.error('Error getting location for SOS:', error);
      // Navigate anyway without location, SOS screen will handle it
      navigation.navigate('SOSReport');
    }
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'verified': return '#10b981';
      case 'under_review': return '#f59e0b';
      case 'rejected': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'verified': return '✓';
      case 'under_review': return '⏳';
      case 'rejected': return '✗';
      default: return '?';
    }
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

  const getLocationDisplay = (location) => {
    if (!location) return 'Location not specified';
    
    // If location has address property, use it
    if (location.address) {
      return location.address;
    }
    
    // If location has coordinates, format them
    if (location.latitude && location.longitude) {
      return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
    }
    
    return 'Location not specified';
  };

  const handleIncidentPress = (incident) => {
    showAlert(
      `${incident.type.charAt(0).toUpperCase() + incident.type.slice(1)} Report`,
      `Status: ${incident.status.replace('_', ' ').toUpperCase()}\n\n${incident.description}\n\nReported: ${formatTimestamp(incident.timestamp)}`,
      'info',
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading your reports...</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
          }
        >
          {/* Header */}
          <View style={styles.headerNew}>
            <Text style={styles.headerNewTitle}>REPORT STATUS</Text>
          </View>

          {/* Statistics Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total Reports</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.under_review}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.verified}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
          </View>

          {/* Incidents List */}
          <View style={styles.content}>
            {incidents.length > 0 ? (
              incidents.map((incident) => (
                <TouchableOpacity 
                  key={incident.id} 
                  style={styles.incidentCard}
                  onPress={() => handleIncidentPress(incident)}
                >
                  <View style={styles.incidentRowTop}>
                    <Text style={styles.incidentTitle}>{incident.type.charAt(0).toUpperCase() + incident.type.slice(1)}</Text>
                    <View style={styles.rowRightTop}>
                      <View style={styles.updateBadge}>
                        <Text style={styles.updateBadgeText}>{incident.updatesCount || 2} updates</Text>
                      </View>
                      {incident.status === 'under_review' && (
                        <View style={styles.investigationPill}>
                          <Text style={styles.investigationPillText}>🔍 Under Investigation</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Text style={styles.incidentBody} numberOfLines={2}>{incident.description}</Text>

                  <View style={styles.incidentRowBottom}>
                    <Text style={styles.incidentLocation}>📍 {getLocationDisplay(incident.location)}</Text>
                    <Text style={styles.detailsLink}>Details ›</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyTitle}>No Reports Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Your submitted incident reports will appear here
                </Text>
              </View>
            )}
          </View>

          {/* Bottom Spacer */}
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
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  
  // Header Styles
  headerNew: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
  headerNewTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1.2,
  },

  // Statistics Cards
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#dc2626',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'center',
  },

  // Content Area
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  incidentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  incidentRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  incidentTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    flex: 1,
  },
  rowRightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  updateBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginRight: 8,
  },
  updateBadgeText: {
    color: '#0284c7',
    fontSize: 11,
    fontWeight: '700',
  },
  investigationPill: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  investigationPillText: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '700',
  },
  incidentBody: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 10,
    lineHeight: 18,
  },
  incidentRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incidentLocation: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  },
  detailsLink: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 13,
  },

  // Empty State
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
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
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
});

export default StatusScreen;
