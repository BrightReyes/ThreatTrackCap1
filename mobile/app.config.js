const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: '.env' });
} catch (e) {
  // dotenv is built into Expo CLI, fallback if running standalone
}

// [QA-FIX #5b] Firebase Android config, needed for the native FCM push token
// (Notifications.getDevicePushTokenAsync). Download it from the Firebase console
// (Project settings > Your apps > Android app "com.threattrack.mobile") and save
// it as mobile/google-services.json. It is only referenced when the file exists,
// because a missing googleServicesFile makes the native build fail; without it
// the app still runs and just can't register for push.
const GOOGLE_SERVICES_FILE = './google-services.json';
const hasGoogleServicesFile = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES_FILE));

module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      ...(hasGoogleServicesFile ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
  };
};
