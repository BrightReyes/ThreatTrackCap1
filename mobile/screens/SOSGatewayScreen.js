import React, { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  StyleSheet,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HOLD_DURATION = 3000;
const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

const SOSGatewayScreen = ({ navigation }) => {
  const holdProgress = useRef(new Animated.Value(0)).current;
  const [isHolding, setIsHolding] = useState(false);
  const completedRef = useRef(false);

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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
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
          <Text style={styles.headerTitle}>Emergency Hold</Text>
          <Text style={styles.headerSubtitle}>
            Press and hold the SOS button for 3 seconds to continue to urgent reporting.
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.holdPanel}>
            <View style={styles.copyBlock}>
              <Text style={styles.instructionEyebrow}>Instant rescue gateway</Text>
              <Text style={styles.instructionText}>Hold to start an emergency report</Text>
              <Text style={styles.instructionSubtext}>
                Releasing early cancels the action, helping prevent accidental SOS submissions.
              </Text>
            </View>

            <Pressable
              style={styles.sosPressArea}
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
                <Text style={styles.sosText}>SOS</Text>
                <Text style={styles.sosButtonHint}>HOLD</Text>
              </View>
            </Pressable>

            <View style={[styles.holdStatus, isHolding && styles.holdStatusActive]}>
              <View style={[styles.holdStatusDot, isHolding && styles.holdStatusDotActive]} />
              <Text style={[styles.holdHint, isHolding && styles.holdHintActive]}>
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
    </SafeAreaView>
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
    paddingTop: HEADER_TOP_PADDING,
    paddingHorizontal: 18,
    paddingBottom: 20,
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
    marginBottom: 14,
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
    fontSize: 30,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#fff1f2',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 7,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
  },
  holdPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 28,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  copyBlock: {
    alignItems: 'center',
    marginBottom: 44,
  },
  instructionEyebrow: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
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
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 9,
    maxWidth: 300,
  },
  sosPressArea: {
    width: 208,
    height: 208,
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
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    marginTop: 28,
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
  },
  holdHintActive: {
    color: '#991b1b',
  },
  homeButton: {
    width: '100%',
    minHeight: 60,
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
    marginTop: 14,
  },
  homeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
});

export default SOSGatewayScreen;
