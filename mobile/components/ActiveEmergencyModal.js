import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import SmoothModal from './SmoothModal';

const TRACKING_STEPS = ['Submitted', 'Review', 'Responder'];

const STATUS_META = {
  responding: {
    label: 'Help On The Way',
    shortLabel: 'Responding',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 3,
    assurance: 'A responder has acknowledged your report. Keep your phone reachable and stay in a safe place.',
  },
  verified: {
    label: 'Verified',
    shortLabel: 'Verified',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    step: 3,
    assurance: 'Your report was validated and is available for responder review.',
  },
  under_review: {
    label: 'Under Review',
    shortLabel: 'Review',
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    step: 2,
    assurance: 'Your report is in the review queue. Keep your phone reachable for possible updates.',
  },
  pending: {
    label: 'Submitted',
    shortLabel: 'Submitted',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'Your report was received and is waiting for review.',
  },
  submitted: {
    label: 'Submitted',
    shortLabel: 'Submitted',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'Your report was received and is waiting for review.',
  },
  open: {
    label: 'Responder Review',
    shortLabel: 'Active',
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    step: 3,
    assurance: 'Your report is active for responder coordination.',
  },
  done: {
    label: 'Completed',
    shortLabel: 'Done',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    step: 3,
    assurance: 'This emergency report has been marked resolved.',
  },
};

const getStatusMeta = (status) => {
  return STATUS_META[status] || STATUS_META.under_review;
};

const getStatusIconName = (status) => {
  const meta = getStatusMeta(status);
  if (status === 'responding') return 'radio-outline';
  if (meta.step >= 3) return 'checkmark-circle-outline';
  if (meta.step === 2) return 'time-outline';
  return 'alert-circle-outline';
};

const getSeverityColor = (severity) => {
  const lower = String(severity || '').toLowerCase();
  if (lower === 'high') return '#dc2626';
  if (lower === 'medium') return '#b45309';
  if (lower === 'low') return '#047857';
  return '#dc2626';
};

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Just now';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

