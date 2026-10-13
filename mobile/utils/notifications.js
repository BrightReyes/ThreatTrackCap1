/**
 * ThreatTrack Push & Local Notification Service
 *
 * Integrates with Expo Notifications and Google Firebase Cloud Messaging (FCM).
 * Handles device registration, FCM token sync to Firestore, background/foreground
 * notification channels, and dispatch alert triggers.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Configure foreground presentation behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Configure Android notification channels for high-priority emergency alerts
 */
export async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('threattrack-alerts', {
        name: 'ThreatTrack Emergency & Safety Alerts',
        description: 'Critical notifications for Valenzuela crime alerts and emergency dispatch updates.',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#dc2626',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });

      await Notifications.setNotificationChannelAsync('threattrack-general', {
        name: 'ThreatTrack Community Notices',
        description: 'General community safety updates and precinct announcements.',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    } catch (error) {
      console.warn('[Notifications] Channel setup error:', error?.message || error);
    }
  }
}

/**
 * Request notification permissions and register the device FCM push token with Firebase
 * @param {string} userId - Current authenticated user UID
 * @returns {Promise<{ fcmToken: string|null, pushToken: string|null }>}
 */
export async function registerForPushNotificationsAsync(userId) {
  await setupNotificationChannels();

  let fcmToken = null;
  let pushToken = null;

  if (!Device.isDevice) {
    console.log('[Notifications] Push notifications require a physical device. Simulator/Emulator detected.');
    return { fcmToken: null, pushToken: null };
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission to receive push notifications was denied.');
      return { fcmToken: null, pushToken: null };
    }

    // 1. Get native Firebase Cloud Messaging (FCM) device token
    try {
      const deviceTokenData = await Notifications.getDevicePushTokenAsync();
      fcmToken = deviceTokenData?.data || null;
    } catch (fcmErr) {
      console.log('[Notifications] Native FCM token resolution note:', fcmErr?.message);
    }

    // 2. Get Expo Push Token as reliable fallback
    try {
      const expoTokenData = await Notifications.getExpoPushTokenAsync();
      pushToken = expoTokenData?.data || null;
    } catch (expoErr) {
      console.log('[Notifications] Expo push token resolution note:', expoErr?.message);
    }

    const activeToken = fcmToken || pushToken;

    // 3. Sync token into Firestore user record so Cloud Functions can dispatch alerts
    if (userId && activeToken) {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmToken: activeToken,
        pushToken: activeToken,
        pushNotificationsEnabled: true,
        lastTokenRegisteredAt: serverTimestamp(),
      }).catch((updateErr) => {
        console.warn('[Notifications] Failed updating user fcmToken in Firestore:', updateErr?.message);
      });
      console.log('[Notifications] Push notification token successfully registered for user:', userId);
    }

    return { fcmToken, pushToken };
  } catch (error) {
    console.error('[Notifications] Error registering for push notifications:', error);
    return { fcmToken: null, pushToken: null };
  }
}

/**
 * Trigger an instant local push notification on the device
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.body
 * @param {object} [params.data]
 * @param {string} [params.channelId]
 */
export async function scheduleLocalNotification({
  title,
  body,
  data = {},
  channelId = 'threattrack-alerts',
}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        color: '#dc2626',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // deliver immediately
    });
  } catch (error) {
    console.warn('[Notifications] Failed to schedule local notification:', error?.message);
  }
}

/**
 * Add listener for when a notification is received while the app is in the foreground
 */
export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for when a user interacts with/taps a notification
 */
export function addNotificationResponseReceivedListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
