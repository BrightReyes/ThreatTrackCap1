import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { handleLogin, validateEmail, validatePassword } from './utils/auth';
import CustomAlert from './components/CustomAlert';

const LoginScreen = ({ onNavigateToSignUp, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const showAlert = (title, message, type = 'info', buttons = []) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      buttons,
    });
  };

  const hideAlert = () => {
    setAlertConfig({ ...alertConfig, visible: false });
  };

  const onLogin = async () => {
    try {
      setLoading(true);
      const result = await handleLogin(email, password);
      // Success - navigate to dashboard
      if (onLoginSuccess) {
        onLoginSuccess();
      }
      // Show non-blocking success message
      setTimeout(() => {
        showAlert('✅ Success', `Welcome back, ${result.user.name}!`, 'success');
      }, 100);
    } catch (error) {
      showAlert('Error', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <LinearGradient
      colors={['#dc2626', '#ef4444', '#ffffff', '#ffffff']}
      locations={[0, 0.32, 0.58, 1]}
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
                  <Image
                    source={require('./assets/icons/Threat Track Logo Red.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.shieldIcon}>🛡️</Text>
                </View>
              </View>
            </View>
            <Text style={styles.brandTitle}>Threat Track</Text>
            <Text style={styles.brandSubtitle}></Text>
          </View>

          {/* Form Container */}
          <View style={styles.formContainer}>
            <Text style={styles.welcomeTitle}>Welcome Back</Text>
            <Text style={styles.welcomeSubtitle}>Sign in to access your dashboard</Text>

            {/* Email Input */}
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder="sample@.com"
                placeholderTextColor="#9ca3af"
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
                placeholderTextColor="#9ca3af"
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

            {/* Forgot Password */}
            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>Forget Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity 
              style={[styles.loginButton, loading && styles.loginButtonDisabled]} 
              onPress={onLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>Log In</Text>
              )}
            </TouchableOpacity>

            {/* OR Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Sign Up Link */}
            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={onNavigateToSignUp}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>

    {/* Custom Alert Modal */}
    <CustomAlert
      visible={alertConfig.visible}
      title={alertConfig.title}
      message={alertConfig.message}
      type={alertConfig.type}
      buttons={alertConfig.buttons}
      onClose={hideAlert}
      autoCloseDelay={5000}
    />
  </>
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
  },
  logoSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 28,
  },
  logoContainer: {
    marginBottom: 18,
  },
  shieldOuter: {
    width: 124,
    height: 124,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 10,
  },
  shieldInner: {
    width: 112,
    height: 112,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 102,
    height: 102,
  },
  shieldIcon: {
    display: 'none',
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
    color: '#fff1f2',
    letterSpacing: 0.3,
  },
  formContainer: {
    paddingHorizontal: 30,
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 30,
    paddingBottom: 30,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 30,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    color: '#7f1d1d',
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 52,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
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
    color: '#111827',
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 4,
  },
  eyeText: {
    fontSize: 18,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '700',
  },
  loginButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#fca5a5',
  },
  loginButtonText: {
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
    backgroundColor: '#fee2e2',
  },
  dividerText: {
    color: '#991b1b',
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  signupText: {
    color: '#6b7280',
    fontSize: 14,
  },
  signupLink: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default LoginScreen;
