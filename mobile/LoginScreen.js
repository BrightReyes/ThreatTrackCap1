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
import { Ionicons } from '@expo/vector-icons';
import { handleLogin } from './utils/auth';
import CustomAlert from './components/CustomAlert';

const LoginScreen = ({ onNavigateToSignUp, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

      if (onLoginSuccess) {
        onLoginSuccess();
      }

      setTimeout(() => {
        showAlert('Success', `Welcome back, ${result.user.name}!`, 'success');
      }, 100);
    } catch (error) {
      showAlert('Unable to sign in', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LinearGradient
        colors={['#8f1d1d', '#c92a2a', '#f7f8fb']}
        locations={[0, 0.42, 1]}
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
            <View style={styles.hero}>
              <View style={styles.logoShell}>
                <Image
                  source={require('./assets/icons/Threat Track Logo Red.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brandTitle}>Threat Track</Text>
              <Text style={styles.brandSubtitle}>
                Stay aware, report faster, and keep your community safer.
              </Text>

              <View style={styles.trustRow}>
                <View style={styles.trustPill}>
                  <Ionicons name="shield-checkmark" size={14} color="#fee2e2" />
                  <Text style={styles.trustText}>Verified reports</Text>
                </View>
                <View style={styles.trustPill}>
                  <Ionicons name="location" size={14} color="#fee2e2" />
                  <Text style={styles.trustText}>Live alerts</Text>
                </View>
              </View>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.formHeader}>
                <Text style={styles.welcomeTitle}>Welcome Back</Text>
                <Text style={styles.welcomeSubtitle}>
                  Sign in to continue to your safety dashboard.
                </Text>
              </View>

              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#991b1b" />
                <TextInput
                  style={styles.input}
                  placeholder="sample@email.com"
                  placeholderTextColor="#9ca3af"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#991b1b" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.forgotPassword} disabled={loading}>
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={onLogin}
                disabled={loading}
                activeOpacity={0.86}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.loginButtonText}>Log In</Text>
                    <Ionicons name="arrow-forward" size={19} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.signupContainer}>
                <Text style={styles.signupText}>New to Threat Track?</Text>
                <TouchableOpacity onPress={onNavigateToSignUp} disabled={loading}>
                  <Text style={styles.signupLink}>Create account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>

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
    paddingTop: 44,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 28,
  },
  logoShell: {
    width: 104,
    height: 104,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#3f0808',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 10,
  },
  logoImage: {
    width: 82,
    height: 82,
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    maxWidth: 300,
    marginTop: 8,
    color: '#fee2e2',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '600',
  },
  trustRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  trustText: {
    color: '#fff7f7',
    fontSize: 12,
    fontWeight: '700',
  },
  formContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  formHeader: {
    marginBottom: 26,
  },
  welcomeTitle: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputContainer: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  input: {
    flex: 1,
    color: '#0f172a',
    fontSize: 15,
    paddingVertical: 0,
    fontWeight: '600',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 22,
  },
  forgotPasswordText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '800',
  },
  loginButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#b91c1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 22,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#fca5a5',
    shadowOpacity: 0.08,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  signupText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  signupLink: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default LoginScreen;
