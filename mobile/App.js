import React, { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import LoginScreen from './LoginScreen';
import SignUpScreen from './SignUpScreen';
import MainNavigator from './navigation/MainNavigator';

// Simple Error Boundary Component
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
  // Show login screen first - set to true to bypass authentication
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('login');

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentScreen('login');
  };

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
    fontSize: 12,
    color: '#888888',
    fontStyle: 'italic',
  },
});
