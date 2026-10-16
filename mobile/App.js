import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './utils/firebase';
import { handleLogout as authLogout, syncEmailVerification } from './utils/auth';
import { registerForPushNotificationsAsync, addNotificationResponseReceivedListener } from './utils/notifications';
import LoginScreen from './LoginScreen';
import SignUpScreen from './SignUpScreen';
import MainNavigator from './navigation/MainNavigator';

enableScreens(true);
enableFreeze(true);

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

  useEffect(() => {
    let responseSubscription = null;

    // Listen to Firebase authentication state changes.
    // AsyncStorage persistence automatically checks for an existing session on app startup.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
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
      responseSubscription = addNotificationResponseReceivedListener((response) => {
        const data = response?.notification?.request?.content?.data;
        console.log('[PUSH] Notification tapped with data:', data);
      });
    } catch (e) {
      // Ignore if not supported in environment
    }

    // Clean up the subscriptions on unmount to prevent memory leaks
    return () => {
      unsubscribe();
      if (appStateSub?.remove) {
        appStateSub.remove();
      }
      if (responseSubscription?.remove) {
        responseSubscription.remove();
      }
    };
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await authLogout();
    } catch (error) {
      console.error('[AUTH] Sign out error:', error);
    } finally {
      setIsAuthenticated(false);
      setCurrentScreen('login');
    }
  };

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
      {!isAuthenticated ? (
        <View style={styles.container}>
          {currentScreen === 'login' ? (
            <LoginScreen 
              onNavigateToSignUp={() => setCurrentScreen('signup')}
              onLoginSuccess={handleLoginSuccess}
            />
          ) : (
            <SignUpScreen onNavigateToLogin={() => setCurrentScreen('login')} />
          )}
        </View>
      ) : (
        <NavigationContainer>
          <MainNavigator onLogout={handleLogout} />
        </NavigationContainer>
      )}
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
