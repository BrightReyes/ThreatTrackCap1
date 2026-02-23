import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { handleSignup } from './utils/auth';

const SignUpScreen = ({ onNavigateToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSignUp = async () => {
    console.log('Sign Up button clicked!');
    
    try {
      // Validate all fields
      if (!fullName || !email || !password || !confirmPassword) {
        console.log('Validation failed: missing fields');
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      if (password !== confirmPassword) {
        console.log('Validation failed: passwords do not match');
        Alert.alert('Error', 'Passwords do not match');
        return;
      }

      console.log('Starting signup process...');
      setLoading(true);
      
      // Split full name into first and last
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Pass user data to signup function
      const userData = {
        firstName,
        lastName,
        middleName: '',
        sex: '',
        age: '',
        address: ''
      };
      
      console.log('Calling handleSignup with:', { email, userData });
      const result = await handleSignup(email, password, userData);
      console.log('Signup successful:', result);
      
      // Navigate to login screen immediately
      onNavigateToLogin();
      
      // Show success message after navigation
      setTimeout(() => {
        Alert.alert('✅ Account Created!', 'Your account has been created successfully. Please login to continue.');
      }, 300);
    } catch (error) {
      console.error('Signup error:', error);
      Alert.alert('Error', error.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
      locations={[0, 0.3, 0.6, 0.85, 1]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo/Branding Section */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <View style={styles.shieldOuter}>
                <View style={styles.shieldInner}>
                  <Text style={styles.shieldIcon}>🛡️</Text>
                </View>
              </View>
            </View>
            <Text style={styles.brandTitle}>Threat Track</Text>
            <Text style={styles.brandSubtitle}>Interactive Spatial Analysis</Text>
          </View>

          {/* Form Container */}
          <View style={styles.formContainer}>
            <Text style={styles.welcomeTitle}>Create Account</Text>
            <Text style={styles.welcomeSubtitle}>Join ThreatTrack to help make your community safer</Text>

            {/* Features List */}
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Text style={styles.featureIconText}>🗺️</Text>
                </View>
                <Text style={styles.featureText}>Crime hotspot mapping</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Text style={styles.featureIconText}>📊</Text>
                </View>
                <Text style={styles.featureText}>Real-time spatial analysis</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Text style={styles.featureIconText}>📍</Text>
                </View>
                <Text style={styles.featureText}>Nearest precinct locator</Text>
              </View>
            </View>

            {/* Full Name Input */}
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>👤</Text>
              <TextInput
                style={styles.input}
                placeholder="Sabrina Baker"
                placeholderTextColor="#4a5f8a"
                value={fullName}
                onChangeText={setFullName}
                editable={!loading}
              />
            </View>

            {/* Email Input */}
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder="sammy@young.com"
                placeholderTextColor="#4a5f8a"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#4a5f8a"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm Password Input */}
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#4a5f8a"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Text style={styles.eyeText}>{showConfirmPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>

            {/* Sign Up Button */}
            <TouchableOpacity 
              style={[styles.signupButton, loading && styles.signupButtonDisabled]} 
              onPress={onSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.signupButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* OR Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Login Link */}
            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={onNavigateToLogin}>
                <Text style={styles.loginLink}>Log In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 40,
    paddingBottom: 30,
  },
  logoSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  logoContainer: {
    marginBottom: 20,
  },
  shieldOuter: {
    width: 100,
    height: 100,
    borderRadius: 20,
    backgroundColor: '#5178e8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4169e1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  shieldInner: {
    width: 90,
    height: 90,
    borderRadius: 16,
    backgroundColor: '#6a8eef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shieldIcon: {
    fontSize: 48,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: '#a0aec0',
    letterSpacing: 0.3,
  },
  formContainer: {
    paddingHorizontal: 30,
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#8b95a8',
    marginBottom: 24,
    textAlign: 'center',
  },
  featuresList: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1a2d52',
    borderWidth: 1,
    borderColor: '#2d4573',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureIconText: {
    fontSize: 16,
  },
  featureText: {
    fontSize: 14,
    color: '#a0aec0',
  },
  label: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 4,
  },
  eyeText: {
    fontSize: 18,
  },
  signupButton: {
    backgroundColor: '#5178e8',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    marginTop: 8,
    shadowColor: '#4169e1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  signupButtonDisabled: {
    backgroundColor: '#555',
  },
  signupButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2d4573',
  },
  dividerText: {
    color: '#8b95a8',
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    paddingBottom: 30,
  },
  loginText: {
    color: '#8b95a8',
    fontSize: 14,
  },
  loginLink: {
    color: '#6a8eef',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default SignUpScreen;
