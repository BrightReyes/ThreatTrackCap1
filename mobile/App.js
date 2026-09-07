import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './utils/firebase';
import { handleLogout as authLogout } from './utils/auth';
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
    // Listen to Firebase authentication state changes.
    // AsyncStorage persistence automatically checks for an existing session on app startup.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
    });

    // Clean up the auth subscription on unmount to prevent memory leaks
    return () => unsubscribe();
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
