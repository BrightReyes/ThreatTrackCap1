import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import LoginScreen from './LoginScreen';
import SignUpScreen from './SignUpScreen';
import MainNavigator from './navigation/MainNavigator';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('login');

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentScreen('login');
  };

  if (!isAuthenticated) {
    return (
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
    );
  }

  return (
    <NavigationContainer>
      <MainNavigator onLogout={handleLogout} />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
