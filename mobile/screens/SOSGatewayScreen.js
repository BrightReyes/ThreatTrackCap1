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
          <Text style={styles.brandTitle}>Threat Track</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.copyBlock}>
            <Text style={styles.instructionText}>Hold for 3 seconds for Instant Rescue</Text>
            <Text style={styles.instructionText}>
              Press the <Text style={styles.boldRed}>SOS button</Text> below to call help
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
            </View>
          </Pressable>

          <Text style={styles.holdHint}>
            {isHolding ? 'Keep holding...' : 'Release before 3 seconds to cancel'}
          </Text>

          <View style={styles.bottomSpacer} />

          <TouchableOpacity
            style={styles.homeButton}
            activeOpacity={0.86}
            onPress={() => navigation.replace('Home')}
          >
            <Text style={styles.homeButtonText}>Go to Home Page</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    minHeight: 86 + HEADER_TOP_PADDING,
    backgroundColor: '#dc2626',
    paddingTop: HEADER_TOP_PADDING,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 70,
    paddingBottom: 36,
  },
  copyBlock: {
    alignItems: 'center',
    marginBottom: 92,
  },
  instructionText: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '500',
  },
  boldRed: {
    color: '#dc2626',
    fontWeight: '900',
  },
  sosPressArea: {
    width: 188,
    height: 188,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosHalo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#dc2626',
  },
  sosFill: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: '#fb7185',
  },
  sosButton: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 12,
  },
  sosText: {
    color: '#ffffff',
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: 1,
  },
  holdHint: {
    marginTop: 18,
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
  },
  bottomSpacer: {
    flex: 1,
    minHeight: 34,
  },
  homeButton: {
    width: '100%',
    minHeight: 64,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 8,
  },
  homeButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
});

export default SOSGatewayScreen;
