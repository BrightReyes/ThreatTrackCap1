import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import CustomAlert from '../components/CustomAlert';

const StatusScreen = () => {
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
      <LinearGradient
        colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
        locations={[0, 0.3, 0.6, 0.85, 1]}
        style={styles.container}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6a8eef" />
          <Text style={styles.loadingText}>Loading your reports...</Text>
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
          <Text style={styles.headerTitle}>MY REPORTS</Text>
          <Text style={styles.headerSubtitle}>{stats.total} Total</Text>
        </View>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { borderColor: '#10b981' }]}>
            <Text style={styles.statNumber}>{stats.verified}</Text>
            <Text style={styles.statLabel}>Verified</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#f59e0b' }]}>
            <Text style={styles.statNumber}>{stats.under_review}</Text>
            <Text style={styles.statLabel}>Reviewing</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#dc2626' }]}>
            <Text style={styles.statNumber}>{stats.rejected}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
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
                <View style={styles.incidentHeader}>
                  <View style={styles.incidentLeft}>
                    <View style={[
                      styles.incidentIcon,
                      { backgroundColor: getSeverityColor(incident.severity) }
                    ]}>
                      <Text style={styles.incidentIconText}>{getIncidentIcon(incident.type)}</Text>
                    </View>
                    <View style={styles.incidentInfo}>
                      <Text style={styles.incidentType}>
                        {incident.type.charAt(0).toUpperCase() + incident.type.slice(1)}
                      </Text>
                      <Text style={styles.incidentTime}>{formatTimestamp(incident.timestamp)}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(incident.status) }]}>
                    <Text style={styles.statusIcon}>{getStatusIcon(incident.status)}</Text>
                    <Text style={styles.statusText}>
                      {incident.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.incidentDescription} numberOfLines={2}>
                  {incident.description}
                </Text>
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
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8b95a8',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6a8eef',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a2d52',
    borderWidth: 2,
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#8b95a8',
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  incidentCard: {
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  incidentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  incidentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  incidentIconText: {
    fontSize: 18,
  },
  incidentInfo: {
    flex: 1,
  },
  incidentType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  incidentTime: {
    fontSize: 12,
    color: '#8b95a8',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 10,
  },
  statusIcon: {
    fontSize: 12,
    color: '#ffffff',
    marginRight: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  incidentDescription: {
    fontSize: 13,
    color: '#9ba5b8',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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

export default StatusScreen;
