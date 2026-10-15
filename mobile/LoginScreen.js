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
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { handleLogin, handleResetPassword } from './utils/auth';
import CustomAlert from './components/CustomAlert';
import SmoothModal from './components/SmoothModal';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 16;
const APP_LOGO = require('./assets/icons/Threat Track Logo Red.png');

const LoginScreen = ({ onNavigateToSignUp, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // 'email' | 'password' | null

  // Forgot Password Modal States
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetFocused, setResetFocused] = useState(false);

  // Custom Alert State
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
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  };

  const handleOpenForgotPassword = () => {
    setResetEmail(email ? email.trim() : '');
    setForgotModalVisible(true);
  };

  const handleCloseForgotPassword = () => {
    if (resetLoading) return;
    setForgotModalVisible(false);
  };

  const onSubmitResetPassword = async () => {
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      showAlert('Email Required', 'Please enter your registered email address.', 'warning');
      return;
    }

    try {
      setResetLoading(true);
      await handleResetPassword(cleanEmail);
      setForgotModalVisible(false);
      showAlert(
        'Password Recovery Sent',
        `A password reset link has been dispatched to ${cleanEmail}. Check your inbox or spam folder.`,
        'success'
      );
      setResetEmail('');
    } catch (error) {
      showAlert('Reset Failed', error?.message || 'Unable to send password reset email.', 'error');
    } finally {
      setResetLoading(false);
    }
  };

  const onLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      showAlert('Missing Credentials', 'Please enter both your email address and password.', 'warning');
      return;
    }

    try {
      setLoading(true);
      const result = await handleLogin(cleanEmail, password);

      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (error) {
      showAlert('Sign In Failed', error?.message || 'Invalid email or password. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#991b1b" translucent />
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Branded ThreatTrack Crimson Hero Banner */}
            <LinearGradient
              colors={['#991b1b', '#dc2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroBanner}
            >
              <View style={styles.logoBadgeContainer}>
                <Image source={APP_LOGO} style={styles.logoImage} resizeMode="contain" />
              </View>

              <Text style={styles.brandTitle}>
                Threat<Text style={styles.brandTitleHighlight}>Track</Text>
              </Text>
              <Text style={styles.brandSubtitle}>
                Valenzuela Community Safety & Emergency Grid
              </Text>

              {/* Trust Indicators Pill Row */}
              <View style={styles.trustRow}>
                <View style={styles.trustPill}>
                  <Ionicons name="shield-checkmark" size={13} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.trustPillText}>Verified Citizen Safety</Text>
                </View>
                <View style={styles.trustPill}>
                  <Ionicons name="radio" size={13} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.trustPillText}>24/7 Police Radar</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Signature ThreatTrack Laser Line */}
            <LinearGradient
              colors={['transparent', 'rgba(220, 38, 38, 0.45)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.laserLine}
            />

            {/* Elevated White Card Form Container */}
            <View style={styles.formCard}>
              <View style={styles.formCardHeader}>
                <Text style={styles.welcomeTitle}>Sign In</Text>
                <Text style={styles.welcomeSubtitle}>
                  Access live incident reports, emergency SOS, and safety alerts.
                </Text>
              </View>

              {/* Email Address Field */}
              <Text style={styles.fieldLabel}>Email Address</Text>
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'email' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={focusedField === 'email' ? '#dc2626' : '#64748b'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="name@example.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              {/* Password Field */}
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'password' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={focusedField === 'password' ? '#dc2626' : '#64748b'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your account password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.passwordEyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              {/* Forgot Password Link */}
              <TouchableOpacity
                style={styles.forgotPasswordContainer}
                onPress={handleOpenForgotPassword}
                disabled={loading}
                activeOpacity={0.75}
              >
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>

              {/* ThreatTrack Signature Gradient Login Button */}
              <TouchableOpacity
                style={[styles.loginButtonTouch, loading && styles.loginButtonDisabled]}
                onPress={onLogin}
                disabled={loading}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#dc2626', '#991b1b']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButtonGradient}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text style={styles.loginButtonText}>Sign In to ThreatTrack</Text>
                      <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Navigation to Sign Up */}
              <View style={styles.signUpPromptRow}>
                <Text style={styles.signUpPromptText}>New to ThreatTrack?</Text>
                <TouchableOpacity onPress={onNavigateToSignUp} disabled={loading} activeOpacity={0.8}>
                  <Text style={styles.signUpLinkText}>Create Citizen Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Forgot Password Recovery SmoothModal */}
      <SmoothModal
        visible={forgotModalVisible}
        onRequestClose={handleCloseForgotPassword}
        position="bottom"
        contentStyle={styles.forgotModalCard}
      >
        <View style={styles.forgotModalHeader}>
          <View style={styles.forgotIconBadge}>
            <Ionicons name="key" size={20} color="#dc2626" />
          </View>
          <View style={styles.forgotHeaderCopy}>
            <Text style={styles.forgotModalTitle}>Reset Password</Text>
            <Text style={styles.forgotModalSubtitle}>
              Enter your registered email to receive a recovery link.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.forgotCloseButton}
            onPress={handleCloseForgotPassword}
            disabled={resetLoading}
            accessibilityLabel="Close reset modal"
          >
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <Text style={styles.modalFieldLabel}>Account Email</Text>
        <View style={[styles.inputWrap, resetFocused && styles.inputWrapFocused]}>
          <Ionicons
            name="mail-outline"
            size={19}
            color={resetFocused ? '#dc2626' : '#64748b'}
            style={styles.inputLeadingIcon}
          />
          <TextInput
            style={styles.textInput}
            placeholder="name@example.com"
            placeholderTextColor="#94a3b8"
            value={resetEmail}
            onChangeText={setResetEmail}
            onFocus={() => setResetFocused(true)}
            onBlur={() => setResetFocused(false)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!resetLoading}
          />
        </View>

        <TouchableOpacity
          style={[styles.modalSubmitButtonTouch, resetLoading && styles.loginButtonDisabled]}
          onPress={onSubmitResetPassword}
          disabled={resetLoading}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#dc2626', '#991b1b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.modalSubmitButtonGradient}
          >
            {resetLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Text style={styles.modalSubmitButtonText}>Send Recovery Link</Text>
                <Ionicons name="paper-plane-outline" size={17} color="#ffffff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </SmoothModal>

      {/* Custom Alert Dialog */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
        autoCloseDelay={4500}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 36,
  },

  // Hero Banner (ThreatTrack Crimson)
  heroBanner: {
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logoBadgeContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  brandTitleHighlight: {
    color: '#fecaca',
  },
  brandSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#fee2e2',
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 18,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  trustPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Laser Accent Line
  laserLine: {
    height: 2,
    width: '100%',
  },

  // Elevated Form Card (Crisp White)
  formCard: {
    marginTop: -16,
    marginHorizontal: 18,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  formCardHeader: {
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  welcomeSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 19,
  },

  // Input Fields
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 50,
    marginBottom: 16,
  },
  inputWrapFocused: {
    borderColor: '#dc2626',
    backgroundColor: '#fffdfd',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 1,
  },
  inputLeadingIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0f172a',
    paddingVertical: 10,
  },
  passwordEyeButton: {
    padding: 6,
    marginLeft: 4,
  },

  // Forgot Password
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: 22,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },

  // Submit Button
  loginButtonTouch: {
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 20,
  },
  loginButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
    gap: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  // Sign Up Link Row
  signUpPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 6,
  },
  signUpPromptText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748b',
  },
  signUpLinkText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#dc2626',
  },

  // Forgot Password Modal
  forgotModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  forgotModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  forgotIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  forgotHeaderCopy: {
    flex: 1,
  },
  forgotModalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
  },
  forgotModalSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '500',
  },
  forgotCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  modalSubmitButtonTouch: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  modalSubmitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 20,
    gap: 8,
  },
  modalSubmitButtonText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900',
  },
});

export default LoginScreen;
