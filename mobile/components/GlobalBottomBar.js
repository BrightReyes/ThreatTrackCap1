import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';

/**
 * GlobalBottomBar
 * Shared navigation bar providing seamless switching between Home and Reports (Status)
 * along with the signature glowing SOS action button.
 */
const GlobalBottomBar = ({ navigation, activeTab = 'Home', userLocation = null }) => {
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
      <View style={styles.bottomNavBar}>
        <TouchableOpacity
          style={styles.navBottomItem}
          onPress={() => handleNavigate('Home')}
          activeOpacity={0.8}
        >
          <Image
            source={require('../assets/icons/home.png')}
            style={styles.navBottomIconImage}
          />
          <Text style={styles.navBottomLabel}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBottomItem}
          onPress={() => handleNavigate('Status')}
          activeOpacity={0.8}
        >
          <Image
            source={require('../assets/icons/report.png')}
            style={styles.navBottomIconImage}
          />
          <Text style={styles.navBottomLabel}>Reports</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.sosButtonBottom}
        onPress={handleSOSPress}
        activeOpacity={0.86}
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
  navBottomIconImage: {
    width: 32,
    height: 32,
    marginBottom: 4,
    tintColor: '#ffffff',
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
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
});

export default GlobalBottomBar;
