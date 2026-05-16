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
import { Picker } from '@react-native-picker/picker';
import { handleSignup } from './utils/auth';
import CustomAlert from './components/CustomAlert';

const VALENZUELA_BARANGAYS = [
  'Arkong Bato',
  'Bagbaguin',
  'Balangkas',
  'Bignay',
  'Bisig',
  'Canumay East',
  'Canumay West',
  'Coloong',
  'Dalandanan',
  'Gen. T. de Leon',
  'Isla',
  'Karuhatan',
  'Lawang Bato',
  'Lingunan',
  'Mabolo',
  'Malanday',
  'Malinta',
  'Mapulang Lupa',
  'Marulas',
  'Maysan',
  'Palasan',
  'Parada',
  'Pariancillo Villa',
  'Paso de Blas',
  'Pasolo',
  'Poblacion',
  'Pulo',
  'Punturin',
  'Rincon',
  'Tagalag',
  'Ugong',
  'Veinte Reales',
  'Wawang Pulo',
];

const SignUpScreen = ({ onNavigateToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [barangay, setBarangay] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [falseReportAcknowledged, setFalseReportAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  const onSignUp = async () => {
    console.log('Sign Up button clicked!');
    
    try {
      // Validate all fields
      if (!fullName || !email || !phoneNumber || !barangay || !address || !password || !confirmPassword) {
        console.log('Validation failed: missing fields');
        showAlert('Error', 'Please fill in all required fields', 'warning');
        return;
      }

      if (!VALENZUELA_BARANGAYS.includes(barangay)) {
        showAlert('Error', 'Please select a valid Valenzuela barangay', 'warning');
        return;
      }

      const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        showAlert('Error', 'Please enter your complete legal name', 'warning');
        return;
      }

      const phoneDigits = phoneNumber.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        showAlert('Error', 'Please enter a valid phone number', 'warning');
        return;
      }

      if (address.trim().length < 8) {
        showAlert('Error', 'Please enter your complete address', 'warning');
        return;
      }

      if (password !== confirmPassword) {
        console.log('Validation failed: passwords do not match');
        showAlert('Error', 'Passwords do not match', 'warning');
        return;
      }

      if (!falseReportAcknowledged) {
        showAlert('Policy Required', 'Please acknowledge the false report policy before creating an account.', 'warning');
        return;
      }

      console.log('Starting signup process...');
      setLoading(true);
      
      // Split full name into first and last
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Pass user data to signup function
      const userData = {
        firstName,
        lastName,
        middleName: '',
        phoneNumber,
        barangay,
        sex: '',
        age: '',
        address,
        falseReportAcknowledged,
      };
      
      console.log('Calling handleSignup with:', { email, userData });
      const result = await handleSignup(email, password, userData);
      console.log('Signup successful:', result);

      const message = result.verificationEmailSent
        ? 'Your account has been created. You can submit reports now; email verification is optional.'
        : 'Your account has been created. You can submit reports now, even though the verification email could not be sent.';

      showAlert('Account Created', message, 'success', [
        { text: 'Go to Login', onPress: onNavigateToLogin },
      ]);
    } catch (error) {
      console.error('Signup error:', error);
      showAlert('Error', error.message || 'An error occurred during signup', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <LinearGradient
      colors={['#dc2626', '#ef4444', '#ffffff', '#ffffff']}
      locations={[0, 0.28, 0.5, 1]}
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
                <Text style={styles.featureText}>SOS report</Text>
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
                placeholder="Juan Dela Cruz"
                placeholderTextColor="#9ca3af"
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
                placeholder="juan@example.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Phone Number Input */}
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>+63</Text>
              <TextInput
                style={styles.input}
                placeholder="0917 123 4567"
                placeholderTextColor="#9ca3af"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Barangay Dropdown */}
            <Text style={styles.label}>Barangay</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>BR</Text>
              <Picker
                selectedValue={barangay}
                onValueChange={(value) => setBarangay(value)}
                enabled={!loading}
                mode="dropdown"
                dropdownIconColor="#7f1d1d"
                style={[styles.picker, !barangay && styles.pickerPlaceholder]}
                itemStyle={styles.pickerItem}
                accessibilityLabel="Select barangay"
              >
                <Picker.Item label="Select barangay" value="" color="#9ca3af" enabled={false} />
                {VALENZUELA_BARANGAYS.map((name) => (
                  <Picker.Item key={name} label={name} value={name} />
                ))}
              </Picker>
            </View>

            {/* Address Input */}
            <Text style={styles.label}>Complete Address</Text>
            <View style={[styles.inputContainer, styles.addressInputContainer]}>
              <Text style={styles.inputIcon}>AD</Text>
              <TextInput
                style={[styles.input, styles.addressInput]}
                placeholder="House no., street, subdivision or landmark"
                placeholderTextColor="#9ca3af"
                value={address}
                onChangeText={setAddress}
                multiline
                textAlignVertical="top"
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

            {/* Confirm Password Input */}
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
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

            <TouchableOpacity
              style={styles.policyContainer}
              onPress={() => setFalseReportAcknowledged(!falseReportAcknowledged)}
              activeOpacity={0.85}
              disabled={loading}
            >
              <View style={[styles.checkbox, falseReportAcknowledged && styles.checkboxChecked]}>
                {falseReportAcknowledged ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.policyText}>
                I understand that false reports can lead to account suspension and possible legal action.
              </Text>
            </TouchableOpacity>

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
    paddingBottom: 24,
  },
  logoContainer: {
    marginBottom: 16,
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
    paddingTop: 28,
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
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureIconText: {
    fontSize: 16,
  },
  featureText: {
    fontSize: 14,
    color: '#6b7280',
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
    minWidth: 24,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 0,
  },
  picker: {
    flex: 1,
    height: 52,
    color: '#111827',
    marginLeft: -8,
  },
  pickerPlaceholder: {
    color: '#9ca3af',
  },
  pickerItem: {
    fontSize: 15,
    color: '#111827',
  },
  addressInputContainer: {
    minHeight: 76,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  addressInput: {
    minHeight: 48,
    paddingTop: 0,
  },
  eyeIcon: {
    padding: 4,
  },
  eyeText: {
    fontSize: 18,
  },
  policyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#dc2626',
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
  },
  policyText: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  signupButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    marginTop: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  signupButtonDisabled: {
    backgroundColor: '#fca5a5',
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
    backgroundColor: '#fee2e2',
  },
  dividerText: {
    color: '#991b1b',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    paddingBottom: 30,
  },
  loginText: {
    color: '#6b7280',
    fontSize: 14,
  },
  loginLink: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default SignUpScreen;
