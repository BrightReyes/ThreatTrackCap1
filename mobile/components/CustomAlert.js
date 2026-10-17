import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const parseMessage = (rawMessage) => {
  if (!rawMessage) return { body: '', notice: null };
  const str = String(rawMessage);
  // Match notices starting with ⚠️ Notice: or Notice:
  const noticeMatch = str.match(/(?:\n\s*)?(?:⚠️\s*Notice:?|Notice:?)\s*([\s\S]+)$/i);
  if (noticeMatch) {
    const body = str.substring(0, noticeMatch.index).trim();
    const notice = noticeMatch[1].trim();
    return { body, notice };
  }
  return { body: str, notice: null };
};

const CustomAlert = ({
  visible,
  title,
  message,
  type = 'info',
  dispatchInfo = null,
  buttons = [],
  onClose,
  autoCloseDelay = 0,
}) => {
  const timerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const translateAnim = useRef(new Animated.Value(16)).current;
  const radarScale = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(0.55)).current;
  const [isMounted, setIsMounted] = useState(visible);

  const isSOS = Boolean(
    title?.toLowerCase().includes('sos') ||
    message?.toLowerCase().includes('sos')
  );

  // Entrance & Exit springs
  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 280,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isMounted) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.96,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 12,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setIsMounted(false));
    }
  }, [fadeAnim, isMounted, scaleAnim, translateAnim, visible]);

  // Looping Radar Wave animation
  useEffect(() => {
    if (visible) {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(radarScale, {
              toValue: 1.5,
              duration: 1700,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(radarScale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(radarOpacity, {
              toValue: 0,
              duration: 1700,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(radarOpacity, {
              toValue: 0.55,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [radarOpacity, radarScale, visible]);

  // Auto-close handling
  useEffect(() => {
    if (visible && autoCloseDelay > 0) {
      timerRef.current = setTimeout(() => {
        if (buttons.length === 0) {
          onClose();
        }
      }, autoCloseDelay);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, autoCloseDelay, buttons, onClose]);

  const handleButtonPress = (button) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (button.onPress) {
      button.onPress();
    }
    onClose();
  };

  const handleManualClose = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onClose();
  };

  const getTypeConfig = () => {
    if (isSOS) {
      return {
        icon: 'flash',
        label: 'EMERGENCY SOS DISPATCHED',
        color: '#dc2626',
        backgroundColor: '#fef2f2',
        borderColor: '#fca5a5',
        pulseColor: 'rgba(220, 38, 38, 0.45)',
        buttonGradient: ['#7f1d1d', '#991b1b', '#dc2626'],
      };
    }
    if (type === 'dispatch') {
      return {
        icon: 'shield-checkmark',
        label: 'FIRST RESPONDER DISPATCHED',
        color: '#dc2626',
        backgroundColor: '#fef2f2',
        borderColor: '#fca5a5',
        pulseColor: 'rgba(220, 38, 38, 0.45)',
        buttonGradient: ['#7f1d1d', '#991b1b', '#dc2626'],
      };
    }
    switch (type) {
      case 'success':
        return {
          icon: 'shield-checkmark',
          label: 'TRANSMISSION CONFIRMED',
          color: '#059669',
          backgroundColor: '#ecfdf5',
          borderColor: '#6ee7b7',
          pulseColor: 'rgba(16, 185, 129, 0.4)',
          buttonGradient: ['#991b1b', '#dc2626'], // ThreatTrack signature gradient
        };
      case 'error':
        return {
          icon: 'alert-circle',
          label: 'SYSTEM ALERT',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          borderColor: '#fca5a5',
          pulseColor: 'rgba(220, 38, 38, 0.45)',
          buttonGradient: ['#991b1b', '#dc2626'],
        };
      case 'warning':
        return {
          icon: 'warning',
          label: 'VERIFICATION PROTOCOL',
          color: '#d97706',
          backgroundColor: '#fffbeb',
          borderColor: '#fcd34d',
          pulseColor: 'rgba(217, 119, 6, 0.4)',
          buttonGradient: ['#991b1b', '#dc2626'],
        };
      default:
        return {
          icon: 'information-circle',
          label: 'COMMUNITY NOTICE',
          color: '#2563eb',
          backgroundColor: '#eff6ff',
          borderColor: '#93c5fd',
          pulseColor: 'rgba(37, 99, 235, 0.4)',
          buttonGradient: ['#991b1b', '#dc2626'],
        };
    }
  };

  const typeConfig = getTypeConfig();
  const parsed = parseMessage(message);

  if (!isMounted) return null;

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={handleManualClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.alertCard,
            {
              transform: [
                { translateY: translateAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          {/* ThreatTrack Signature Gradient Horizon Line */}
          <LinearGradient
            colors={['#7f1d1d', '#991b1b', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topHorizonGlow}
          />

          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.iconRadarWrapper}>
              {/* Animated Radar Pulse Ring */}
              <Animated.View
                style={[
                  styles.radarWave,
                  {
                    borderColor: typeConfig.pulseColor,
                    transform: [{ scale: radarScale }],
                    opacity: radarOpacity,
                  },
                ]}
              />
              <View
                style={[
                  styles.headerIconWrap,
                  {
                    backgroundColor: typeConfig.backgroundColor,
                    borderColor: typeConfig.borderColor,
                  },
                ]}
              >
                <Ionicons name={typeConfig.icon} size={25} color={typeConfig.color} />
              </View>
            </View>

            <View style={styles.headerCopy}>
              <View style={styles.eyebrowRow}>
                <View style={[styles.liveBeacon, { backgroundColor: typeConfig.color }]} />
                <Text style={[styles.headerEyebrow, { color: typeConfig.color }]}>
                  {typeConfig.label}
                </Text>
              </View>
              <Text style={styles.headerTitle}>{title}</Text>
            </View>

            <TouchableOpacity
              onPress={handleManualClose}
              style={styles.closeButton}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={19} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Content & Action Area */}
          <View style={styles.contentContainer}>
            {/* Dispatch Telemetry Card */}
            {dispatchInfo ? (
              <View style={styles.dispatchCard}>
                <View style={styles.dispatchHeader}>
                  <View style={styles.dispatchIconBadge}>
                    <Ionicons name="navigate" size={15} color="#dc2626" />
                  </View>
                  <View style={styles.dispatchTitleWrap}>
                    <Text style={styles.dispatchStationTitle} numberOfLines={2}>
                      {dispatchInfo.stationName || 'Valenzuela Police Outpost'}
                    </Text>
                    <Text style={styles.dispatchStatusSub}>Active Unit Deployment</Text>
                  </View>
                </View>
                <View style={styles.dispatchPillsRow}>
                  {dispatchInfo.distance ? (
                    <View style={styles.dispatchPill}>
                      <Ionicons name="location" size={11} color="#dc2626" />
                      <Text style={styles.dispatchPillText}>{dispatchInfo.distance}</Text>
                    </View>
                  ) : null}
                  {dispatchInfo.eta ? (
                    <View style={[styles.dispatchPill, styles.dispatchPillAmber]}>
                      <Ionicons name="time" size={11} color="#b45309" />
                      <Text style={[styles.dispatchPillText, styles.dispatchTextAmber]}>
                        {dispatchInfo.eta}
                      </Text>
                    </View>
                  ) : null}
                  {dispatchInfo.traffic ? (
                    <View style={[styles.dispatchPill, styles.dispatchPillSlate]}>
                      <Ionicons name="car" size={11} color="#475569" />
                      <Text style={[styles.dispatchPillText, styles.dispatchTextSlate]}>
                        {dispatchInfo.traffic}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Primary Clean Message Body */}
            <Text style={styles.message}>{parsed.body}</Text>

            {/* Smart Advisory Callout Card (for grace periods & disclaimers) */}
            {parsed.notice ? (
              <View style={styles.advisoryCard}>
                <View style={styles.advisoryIconWrap}>
                  <Ionicons name="alert-circle" size={17} color="#b45309" />
                </View>
                <View style={styles.advisoryContent}>
                  <Text style={styles.advisoryTitle}>Official Advisory</Text>
                  <Text style={styles.advisoryText}>{parsed.notice}</Text>
                </View>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              {buttons.length === 0 ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.singleButtonTouch}
                  onPress={handleManualClose}
                >
                  <LinearGradient
                    colors={typeConfig.buttonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryButtonText}>Acknowledge</Text>
                    <View style={styles.btnIconBubble}>
                      <Ionicons
                        name={isSOS ? 'flash' : type === 'success' ? 'checkmark' : 'arrow-forward'}
                        size={13}
                        color="#ffffff"
                      />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                buttons.map((button, index) => {
                  const isCancel = button.style === 'cancel';
                  if (isCancel) {
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.8}
                        style={[styles.secondaryButton, buttons.length > 1 && styles.multiButton]}
                        onPress={() => handleButtonPress(button)}
                      >
                        <Text style={styles.secondaryButtonText} numberOfLines={1}>
                          {button.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.88}
                      style={[styles.primaryButtonTouch, buttons.length > 1 && styles.multiButton]}
                      onPress={() => handleButtonPress(button)}
                    >
                      <LinearGradient
                        colors={typeConfig.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.primaryGradient}
                      >
                        <Text style={styles.primaryButtonText} numberOfLines={1}>
                          {button.text}
                        </Text>
                        <View style={styles.btnIconBubble}>
                          <Ionicons
                            name={isSOS ? 'flash' : type === 'success' ? 'checkmark' : 'arrow-forward'}
                            size={13}
                            color="#ffffff"
                          />
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 29, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    width: width * 0.9,
    maxWidth: 420,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 22,
  },
  topHorizonGlow: {
    height: 4.5,
    width: '100%',
  },
  header: {
    paddingTop: 18,
    paddingBottom: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  iconRadarWrapper: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radarWave: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  headerIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  liveBeacon: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 20,
  },
  dispatchCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  dispatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  dispatchIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dispatchTitleWrap: {
    flex: 1,
  },
  dispatchStationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  dispatchStatusSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  dispatchPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dispatchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  dispatchPillAmber: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  dispatchPillSlate: {
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  dispatchPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#dc2626',
  },
  dispatchTextAmber: {
    color: '#b45309',
  },
  dispatchTextSlate: {
    color: '#475569',
  },
  message: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'left',
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  advisoryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    gap: 9,
  },
  advisoryIconWrap: {
    marginTop: 1,
  },
  advisoryContent: {
    flex: 1,
  },
  advisoryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  advisoryText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
    fontWeight: '600',
  },
  buttonContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 18,
  },
  singleButtonTouch: {
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryButtonTouch: {
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  multiButton: {
    flex: 1,
  },
  primaryGradient: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  btnIconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});

export default CustomAlert;
