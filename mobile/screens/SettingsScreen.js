import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { auth } from '../utils/firebase';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

const SettingIcon = ({ name }) => (
  <View style={styles.settingIconWrapper}>
    <Ionicons name={name} size={21} color="#991b1b" />
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

  useEffect(() => {
    try {
      setUser(auth.currentUser);
    } catch {
      setUser(null);
    }
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

  return (
    <>
      <View style={styles.container}>
        <View style={styles.headerModern}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Account, alerts, and privacy</Text>
          </View>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Text style={styles.avatarText}>
                  {(user?.displayName || user?.email || 'U').charAt(0)}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.displayName || 'User Profile'}</Text>
                <Text style={styles.profileEmail}>{user?.email || 'user@example.com'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.settingsCard}>
              <View style={styles.settingItem}>
                <SettingIcon name="notifications-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDesc}>Receive alerts on your device</Text>
                </View>
                <Switch value={pushNotifications} onValueChange={setPushNotifications} trackColor={{ true: '#dc2626', false: '#ccc' }} thumbColor="#fff" />
              </View>
              <View style={styles.divider} />
              <View style={styles.settingItem}>
                <SettingIcon name="flash-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>High Priority Alerts</Text>
                  <Text style={styles.settingDesc}>Critical safety notifications</Text>
                </View>
                <Switch value={highPriority} onValueChange={setHighPriority} trackColor={{ true: '#dc2626', false: '#ccc' }} thumbColor="#fff" />
              </View>
              <View style={styles.divider} />
              <View style={styles.settingItem}>
                <SettingIcon name="location-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Location-based Alerts</Text>
                  <Text style={styles.settingDesc}>Alerts for your area</Text>
                </View>
                <Switch value={locationAlerts} onValueChange={setLocationAlerts} trackColor={{ true: '#dc2626', false: '#ccc' }} thumbColor="#fff" />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy & Security</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity style={styles.settingItem} onPress={() => showAlert('Change Password', 'Update your password to keep your account secure', 'info')}>
                <SettingIcon name="lock-closed-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Change Password</Text>
                  <Text style={styles.settingDesc}>Update your password</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Support & About</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity style={styles.settingItem} onPress={() => showAlert('Help & Support', 'Contact our support team for assistance', 'info')}>
                <SettingIcon name="help-circle-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Help & Support</Text>
                  <Text style={styles.settingDesc}>Get help and contact support</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.settingItem} onPress={() => showAlert('About Threat Track', 'ThreatTrack v1.0\nA modern safety app for communities', 'info')}>
                <SettingIcon name="information-circle-outline" />
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>About ThreatTrack</Text>
                  <Text style={styles.settingDesc}>App version and details</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>

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
    paddingHorizontal: 18,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTitleBlock: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerRightSpacer: {
    width: 42,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
    color: '#6b7280',
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
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 12,
    color: '#6b7280',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  bottomSpacer: {
    height: 28,
  },
});

export default SettingsScreen;
