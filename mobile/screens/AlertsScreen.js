import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, Image, StatusBar } from 'react-native';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../utils/firebase';
import { getCurrentLocation, calculateDistance, formatDistance } from '../utils/location';
import CustomAlert from '../components/CustomAlert';
import SmoothModal from '../components/SmoothModal';

const NEARBY_RADIUS_KM = 5; // Alert for incidents within 5km
const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

const AlertsScreen = ({ navigation }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [selectedNotification, setSelectedNotification] = useState(null);

  // Sample notifications matching the image design
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'High Crime Activity Detected',
      description: 'Increased reports near Main Street area. Avoid if possible.',
      type: 'crime',
      badge: 'High Priority',
      read: false,
    },
    {
      id: 2,
      title: 'Safety Alert Resolved',
      description: 'Increased reports near Main Street area. Avoid if possible.',
      type: 'safety',
      badge: 'Resolved',
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

  const markNotificationRead = async (item) => {
    if (!item || item.read || item.readAt || typeof item.id !== 'string') return;

    setNotifications(prev => prev.map(notification => (
      notification.id === item.id
        ? { ...notification, read: true, readAt: notification.readAt || new Date().toISOString() }
        : notification
    )));

    try {
      await updateDoc(doc(db, 'notifications', item.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error marking notification read:', error);
      showAlert('Error', 'This notification could not be marked as read.', 'error');
    }
  };

  const openNotification = async (item) => {
    setSelectedNotification(item);
    await markNotificationRead(item);
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

  const getAlertIconName = (type) => {
    switch (type?.toLowerCase()) {
      case 'police_urgent_report': return 'alert-circle-outline';
      case 'response_update': return 'radio-outline';
      case 'crime': return 'warning-outline';
      case 'safety': return 'checkmark-circle-outline';
      case 'precinct': return 'shield-outline';
      case 'theft': return 'bag-handle-outline';
      case 'meeting': return 'people-outline';
      default: return 'information-circle-outline';
    }
  };

  const getAlertColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'police_urgent_report': return '#dc2626';
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
      case 'police_urgent_report': return '#fee2e2';
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
  const selectedType = selectedNotification?.type || 'notification';
  const selectedPriority = selectedNotification?.priority || selectedNotification?.severity || 'normal';
  const selectedColor = getAlertColor(selectedType);
  const selectedBgColor = getAlertBgColor(selectedType);
  const selectedTypeLabel = String(selectedType).replace(/_/g, ' ');

  const renderNotificationDetailModal = () => {
    if (!selectedNotification) return null;

    const isLinkedToReport = shouldLinkNotificationToReports(selectedNotification);
    const locationText = selectedNotification.location?.address;
    const message = selectedNotification.body || selectedNotification.description || 'No message provided.';

    return (
      <SmoothModal
        visible={!!selectedNotification}
        onRequestClose={() => setSelectedNotification(null)}
        position="center"
        overlayStyle={styles.notificationDetailOverlay}
        contentStyle={styles.notificationDetailCard}
      >
        <View style={styles.notificationDetailHeader}>
          <View style={[styles.notificationDetailIcon, { backgroundColor: selectedBgColor }]}>
            <Ionicons
              name={getAlertIconName(selectedType)}
              size={30}
              color={selectedColor}
            />
          </View>
          <View style={styles.notificationDetailTitleBlock}>
            <Text style={[styles.notificationDetailEyebrow, { color: selectedColor }]}>
              {selectedPriority === 'high' ? 'Priority alert' : 'Notification'}
            </Text>
            <Text style={styles.notificationDetailTitle}>
              {selectedNotification.title || selectedTypeLabel}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.notificationDetailClose}
            onPress={() => setSelectedNotification(null)}
            activeOpacity={0.82}
          >
            <Ionicons name="close-outline" size={24} color="#991b1b" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.notificationDetailScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.notificationMessagePanel}>
            <Text style={styles.notificationMessageText}>{message}</Text>
          </View>

          <View style={styles.notificationMetaGrid}>
            <View style={styles.notificationMetaCard}>
              <Text style={styles.notificationMetaLabel}>Type</Text>
              <Text style={styles.notificationMetaValue}>{selectedTypeLabel}</Text>
            </View>
            <View style={styles.notificationMetaCard}>
              <Text style={styles.notificationMetaLabel}>Priority</Text>
              <Text style={[styles.notificationMetaValue, { color: selectedColor }]}>
                {selectedPriority}
              </Text>
            </View>
          </View>

          <View style={styles.notificationInfoRow}>
            <View style={styles.notificationInfoIcon}>
              <Ionicons name="time-outline" size={19} color="#991b1b" />
            </View>
            <View style={styles.notificationInfoCopy}>
              <Text style={styles.notificationInfoLabel}>Received</Text>
              <Text style={styles.notificationInfoText}>
                {formatNotificationTime(selectedNotification.sentAt || selectedNotification.timestamp)}
              </Text>
            </View>
          </View>

          {locationText ? (
            <View style={styles.notificationInfoRow}>
              <View style={styles.notificationInfoIcon}>
                <Ionicons name="location-outline" size={19} color="#991b1b" />
              </View>
              <View style={styles.notificationInfoCopy}>
                <Text style={styles.notificationInfoLabel}>Location</Text>
                <Text style={styles.notificationInfoText}>{locationText}</Text>
              </View>
            </View>
          ) : null}

          {isLinkedToReport ? (
            <View style={styles.notificationLinkedPanel}>
              <Ionicons name="document-text-outline" size={20} color="#dc2626" />
              <Text style={styles.notificationLinkedText}>
                This notification is linked to your report status.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.notificationDetailActions}>
          {isLinkedToReport ? (
            <TouchableOpacity
              style={[styles.notificationDetailButton, styles.notificationDetailPrimary]}
              onPress={() => {
                setSelectedNotification(null);
                navigation.navigate('Status');
              }}
              activeOpacity={0.86}
            >
              <Ionicons name="document-text-outline" size={18} color="#ffffff" />
              <Text style={styles.notificationDetailPrimaryText}>View Reports</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.notificationDetailButton,
              isLinkedToReport ? styles.notificationDetailSecondary : styles.notificationDetailPrimary,
            ]}
            onPress={() => setSelectedNotification(null)}
            activeOpacity={0.86}
          >
            <Text
              style={
                isLinkedToReport
                  ? styles.notificationDetailSecondaryText
                  : styles.notificationDetailPrimaryText
              }
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>
    );
  };

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
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="notifications-outline" size={24} color="#ffffff" />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.headerNewTitle}>NOTIFICATIONS</Text>
                <Text style={styles.headerSubtitle}>Review safety alerts and response updates.</Text>
              </View>
            </View>
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
                  onPress={() => openNotification(alert)}
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
                        <Ionicons
                          name={getAlertIconName(alert.type)}
                          size={22}
                          color={getAlertColor(alert.type)}
                        />
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
                <View style={styles.emptyIcon}>
                  <Ionicons name="notifications-outline" size={34} color="#dc2626" />
                </View>
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
            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.replace('Home')}>
              <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />
              <Text style={styles.navBottomLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.replace('Status')}>
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
      {renderNotificationDetailModal()}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  headerCopy: {
    flex: 1,
  },
  headerNewTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '700',
    lineHeight: 19,
  },

  // Tabs
  tabsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tabActive: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  tabText: {
    fontSize: 14,
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
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    borderLeftColor: '#dc2626',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
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
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#fee2e2',
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 3,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 14,
    fontWeight: '900',
  },
  notificationBody: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginLeft: 54,
    fontWeight: '600',
  },
  notificationDetailOverlay: {
    backgroundColor: 'rgba(17, 24, 39, 0.58)',
  },
  notificationDetailCard: {
    width: '100%',
    maxHeight: '82%',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
  },
  notificationDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#fee2e2',
  },
  notificationDetailIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  notificationDetailTitleBlock: {
    flex: 1,
  },
  notificationDetailEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  notificationDetailTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 27,
  },
  notificationDetailClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  notificationDetailScroll: {
    maxHeight: 440,
  },
  notificationMessagePanel: {
    margin: 16,
    marginBottom: 12,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 14,
  },
  notificationMessageText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '800',
    lineHeight: 24,
  },
  notificationMetaGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  notificationMetaCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 16,
    padding: 12,
  },
  notificationMetaLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  notificationMetaValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  notificationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 16,
    padding: 12,
  },
  notificationInfoIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  notificationInfoCopy: {
    flex: 1,
  },
  notificationInfoLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  notificationInfoText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '700',
    lineHeight: 20,
  },
  notificationLinkedPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 12,
  },
  notificationLinkedText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginLeft: 9,
  },
  notificationDetailActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#fee2e2',
    backgroundColor: '#ffffff',
  },
  notificationDetailButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  notificationDetailPrimary: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7,
  },
  notificationDetailSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  notificationDetailPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  notificationDetailSecondaryText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '900',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
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
});

const getTimeValue = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const formatNotificationTime = (value) => {
  if (!value) return 'Time unavailable';
  const date = value.toDate
    ? value.toDate()
    : value.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return 'Time unavailable';

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const shouldLinkNotificationToReports = (item) => {
  if (!item?.incidentId) return false;
  return item.source !== 'police_admin' && item.type !== 'police_operation_report';
};

export default AlertsScreen;
