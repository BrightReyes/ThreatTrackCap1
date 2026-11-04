/**
 * ThreatTrack Push & Local Notification Service
 *
 * Integrates with Expo Notifications and Google Firebase Cloud Messaging (FCM).
 * Handles device registration, FCM token sync to Firestore, background/foreground
 * notification channels, and dispatch alert triggers.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { auth, db } from './firebase';

// Configure foreground presentation behavior
// [QA-FIX #19] SDK 54 replaced the deprecated `shouldShowAlert` with
// `shouldShowBanner` + `shouldShowList`.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
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

// [QA-FIX #5c] EAS project id, required by getExpoPushTokenAsync in
// standalone builds (without it the Expo token call throws).
const getEasProjectId = () =>
  Constants?.expoConfig?.extra?.eas?.projectId ||
  Constants?.easConfig?.projectId ||
  undefined;

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

    // 1. Get native Firebase Cloud Messaging (FCM) device token.
    //    Needs mobile/google-services.json in the build (see app.json).
    try {
      const deviceTokenData = await Notifications.getDevicePushTokenAsync();
      fcmToken = deviceTokenData?.data || null;
    } catch (fcmErr) {
      console.log('[Notifications] Native FCM token resolution note:', fcmErr?.message);
    }

    // 2. Get the Expo push token too (kept separately, see below).
    try {
      const projectId = getEasProjectId();
      const expoTokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      pushToken = expoTokenData?.data || null;
    } catch (expoErr) {
      console.log('[Notifications] Expo push token resolution note:', expoErr?.message);
    }

    // [QA-FIX #5c] Each token goes in its own field. Before, the Expo token was
    // written into `fcmToken` when no FCM token existed, but the Cloud Function
    // sends with admin.messaging() (FCM), which rejects Expo tokens.
    // [QA-FIX #5d] Only write while this user is still the signed-in user, so a
    // registration that finishes after logout can't re-attach the token.
    if (userId && (fcmToken || pushToken) && auth.currentUser?.uid === userId) {
      const updates = {
        pushNotificationsEnabled: true,
        lastTokenRegisteredAt: serverTimestamp(),
      };
      if (fcmToken) {
        updates.fcmToken = fcmToken;
        updates.pushToken = fcmToken;
      }
      if (pushToken) {
        updates.expoPushToken = pushToken;
      }
      // [QA-FIX #5a] This write used to be rejected by firestore.rules because
      // these fields were missing from the owner-update allow-list.
      await updateDoc(doc(db, 'users', userId), updates).catch((updateErr) => {
        console.warn('[Notifications] Failed updating push tokens in Firestore:', updateErr?.message);
      });
    }

    return { fcmToken, pushToken };
  } catch (error) {
    console.error('[Notifications] Error registering for push notifications:', error);
    return { fcmToken: null, pushToken: null };
  }
}

/**
 * [QA-FIX #5d] Detach this device's push tokens from the user's profile.
 * Called on logout BEFORE signOut (the rules need the user to be signed in).
 * Never throws: logout must always succeed even when offline.
 * @param {string} userId
 */
export async function unregisterPushToken(userId) {
  if (!userId) return;
  try {
    await updateDoc(doc(db, 'users', userId), {
      fcmToken: deleteField(),
      pushToken: deleteField(),
      expoPushToken: deleteField(),
      pushNotificationsEnabled: false,
    });
  } catch (error) {
    console.warn('[Notifications] Unable to clear push token on logout:', error?.message || error);
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
      // [QA-FIX #19] Deliver immediately on the requested Android channel.
      // `channelId` was accepted before but never used.
      trigger: Platform.OS === 'android' ? { channelId } : null,
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

/**
 * [QA-FIX #16] The notification that cold-started the app (if any), so a tap
 * on a notification while the app was closed still opens the right screen.
 */
export async function getLastNotificationResponse() {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch (_) {
    return null;
  }
}
