import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Linking, Image } from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { auth } from '../utils/firebase';

const SettingsScreen = ({ navigation, onLogout }) => {
  // Custom alert state
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
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    try { const u = auth.currentUser; setUser(u); } catch(e){}
  }, []);

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

  const handleLogout = () => {
    showAlert(
      'Logout',
      'Are you sure you want to logout?',
      'warning',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: onLogout },
      ]
    );
  };

  const handleSOSPress = async () => {
    try {
      // Import getCurrentLocation here since SettingsScreen doesn't have it
      const { getCurrentLocation } = require('../utils/location');
      const location = await getCurrentLocation();
      navigation.navigate('SOSReport', { userLocation: location });
    } catch (error) {
      console.error('Error getting location for SOS:', error);
      // Navigate anyway without location, SOS screen will handle it
      navigation.navigate('SOSReport');
    }
  };

  return (
    <>
    <View style={styles.container}>
      {/* Modern Header */}
      <View style={styles.headerModern}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Profile Section */}
        <View style={styles.section}>
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.avatarText}>{(user?.displayName || user?.email || 'U').charAt(0)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.displayName || 'User Profile'}</Text>
              <Text style={styles.profileEmail}>{user?.email || 'user@example.com'}</Text>
            </View>
            <Text style={styles.profileArrow}>›</Text>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.settingsCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>🔔</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDesc}>Receive alerts on your device</Text>
              </View>
              <Switch value={pushNotifications} onValueChange={setPushNotifications} trackColor={{true:'#dc2626', false:'#ccc'}} thumbColor={'#fff'} />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>⚡</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>High Priority Alerts</Text>
                <Text style={styles.settingDesc}>Critical safety notifications</Text>
              </View>
              <Switch value={highPriority} onValueChange={setHighPriority} trackColor={{true:'#dc2626', false:'#ccc'}} thumbColor={'#fff'} />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>📍</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Location-based Alerts</Text>
                <Text style={styles.settingDesc}>Alerts for your area</Text>
              </View>
              <Switch value={locationAlerts} onValueChange={setLocationAlerts} trackColor={{true:'#dc2626', false:'#ccc'}} thumbColor={'#fff'} />
            </View>
          </View>
        </View>

        {/* Privacy & Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Security</Text>

          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingItem} onPress={() => showAlert('Change Password', 'Update your password to keep your account secure', 'info')}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>🔒</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Change Password</Text>
                <Text style={styles.settingDesc}>Update your password</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>👤</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Anonymous Mode</Text>
                <Text style={styles.settingDesc}>Hide your identity when reporting</Text>
              </View>
              <Switch value={anonymousMode} onValueChange={setAnonymousMode} trackColor={{true:'#dc2626', false:'#ccc'}} thumbColor={'#fff'} />
            </View>
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & About</Text>

          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingItem} onPress={() => showAlert('Help & Support', 'Contact our support team for assistance', 'info')}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>❓</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Help & Support</Text>
                <Text style={styles.settingDesc}>Get help and contact support</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingItem} onPress={() => showAlert('About Threat Track', 'ThreatTrack v1.0\nA modern safety app for communities', 'info')}>
              <View style={styles.settingIconWrapper}>
                <Text style={styles.settingIcon}>ℹ️</Text>
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>About ThreatTrack</Text>
                <Text style={styles.settingDesc}>App version and details</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNavBarContainer}>
        <View style={styles.bottomNavBar}>
          <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Home')}>
            <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />
            <Text style={styles.navBottomLabel}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Status')}>
            <Image source={require('../assets/icons/report.png')} style={styles.navBottomIconImage} />
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
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  
  /* Modern Header */
  headerModern: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  },
  
  /* Sections */
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
  
  /* Settings Card */
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
  
  /* Setting Item */
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
  settingIcon: {
    fontSize: 20,
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
  settingArrow: {
    fontSize: 18,
    color: '#d1d5db',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  
  /* Profile Card */
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
  profileArrow: {
    fontSize: 20,
    color: '#d1d5db',
  },
  
  /* Logout Button */
  logoutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 0,
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
  
  /* Bottom Spacer */
  bottomSpacer: {
    height: 120,
  },
  
  /* Bottom Navigation Bar */
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
    fontSize: 32,
    color: '#ffffff',
    marginBottom: 4,
  },
  navBottomIconImage: {
    width: 32,
    height: 32,
    marginBottom: 4,
    tintColor: '#ffffff',
  },
  navBottomLabel: {
    fontSize: 13,
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
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
});

export default SettingsScreen;
