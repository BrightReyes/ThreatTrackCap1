/**
 * Location Utilities
 * 
 * Helper functions for handling location permissions and services
 */

import * as Location from 'expo-location';
import { Alert, Platform } from 'react-native';

/**
 * Request location permissions from the user
 * @returns {Promise<boolean>} True if permission granted, false otherwise
 */
export const requestLocationPermission = async () => {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      Alert.alert(
        'Location Permission Required',
        'ThreatTrack needs access to your location to show nearby incidents and calculate risk levels in your area.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Location.requestForegroundPermissionsAsync() }
        ]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
};

/**
 * Check if location permissions are granted
 * @returns {Promise<boolean>} True if granted, false otherwise
 */
export const checkLocationPermission = async () => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking location permission:', error);
    return false;
  }
};

/**
 * Get the user's current location
 * @returns {Promise<Object|null>} Location object or null if failed
 */
export const getCurrentLocation = async () => {
  try {
    const hasPermission = await checkLocationPermission();
    
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) {
        return null;
      }
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    Alert.alert(
      'Location Error',
      'Unable to get your current location. Please check your location services are enabled.',
      [{ text: 'OK' }]
    );
    return null;
  }
};

/**
 * Watch user's location for changes
 * @param {Function} callback Function to call when location changes
 * @returns {Promise<Object>} Location subscription object
 */
export const watchLocation = async (callback) => {
  try {
    const hasPermission = await checkLocationPermission();
    
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) {
        return null;
      }
    }

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000, // Update every 10 seconds
        distanceInterval: 50, // Update every 50 meters
      },
      (location) => {
        callback({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    );

    return subscription;
  } catch (error) {
    console.error('Error watching location:', error);
    return null;
  }
};

/**
 * Calculate distance between two coordinates in kilometers
 * @param {Object} coord1 First coordinate {latitude, longitude}
 * @param {Object} coord2 Second coordinate {latitude, longitude}
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(coord2.latitude - coord1.latitude);
  const dLon = toRadians(coord2.longitude - coord1.longitude);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.latitude)) *
    Math.cos(toRadians(coord2.latitude)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return parseFloat(distance.toFixed(2));
};

/**
 * Format distance for display
 * @param {number} distanceKm Distance in kilometers
 * @returns {string} Formatted distance string
 */
export const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
};

/**
 * Check if location services are enabled
 * @returns {Promise<boolean>} True if enabled, false otherwise
 */
export const isLocationEnabled = async () => {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    
    if (!enabled) {
      Alert.alert(
        'Location Services Disabled',
        'Please enable location services in your device settings to use ThreatTrack.',
        [{ text: 'OK' }]
      );
    }
    
    return enabled;
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
};
