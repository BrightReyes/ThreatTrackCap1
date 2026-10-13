import React, { useState, useMemo } from 'react';
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
import { handleSignup } from './utils/auth';
import CustomAlert from './components/CustomAlert';
import SmoothModal from './components/SmoothModal';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 16;
const APP_LOGO = require('./assets/icons/Threat Track Logo Red.png');

export const VALENZUELA_BARANGAYS = [
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
  // Form input states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [barangay, setBarangay] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [falseReportAcknowledged, setFalseReportAcknowledged] = useState(false);

  // UI Interactive States
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // Barangay Searchable Modal States
  const [barangayModalVisible, setBarangayModalVisible] = useState(false);
  const [barangaySearchQuery, setBarangaySearchQuery] = useState('');

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

  // Filter barangays for the selector modal
  const filteredBarangays = useMemo(() => {
    const q = barangaySearchQuery.trim().toLowerCase();
    if (!q) return VALENZUELA_BARANGAYS;
    return VALENZUELA_BARANGAYS.filter((b) => b.toLowerCase().includes(q));
  }, [barangaySearchQuery]);

  const onSelectBarangay = (selected) => {
    setBarangay(selected);
    setBarangayModalVisible(false);
    setBarangaySearchQuery('');
  };

  const onSignUp = async () => {
    try {
      if (!fullName || !email || !phoneNumber || !barangay || !address || !password || !confirmPassword) {
        showAlert('Missing Details', 'Please complete all required fields.', 'warning');
        return;
      }

      if (!VALENZUELA_BARANGAYS.includes(barangay)) {
        showAlert('Invalid Barangay', 'Please choose a valid Valenzuela City barangay.', 'warning');
        return;
      }

      const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        showAlert('Complete Name Required', 'Please enter your first and last legal name.', 'warning');
        return;
      }

      const phoneDigits = phoneNumber.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        showAlert('Invalid Phone Number', 'Please provide a valid 10-11 digit mobile number.', 'warning');
        return;
      }

      if (address.trim().length < 8) {
        showAlert('Detailed Address Required', 'Please provide your street, house number, or landmark.', 'warning');
        return;
      }

      if (password.length < 6) {
        showAlert('Weak Password', 'Your password must be at least 6 characters long.', 'warning');
        return;
      }

      if (password !== confirmPassword) {
        showAlert('Password Mismatch', 'The passwords you entered do not match.', 'warning');
        return;
      }

      if (!falseReportAcknowledged) {
        showAlert(
          'Policy Acknowledgment Required',
          'You must acknowledge the false report policy before registering your account.',
          'warning'
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
        phoneNumber: phoneNumber.trim(),
        barangay,
        sex: '',
        age: '',
        address: address.trim(),
        falseReportAcknowledged,
      };

      const result = await handleSignup(email.trim(), password, userData);
      const message = result?.verificationEmailSent
        ? 'Your citizen account has been created. A verification email has been sent to your address.\n\nYou can submit an emergency report right away, but must verify your email before filing ongoing reports.'
        : 'Your citizen account has been created successfully.\n\nYou can now log in and access Valenzuela City safety features.';

      showAlert('Account Created', message, 'success', [
        { text: 'Go to Sign In', onPress: onNavigateToLogin },
      ]);
    } catch (error) {
      showAlert('Registration Failed', error?.message || 'An error occurred during account creation.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#991b1b" translucent />
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                Register as a verified Valenzuela citizen for live response & emergency radar
              </Text>
            </LinearGradient>

            {/* Signature ThreatTrack Laser Line */}
            <LinearGradient
              colors={['transparent', 'rgba(220, 38, 38, 0.45)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.laserLine}
            />

            <View style={styles.formWrapper}>
              {/* SECTION 1: CITIZEN IDENTIFICATION */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionNumberBadge}>
                    <Text style={styles.sectionNumberText}>1</Text>
                  </View>
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={styles.sectionTitle}>Citizen Identification</Text>
                    <Text style={styles.sectionSubtitle}>Your legal contact information for verified incident logging</Text>
                  </View>
                </View>

                {/* Full Name */}
                <Text style={styles.fieldLabel}>Full Legal Name</Text>
                <View style={[styles.inputWrap, focusedField === 'fullName' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={focusedField === 'fullName' ? '#dc2626' : '#64748b'}
                    style={styles.inputLeadingIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Juan Dela Cruz"
                    placeholderTextColor="#94a3b8"
                    value={fullName}
                    onChangeText={setFullName}
                    onFocus={() => setFocusedField('fullName')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                </View>

                {/* Email Address */}
                <Text style={styles.fieldLabel}>Email Address</Text>
                <View style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}>
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

                {/* Phone Number */}
                <Text style={styles.fieldLabel}>Mobile Phone Number</Text>
                <View style={[styles.inputWrap, focusedField === 'phone' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="call-outline"
                    size={19}
                    color={focusedField === 'phone' ? '#dc2626' : '#64748b'}
                    style={styles.inputLeadingIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="0917 123 4567"
                    placeholderTextColor="#94a3b8"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    keyboardType="phone-pad"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* SECTION 2: VALENZUELA RESIDENCY */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionNumberBadge}>
                    <Text style={styles.sectionNumberText}>2</Text>
                  </View>
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={styles.sectionTitle}>Valenzuela City Residency</Text>
                    <Text style={styles.sectionSubtitle}>Assigns your nearest police sub-station and 3S center</Text>
                  </View>
                </View>

                {/* Barangay Selector Trigger Button */}
                <Text style={styles.fieldLabel}>Registered Barangay</Text>
                <TouchableOpacity
                  style={[
                    styles.barangaySelectorTrigger,
                    barangay ? styles.barangaySelectorTriggerSelected : null,
                  ]}
                  onPress={() => setBarangayModalVisible(true)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.barangayTriggerLeft}>
                    <Ionicons
                      name="location"
                      size={19}
                      color={barangay ? '#dc2626' : '#64748b'}
                      style={styles.inputLeadingIcon}
                    />
                    <Text style={barangay ? styles.barangaySelectedText : styles.barangayPlaceholderText}>
                      {barangay ? `Barangay ${barangay}` : 'Select your Valenzuela barangay...'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={19} color="#64748b" />
                </TouchableOpacity>

                {/* Complete Street Address */}
                <Text style={styles.fieldLabel}>Street Address / House No.</Text>
                <View style={[styles.inputWrap, styles.addressWrap, focusedField === 'address' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="home-outline"
                    size={19}
                    color={focusedField === 'address' ? '#dc2626' : '#64748b'}
                    style={[styles.inputLeadingIcon, { marginTop: 4 }]}
                  />
                  <TextInput
                    style={[styles.textInput, styles.addressInput]}
                    placeholder="House no., street, subdivision, or landmark"
                    placeholderTextColor="#94a3b8"
                    value={address}
                    onChangeText={setAddress}
                    onFocus={() => setFocusedField('address')}
                    onBlur={() => setFocusedField(null)}
                    multiline
                    textAlignVertical="top"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* SECTION 3: SECURITY & LEGAL COMPLIANCE */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionNumberBadge}>
                    <Text style={styles.sectionNumberText}>3</Text>
                  </View>
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={styles.sectionTitle}>Account Security & Legal Policy</Text>
                    <Text style={styles.sectionSubtitle}>Safeguard your citizen portal and verify accountability</Text>
                  </View>
                </View>

                {/* Password */}
                <Text style={styles.fieldLabel}>Account Password</Text>
                <View style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color={focusedField === 'password' ? '#dc2626' : '#64748b'}
                    style={styles.inputLeadingIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Minimum 6 characters"
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
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                {/* Confirm Password */}
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <View style={[styles.inputWrap, focusedField === 'confirmPassword' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="shield-outline"
                    size={19}
                    color={focusedField === 'confirmPassword' ? '#dc2626' : '#64748b'}
                    style={styles.inputLeadingIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Re-type your password"
                    placeholderTextColor="#94a3b8"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={styles.passwordEyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                {/* False Reporting Legal Warning Card & Checkbox */}
                <TouchableOpacity
                  style={[
                    styles.policyNoticeCard,
                    falseReportAcknowledged && styles.policyNoticeCardChecked,
                  ]}
                  onPress={() => setFalseReportAcknowledged(!falseReportAcknowledged)}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <View style={styles.policyCheckboxWrap}>
                    <Ionicons
                      name={falseReportAcknowledged ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={falseReportAcknowledged ? '#dc2626' : '#94a3b8'}
                    />
                  </View>
                  <View style={styles.policyCopyWrap}>
                    <Text style={styles.policyNoticeTitle}>Anti-False Report Policy</Text>
                    <Text style={styles.policyNoticeBody}>
                      I solemnly certify that all reports submitted through ThreatTrack are truthful and accurate. Filing malicious or fabricated emergency alerts is punishable under Philippine Law (P.D. 1829 & R.A. 10175).
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Submit Registration Button */}
              <TouchableOpacity
                style={[styles.signUpButtonTouch, loading && styles.signUpButtonDisabled]}
                onPress={onSignUp}
                disabled={loading}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#dc2626', '#991b1b']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.signUpButtonGradient}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text style={styles.signUpButtonText}>Register Citizen Account</Text>
                      <Ionicons name="shield-checkmark" size={18} color="#ffffff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Navigation Back to Login */}
              <View style={styles.loginPromptRow}>
                <Text style={styles.loginPromptText}>Already have an account?</Text>
                <TouchableOpacity onPress={onNavigateToLogin} disabled={loading} activeOpacity={0.8}>
                  <Text style={styles.loginLinkText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Valenzuela Barangay Searchable Modal (SmoothModal) */}
      <SmoothModal
        visible={barangayModalVisible}
        onRequestClose={() => {
          setBarangayModalVisible(false);
          setBarangaySearchQuery('');
        }}
        position="bottom"
        contentStyle={styles.barangayModalCard}
      >
        <View style={styles.barangayModalHeader}>
          <View style={styles.barangayModalIcon}>
            <Ionicons name="location" size={20} color="#dc2626" />
          </View>
          <View style={styles.barangayHeaderCopy}>
            <Text style={styles.barangayModalTitle}>Select Valenzuela Barangay</Text>
            <Text style={styles.barangayModalSubtitle}>Choose your residency location (33 barangays)</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => {
              setBarangayModalVisible(false);
              setBarangaySearchQuery('');
            }}
          >
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Barangay Quick Search Filter Input */}
        <View style={styles.modalSearchWrap}>
          <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.modalSearchInput}
            placeholder="Search barangay..."
            placeholderTextColor="#94a3b8"
            value={barangaySearchQuery}
            onChangeText={setBarangaySearchQuery}
            autoCapitalize="words"
          />
          {barangaySearchQuery ? (
            <TouchableOpacity onPress={() => setBarangaySearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Scrollable Barangay List */}
        <ScrollView style={styles.barangayListScroll} showsVerticalScrollIndicator={false}>
          {filteredBarangays.map((bName) => {
            const isSelected = barangay === bName;
            return (
              <TouchableOpacity
                key={bName}
                style={[styles.barangayOptionRow, isSelected && styles.barangayOptionRowActive]}
                onPress={() => onSelectBarangay(bName)}
                activeOpacity={0.7}
              >
                <View style={styles.barangayOptionLeft}>
                  <View style={[styles.barangayOptionDot, isSelected && styles.barangayOptionDotActive]} />
                  <Text style={[styles.barangayOptionText, isSelected && styles.barangayOptionTextActive]}>
                    Barangay {bName}
                  </Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={19} color="#dc2626" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SmoothModal>

      {/* Custom Alert Dialog */}
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
    paddingBottom: 40,
  },

  // Hero Banner (ThreatTrack Crimson)
  heroBanner: {
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logoBadgeContainer: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  brandTitleHighlight: {
    color: '#fecaca',
  },
  brandSubtitle: {
    marginTop: 4,
    fontSize: 12.5,
    color: '#fee2e2',
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 310,
    lineHeight: 18,
  },

  // Laser Accent Line
  laserLine: {
    height: 2,
    width: '100%',
  },

  // Form Wrapper
  formWrapper: {
    paddingHorizontal: 16,
    marginTop: -14,
  },

  // Grouped Section Card
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  sectionNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  sectionNumberText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#dc2626',
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 17,
  },

  // Input Fields
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 48,
    marginBottom: 14,
  },
  inputWrapFocused: {
    borderColor: '#dc2626',
    backgroundColor: '#fffdfd',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 1,
  },
  inputLeadingIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    paddingVertical: 10,
  },
  addressWrap: {
    minHeight: 80,
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  addressInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  passwordEyeButton: {
    padding: 6,
    marginLeft: 4,
  },

  // Barangay Trigger Button
  barangaySelectorTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 48,
    marginBottom: 14,
  },
  barangaySelectorTriggerSelected: {
    borderColor: '#fca5a5',
    backgroundColor: '#fffbfb',
  },
  barangayTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  barangayPlaceholderText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  barangaySelectedText: {
    fontSize: 14.5,
    color: '#0f172a',
    fontWeight: '800',
  },

  // Policy Notice Card
  policyNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbfb',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
    gap: 10,
  },
  policyNoticeCardChecked: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  policyCheckboxWrap: {
    marginTop: 2,
  },
  policyCopyWrap: {
    flex: 1,
  },
  policyNoticeTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#991b1b',
    marginBottom: 3,
  },
  policyNoticeBody: {
    fontSize: 11.5,
    color: '#64748b',
    lineHeight: 16,
    fontWeight: '500',
  },

  // Sign Up CTA Button
  signUpButtonTouch: {
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
    marginTop: 6,
    marginBottom: 16,
  },
  signUpButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
    gap: 8,
  },
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  // Login Prompt Row
  loginPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 10,
  },
  loginPromptText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748b',
  },
  loginLinkText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#dc2626',
  },

  // Barangay Selector Modal
  barangayModalCard: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  barangayModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  barangayModalIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  barangayHeaderCopy: {
    flex: 1,
  },
  barangayModalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  barangayModalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  barangayListScroll: {
    maxHeight: 340,
  },
  barangayOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    borderRadius: 10,
  },
  barangayOptionRowActive: {
    backgroundColor: '#fef2f2',
  },
  barangayOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barangayOptionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#cbd5e1',
  },
  barangayOptionDotActive: {
    backgroundColor: '#dc2626',
  },
  barangayOptionText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#334151',
  },
  barangayOptionTextActive: {
    color: '#dc2626',
    fontWeight: '900',
  },
});

export default SignUpScreen;
