try {
  require('dotenv').config({ path: '.env' });
} catch (e) {
  // dotenv is built into Expo CLI, fallback if running standalone
}

module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
  };
};
