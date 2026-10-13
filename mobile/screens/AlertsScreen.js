import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../utils/firebase';
import CustomAlert from '../components/CustomAlert';
import SmoothModal from '../components/SmoothModal';
import GlobalBottomBar from '../components/GlobalBottomBar';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

const humanize = (str) => {
  if (!str) return 'Notice';
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const getTimeValue = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const formatRelativeTime = (value) => {
  const ms = getTimeValue(value);
  if (!ms) return 'Recently';
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatNotificationTime = (value) => {
  const ms = getTimeValue(value);
  if (!ms) return 'Time unavailable';
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const isUrgentNotification = (item) => {
  if (!item) return false;
  const type = String(item.type || '').toLowerCase();
  const priority = String(item.priority || item.severity || '').toLowerCase();
  return (
    priority === 'high' ||
    type === 'police_urgent_report' ||
    type === 'response_update' ||
    type.includes('sos') ||
    type.includes('urgent')
  );
};

const shouldLinkNotificationToReports = (item) => {
  if (!item?.incidentId) return false;
  return item.source !== 'police_admin' && item.type !== 'police_operation_report';
};

const AlertsScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread' | 'urgent'
  const [selectedNotification, setSelectedNotification] = useState(null);

  // Custom alert dialog state
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
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  };

  // Real-time Firestore subscription to user's dynamic notifications
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setNotifications([]);
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
        console.error('[AlertsScreen] Error loading real-time notifications:', error);
        setNotifications([]);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    // onSnapshot is already real-time; brief timeout provides tactile pull feedback
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  const markNotificationRead = async (item) => {
    if (!item || item.read || item.readAt || typeof item.id !== 'string') return;

    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === item.id
          ? { ...notif, read: true, readAt: notif.readAt || new Date().toISOString() }
          : notif
      )
    );

    try {
      await updateDoc(doc(db, 'notifications', item.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('[AlertsScreen] Failed marking notification as read in Firestore:', error);
    }
  };

  const toggleNotificationReadStatus = async (item) => {
    if (!item || typeof item.id !== 'string') return;
    const isCurrentlyRead = Boolean(item.read || item.readAt);
    const nextRead = !isCurrentlyRead;

    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === item.id
          ? { ...notif, read: nextRead, readAt: nextRead ? new Date().toISOString() : null }
          : notif
      )
    );

    if (selectedNotification?.id === item.id) {
      setSelectedNotification((prev) =>
        prev ? { ...prev, read: nextRead, readAt: nextRead ? new Date().toISOString() : null } : null
      );
    }

    try {
      await updateDoc(doc(db, 'notifications', item.id), {
        read: nextRead,
        readAt: nextRead ? serverTimestamp() : null,
      });
    } catch (error) {
      console.warn('[AlertsScreen] Failed toggling read state:', error);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((item) => !item.read && !item.readAt && typeof item.id === 'string');
    if (unread.length === 0) {
      showAlert('All Caught Up', 'You have no unread notifications.', 'info');
      return;
    }

    // Optimistic update
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, read: true, readAt: item.readAt || new Date().toISOString() }))
    );

    try {
      const batch = writeBatch(db);
      unread.forEach((item) => {
        batch.update(doc(db, 'notifications', item.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showAlert('Marked as Read', 'All notifications have been marked as read.', 'success');
    } catch (error) {
      console.error('[AlertsScreen] Error marking all notifications read:', error);
      showAlert('Notice', 'Some notifications could not be updated in the cloud.', 'info');
    }
  };

  const openNotification = async (item) => {
    setSelectedNotification(item);
    await markNotificationRead(item);
  };

  const getAlertIconName = (type) => {
    const val = String(type || '').toLowerCase();
    if (val === 'police_urgent_report' || val.includes('sos')) return 'alert-circle';
    if (val === 'response_update') return 'shield-checkmark';
    if (val === 'crime') return 'warning';
    if (val === 'safety' || val === 'report_verified') return 'checkmark-circle';
    if (val === 'report_rejected') return 'close-circle';
    if (val === 'precinct' || val.includes('police')) return 'shield';
    if (val === 'theft') return 'alert-circle';
    if (val === 'meeting' || val === 'community') return 'megaphone';
    return 'notifications';
  };

  const getAlertColor = (type, priority) => {
    if (priority === 'high') return '#dc2626';
    const val = String(type || '').toLowerCase();
    if (val === 'police_urgent_report' || val.includes('sos') || val === 'response_update') return '#dc2626';
    if (val === 'crime' || val === 'theft') return '#ea580c';
    if (val === 'safety' || val === 'report_verified') return '#10b981';
    if (val === 'report_rejected') return '#ef4444';
    if (val === 'precinct' || val.includes('police')) return '#0284c7';
    if (val === 'meeting' || val === 'community') return '#0284c7';
    return '#64748b';
  };

  const getAlertBgColor = (type, priority) => {
    if (priority === 'high') return '#fef2f2';
    const val = String(type || '').toLowerCase();
    if (val === 'police_urgent_report' || val.includes('sos') || val === 'response_update') return '#fef2f2';
    if (val === 'crime' || val === 'theft') return '#fff7ed';
    if (val === 'safety' || val === 'report_verified') return '#ecfdf5';
    if (val === 'report_rejected') return '#fef2f2';
    if (val === 'precinct' || val.includes('police')) return '#f0f9ff';
    if (val === 'meeting' || val === 'community') return '#f0f9ff';
    return '#f8fafc';
  };

  // Filter calculations
  const unreadCount = notifications.filter((a) => !a.read && !a.readAt).length;
  const urgentCount = notifications.filter(isUrgentNotification).length;

  const filteredAlerts = notifications.filter((item) => {
    if (filterTab === 'unread') return !item.read && !item.readAt;
    if (filterTab === 'urgent') return isUrgentNotification(item);
    return true;
  });

  const renderNotificationDetailModal = () => {
    if (!selectedNotification) return null;

    const isLinkedToReport = shouldLinkNotificationToReports(selectedNotification);
    const locationText = selectedNotification.location?.address;
    const message = selectedNotification.body || selectedNotification.description || 'No message provided.';
    const selectedType = selectedNotification.type || 'notification';
    const selectedPriority = selectedNotification.priority || selectedNotification.severity || 'normal';
    const selectedColor = getAlertColor(selectedType, selectedPriority);
    const selectedBgColor = getAlertBgColor(selectedType, selectedPriority);
    const isCurrentlyRead = Boolean(selectedNotification.read || selectedNotification.readAt);

    return (
      <SmoothModal
        visible={!!selectedNotification}
        onRequestClose={() => setSelectedNotification(null)}
        position="center"
        overlayStyle={styles.notificationDetailOverlay}
        contentStyle={styles.notificationDetailCard}
      >
        {/* Modal Header */}
        <View style={styles.notificationDetailHeader}>
          <View style={[styles.notificationDetailIcon, { backgroundColor: selectedBgColor }]}>
            <Ionicons name={getAlertIconName(selectedType)} size={28} color={selectedColor} />
          </View>
          <View style={styles.notificationDetailTitleBlock}>
            <Text style={[styles.notificationDetailEyebrow, { color: selectedColor }]}>
              {selectedPriority === 'high' ? 'CRITICAL ALERT' : 'SAFETY NOTICE'}
            </Text>
            <Text style={styles.notificationDetailTitle}>
              {selectedNotification.title || humanize(selectedType)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.notificationDetailClose}
            onPress={() => setSelectedNotification(null)}
            activeOpacity={0.8}
            accessibilityLabel="Close notification details"
          >
            <Ionicons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.notificationDetailScroll} showsVerticalScrollIndicator={false}>
          {/* Main Message Panel */}
          <View style={styles.notificationMessagePanel}>
            <Text style={styles.notificationMessageText}>{message}</Text>
          </View>

          {/* Responder Dispatch Details (if help is on the way) */}
          {selectedNotification.responder?.precinctName ? (
            <View style={styles.responderCard}>
              <View style={styles.responderCardHeader}>
                <Ionicons name="shield-checkmark" size={18} color="#0284c7" />
                <Text style={styles.responderCardTitle}>Assigned Response Unit</Text>
              </View>
              <Text style={styles.responderName}>{selectedNotification.responder.precinctName}</Text>
              <View style={styles.responderMetricsRow}>
                {selectedNotification.response?.distanceKm ? (
                  <View style={styles.responderMetric}>
                    <Text style={styles.responderMetricLabel}>DISTANCE</Text>
                    <Text style={styles.responderMetricValue}>
                      {Number(selectedNotification.response.distanceKm).toFixed(1)} km
                    </Text>
                  </View>
                ) : null}
                {selectedNotification.response?.etaMinutes ? (
                  <View style={styles.responderMetric}>
                    <Text style={styles.responderMetricLabel}>ESTIMATED ETA</Text>
                    <Text style={[styles.responderMetricValue, { color: '#dc2626' }]}>
                      {selectedNotification.response.etaMinutes} min
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Metadata Grid */}
          <View style={styles.notificationMetaGrid}>
            <View style={styles.notificationMetaCard}>
              <Text style={styles.notificationMetaLabel}>Category</Text>
              <Text style={styles.notificationMetaValue}>{humanize(selectedType)}</Text>
            </View>
            <View style={styles.notificationMetaCard}>
              <Text style={styles.notificationMetaLabel}>Priority</Text>
              <Text style={[styles.notificationMetaValue, { color: selectedColor }]}>
                {selectedPriority.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Time Received */}
          <View style={styles.notificationInfoRow}>
            <View style={styles.notificationInfoIcon}>
              <Ionicons name="time-outline" size={18} color="#dc2626" />
            </View>
            <View style={styles.notificationInfoCopy}>
              <Text style={styles.notificationInfoLabel}>Time Received</Text>
              <Text style={styles.notificationInfoText}>
                {formatNotificationTime(selectedNotification.sentAt || selectedNotification.timestamp)}
              </Text>
            </View>
          </View>

          {/* Location */}
          {locationText ? (
            <View style={styles.notificationInfoRow}>
              <View style={styles.notificationInfoIcon}>
                <Ionicons name="location-outline" size={18} color="#dc2626" />
              </View>
              <View style={styles.notificationInfoCopy}>
                <Text style={styles.notificationInfoLabel}>Location</Text>
                <Text style={styles.notificationInfoText}>{locationText}</Text>
              </View>
            </View>
          ) : null}

          {/* Linked Report Notice */}
          {isLinkedToReport ? (
            <View style={styles.notificationLinkedPanel}>
              <Ionicons name="document-text-outline" size={18} color="#dc2626" />
              <Text style={styles.notificationLinkedText}>
                This notification is connected to your active incident report.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Modal Action Buttons */}
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
              <Ionicons name="document-text" size={17} color="#ffffff" />
              <Text style={styles.notificationDetailPrimaryText}>View Report</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.notificationDetailButton, styles.notificationDetailSecondary]}
            onPress={() => toggleNotificationReadStatus(selectedNotification)}
            activeOpacity={0.86}
          >
            <Ionicons
              name={isCurrentlyRead ? 'mail-unread-outline' : 'checkmark-done-outline'}
              size={17}
              color="#475569"
            />
            <Text style={styles.notificationDetailSecondaryText}>
              {isCurrentlyRead ? 'Mark as Unread' : 'Mark as Read'}
            </Text>
          </TouchableOpacity>

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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerNew}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="notifications" size={22} color="#dc2626" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerNewTitle}>Safety Alerts</Text>
              <Text style={styles.headerSubtitle}>Valenzuela City real-time emergency dispatch</Text>
            </View>
          </View>
        </View>
        <LinearGradient
          colors={['transparent', 'rgba(220, 38, 38, 0.45)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerLaserLine}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Syncing Valenzuela safety network...</Text>
        </View>
        <GlobalBottomBar navigation={navigation} activeTab="Alerts" />
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
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="notifications" size={22} color="#dc2626" />
                {unreadCount > 0 && <View style={styles.headerUnreadDot} />}
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.headerNewTitle}>Safety Alerts</Text>
                <Text style={styles.headerSubtitle}>Valenzuela City real-time emergency dispatch</Text>
              </View>
            </View>
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(220, 38, 38, 0.45)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerLaserLine}
          />

          {/* Interactive Filter Tabs & Quick Bulk Action */}
          <View style={styles.tabsContainer}>
            <View style={styles.tabsPillsRow}>
              <TouchableOpacity
                style={[styles.tab, filterTab === 'all' && styles.tabActive]}
                onPress={() => setFilterTab('all')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, filterTab === 'all' && styles.tabTextActive]}>
                  All ({notifications.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, filterTab === 'unread' && styles.tabActive]}
                onPress={() => setFilterTab('unread')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, filterTab === 'unread' && styles.tabTextActive]}>
                  Unread ({unreadCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, filterTab === 'urgent' && styles.tabActive]}
                onPress={() => setFilterTab('urgent')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, filterTab === 'urgent' && styles.tabTextActive]}>
                  Urgent ({urgentCount})
                </Text>
              </TouchableOpacity>
            </View>

            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.markAllReadBtn}
                onPress={markAllRead}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done" size={14} color="#dc2626" style={{ marginRight: 4 }} />
                <Text style={styles.markAllReadText}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Dynamic Notifications List */}
          <View style={styles.content}>
            {filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert, index) => {
                const isUnread = !alert.read && !alert.readAt;
                const isUrgent = isUrgentNotification(alert);
                const accentColor = getAlertColor(alert.type, alert.priority || alert.severity);
                const iconBgColor = getAlertBgColor(alert.type, alert.priority || alert.severity);
                const iconName = getAlertIconName(alert.type);
                const relTime = formatRelativeTime(alert.sentAt || alert.timestamp);
                const titleText = alert.title || humanize(alert.type);
                const bodyText = alert.body || alert.description || 'No additional details provided.';

                return (
                  <TouchableOpacity
                    key={alert.id || `alert-${index}`}
                    onPress={() => openNotification(alert)}
                    activeOpacity={0.85}
                    style={[
                      styles.notificationCard,
                      {
                        borderLeftColor: accentColor,
                        backgroundColor: isUnread ? '#fffbfb' : '#ffffff',
                        borderColor: isUnread ? '#fee2e2' : '#f1f5f9',
                      },
                    ]}
                  >
                    <View style={styles.notificationCardTopRow}>
                      <View
                        style={[
                          styles.notificationIcon,
                          { backgroundColor: iconBgColor, borderColor: accentColor },
                        ]}
                      >
                        <Ionicons name={iconName} size={20} color={accentColor} />
                      </View>
                      <View style={styles.notificationMainColumn}>
                        <View style={styles.notificationMetaHeaderRow}>
                          <View style={styles.notificationTitleRow}>
                            {isUnread && <View style={styles.unreadPulseDot} />}
                            <Text style={styles.notificationTitle} numberOfLines={1}>
                              {titleText}
                            </Text>
                          </View>
                          <Text style={styles.notificationTimeText}>{relTime}</Text>
                        </View>

                        {/* Badges: Urgent / Assigned Station / ETA */}
                        <View style={styles.badgeRow}>
                          {isUrgent && (
                            <View style={styles.urgentBadge}>
                              <Ionicons name="flame" size={11} color="#dc2626" style={{ marginRight: 3 }} />
                              <Text style={styles.urgentBadgeText}>URGENT</Text>
                            </View>
                          )}
                          {alert.responder?.precinctName && (
                            <View style={styles.precinctBadge}>
                              <Ionicons
                                name="shield-checkmark"
                                size={11}
                                color="#0284c7"
                                style={{ marginRight: 3 }}
                              />
                              <Text style={styles.precinctBadgeText} numberOfLines={1}>
                                {alert.responder.precinctName}
                              </Text>
                            </View>
                          )}
                          {alert.response?.etaMinutes && (
                            <View style={styles.etaBadge}>
                              <Ionicons name="time" size={11} color="#15803d" style={{ marginRight: 3 }} />
                              <Text style={styles.etaBadgeText}>ETA {alert.response.etaMinutes}m</Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.notificationBody} numberOfLines={2}>
                          {bodyText}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyRadarCircle}>
                  <View style={styles.emptyRadarRingOuter} />
                  <View style={styles.emptyRadarRingInner} />
                  <View style={styles.emptyIconBadge}>
                    <Ionicons name="shield-checkmark" size={32} color="#dc2626" />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>
                  {filterTab === 'unread'
                    ? 'No Unread Alerts'
                    : filterTab === 'urgent'
                    ? 'No Critical Emergencies'
                    : 'All Clear in Valenzuela'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {filterTab === 'unread'
                    ? 'You have reviewed all safety notifications.'
                    : filterTab === 'urgent'
                    ? 'No high-priority alerts are active right now.'
                    : 'The city safety grid is monitoring 24/7. Any verified incidents or emergency dispatches near you will appear here.'}
                </Text>
                {filterTab !== 'all' ? (
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => setFilterTab('all')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyActionButtonText}>View All Notices</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => navigation.navigate('Home')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="map-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyActionButtonText}>Check Live Map</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Bottom Spacer to ensure last card scrolls above bottom bar */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Global Bottom Navigation Bar */}
        <GlobalBottomBar navigation={navigation} activeTab="Alerts" />
      </View>

      {/* Custom Alert Modal */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
        autoCloseDelay={4000}
      />

      {/* Rich Notification Detail SmoothModal */}
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
    paddingVertical: 100,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },

  // Header Styles
  headerNew: {
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  headerLaserLine: {
    height: 1.5,
    width: '100%',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    position: 'relative',
  },
  headerUnreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dc2626',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  headerCopy: {
    flex: 1,
  },
  headerNewTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    lineHeight: 18,
  },

  // Filter Tabs
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabsPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  tabActive: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#dc2626',
    fontWeight: '900',
  },
  markAllReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  markAllReadText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
  },

  // Content Area
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  notificationCard: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 4,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  notificationCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  notificationMainColumn: {
    flex: 1,
  },
  notificationMetaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  unreadPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#dc2626',
    marginRight: 6,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  notificationTimeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  precinctBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 160,
  },
  precinctBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  etaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
  },
  notificationBody: {
    fontSize: 13.5,
    color: '#475569',
    lineHeight: 19,
    fontWeight: '500',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyRadarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  emptyRadarRingOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  emptyRadarRingInner: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  emptyIconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 22,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyActionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Modal Details
  notificationDetailOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  notificationDetailCard: {
    width: '100%',
    maxHeight: '84%',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    overflow: 'hidden',
  },
  notificationDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  notificationDetailIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  notificationDetailTitleBlock: {
    flex: 1,
  },
  notificationDetailEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  notificationDetailTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: 24,
  },
  notificationDetailClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  notificationDetailScroll: {
    maxHeight: 460,
  },
  notificationMessagePanel: {
    margin: 16,
    marginBottom: 12,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 16,
    padding: 14,
  },
  notificationMessageText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
    lineHeight: 22,
  },
  responderCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 16,
    padding: 14,
  },
  responderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  responderCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0284c7',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  responderName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
  },
  responderMetricsRow: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0f2fe',
    paddingTop: 8,
  },
  responderMetric: {
    flex: 1,
  },
  responderMetricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2,
  },
  responderMetricValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0284c7',
  },
  notificationMetaGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  notificationMetaCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
  },
  notificationMetaLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  notificationMetaValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '900',
  },
  notificationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 10,
  },
  notificationInfoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  notificationInfoCopy: {
    flex: 1,
  },
  notificationInfoLabel: {
    fontSize: 10.5,
    color: '#dc2626',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notificationInfoText: {
    fontSize: 13,
    color: '#334151',
    fontWeight: '700',
  },
  notificationLinkedPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  notificationLinkedText: {
    flex: 1,
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  notificationDetailActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  notificationDetailButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  notificationDetailPrimary: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  notificationDetailSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  notificationDetailPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  notificationDetailSecondaryText: {
    color: '#334151',
    fontSize: 13.5,
    fontWeight: '800',
  },

  bottomSpacer: {
    height: 120,
  },
});

export default AlertsScreen;
