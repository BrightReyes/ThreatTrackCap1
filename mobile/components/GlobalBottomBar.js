import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * GlobalBottomBar
 * Shared modern navigation bar providing seamless switching between Home and Reports (Status)
 * along with the signature glowing SOS action button.
 */
const GlobalBottomBar = ({ navigation, activeTab = 'Home', userLocation = null }) => {
  const isHome = activeTab === 'Home';
  const isReports = activeTab === 'Status' || activeTab === 'Reports';

  const handleSOSPress = async () => {
    try {
      if (userLocation) {
        navigation.navigate('SOSReport', { userLocation });
        return;
      }
      const { getCurrentLocation } = require('../utils/location');
      const location = await getCurrentLocation();
      navigation.navigate('SOSReport', { userLocation: location });
    } catch (error) {
      console.error('[SOS] Error obtaining location for emergency dispatch:', error);
      navigation.navigate('SOSReport');
    }
  };

  const handleNavigate = (screenName) => {
    if (activeTab === screenName) return;
    navigation.navigate(screenName);
  };

  return (
    <View style={styles.bottomNavBarContainer}>
      <LinearGradient
        colors={['transparent', 'rgba(220, 38, 38, 0.5)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topLaserLine}
      />
      <View style={styles.bottomNavBar}>
        <TouchableOpacity
          style={styles.navBottomItem}
          onPress={() => handleNavigate('Home')}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isHome ? 'home' : 'home-outline'}
            size={24}
            color={isHome ? '#dc2626' : '#64748b'}
          />
          <Text style={[styles.navBottomLabel, isHome && styles.navBottomLabelActive]}>
            Home
          </Text>
          {isHome && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBottomItem}
          onPress={() => handleNavigate('Status')}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isReports ? 'document-text' : 'document-text-outline'}
            size={24}
            color={isReports ? '#dc2626' : '#64748b'}
          />
          <Text style={[styles.navBottomLabel, isReports && styles.navBottomLabelActive]}>
            Reports
          </Text>
          {isReports && <View style={styles.activeDot} />}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.sosButtonBottom}
        onPress={handleSOSPress}
        activeOpacity={0.88}
      >
        <View style={styles.sosGlowRing} />
        <View style={styles.sosButtonInner}>
          <Text style={styles.sosTextBottom}>SOS</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomNavBarContainer: {
    position: 'relative',
    backgroundColor: '#ffffff',
  },
  topLaserLine: {
    height: 2,
    width: '100%',
  },
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingBottom: 16,
    paddingTop: 10,
    paddingHorizontal: 40,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  navBottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
  },
  navBottomLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  navBottomLabelActive: {
    color: '#dc2626',
    fontWeight: '800',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#dc2626',
    marginTop: 3,
  },
  sosButtonBottom: {
    position: 'absolute',
    top: -42,
    left: '50%',
    marginLeft: -44,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 20,
  },
  sosGlowRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff1f2',
    borderWidth: 2,
    borderColor: '#fee2e2',
  },
  sosButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#dc2626',
    borderWidth: 3,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#b91c1c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  sosTextBottom: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
});

export default GlobalBottomBar;
