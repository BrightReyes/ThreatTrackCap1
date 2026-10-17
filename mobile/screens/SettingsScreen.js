import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import CustomAlert from '../components/CustomAlert';
import SmoothModal from '../components/SmoothModal';
import GlobalBottomBar from '../components/GlobalBottomBar';
import { auth, db } from '../utils/firebase';
import { resendEmailVerification, syncEmailVerification } from '../utils/auth';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 16;

const SettingsIcon = ({ name, color = '#dc2626', bgColor = '#fef2f2' }) => (
  <View style={[styles.settingIconWrapper, { backgroundColor: bgColor }]}>
    <Ionicons name={name} size={19} color={color} />
  </View>
);

const ProfileField = ({ icon, label, value }) => (
  <View style={styles.profileDetailRow}>
    <View style={styles.profileDetailIcon}>
      <Ionicons name={icon} size={17} color="#dc2626" />
    </View>
    <View style={styles.profileDetailCopy}>
      <Text style={styles.profileDetailLabel}>{label}</Text>
      <Text style={styles.profileDetailValue}>{value || 'Not provided'}</Text>
    </View>
  </View>
);

const SupportTopic = ({ icon, title, text }) => (
  <View style={styles.supportTopicRow}>
    <View style={styles.supportTopicIcon}>
      <Ionicons name={icon} size={17} color="#dc2626" />
    </View>
    <View style={styles.supportTopicCopy}>
      <Text style={styles.supportTopicTitle}>{title}</Text>
      <Text style={styles.supportTopicText}>{text}</Text>
    </View>
  </View>
);