const ActiveEmergencyModal = ({
  incident,
  visible,
  onClose,
  onResolveSafe,
  distressPingsCount = 1,
  lastDistressBroadcastTime = '',
  currentLocation = null,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [confirmSafeVisible, setConfirmSafeVisible] = React.useState(false);
  const [isResolving, setIsResolving] = React.useState(false);

  useEffect(() => {
    let animation;
    if (visible) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.22,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    }
    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [visible]);

  if (!incident) return null;

  const displayStatus = incident.status || 'under_review';
  const meta = getStatusMeta(displayStatus);
  const currentStep = meta.step || 2;
  const severityColor = getSeverityColor(incident.severity);

  const response = incident.response || {};
  const responder = incident.responder || response.responder || {};
  const hasResponder = displayStatus === 'responding' && (responder.precinctName || responder.name);

  const handleCall = async (phone) => {
    const cleanNumber = String(phone || '83524000').replace(/[^0-9+]/g, '');
    const telUrl = `tel:${cleanNumber}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (canOpen) {
        await Linking.openURL(telUrl);
      } else {
        Alert.alert('Dialer Unavailable', `Please dial ${cleanNumber} manually on your phone.`);
      }
    } catch (err) {
      console.warn('Call error:', err.message);
    }
  };

  const handleSafePress = () => {
    setConfirmSafeVisible(true);
  };

  const handleConfirmSafeResolution = async () => {
    setIsResolving(true);
    try {
      if (incident.id) {
        const incidentRef = doc(db, 'incidents', incident.id);
        await updateDoc(incidentRef, {
          status: 'done',
          responseStatus: 'completed',
          liveStreamingActive: false,
          distressResolvedAt: serverTimestamp(),
          completedAt: serverTimestamp(),
          resolutionReason: 'user_marked_safe',
        });
      }
    } catch (err) {
      console.warn('Could not update safe status in Firestore:', err.message);
    } finally {
      setIsResolving(false);
      setConfirmSafeVisible(false);
      if (onResolveSafe) {
        onResolveSafe();
      }
    }
  };

  const lat = currentLocation?.latitude || incident.location?.latitude;
  const lng = currentLocation?.longitude || incident.location?.longitude;
  const coordsText = (lat && lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Broadcasting GPS...';

  return (
    <SmoothModal
      visible={visible}
      onRequestClose={onClose}
      overlayStyle={styles.backdrop}
      contentStyle={styles.sheet}
    >
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>REPORT TRACKING</Text>
          <Text style={styles.title}>{incident.typeLabel || incident.type || 'Emergency Report'}</Text>
          <Text style={styles.subtitle}>
            Submitted {formatTimeAgo(incident.timestamp || incident.clientTimestamp)}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.86}>
          <Ionicons name="close-outline" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status Panel */}
        <View style={styles.statusPanel}>
          <View style={[styles.statusIcon, { backgroundColor: meta.backgroundColor, borderColor: meta.borderColor }]}>
            <Ionicons name={getStatusIconName(displayStatus)} size={26} color={meta.color} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>{meta.label}</Text>
            <Text style={styles.statusMessage}>{meta.assurance}</Text>
          </View>
        </View>

        {/* Stepper Timeline */}
        <View style={styles.trackingTimeline}>
          {TRACKING_STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep >= stepNumber;
            const isCurrent = currentStep === stepNumber;

            return (
              <View key={step} style={styles.trackingStepWrap}>
                <View
                  style={[
                    styles.trackingDot,
                    isActive && styles.trackingDotActive,
                    isCurrent && styles.trackingDotCurrent,
                  ]}
                >
                  <Text style={[styles.trackingDotText, isActive && styles.trackingDotTextActive]}>
                    {stepNumber}
                  </Text>
                </View>
                <Text style={[styles.trackingLabel, isActive && styles.trackingLabelActive]}>
                  {step}
                </Text>
                {index < TRACKING_STEPS.length - 1 && (
                  <View style={[styles.trackingLine, currentStep > stepNumber && styles.trackingLineActive]} />
                )}
              </View>
            );
          })}
        </View>

        {/* UNIFIED LIVE DISTRESS GPS STREAM CARD */}
        <View style={styles.distressStreamCard}>
          <View style={styles.distressHeader}>
            <View style={styles.beaconContainer}>
              <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulseAnim }] }]} />
              <View style={styles.beaconInner}>
                <Ionicons name="radio" size={24} color="#ffffff" />
              </View>
            </View>
            <View style={styles.distressTitleBlock}>
              <Text style={styles.distressBadge}>● LIVE DISTRESS STREAMING</Text>
              <Text style={styles.distressTitle}>Continuous GPS Active</Text>
              <Text style={styles.distressSubtitle}>First responders have your live position</Text>
            </View>
          </View>

          <View style={styles.distressMetaBox}>
            <View style={styles.distressMetaRow}>
              <Text style={styles.distressMetaLabel}>Coordinates:</Text>
              <Text style={styles.distressMetaValue}>{coordsText}</Text>
            </View>
            <View style={styles.distressMetaRow}>
              <Text style={styles.distressMetaLabel}>Last Broadcast:</Text>
              <Text style={styles.distressMetaValue}>{lastDistressBroadcastTime || 'Just now'}</Text>
            </View>
            <View style={styles.distressMetaRow}>
              <Text style={styles.distressMetaLabel}>GPS Pings Sent:</Text>
              <Text style={styles.distressMetaValue}>{distressPingsCount} updates</Text>
            </View>
          </View>

          {/* If assigned responder is on the way */}
          {hasResponder && (
            <View style={styles.responderBox}>
              <Text style={styles.responderEyebrow}>ASSIGNED UNIT</Text>
              <Text style={styles.responderName}>{responder.precinctName || responder.name}</Text>
              <TouchableOpacity
                style={styles.callUnitButton}
                onPress={() => handleCall(responder.phone || responder.contactNumber || '83524000')}
                activeOpacity={0.86}
              >
                <Ionicons name="call" size={16} color="#ffffff" />
                <Text style={styles.callUnitButtonText}>Call Assigned Unit</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Quick hotline button */}
          <TouchableOpacity
            style={styles.hotlineButton}
            onPress={() => handleCall('83524000')}
            activeOpacity={0.86}
          >
            <Ionicons name="call" size={16} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.hotlineButtonText}>Direct Call Hotline (8352-4000)</Text>
          </TouchableOpacity>

          {/* I Am Safe Now Button */}
          <TouchableOpacity
            style={styles.safeButton}
            onPress={handleSafePress}
            activeOpacity={0.86}
          >
            <Ionicons name="shield-checkmark" size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.safeButtonText}>I Am Safe Now (End Distress Stream)</Text>
          </TouchableOpacity>
        </View>

        {/* Severity & Report ID */}
        <View style={styles.gridRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Severity</Text>
            <Text style={[styles.infoValue, { color: severityColor }]}>
              {(incident.severity || 'high').toUpperCase()}
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Report ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {incident.id?.slice(0, 8) || 'Pending'}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionLabel}>Description</Text>
          <Text style={styles.detailSectionText}>
            {incident.description || 'SOS quick report submitted via emergency flow.'}
          </Text>
        </View>

        {/* Location */}
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionLabel}>Location</Text>
          <Text style={styles.detailSectionText}>
            {incident.location?.address || 'Valenzuela City, Philippines'}
          </Text>
        </View>

        <View style={{ height: 28 }} />
      </ScrollView>

      {/* ThreatTrack-Themed "I Am Safe" Confirmation Overlay */}
      {confirmSafeVisible && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="shield-checkmark" size={34} color="#047857" />
            </View>
            <Text style={styles.confirmEyebrow}>EMERGENCY RESOLUTION</Text>
            <Text style={styles.confirmTitle}>Confirm You Are Safe</Text>
            <Text style={styles.confirmMessage}>
              Are you sure you want to end distress tracking? This will stop continuous GPS streaming and mark your emergency report resolved.
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmSafeBtn}
                onPress={handleConfirmSafeResolution}
                disabled={isResolving}
                activeOpacity={0.88}
              >
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.confirmSafeBtnText}>
                  {isResolving ? 'Resolving...' : 'Yes, I Am Safe'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmSafeVisible(false)}
                disabled={isResolving}
                activeOpacity={0.88}
              >
                <Text style={styles.confirmCancelBtnText}>Keep Streaming</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SmoothModal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fecaca',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleBlock: {
    flex: 1,
    paddingRight: 10,
  },
  eyebrow: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    maxHeight: 560,
  },
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
  },
  statusIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusCopy: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 2,
  },
  statusMessage: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
    lineHeight: 18,
  },

  // Stepper Timeline
  trackingTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  trackingStepWrap: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  trackingDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    zIndex: 2,
  },
  trackingDotActive: {
    backgroundColor: '#dc2626',
  },
  trackingDotCurrent: {
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  trackingDotText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9ca3af',
  },
  trackingDotTextActive: {
    color: '#ffffff',
  },
  trackingLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9ca3af',
  },
  trackingLabelActive: {
    color: '#111827',
  },
  trackingLine: {
    position: 'absolute',
    top: 14,
    left: '50%',
    width: '100%',
    height: 2.5,
    backgroundColor: '#e5e7eb',
    zIndex: 1,
  },
  trackingLineActive: {
    backgroundColor: '#dc2626',
  },

  // Distress Stream Card
  distressStreamCard: {
    backgroundColor: '#fff7f7',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  distressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  beaconContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pulseOuter: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
  },
  beaconInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distressTitleBlock: {
    flex: 1,
  },
  distressBadge: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },
  distressTitle: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '900',
  },
  distressSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  distressMetaBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fee2e2',
    padding: 10,
    marginBottom: 12,
  },
  distressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  distressMetaLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '700',
  },
  distressMetaValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '800',
  },
  responderBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 10,
    marginBottom: 10,
  },
  responderEyebrow: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  responderName: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '800',
    marginBottom: 8,
  },
  callUnitButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  callUnitButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  hotlineButton: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 10,
  },
  hotlineButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  safeButton: {
    backgroundColor: '#047857',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  safeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '900',
  },
  detailSection: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  detailSectionLabel: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  detailSectionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    lineHeight: 20,
  },

  // Themed Confirmation Modal Styles
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#d1fae5',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  confirmActions: {
    width: '100%',
    gap: 10,
  },
  confirmSafeBtn: {
    backgroundColor: '#047857',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmSafeBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  confirmCancelBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ActiveEmergencyModal;
