/**
 * Location Utilities
 * 
 * Helper functions for handling location permissions and services
 */

import * as Location from 'expo-location';
import { withTimeout } from './async';

// Note: Alert dialogs should be handled by calling screens using CustomAlert
// This utility file focuses on location logic only

/**
 * Request location permissions from the user
 * @returns {Promise<boolean>} True if permission granted, false otherwise
 */
export const requestLocationPermission = async () => {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      console.log('Location permission denied by user');
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

// [QA-FIX #4] One place that shapes a location result. The extra fields
// (accuracy, isApproximate, timestamp) are additive; existing callers only
// read latitude/longitude/latitudeDelta/longitudeDelta.
const toLocationResult = (position, isApproximate) => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
  isApproximate,
  timestamp: position.timestamp || null,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
});

/**
 * Get the user's current location.
 *
 * [QA-FIX #4] Bounded wait. getCurrentPositionAsync has no timeout of its own
 * and can hang for a long time indoors or with weak GPS, which froze the SOS
 * buttons and left "Locking location..." spinning. Now it waits at most
 * `timeoutMs`, then falls back to the phone's last known position (flagged
 * `isApproximate: true`). It never invents a default location: with no fix
 * at all it returns null and the caller decides what to show.
 *
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=12000] Max wait for a fresh fix.
 * @param {number} [options.accuracy] expo-location Accuracy (default Balanced).
 * @returns {Promise<Object|null>} { latitude, longitude, accuracy, isApproximate,
 *   timestamp, latitudeDelta, longitudeDelta } or null if no fix is available.
 */
export const getCurrentLocation = async ({
  timeoutMs = 12000,
  accuracy = Location.Accuracy.Balanced,
} = {}) => {
  try {
    const hasPermission = await checkLocationPermission();

    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) {
        return null;
      }
    }

    let location = null;
    try {
      location = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy }),
        timeoutMs,
        null
      );
    } catch (positionError) {
      // e.g. location services switched off; try the cached fix below.
      console.warn('Current position unavailable:', positionError?.message || positionError);
    }

    if (location?.coords) {
      return toLocationResult(location, false);
    }

    // [QA-FIX #4] Fallback: last known position (instant, may be older or less precise).
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        return toLocationResult(lastKnown, true);
      }
    } catch (lastKnownError) {
      console.warn('Last known position unavailable:', lastKnownError?.message || lastKnownError);
    }

    return null;
  } catch (error) {
    console.error('Error getting current location:', error);
    // Calling screens should handle showing user-friendly error messages
    return null;
  }
};

/**
 * Get the user's location with extreme speed (checks cached position first < 50ms)
 * @returns {Promise<Object|null>} Location object or null
 */
export const getFastLocation = async () => {
  try {
    const hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) return null;
    }

    // 1. Instant cached position (< 50ms)
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && lastKnown.coords) {
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
      }
    } catch {
      // Fall through to quick position check
    }

    // 2. Bounded current position (max 1.4s wait)
    const positionPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1400));
    const location = await Promise.race([positionPromise, timeoutPromise]);

    if (location && location.coords) {
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }

    return null;
  } catch (error) {
    console.warn('Fast location check:', error.message);
    return null;
  }
};

/**
 * Watch user's location for changes
 * @param {Function} callback Function to call when location changes
 * @returns {Promise<Object>} Location subscription object
 */
export const watchLocation = async (callback, { accuracy = Location.Accuracy.Balanced } = {}) => {
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
        // [QA-FIX #3] Accuracy is now configurable (SOS tracking asks for High).
        accuracy,
        timeInterval: 10000, // Update every 10 seconds
        distanceInterval: 50, // Update every 50 meters
      },
      (location) => {
        callback({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          // [QA-FIX #3] Additive: lets the SOS stream report fix accuracy.
          accuracy: Number.isFinite(location.coords.accuracy) ? location.coords.accuracy : null,
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
      console.log('Location services are disabled');
    }
    
    return enabled;
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
};

/**
 * Get address from coordinates using reverse geocoding
 * @param {number} latitude Latitude coordinate
 * @param {number} longitude Longitude coordinate
 * @returns {Promise<string|null>} Address string or null if failed
 */
export const getAddressFromCoordinates = async (latitude, longitude, { timeoutMs = 2500 } = {}) => {
  try {
    // [QA-FIX #9] Bounded wait. Reverse geocoding goes over the network and
    // used to block SOS/report submission with no limit (forever when offline).
    // On timeout this returns null and callers use their fallback address.
    const addresses = await withTimeout(
      Location.reverseGeocodeAsync({
        latitude,
        longitude,
      }),
      timeoutMs,
      null
    );

    if (addresses && addresses.length > 0) {
      const address = addresses[0];
      // Format address as readable string
      const parts = [];
      
      if (address.street) parts.push(address.street);
      if (address.city) parts.push(address.city);
      if (address.region) parts.push(address.region);
      if (address.postalCode) parts.push(address.postalCode);
      if (address.country) parts.push(address.country);
      
      return parts.filter(p => p).join(', ') || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting address from coordinates:', error);
    return null;
  }
};
