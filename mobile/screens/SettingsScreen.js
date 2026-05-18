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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import CustomAlert from '../components/CustomAlert';
import SmoothModal from '../components/SmoothModal';
import { auth, db } from '../utils/firebase';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 16;

const SettingsIcon = ({ name }) => (
  <View style={styles.settingIconWrapper}>
    <Ionicons name={name} size={20} color="#991b1b" />
  </View>
);

const ProfileField = ({ icon, label, value }) => (
  <View style={styles.profileDetailRow}>
    <View style={styles.profileDetailIcon}>
      <Ionicons name={icon} size={18} color="#991b1b" />
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
      <Ionicons name={icon} size={18} color="#991b1b" />
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);

  useEffect(() => {
    const currentUser = auth.currentUser || null;
    setUser(currentUser);

    const loadProfile = async () => {
      if (!currentUser?.uid) return;

      try {
        const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (profileSnap.exists()) {
          const profileData = profileSnap.data();
          const prefs = profileData.notificationPreferences || {};
          setProfile(profileData);
          setPushNotifications(prefs.pushNotifications !== false);
          setHighPriority(prefs.highPriority !== false);
          setLocationAlerts(prefs.locationAlerts !== false);
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
    showAlert('Logout', 'Are you sure you want to logout?', 'warning', [
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

  const closePasswordModal = () => {
    if (passwordLoading) return;
    setPasswordModalVisible(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
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
  const displayName = fullName || user?.displayName || 'User Profile';
  const accountStatus = String(profile?.accountStatus || 'active').replace(/_/g, ' ');

  return (
    <>
      <View style={styles.container}>
        <View style={styles.headerModern}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Manage alerts, privacy, and account access.</Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.profileCard}
              onPress={() => setProfileVisible(true)}
              activeOpacity={0.86}
            >
              <View style={styles.profileAvatar}>
                <Text style={styles.avatarText}>
                  {(displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileEmail}>{user?.email || 'user@example.com'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>

            <View style={styles.settingsCard}>
              <View style={styles.settingItem}>
                <SettingsIcon name="notifications-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDesc}>Receive alerts on your device</Text>
                </View>
                <Switch
                  value={pushNotifications}
                  onValueChange={handlePushNotificationsChange}
                  trackColor={{ true: '#dc2626', false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingItem}>
                <SettingsIcon name="flash-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>High Priority Alerts</Text>
                  <Text style={styles.settingDesc}>Critical safety notifications</Text>
                </View>
                <Switch
                  value={highPriority}
                  onValueChange={handleHighPriorityChange}
                  trackColor={{ true: '#dc2626', false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingItem}>
                <SettingsIcon name="location-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Location-based Alerts</Text>
                  <Text style={styles.settingDesc}>Alerts for your area</Text>
                </View>
                <Switch
                  value={locationAlerts}
                  onValueChange={handleLocationAlertsChange}
                  trackColor={{ true: '#dc2626', false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy & Security</Text>

            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setPasswordModalVisible(true)}
                activeOpacity={0.86}
              >
                <SettingsIcon name="lock-closed-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Change Password</Text>
                  <Text style={styles.settingDesc}>Update your password</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Support & About</Text>

            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setSupportVisible(true)}
                activeOpacity={0.86}
              >
                <SettingsIcon name="help-circle-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Help & Support</Text>
                  <Text style={styles.settingDesc}>Get help and contact support</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setAboutVisible(true)}
                activeOpacity={0.86}
              >
                <SettingsIcon name="information-circle-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>About ThreatTrack</Text>
                  <Text style={styles.settingDesc}>App version and details</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.86}>
              <Ionicons name="log-out-outline" size={20} color="#ffffff" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <View style={styles.bottomNavBarContainer}>
          <View style={styles.bottomNavBar}>
            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.replace('Home')}>
              <Ionicons name="home-outline" size={27} color="#ffffff" style={styles.navBottomIcon} />
              <Text style={styles.navBottomLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.replace('Status')}>
              <Ionicons name="document-text-outline" size={27} color="#ffffff" style={styles.navBottomIcon} />
              <Text style={styles.navBottomLabel}>Reports</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sosButtonBottom} onPress={handleSOSPress}>
            <View style={styles.sosGlowRing} />
            <View style={styles.sosButtonInner}>
              <Text style={styles.sosTextBottom}>SOS</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <SmoothModal
        visible={profileVisible}
        onRequestClose={() => setProfileVisible(false)}
        overlayStyle={styles.profileModalOverlay}
        contentStyle={styles.profileModalPanel}
      >
            <View style={styles.profileModalHeader}>
              <View style={styles.profileModalAvatar}>
                <Text style={styles.profileModalAvatarText}>
                  {(displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileModalTitleBlock}>
                <Text style={styles.profileModalTitle}>{displayName}</Text>
                <Text style={styles.profileModalSubtitle}>{user?.email || 'No email address'}</Text>
              </View>
              <TouchableOpacity
                style={styles.profileModalClose}
                onPress={() => setProfileVisible(false)}
                accessibilityLabel="Close profile"
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.profileStatusGrid}>
                <View style={styles.profileStatusCard}>
                  <Text style={styles.profileStatusLabel}>Account</Text>
                  <Text style={styles.profileStatusValue}>{accountStatus}</Text>
                </View>
              </View>

              <View style={styles.profileDetailsCard}>
                <ProfileField icon="person-outline" label="Full name" value={displayName} />
                <View style={styles.divider} />
                <ProfileField icon="mail-outline" label="Email address" value={user?.email || profile?.email} />
                <View style={styles.divider} />
                <ProfileField icon="call-outline" label="Phone number" value={profile?.phoneNumber} />
                <View style={styles.divider} />
                <ProfileField icon="location-outline" label="Barangay" value={profile?.barangay} />
                <View style={styles.divider} />
                <ProfileField icon="home-outline" label="Complete address" value={profile?.address} />
                <View style={styles.divider} />
                <ProfileField icon="finger-print-outline" label="User ID" value={user?.uid} />
              </View>
            </ScrollView>
      </SmoothModal>

      <SmoothModal
        visible={passwordModalVisible}
        onRequestClose={closePasswordModal}
        overlayStyle={styles.profileModalOverlay}
        contentStyle={styles.passwordModalPanel}
      >
            <View style={styles.passwordModalHeader}>
              <View>
                <Text style={styles.profileModalTitle}>Change password</Text>
                <Text style={styles.profileModalSubtitle}>Enter your current password to continue.</Text>
              </View>
              <TouchableOpacity
                style={styles.profileModalClose}
                onPress={closePasswordModal}
                disabled={passwordLoading}
                accessibilityLabel="Close change password"
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordForm}>
              <Text style={styles.passwordLabel}>Current password</Text>
              <View style={styles.passwordInputWrap}>
                <Ionicons name="lock-closed-outline" size={19} color="#991b1b" />
                <TextInput
                  style={styles.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  editable={!passwordLoading}
                />
                <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} disabled={passwordLoading}>
                  <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <Text style={styles.passwordLabel}>New password</Text>
              <View style={styles.passwordInputWrap}>
                <Ionicons name="shield-checkmark-outline" size={19} color="#991b1b" />
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  editable={!passwordLoading}
                />
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} disabled={passwordLoading}>
                  <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <Text style={styles.passwordLabel}>Confirm new password</Text>
              <View style={styles.passwordInputWrap}>
                <Ionicons name="checkmark-circle-outline" size={19} color="#991b1b" />
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  editable={!passwordLoading}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} disabled={passwordLoading}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.passwordSubmitButton, passwordLoading && styles.passwordSubmitButtonDisabled]}
                onPress={handleChangePassword}
                disabled={passwordLoading}
                activeOpacity={0.86}
              >
                {passwordLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.passwordSubmitText}>Update Password</Text>
                    <Ionicons name="arrow-forward" size={19} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
      </SmoothModal>

      <SmoothModal
        visible={supportVisible}
        onRequestClose={closeSupportModal}
        overlayStyle={styles.profileModalOverlay}
        contentStyle={styles.supportModalPanel}
      >
            <View style={styles.passwordModalHeader}>
              <View>
                <Text style={styles.profileModalTitle}>Help & Support</Text>
                <Text style={styles.profileModalSubtitle}>Get help with reports, safety alerts, and your account.</Text>
              </View>
              <TouchableOpacity
                style={styles.profileModalClose}
                onPress={closeSupportModal}
                accessibilityLabel="Close help and support"
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.supportEmergencyCard}>
                <View style={styles.supportEmergencyIcon}>
                  <Ionicons name="warning-outline" size={24} color="#ffffff" />
                </View>
                <View style={styles.supportEmergencyCopy}>
                  <Text style={styles.supportEmergencyTitle}>In immediate danger?</Text>
                  <Text style={styles.supportEmergencyText}>
                    Use SOS first or call your nearest precinct if you need urgent help.
                  </Text>
                </View>
              </View>

              <View style={styles.supportActionGrid}>
                <TouchableOpacity
                  style={styles.supportActionButton}
                  onPress={() => {
                    closeSupportModal();
                    handleSOSPress();
                  }}
                  activeOpacity={0.86}
                >
                  <Ionicons name="radio-outline" size={21} color="#dc2626" />
                  <Text style={styles.supportActionText}>Open SOS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.supportActionButton}
                  onPress={() => showAlert('Call Precinct', 'Use the Home screen precinct tools to call the nearest station.', 'info')}
                  activeOpacity={0.86}
                >
                  <Ionicons name="call-outline" size={21} color="#dc2626" />
                  <Text style={styles.supportActionText}>Call Precinct</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.supportSectionTitle}>Common help topics</Text>
              <View style={styles.supportTopicsCard}>
                <SupportTopic
                  icon="document-text-outline"
                  title="Report review"
                  text="Submitted reports are reviewed before they appear as verified safety information."
                />
                <View style={styles.divider} />
                <SupportTopic
                  icon="shield-checkmark-outline"
                  title="Account verification"
                  text="Identity checks help reduce false reports and keep community alerts reliable."
                />
                <View style={styles.divider} />
                <SupportTopic
                  icon="time-outline"
                  title="Report status"
                  text="Use the Reports tab to check if your report is pending, under review, verified, or resolved."
                />
                <View style={styles.divider} />
                <SupportTopic
                  icon="lock-closed-outline"
                  title="Privacy"
                  text="Your account details are not shown publicly with community incident reports."
                />
              </View>

              <Text style={styles.supportSectionTitle}>Contact support</Text>
              <View style={styles.supportContactCard}>
                <Ionicons name="mail-outline" size={20} color="#991b1b" />
                <View style={styles.supportContactCopy}>
                  <Text style={styles.supportContactTitle}>ThreatTrack support</Text>
                  <Text style={styles.supportContactText}>support@threattrack.local</Text>
                </View>
              </View>

              <View style={styles.supportSafetyNote}>
                <Ionicons name="information-circle-outline" size={18} color="#991b1b" />
                <Text style={styles.supportSafetyText}>
                  If it is unsafe to take photos or stay nearby, leave the area first and report when you are safe.
                </Text>
              </View>
            </ScrollView>
      </SmoothModal>

      <SmoothModal
        visible={aboutVisible}
        onRequestClose={closeAboutModal}
        overlayStyle={styles.profileModalOverlay}
        contentStyle={styles.supportModalPanel}
      >
            <View style={styles.passwordModalHeader}>
              <View>
                <Text style={styles.profileModalTitle}>About ThreatTrack</Text>
                <Text style={styles.profileModalSubtitle}>Community reporting and safety awareness.</Text>
              </View>
              <TouchableOpacity
                style={styles.profileModalClose}
                onPress={closeAboutModal}
                accessibilityLabel="Close about ThreatTrack"
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.aboutHero}>
                <Text style={styles.aboutTitle}>ThreatTrack</Text>
                <Text style={styles.aboutVersion}>Version 1.0</Text>
                <Text style={styles.aboutDescription}>
                  A community safety app for reporting incidents, viewing nearby alerts, and helping responders understand what is happening faster.
                </Text>
              </View>

              <Text style={styles.supportSectionTitle}>What it helps with</Text>
              <View style={styles.supportTopicsCard}>
                <SupportTopic
                  icon="map-outline"
                  title="Safety awareness"
                  text="View nearby reports and hotspot information to stay aware of risk in your area."
                />
                <View style={styles.divider} />
                <SupportTopic
                  icon="camera-outline"
                  title="Incident reporting"
                  text="Submit reports with details, location, severity, and optional evidence photos."
                />
                <View style={styles.divider} />
                <SupportTopic
                  icon="radio-outline"
                  title="SOS assistance"
                  text="Send urgent help requests so the admin desk can coordinate available responders."
                />
                <View style={styles.divider} />
                <SupportTopic
                  icon="document-text-outline"
                  title="Report tracking"
                  text="Follow the status of reports you submitted from pending review to resolution."
                />
              </View>

              <View style={styles.aboutInfoGrid}>
                <View style={styles.aboutInfoCard}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#047857" />
                  <Text style={styles.aboutInfoTitle}>Verified reports</Text>
                  <Text style={styles.aboutInfoText}>Reports are reviewed to reduce false or unsafe information.</Text>
                </View>
                <View style={styles.aboutInfoCard}>
                  <Ionicons name="lock-closed-outline" size={20} color="#991b1b" />
                  <Text style={styles.aboutInfoTitle}>Privacy minded</Text>
                  <Text style={styles.aboutInfoText}>Account details are protected and are not displayed in public report views.</Text>
                </View>
              </View>

              <View style={styles.supportSafetyNote}>
                <Ionicons name="alert-circle-outline" size={18} color="#991b1b" />
                <Text style={styles.supportSafetyText}>
                  ThreatTrack supports awareness and reporting, but it does not replace official emergency services.
                </Text>
              </View>
            </ScrollView>
      </SmoothModal>

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
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  headerModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 12.5,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 20,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  profileModalPanel: {
    maxHeight: '86%',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },
  passwordModalPanel: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },
  supportModalPanel: {
    maxHeight: '88%',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  passwordModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 14,
  },
  profileModalAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  profileModalAvatarText: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '900',
  },
  profileModalTitleBlock: {
    flex: 1,
  },
  profileModalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#111827',
  },
  profileModalSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748b',
  },
  profileModalClose: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  profileStatusGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  profileStatusCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 16,
    padding: 13,
  },
  profileStatusLabel: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  profileStatusValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  profileDetailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  profileDetailIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
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
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  profileDetailValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '750',
    lineHeight: 19,
  },
  passwordForm: {
    gap: 10,
  },
  passwordLabel: {
    color: '#334155',
    fontSize: 12.5,
    fontWeight: '900',
    marginLeft: 2,
  },
  passwordInputWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 5,
  },
  passwordInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  passwordSubmitButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#b91c1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  passwordSubmitButtonDisabled: {
    backgroundColor: '#fca5a5',
    shadowOpacity: 0.08,
  },
  passwordSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  supportEmergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#b91c1c',
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
  },
  supportEmergencyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supportEmergencyCopy: {
    flex: 1,
  },
  supportEmergencyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  supportEmergencyText: {
    color: '#fee2e2',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  supportActionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  supportActionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  supportActionText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '900',
  },
  supportSectionTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 2,
  },
  supportTopicsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 18,
  },
  supportTopicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  supportTopicIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supportTopicCopy: {
    flex: 1,
  },
  supportTopicTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 3,
  },
  supportTopicText: {
    color: '#64748b',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  supportContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  supportContactCopy: {
    flex: 1,
  },
  supportContactTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },
  supportContactText: {
    color: '#64748b',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 3,
  },
  supportSafetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 13,
  },
  supportSafetyText: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  aboutHero: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 18,
  },
  aboutTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  aboutVersion: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
    marginBottom: 10,
  },
  aboutDescription: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
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
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 13,
  },
  aboutInfoTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 5,
  },
  aboutInfoText: {
    color: '#64748b',
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  bottomSpacer: {
    height: 120,
  },
  bottomNavBarContainer: {
    position: 'relative',
    backgroundColor: '#991b1b',
  },
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: '#991b1b',
    borderTopWidth: 1,
    borderTopColor: '#b91c1c',
    paddingBottom: 15,
    paddingTop: 13,
    paddingHorizontal: 20,
  },
  navBottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0,
    paddingHorizontal: 14,
  },
  navBottomIcon: {
    marginBottom: 4,
  },
  navBottomLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '700',
  },
  sosButtonBottom: {
    position: 'absolute',
    top: -58,
    left: '50%',
    marginLeft: -56,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.68,
    shadowRadius: 28,
    elevation: 35,
  },
  sosGlowRing: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: '#ffe4e6',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  sosButtonInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#ff1238',
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  sosTextBottom: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
});

export default SettingsScreen;
