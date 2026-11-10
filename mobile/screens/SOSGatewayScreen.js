import React, { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, BRAND_GRADIENT_START, BRAND_GRADIENT_END } from '../theme/colors';
// [QA-FIX #11] RN's SafeAreaView is a no-op on Android; the bottom inset now
// keeps "Back to Home" clear of the system navigation bar.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HOLD_DURATION = 3000;
const SOS_PRESS_SIZE = 208;
const MIN_SOS_SCALE = 0.6;
const MAX_FONT_SCALE = 1.2;
const SHORT_SCREEN_HEIGHT = 700;

const SOSGatewayScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const holdProgress = useRef(new Animated.Value(0)).current;
  const [isHolding, setIsHolding] = useState(false);
  const [sosScale, setSosScale] = useState(MIN_SOS_SCALE);
  const completedRef = useRef(false);
  const hideInstructionDetail = windowHeight < SHORT_SCREEN_HEIGHT || fontScale > MAX_FONT_SCALE;

  // The button takes whatever height the text leaves, so nothing can overflow
  // the panel on short phones or with large system fonts.
  const handleSosSlotLayout = (event) => {
    const fitted = event.nativeEvent.layout.height / SOS_PRESS_SIZE;
    setSosScale(Math.max(MIN_SOS_SCALE, Math.min(1, fitted)));
  };

  const haloScale = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.34],
  });

  const haloOpacity = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.26, 0.02],
  });

  const fillScale = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const startSOSHold = () => {
    completedRef.current = false;
    setIsHolding(true);
    holdProgress.setValue(0);

    Animated.timing(holdProgress, {
      toValue: 1,
      duration: HOLD_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !completedRef.current) {
        completedRef.current = true;
        setIsHolding(false);
        navigation.navigate('SOSReport');
      }
    });
  };

  const cancelSOSHold = () => {
    if (completedRef.current) return;

    holdProgress.stopAnimation(() => {
      Animated.timing(holdProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    setIsHolding(false);
  };

  return (
    <View style={[styles.safeArea, { paddingBottom: insets.bottom }]}>
      <View style={styles.container}>
        <LinearGradient colors={BRAND_GRADIENT} start={BRAND_GRADIENT_START} end={BRAND_GRADIENT_END} style={[styles.header, { paddingTop: Math.max(16, insets.top + 12) }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.sosBadge}>
              <Ionicons name="warning-outline" size={18} color="#dc2626" />
              <Text style={styles.sosBadgeText}>SOS</Text>
            </View>
            <TouchableOpacity
              style={styles.headerHomeButton}
              activeOpacity={0.86}
              onPress={() => navigation.replace('Home')}
            >
              <Ionicons name="home-outline" size={19} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>Emergency Hold</Text>
          <Text style={styles.headerSubtitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Press and hold the SOS button for 3 seconds to continue to urgent reporting.
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.holdPanel}>
            <View style={styles.copyBlock}>
              <Text style={styles.instructionEyebrow} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Instant rescue gateway
              </Text>
              <Text style={styles.instructionText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Hold to start an emergency report
              </Text>
              {!hideInstructionDetail && (
                <Text style={styles.instructionSubtext} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  Releasing early cancels the action, helping prevent accidental SOS submissions.
                </Text>
              )}
            </View>

            <View style={styles.sosSlot} onLayout={handleSosSlotLayout}>
              <Pressable
                style={[styles.sosPressArea, { transform: [{ scale: sosScale }] }]}
                onPressIn={startSOSHold}
                onPressOut={cancelSOSHold}
              >
                <Animated.View
                  style={[
                    styles.sosHalo,
                    {
                      opacity: haloOpacity,
                      transform: [{ scale: haloScale }],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.sosFill,
                    {
                      transform: [{ scale: fillScale }],
                    },
                  ]}
                />
                <View style={styles.sosButton}>
                  <Text style={styles.sosText} allowFontScaling={false}>SOS</Text>
                  <Text style={styles.sosButtonHint} allowFontScaling={false}>HOLD</Text>
                </View>
              </Pressable>
            </View>

            <View style={[styles.holdStatus, isHolding && styles.holdStatusActive]}>
              <View style={[styles.holdStatusDot, isHolding && styles.holdStatusDotActive]} />
              <Text
                style={[styles.holdHint, isHolding && styles.holdHintActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              >
                {isHolding ? 'Keep holding to continue' : 'Release before 3 seconds to cancel'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.homeButton}
            activeOpacity={0.86}
            onPress={() => navigation.replace('Home')}
          >
            <Ionicons name="arrow-back-outline" size={20} color="#ffffff" />
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  sosBadgeText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerHomeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#fff1f2',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  holdPanel: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  copyBlock: {
    alignItems: 'center',
  },
  instructionEyebrow: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  instructionText: {
    color: '#111827',
    fontSize: 24,
    lineHeight: 31,
    textAlign: 'center',
    fontWeight: '900',
  },
  instructionSubtext: {
    color: '#6b7280',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 6,
    maxWidth: 300,
  },
  sosSlot: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  sosPressArea: {
    width: SOS_PRESS_SIZE,
    height: SOS_PRESS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosHalo: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#dc2626',
  },
  sosFill: {
    position: 'absolute',
    width: 162,
    height: 162,
    borderRadius: 81,
    backgroundColor: '#fecaca',
  },
  sosButton: {
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 12,
    borderWidth: 5,
    borderColor: '#fee2e2',
  },
  sosText: {
    color: '#ffffff',
    fontSize: 35,
    fontWeight: '900',
  },
  sosButtonHint: {
    color: '#fee2e2',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: -2,
  },
  holdStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    marginTop: 8,
  },
  holdStatusActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  holdStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9ca3af',
    marginRight: 8,
  },
  holdStatusDotActive: {
    backgroundColor: '#dc2626',
  },
  holdHint: {
    color: '#4b5563',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  holdHintActive: {
    color: '#991b1b',
  },
  homeButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 8,
    marginTop: 12,
  },
  homeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
});

export default SOSGatewayScreen;
