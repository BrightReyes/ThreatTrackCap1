import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, Image } from 'react-native';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import { getCurrentLocation, calculateDistance, formatDistance } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

const NEARBY_RADIUS_KM = 5; // Alert for incidents within 5km

const AlertsScreen = ({ navigation }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [filterTab, setFilterTab] = useState('all');

  // Sample notifications matching the image design
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'High Crime Activity Detected',
      description: 'Increased reports near Main Street area. Avoid if possible.',
      type: 'crime',
      badge: '⚠️ High Priority',
      read: false,
    },
    {
      id: 2,
      title: 'Safety Alert Resolved',
      description: 'Increased reports near Main Street area. Avoid if possible.',
      type: 'safety',
      badge: '✓ Resolved',
      read: false,
    },
    {
      id: 3,
      title: 'Precinct Office Hours Updated',
      description: 'Central Police Station now open 24/7 for emergencies.',
      type: 'precinct',
      badge: null,
      read: true,
    },
    {
      id: 4,
      title: 'Theft Reported Nearby',
      description: 'Vehicle break-in reported at 5th Ave parking lot.',
      type: 'theft',
      badge: null,
      read: true,
    },
    {
      id: 5,
      title: 'Community Safety Meeting',
      description: 'Join us this Friday at 8 PM for a community safety discussion.',
      type: 'meeting',
      badge: null,
      read: true,
    },
  ]);

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
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return undefined;
    }

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextNotifications = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() }))
          .sort((a, b) => getTimeValue(b.sentAt || b.timestamp) - getTimeValue(a.sentAt || a.timestamp));

        setNotifications(nextNotifications);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('Error loading notifications:', error);
        setNotifications([]);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 500);
  };

  const markAllRead = async () => {
    const unread = notifications.filter(item => !item.read && !item.readAt && typeof item.id === 'string');
    setNotifications(prev => prev.map(item => ({ ...item, read: true, readAt: item.readAt || new Date().toISOString() })));

    try {
      await Promise.all(
        unread.map(item => updateDoc(doc(db, 'notifications', item.id), {
          read: true,
          readAt: serverTimestamp(),
        }))
      );
      showAlert('Marked read', 'All notifications were marked as read.', 'success');
    } catch (error) {
      console.error('Error marking notifications read:', error);
      showAlert('Error', 'Some notifications could not be updated.', 'error');
    }
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      </View>
    );
  }

  const getAlertIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'response_update': return '!';
      case 'crime': return '⚠️';
      case 'safety': return '✓';
      case 'precinct': return '🛡️';
      case 'theft': return '⚠️';
      case 'meeting': return '✓';
      default: return 'ℹ️';
    }
  };

  const getAlertColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'response_update': return '#dc2626';
      case 'crime': return '#dc2626';
      case 'safety': return '#10b981';
      case 'precinct': return '#3b82f6';
      case 'theft': return '#f59e0b';
      case 'meeting': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getAlertBgColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'response_update': return '#fee2e2';
      case 'crime': return '#fee2e2';
      case 'safety': return '#d1fae5';
      case 'precinct': return '#dbeafe';
      case 'theft': return '#fef3c7';
      case 'meeting': return '#dbeafe';
      default: return '#f3f4f6';
    }
  };

  const filteredAlerts = filterTab === 'all' ? notifications : notifications.filter(a => !a.read && !a.readAt);
  const unreadCount = notifications.filter(a => !a.read && !a.readAt).length;

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
            <Text style={styles.headerNewTitle}>NOTIFICATIONS NEW</Text>
          </View>

          {/* Filter Tabs */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[styles.tab, filterTab === 'all' && styles.tabActive]}
              onPress={() => setFilterTab('all')}
            >
              <Text style={[styles.tabText, filterTab === 'all' && styles.tabTextActive]}>All ({notifications.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tab, filterTab === 'unread' && styles.tabActive]}
              onPress={() => setFilterTab('unread')}
            >
              <Text style={[styles.tabText, filterTab === 'unread' && styles.tabTextActive]}>Unread ({unreadCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={markAllRead}>
              <Text style={styles.tabText}>Mark all read</Text>
            </TouchableOpacity>
          </View>

          {/* Notifications List */}
          <View style={styles.content}>
            {filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert, index) => (
                <TouchableOpacity
                  key={alert.id || index}
                  style={[
                    styles.notificationCard,
                    { 
                      borderLeftColor: getAlertColor(alert.type),
                      backgroundColor: alert.read || alert.readAt ? '#ffffff' : '#fff7f7'
                    }
                  ]}
                >
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <View style={[styles.notificationIcon, { backgroundColor: getAlertBgColor(alert.type) }]}>
                        <Text style={styles.notificationIconText}>{getAlertIcon(alert.type)}</Text>
                      </View>
                      <View style={styles.notificationTextContainer}>
                        <Text style={styles.notificationTitle}>{alert.title || alert.type}</Text>
                        {(alert.badge || alert.priority === 'high' || alert.severity === 'high') && (
                          <View style={styles.badgeContainer}>
                            <Text style={styles.badge}>{alert.badge || 'High Priority'}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={styles.notificationBody}>{alert.body || alert.description}</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔔</Text>
                <Text style={styles.emptyTitle}>No Notifications</Text>
                <Text style={styles.emptySubtitle}>You're all caught up!</Text>
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
            <View style={styles.sosGlowRing} />
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
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  headerNewTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1.2,
  },

  // Tabs
  tabsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#dc2626',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
  },
  tabTextActive: {
    color: '#dc2626',
  },

  // Content Area
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  notificationCard: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderLeftColor: '#dc2626',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#fee2e2',
  },
  notificationIconText: {
    fontSize: 16,
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 2,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#dbeafe',
    color: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    fontSize: 11,
    fontWeight: '700',
  },
  notificationBody: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
    marginLeft: 42,
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
});

const getTimeValue = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export default AlertsScreen;
