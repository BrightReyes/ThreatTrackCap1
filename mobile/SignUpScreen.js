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
import { Ionicons } from '@expo/vector-icons';
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
    try {
      if (!fullName || !email || !phoneNumber || !barangay || !address || !password || !confirmPassword) {
        showAlert('Missing details', 'Please fill in all required fields.', 'warning');
        return;
      }

      if (!VALENZUELA_BARANGAYS.includes(barangay)) {
        showAlert('Invalid barangay', 'Please select a valid Valenzuela barangay.', 'warning');
        return;
      }

      const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        showAlert('Complete name required', 'Please enter your complete legal name.', 'warning');
        return;
      }

      const phoneDigits = phoneNumber.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        showAlert('Invalid phone number', 'Please enter a valid phone number.', 'warning');
        return;
      }

      if (address.trim().length < 8) {
        showAlert('Address required', 'Please enter your complete address.', 'warning');
        return;
      }

      if (password !== confirmPassword) {
        showAlert('Password mismatch', 'Passwords do not match.', 'warning');
        return;
      }

      if (!falseReportAcknowledged) {
        showAlert(
          'Policy required',
          'Please acknowledge the false report policy before creating an account.',
          'warning',
        );
        return;
      }

      setLoading(true);

      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
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

      const result = await handleSignup(email, password, userData);
      const message = result.verificationEmailSent
        ? 'Your account has been created. You can submit reports now; email verification is optional.'
        : 'Your account has been created. You can submit reports now, even though the verification email could not be sent.';

      showAlert('Account created', message, 'success', [
        { text: 'Go to Login', onPress: onNavigateToLogin },
      ]);
    } catch (error) {
      showAlert('Unable to create account', error.message || 'An error occurred during signup.', 'error');
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
            bounces={false}
            overScrollMode="never"
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
                Create your account and help keep reports timely and reliable.
              </Text>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.formHeader}>
                <Text style={styles.welcomeTitle}>Create Account</Text>
                <Text style={styles.welcomeSubtitle}>
                  Join the community safety network.
                </Text>
              </View>

              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <View style={styles.featureIcon}>
                    <Ionicons name="map-outline" size={18} color="#991b1b" />
                  </View>
                  <Text style={styles.featureText}>Crime hotspot mapping</Text>
                </View>
                <View style={styles.featureItem}>
                  <View style={styles.featureIcon}>
                    <Ionicons name="alert-circle-outline" size={18} color="#991b1b" />
                  </View>
                  <Text style={styles.featureText}>Quick SOS reporting</Text>
                </View>
                <View style={styles.featureItem}>
                  <View style={styles.featureIcon}>
                    <Ionicons name="business-outline" size={18} color="#991b1b" />
                  </View>
                  <Text style={styles.featureText}>Nearest precinct locator</Text>
                </View>
              </View>

              <Text style={styles.label}>Full name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#991b1b" />
                <TextInput
                  style={styles.input}
                  placeholder="Juan Dela Cruz"
                  placeholderTextColor="#9ca3af"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  editable={!loading}
                />
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

              <Text style={styles.label}>Phone number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={20} color="#991b1b" />
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

              <Text style={styles.label}>Barangay</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="location-outline" size={20} color="#991b1b" />
                <Picker
                  selectedValue={barangay}
                  onValueChange={(value) => setBarangay(value)}
                  enabled={!loading}
                  mode="dropdown"
                  dropdownIconColor="#991b1b"
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

              <Text style={styles.label}>Complete address</Text>
              <View style={[styles.inputContainer, styles.addressInputContainer]}>
                <Ionicons name="home-outline" size={20} color="#991b1b" />
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

              <Text style={styles.label}>Confirm password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#991b1b" />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#9ca3af"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.policyContainer}
                onPress={() => setFalseReportAcknowledged(!falseReportAcknowledged)}
                activeOpacity={0.85}
                disabled={loading}
              >
                <View style={[styles.checkbox, falseReportAcknowledged && styles.checkboxChecked]}>
                  {falseReportAcknowledged ? (
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                  ) : null}
                </View>
                <Text style={styles.policyText}>
                  I understand that false reports can lead to account suspension and possible legal action.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.signupButton, loading && styles.signupButtonDisabled]}
                onPress={onSignUp}
                disabled={loading}
                activeOpacity={0.86}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.signupButtonText}>Create Account</Text>
                    <Ionicons name="arrow-forward" size={19} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account?</Text>
                <TouchableOpacity onPress={onNavigateToLogin} disabled={loading}>
                  <Text style={styles.loginLink}>Log In</Text>
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
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 44,
    backgroundColor: 'transparent',
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 28,
    backgroundColor: 'transparent',
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
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 9,
  },
  logoImage: {
    width: 82,
    height: 82,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    maxWidth: 310,
    marginTop: 8,
    color: '#fee2e2',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 34,
  },
  formHeader: {
    marginBottom: 20,
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
  featuresList: {
    gap: 10,
    marginBottom: 22,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
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
    marginBottom: 15,
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
  picker: {
    flex: 1,
    height: 54,
    color: '#0f172a',
    marginLeft: -8,
  },
  pickerPlaceholder: {
    color: '#9ca3af',
  },
  pickerItem: {
    fontSize: 15,
    color: '#0f172a',
  },
  addressInputContainer: {
    height: 88,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  addressInput: {
    minHeight: 56,
    paddingTop: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  policyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 13,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
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
  policyText: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  signupButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#b91c1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 22,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  signupButtonDisabled: {
    backgroundColor: '#fca5a5',
    shadowOpacity: 0.08,
  },
  signupButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 14,
  },
  loginText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  loginLink: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default SignUpScreen;
