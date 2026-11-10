import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { goToMainScreen } from './utils/navigation';
// [KEYBOARD-FIX] Auto-clicking / keyboard bug fix (see mobile/QA_FIX_LOG.md, Part 1).
import { KeyboardProvider } from 'react-native-keyboard-controller';
// [QA-FIX #11] Safe-area insets for edge-to-edge Android (bottom bars were
// drawn under the system navigation buttons).
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './utils/firebase';
import { handleLogout as authLogout, syncEmailVerification, isSignupInProgress } from './utils/auth';
import {
  registerForPushNotificationsAsync,
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
  unregisterPushToken,
} from './utils/notifications';
import { withTimeout } from './utils/async';
import LoginScreen from './LoginScreen';
import SignUpScreen from './SignUpScreen';
import MainNavigator from './navigation/MainNavigator';

enableScreens(true);
enableFreeze(true);

// [QA-FIX #16] Navigation ref so a notification tap can open a screen from
// outside the navigator, including a tap that cold-started the app.
const navigationRef = createNavigationContainerRef();

// [QA-FIX #16] Where a tapped notification should lead. nearby_incident pushes
// come from the sendNearbyIncidentAlert Cloud Function and are listed in
// Alerts; everything else is about the user's own report (Status).
const getNotificationTarget = (data) => {
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'nearby_incident') return 'Alerts';
  return 'Status';
};

// Simple Error Boundary Component to prevent unexpected unhandled crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error?.toString()}</Text>
          <Text style={styles.errorHint}>Check the console for details</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentScreen, setCurrentScreen] = useState('login');
  // [QA-FIX #16] A notification target waiting for the navigator to be ready
  // (cold start, or a tap that arrived while the user was still logging in).
  const pendingNotificationTargetRef = useRef(null);
  // The SOS hold is only for a fresh app start with a saved session. A user who
  // has just typed their password is not in that situation and goes to Home.
  const [mainInitialRoute, setMainInitialRoute] = useState('Home');
  const isAppStartAuthCheckRef = useRef(true);

  // [QA-FIX #16] Navigate now if possible, otherwise remember it for onReady.
  const openNotificationTarget = useCallback((data) => {
    const target = getNotificationTarget(data);
    if (!target) return;
    if (navigationRef.isReady()) {
      goToMainScreen(navigationRef, target);
    } else {
      pendingNotificationTargetRef.current = target;
    }
  }, []);

  const handleNavigationReady = useCallback(() => {
    const target = pendingNotificationTargetRef.current;
    if (target) {
      pendingNotificationTargetRef.current = null;
      goToMainScreen(navigationRef, target);
    }
  }, []);

  useEffect(() => {
    let responseSubscription = null;
    let isActive = true;

    // Listen to Firebase authentication state changes.
    // AsyncStorage persistence automatically checks for an existing session on app startup.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // The first callback reports the session saved from before the app started.
      const isAppStartAuthCheck = isAppStartAuthCheckRef.current;
      isAppStartAuthCheckRef.current = false;

      if (user) {
        // [QA-FIX #2] While SignUpScreen is creating the account, the new user
        // is briefly signed in. Ignore that so SignUpScreen stays mounted and
        // can show "Account Created"; handleSignup signs out when it's done.
        // (This also skips the push-permission prompt mid-signup.)
        if (isSignupInProgress()) {
          setIsLoadingAuth(false);
          return;
        }
        if (isAppStartAuthCheck) setMainInitialRoute('SOSGateway');
        setIsAuthenticated(true);
        // Automatically ensure verification state is synchronized with Firestore profile
        syncEmailVerification().catch((syncErr) => {
          console.warn('[AUTH] Background verification sync error:', syncErr?.message || syncErr);
        });
        // Register device for free push notifications with FCM
        registerForPushNotificationsAsync(user.uid).catch((err) => {
          console.warn('[PUSH] Registration failed:', err?.message || err);
        });
      } else {
        setIsAuthenticated(false);
        setMainInitialRoute('Home');
      }
      setIsLoadingAuth(false);
    });

    // Check verification status whenever user switches back to ThreatTrack (e.g., from verifying in Gmail)
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && auth.currentUser) {
        syncEmailVerification().catch((err) => {
          console.warn('[AUTH] AppState verification sync error:', err?.message || err);
        });
      }
    });

    try {
      // [QA-FIX #16] A notification tap used to only log; it now opens the screen.
      responseSubscription = addNotificationResponseReceivedListener((response) => {
        openNotificationTarget(response?.notification?.request?.content?.data);
      });
    } catch (e) {
      // Ignore if not supported in environment
    }

    // [QA-FIX #16] Handle the notification that launched the app from a closed state.
    getLastNotificationResponse().then((response) => {
      if (isActive && response) {
        openNotificationTarget(response?.notification?.request?.content?.data);
      }
    });

    // Clean up the subscriptions on unmount to prevent memory leaks
    return () => {
      isActive = false;
      unsubscribe();
      if (appStateSub?.remove) {
        appStateSub.remove();
      }
      if (responseSubscription?.remove) {
        responseSubscription.remove();
      }
    };
  }, [openNotificationTarget]);

  // Stable callbacks so child effects (e.g. SignUpScreen's BackHandler) don't
  // re-subscribe every time App re-renders.
  const handleLoginSuccess = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const goToSignUp = useCallback(() => setCurrentScreen('signup'), []);
  const goToLogin = useCallback(() => setCurrentScreen('login'), []);

  const handleLogout = useCallback(async () => {
    try {
      // [QA-FIX #5d] Detach this phone's push token before signing out, so a
      // logged-out phone stops receiving that user's alerts. Capped at 3 s
      // because Firestore writes never settle while offline; logout must not hang.
      const uid = auth.currentUser?.uid;
      if (uid) {
        await withTimeout(unregisterPushToken(uid), 3000);
      }
      await authLogout();
    } catch (error) {
      console.error('[AUTH] Sign out error:', error);
    } finally {
      setIsAuthenticated(false);
      setCurrentScreen('login');
    }
  }, []);

  if (isLoadingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#b91c1c" />
        <Text style={styles.loadingText}>Initializing ThreatTrack...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      {/* [QA-FIX #11] Provides safe-area insets to every screen/component. */}
      <SafeAreaProvider>
      {/* Edge-to-edge Android: the window no longer resizes for the keyboard,
          so keyboard insets come from this provider instead. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        {!isAuthenticated ? (
          <View style={styles.container}>
            {currentScreen === 'login' ? (
              <LoginScreen
                onNavigateToSignUp={goToSignUp}
                onLoginSuccess={handleLoginSuccess}
              />
            ) : (
              <SignUpScreen onNavigateToLogin={goToLogin} />
            )}
          </View>
        ) : (
          // [QA-FIX #16] ref + onReady let notification taps navigate.
          <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
            <MainNavigator onLogout={handleLogout} initialRouteName={mainInitialRoute} />
          </NavigationContainer>
        )}
      </KeyboardProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a2d52',
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff4444',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  errorHint: {
    fontSize: 14,
    color: '#888888',
    fontStyle: 'italic',
  },
});