const SettingsScreen = ({ navigation, onLogout }) => {
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const [pushNotifications, setPushNotifications] = useState(true);
  const [highPriority, setHighPriority] = useState(true);
  const [locationAlerts, setLocationAlerts] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  const handleResendVerification = async () => {
    try {
      setResendingVerification(true);
      const res = await resendEmailVerification();
      if (res.alreadyVerified) {
        await syncEmailVerification();
        setUser({ ...auth.currentUser });
        setProfile((prev) => (prev ? { ...prev, emailVerified: true, isVerified: true } : prev));
        showAlert('Email Verified', 'Your email address is already verified!', 'success');
      } else {
        showAlert('Verification Link Sent', 'A verification link has been sent to your email address. Please check your inbox or spam folder.', 'info');
      }
    } catch (error) {
      showAlert('Unable to Send', error.message || 'Could not send verification email.', 'error');
    } finally {
      setResendingVerification(false);
    }
  };

  useEffect(() => {
    const currentUser = auth.currentUser || null;
    setUser(currentUser);

    const loadProfile = async () => {
      if (!currentUser?.uid) return;

      try {
        await currentUser.reload();
        await currentUser.getIdToken(true);
        setUser({ ...auth.currentUser });
      } catch (reloadErr) {
        // Silently continue if network unavailable
      }

      try {
        const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (profileSnap.exists()) {
          const profileData = profileSnap.data();
          const prefs = profileData.notificationPreferences || {};
          setProfile(profileData);
          setPushNotifications(prefs.pushNotifications !== false);
          setHighPriority(prefs.highPriority !== false);
          setLocationAlerts(prefs.locationAlerts !== false);

          if (auth.currentUser?.emailVerified && (!profileData.emailVerified || !profileData.isVerified)) {
            try {
              await updateDoc(doc(db, 'users', currentUser.uid), {
                emailVerified: true,
                isVerified: true,
                lastVerificationCheckAt: new Date().toISOString(),
              });
              setProfile({ ...profileData, emailVerified: true, isVerified: true });
            } catch (syncErr) {
              console.warn('[AUTH] SettingsScreen profile sync error:', syncErr?.message || syncErr);
            }
          }
        }
      } catch (error) {
        console.warn('Unable to load user profile:', error);
      }
    };

    loadProfile();
  }, []);

  const showAlert = (title, message, type = 'info', buttons = []) => {
    setAlertConfig({ visible: true, title, message, type, buttons });
  };

  const hideAlert = () => {
    setAlertConfig({ ...alertConfig, visible: false });
  };

  const handleLogout = () => {
    showAlert('Confirm Logout', 'Are you sure you want to end your ThreatTrack session?', 'warning', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: onLogout },
    ]);
  };

  const handleSOSPress = async () => {
    try {
      const { getCurrentLocation } = require('../utils/location');
      const location = await getCurrentLocation();
      navigation.navigate('SOSReport', { userLocation: location });
    } catch (error) {
      console.error('Error getting location for SOS:', error);
      navigation.navigate('SOSReport');
    }
  };

  const closeSupportModal = () => {
    setSupportVisible(false);
  };

  const closeAboutModal = () => {
    setAboutVisible(false);
  };

  const handlePrecinctCall = async () => {
    const phoneNumber = '83524000';
    const telUrl = `tel:${phoneNumber}`;
    try {
      const supported = await Linking.canOpenURL(telUrl);
      if (supported) {
        await Linking.openURL(telUrl);
      } else {
        showAlert('Dialer Unavailable', `Unable to open dialer automatically. Please call ${phoneNumber} directly.`, 'info');
      }
    } catch (error) {
      console.error('Precinct call error:', error);
      showAlert('Dialer Error', 'Could not open the phone dialer.', 'error');
    }
  };

  const handleSupportEmail = async () => {
    const email = 'support@threattrack.local';
    const mailUrl = `mailto:${email}?subject=ThreatTrack%20Support%20Request`;
    try {
      const supported = await Linking.canOpenURL(mailUrl);
      if (supported) {
        await Linking.openURL(mailUrl);
      } else {
        showAlert('Email Client Unavailable', `Please send your inquiries directly to ${email}.`, 'info');
      }
    } catch (error) {
      console.error('Support email error:', error);
      showAlert('Email Error', 'Could not open the email client.', 'error');
    }
  };

  const closePasswordModal = () => {
    if (passwordLoading) return;
    setPasswordModalVisible(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setFocusedInput(null);
  };

  const handleChangePassword = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      showAlert('Unable to change password', 'Please sign in again before changing your password.', 'warning');
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert('Missing details', 'Please complete all password fields.', 'warning');
      return;
    }

    if (newPassword.length < 6) {
      showAlert('Weak password', 'New password must be at least 6 characters.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert('Password mismatch', 'New password and confirmation do not match.', 'warning');
      return;
    }

    try {
      setPasswordLoading(true);
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      closePasswordModal();
      showAlert('Password updated', 'Your password has been changed successfully.', 'success');
    } catch (error) {
      const message =
        error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password'
          ? 'Your current password is incorrect.'
          : error.code === 'auth/weak-password'
            ? 'New password must be at least 6 characters.'
            : error.message || 'Unable to update your password right now.';
      showAlert('Password not changed', message, 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const saveNotificationPreference = async (key, value, rollback) => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      rollback();
      showAlert('Login required', 'Please sign in before changing notification settings.', 'warning');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        [`notificationPreferences.${key}`]: value,
        notificationPreferencesUpdatedAt: new Date().toISOString(),
      });
      setProfile((prev) => ({
        ...(prev || {}),
        notificationPreferences: {
          ...(prev?.notificationPreferences || {}),
          [key]: value,
        },
      }));
    } catch (error) {
      rollback();
      console.error('Unable to save notification preference:', error);
      showAlert('Setting not saved', 'Unable to update this notification setting right now.', 'error');
    }
  };

  const handlePushNotificationsChange = (value) => {
    const previous = pushNotifications;
    setPushNotifications(value);
    saveNotificationPreference('pushNotifications', value, () => setPushNotifications(previous));
  };

  const handleHighPriorityChange = (value) => {
    const previous = highPriority;
    setHighPriority(value);
    saveNotificationPreference('highPriority', value, () => setHighPriority(previous));
  };

  const handleLocationAlertsChange = (value) => {
    const previous = locationAlerts;
    setLocationAlerts(value);
    saveNotificationPreference('locationAlerts', value, () => setLocationAlerts(previous));
  };

  const fullName = [profile?.firstName, profile?.middleName, profile?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName = fullName || user?.displayName || 'Citizen User';
  const accountStatus = String(profile?.accountStatus || 'active').replace(/_/g, ' ');
  const isAccountVerified = Boolean(
    user?.emailVerified ||
    profile?.isVerified === true ||
    profile?.emailVerified === true ||
    String(profile?.verificationStatus || '').toLowerCase() === 'approved'
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerModern}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconWrapper}>
              <Ionicons name="settings-outline" size={22} color="#dc2626" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Settings & Profile</Text>
              <Text style={styles.headerSubtitle}>Manage security, alerts, and citizen information</Text>
            </View>
          </View>
        </View>

        {/* Signature Laser Accent Line */}
        <LinearGradient
          colors={['transparent', 'rgba(220, 38, 38, 0.45)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerLaserLine}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Section: Profile Overview Card */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.profileCard}
              onPress={() => setProfileVisible(true)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#dc2626', '#991b1b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.profileAvatar}
              >
                <Text style={styles.avatarText}>
                  {(displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>

              <View style={styles.profileInfo}>
                <View style={styles.profileHeaderLine}>
                  <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
                  <Ionicons name="shield-checkmark" size={16} color="#dc2626" />
                </View>

                <Text style={styles.profileEmail} numberOfLines={1}>{user?.email || 'citizen@threattrack.local'}</Text>

                <View style={styles.profileBadgeRow}>
                  {isAccountVerified ? (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#15803d" />
                      <Text style={styles.verifiedBadgeText}>Verified Citizen</Text>
                    </View>
                  ) : (
                    <View style={styles.unverifiedBadge}>
                      <Ionicons name="alert-circle" size={12} color="#b45309" />
                      <Text style={styles.unverifiedBadgeText}>Pending Verification</Text>
                    </View>
                  )}
                  {profile?.barangay && (
                    <View style={styles.barangayBadge}>
                      <Ionicons name="location-outline" size={11} color="#64748b" />
                      <Text style={styles.barangayBadgeText}>{profile.barangay}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.chevronWrapper}>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Section: Notification Preferences */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="notifications-outline" size={14} color="#dc2626" />
              <Text style={styles.sectionTitle}>Emergency Alerts & Notifications</Text>
            </View>

            <View style={styles.settingsCard}>
              <View style={styles.settingItem}>
                <SettingsIcon name="notifications-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDesc}>Real-time push alerts on incidents and broadcasts</Text>
                </View>
                <Switch
                  value={pushNotifications}
                  onValueChange={handlePushNotificationsChange}
                  trackColor={{ true: '#dc2626', false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#cbd5e1"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingItem}>
                <SettingsIcon name="flash-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>High Priority Alerts</Text>
                  <Text style={styles.settingDesc}>Critical warnings for immediate life-safety emergencies</Text>
                </View>
                <Switch
                  value={highPriority}
                  onValueChange={handleHighPriorityChange}
                  trackColor={{ true: '#dc2626', false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#cbd5e1"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingItem}>
                <SettingsIcon name="location-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Location-based Alerts</Text>
                  <Text style={styles.settingDesc}>Geofenced reports relevant to your Valenzuela zone</Text>
                </View>
                <Switch
                  value={locationAlerts}
                  onValueChange={handleLocationAlertsChange}
                  trackColor={{ true: '#dc2626', false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#cbd5e1"
                />
              </View>
            </View>
          </View>

          {/* Section: Privacy & Security */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="shield-outline" size={14} color="#dc2626" />
              <Text style={styles.sectionTitle}>Privacy & Security</Text>
            </View>

            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setPasswordModalVisible(true)}
                activeOpacity={0.7}
              >
                <SettingsIcon name="lock-closed-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Change Password</Text>
                  <Text style={styles.settingDesc}>Update your account authentication credentials</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Section: Help & Information */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="help-buoy-outline" size={14} color="#dc2626" />
              <Text style={styles.sectionTitle}>Support & Information</Text>
            </View>

            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setSupportVisible(true)}
                activeOpacity={0.7}
              >
                <SettingsIcon name="help-circle-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Help & Support Desk</Text>
                  <Text style={styles.settingDesc}>Emergency guides, precinct hotline, FAQs</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setAboutVisible(true)}
                activeOpacity={0.7}
              >
                <SettingsIcon name="information-circle-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>About ThreatTrack</Text>
                  <Text style={styles.settingDesc}>Valenzuela City Safety Platform • v1.0.0</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingItem}
                onPress={handlePrecinctCall}
                activeOpacity={0.7}
              >
                <SettingsIcon name="call-outline" color="#b91c1c" bgColor="#fef2f2" />
                <View style={styles.settingContent}>
                  <Text style={[styles.settingLabel, { color: '#991b1b' }]}>Police Precinct Hotline</Text>
                  <Text style={styles.settingDesc}>Direct line: (02) 8352-4000</Text>
                </View>
                <View style={styles.callBadge}>
                  <Ionicons name="call" size={12} color="#dc2626" />
                  <Text style={styles.callBadgeText}>Call</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Section: Sign Out */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={19} color="#dc2626" />
              <Text style={styles.logoutText}>Sign Out of ThreatTrack</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Global Bottom Navigation */}
        <GlobalBottomBar navigation={navigation} activeTab="Settings" />
      </View>

      {/* Profile Modal */}
      <SmoothModal
        visible={profileVisible}
        onRequestClose={() => setProfileVisible(false)}
        overlayStyle={styles.modalOverlay}
        contentStyle={styles.profileModalPanel}
      >
        <View style={styles.modalDragHandle} />

        <View style={styles.profileModalHeader}>
          <LinearGradient
            colors={['#dc2626', '#991b1b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileModalAvatar}
          >
            <Text style={styles.profileModalAvatarText}>
              {(displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
          <View style={styles.profileModalTitleBlock}>
            <Text style={styles.profileModalTitle} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.profileModalSubtitle} numberOfLines={1}>{user?.email || 'No email registered'}</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setProfileVisible(false)}
            accessibilityLabel="Close profile modal"
          >
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Status Grid */}
          <View style={styles.profileStatusGrid}>
            <View style={styles.profileStatusCard}>
              <Text style={styles.profileStatusLabel}>Account Status</Text>
              <View style={styles.statusPill}>
                <View style={styles.statusDotActive} />
                <Text style={styles.profileStatusValue}>{accountStatus}</Text>
              </View>
            </View>
            <View style={styles.profileStatusCard}>
              <Text style={styles.profileStatusLabel}>Email Status</Text>
              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: isAccountVerified ? '#16a34a' : '#d97706' }]} />
                <Text style={[styles.profileStatusValue, { color: isAccountVerified ? '#15803d' : '#b45309' }]}>
                  {isAccountVerified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>
          </View>

          {/* Verification Banner if Unverified */}
          {user && !isAccountVerified && (
            <View style={styles.emailVerifyBanner}>
              <View style={styles.emailVerifyBannerHeader}>
                <Ionicons name="shield-outline" size={17} color="#b45309" />
                <Text style={styles.emailVerifyBannerTitle}>Verification Required</Text>
              </View>
              <Text style={styles.emailVerifyBannerText}>
                Your initial report was accepted under grace period. To maintain incident reliability and submit further reports, please verify your email.
              </Text>
              <TouchableOpacity
                style={styles.emailVerifyBannerBtn}
                onPress={handleResendVerification}
                disabled={resendingVerification}
                activeOpacity={0.8}
              >
                {resendingVerification ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="mail" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.emailVerifyBannerBtnText}>Resend Verification Link</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Profile Details List */}
          <View style={styles.profileDetailsCard}>
            <ProfileField icon="person-outline" label="Full Citizen Name" value={displayName} />
            <View style={styles.divider} />
            <ProfileField icon="mail-outline" label="Registered Email" value={user?.email || profile?.email} />
            <View style={styles.divider} />
            <ProfileField icon="call-outline" label="Contact Number" value={profile?.phoneNumber} />
            <View style={styles.divider} />
            <ProfileField icon="location-outline" label="Valenzuela Barangay" value={profile?.barangay} />
            <View style={styles.divider} />
            <ProfileField icon="home-outline" label="Registered Address" value={profile?.address} />
            <View style={styles.divider} />
            <ProfileField icon="finger-print-outline" label="Citizen UID" value={user?.uid} />
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SmoothModal>

      {/* Change Password Modal */}
      <SmoothModal
        visible={passwordModalVisible}
        onRequestClose={closePasswordModal}
        overlayStyle={styles.modalOverlay}
        contentStyle={styles.passwordModalPanel}
      >
        <View style={styles.modalDragHandle} />

        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderIconBadge}>
            <Ionicons name="lock-closed" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalHeaderTitle}>Change Password</Text>
            <Text style={styles.modalHeaderSubtitle}>Enter your current password to set a new one</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={closePasswordModal}
            disabled={passwordLoading}
            accessibilityLabel="Close change password modal"
          >
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <View style={styles.passwordForm}>
          {/* Current Password */}
          <Text style={styles.passwordLabel}>Current Password</Text>
          <View style={[styles.passwordInputWrap, focusedInput === 'current' && styles.passwordInputWrapFocused]}>
            <Ionicons name="lock-closed-outline" size={18} color={focusedInput === 'current' ? '#dc2626' : '#94a3b8'} />
            <TextInput
              style={styles.passwordInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrentPassword}
              placeholder="Enter your current password"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              editable={!passwordLoading}
              onFocus={() => setFocusedInput('current')}
              onBlur={() => setFocusedInput(null)}
            />
            <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} disabled={passwordLoading}>
              <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* New Password */}
          <Text style={styles.passwordLabel}>New Password</Text>
          <View style={[styles.passwordInputWrap, focusedInput === 'new' && styles.passwordInputWrapFocused]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={focusedInput === 'new' ? '#dc2626' : '#94a3b8'} />
            <TextInput
              style={styles.passwordInput}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNewPassword}
              placeholder="At least 6 characters"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              editable={!passwordLoading}
              onFocus={() => setFocusedInput('new')}
              onBlur={() => setFocusedInput(null)}
            />
            <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} disabled={passwordLoading}>
              <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Confirm New Password */}
          <Text style={styles.passwordLabel}>Confirm New Password</Text>
          <View style={[styles.passwordInputWrap, focusedInput === 'confirm' && styles.passwordInputWrapFocused]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={focusedInput === 'confirm' ? '#dc2626' : '#94a3b8'} />
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              placeholder="Re-enter your new password"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              editable={!passwordLoading}
              onFocus={() => setFocusedInput('confirm')}
              onBlur={() => setFocusedInput(null)}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} disabled={passwordLoading}>
              <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#64748b" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.passwordSubmitButton, passwordLoading && styles.passwordSubmitButtonDisabled]}
            onPress={handleChangePassword}
            disabled={passwordLoading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#dc2626', '#991b1b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.passwordSubmitGradient}
            >
              {passwordLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.passwordSubmitText}>Update Password</Text>
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* Help & Support Modal */}
      <SmoothModal
        visible={supportVisible}
        onRequestClose={closeSupportModal}
        overlayStyle={styles.modalOverlay}
        contentStyle={styles.supportModalPanel}
      >
        <View style={styles.modalDragHandle} />

        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderIconBadge}>
            <Ionicons name="help-buoy" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalHeaderTitle}>Help & Support</Text>
            <Text style={styles.modalHeaderSubtitle}>Emergency help and incident assistance</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={closeSupportModal}
            accessibilityLabel="Close support modal"
          >
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Emergency Alert Card */}
          <LinearGradient
            colors={['#991b1b', '#b91c1c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.supportEmergencyCard}
          >
            <View style={styles.supportEmergencyIcon}>
              <Ionicons name="warning" size={22} color="#ffffff" />
            </View>
            <View style={styles.supportEmergencyCopy}>
              <Text style={styles.supportEmergencyTitle}>In Immediate Danger?</Text>
              <Text style={styles.supportEmergencyText}>
                Do not wait for report review. Broadcast an SOS alert or call Valenzuela police right now.
              </Text>
            </View>
          </LinearGradient>

          {/* Quick Emergency Actions */}
          <View style={styles.supportActionGrid}>
            <TouchableOpacity
              style={styles.supportActionButtonRed}
              onPress={() => {
                closeSupportModal();
                handleSOSPress();
              }}
              activeOpacity={0.86}
            >
              <Ionicons name="radio" size={18} color="#ffffff" />
              <Text style={styles.supportActionTextWhite}>Trigger SOS Alert</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportActionButtonOutline}
              onPress={handlePrecinctCall}
              activeOpacity={0.86}
            >
              <Ionicons name="call" size={18} color="#dc2626" />
              <Text style={styles.supportActionTextRed}>Call Precinct</Text>
            </TouchableOpacity>
          </View>

          {/* Frequently Asked Help Topics */}
          <Text style={styles.supportSectionTitle}>Incident & Safety Topics</Text>
          <View style={styles.supportTopicsCard}>
            <SupportTopic
              icon="document-text-outline"
              title="Report Verification Process"
              text="Submitted incident reports are verified by city operators to prevent panic and guarantee accurate alerts."
            />
            <View style={styles.divider} />
            <SupportTopic
              icon="shield-checkmark-outline"
              title="Citizen Identity Safeguards"
              text="Your personal contact info is private and never exposed publicly on the community threat feed."
            />
            <View style={styles.divider} />
            <SupportTopic
              icon="time-outline"
              title="Tracking Incident Status"
              text="Check the Reports tab anytime to see whether dispatchers are reviewing, investigating, or resolving your alert."
            />
            <View style={styles.divider} />
            <SupportTopic
              icon="location-outline"
              title="Barangay Geofencing"
              text="Alerts are clustered within the official boundaries of Valenzuela City for localized community protection."
            />
          </View>

          {/* Email Support Card */}
          <Text style={styles.supportSectionTitle}>Technical & General Support</Text>
          <TouchableOpacity
            style={styles.supportContactCard}
            onPress={handleSupportEmail}
            activeOpacity={0.86}
          >
            <View style={styles.supportTopicIcon}>
              <Ionicons name="mail" size={17} color="#dc2626" />
            </View>
            <View style={styles.supportContactCopy}>
              <Text style={styles.supportContactTitle}>ThreatTrack Help Desk</Text>
              <Text style={styles.supportContactText}>support@threattrack.local</Text>
            </View>
            <Ionicons name="open-outline" size={18} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.supportSafetyNote}>
            <Ionicons name="information-circle" size={18} color="#991b1b" />
            <Text style={styles.supportSafetyText}>
              Always prioritize personal safety before documenting evidence. Evacuate dangerous zones immediately.
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SmoothModal>

      {/* About ThreatTrack Modal */}
      <SmoothModal
        visible={aboutVisible}
        onRequestClose={closeAboutModal}
        overlayStyle={styles.modalOverlay}
        contentStyle={styles.supportModalPanel}
      >
        <View style={styles.modalDragHandle} />

        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderIconBadge}>
            <Ionicons name="information-circle" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalHeaderTitle}>About ThreatTrack</Text>
            <Text style={styles.modalHeaderSubtitle}>Valenzuela City Safety Network</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={closeAboutModal}
            accessibilityLabel="Close about modal"
          >
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Hero Branding */}
          <View style={styles.aboutHero}>
            <View style={styles.aboutLogoBadge}>
              <Ionicons name="shield-checkmark" size={32} color="#dc2626" />
            </View>
            <Text style={styles.aboutTitle}>ThreatTrack</Text>
            <View style={styles.aboutVersionBadge}>
              <Text style={styles.aboutVersionText}>Version 1.0.0 (Official Release)</Text>
            </View>
            <Text style={styles.aboutDescription}>
              ThreatTrack is Valenzuela City's real-time community incident monitoring and rapid emergency dispatch system, empowering citizens to report risks safely and stay informed of localized threats.
            </Text>
          </View>

          {/* Core Pillars */}
          <Text style={styles.supportSectionTitle}>Platform Capabilities</Text>
          <View style={styles.supportTopicsCard}>
            <SupportTopic
              icon="map-outline"
              title="Clustered Incident Maps"
              text="Live visual tracking of police precincts and verified incidents within Valenzuela City boundaries."
            />
            <View style={styles.divider} />
            <SupportTopic
              icon="camera-outline"
              title="Verified Citizen Reporting"
              text="Encrypted submissions with photo attachments, exact coordinates, and severity level assessment."
            />
            <View style={styles.divider} />
            <SupportTopic
              icon="radio-outline"
              title="Instant SOS Broadcast"
              text="Rapid one-touch emergency distress call that alerts city command and nearby responders."
            />
          </View>

          {/* Privacy & Trust Badges */}
          <View style={styles.aboutInfoGrid}>
            <View style={styles.aboutInfoCard}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#15803d" />
              <Text style={styles.aboutInfoTitle}>Verified Accuracy</Text>
              <Text style={styles.aboutInfoText}>Reports undergo validation to prevent disinformation.</Text>
            </View>
            <View style={styles.aboutInfoCard}>
              <Ionicons name="lock-closed-outline" size={20} color="#dc2626" />
              <Text style={styles.aboutInfoTitle}>Privacy Protected</Text>
              <Text style={styles.aboutInfoText}>Citizen identities are shielded on public danger feeds.</Text>
            </View>
          </View>

          <View style={styles.supportSafetyNote}>
            <Ionicons name="alert-circle" size={18} color="#991b1b" />
            <Text style={styles.supportSafetyText}>
              ThreatTrack works alongside official local law enforcement. In severe medical or life-threatening crises, dial 911 or call your local precinct directly.
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SmoothModal>

      {/* Global Alert Notification */}
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
  headerModern: {
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  headerLaserLine: {
    height: 2,
    width: '100%',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  settingContent: {
    flex: 1,
    marginRight: 8,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 67,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 21,
  },
  profileInfo: {
    flex: 1,
  },
  profileHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  profileEmail: {
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
  },
  profileBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  verifiedBadgeText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '800',
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  unverifiedBadgeText: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '800',
  },
  barangayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  barangayBadgeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  chevronWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  callBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  callBadgeText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '800',
  },
  logoutButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 6,
  },
  logoutText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 15,
  },
  bottomSpacer: {
    height: 120,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  profileModalPanel: {
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },
  passwordModalPanel: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },
  supportModalPanel: {
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileModalAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  profileModalAvatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  profileModalTitleBlock: {
    flex: 1,
  },
  profileModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  profileModalSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748b',
  },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileStatusGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  profileStatusCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
  },
  profileStatusLabel: {
    color: '#64748b',
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  profileStatusValue: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  emailVerifyBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  emailVerifyBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  emailVerifyBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400e',
  },
  emailVerifyBannerText: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 17,
    marginBottom: 10,
  },
  emailVerifyBannerBtn: {
    backgroundColor: '#d97706',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  emailVerifyBannerBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800',
  },
  profileDetailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  profileDetailIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileDetailCopy: {
    flex: 1,
  },
  profileDetailLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  profileDetailValue: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '700',
  },

  /* Password Modal */
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  modalHeaderIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalHeaderSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  passwordForm: {
    gap: 10,
  },
  passwordLabel: {
    color: '#334155',
    fontSize: 12.5,
    fontWeight: '800',
    marginLeft: 2,
  },
  passwordInputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  passwordInputWrapFocused: {
    borderColor: '#dc2626',
    backgroundColor: '#fff8f8',
  },
  passwordInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: 14.5,
    fontWeight: '600',
    paddingVertical: 0,
  },
  passwordSubmitButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  passwordSubmitButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.05,
  },
  passwordSubmitGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  passwordSubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  /* Support Modal */
  supportEmergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  supportEmergencyIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supportEmergencyCopy: {
    flex: 1,
  },
  supportEmergencyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 2,
  },
  supportEmergencyText: {
    color: '#fee2e2',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  supportActionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  supportActionButtonRed: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  supportActionTextWhite: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  supportActionButtonOutline: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  supportActionTextRed: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
  },
  supportSectionTitle: {
    color: '#64748b',
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  supportTopicsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  supportTopicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  supportTopicIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  supportTopicCopy: {
    flex: 1,
  },
  supportTopicTitle: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  supportTopicText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  supportContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 12,
  },
  supportContactCopy: {
    flex: 1,
    marginLeft: 2,
  },
  supportContactTitle: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '800',
  },
  supportContactText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  supportSafetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 14,
    padding: 12,
  },
  supportSafetyText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },

  /* About Modal */
  aboutHero: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 16,
  },
  aboutLogoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  aboutTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
  },
  aboutVersionBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  aboutVersionText: {
    color: '#dc2626',
    fontSize: 11.5,
    fontWeight: '800',
  },
  aboutDescription: {
    color: '#64748b',
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center',
  },
  aboutInfoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  aboutInfoCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
  },
  aboutInfoTitle: {
    color: '#0f172a',
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 3,
  },
  aboutInfoText: {
    color: '#64748b',
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 15,
  },
});

export default SettingsScreen;
