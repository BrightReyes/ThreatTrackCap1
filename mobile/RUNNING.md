# Running ThreatTrack Mobile App

## Current Issue
Your system is running Node.js v24, which has compatibility issues with Expo SDK 50. There are several options to run the mobile app:

## Option 1: Use Node.js v20 (Recommended)

Install Node.js v20 LTS and switch to it:

**Using nvm-windows:**
```powershell
nvm install 20
nvm use 20
cd mobile
npm install
npx expo start
```

Then scan the QR code with:
- **iOS:** Camera app
- **Android:** Expo Go app

## Option 2: Use Web Preview (Works Now)

The mobile app can run in a web browser for testing:

```powershell
cd mobile
# This will work with Node v24
npx expo start --web
```

Note: Web preview shows how the app looks but doesn't test native features.

## Option 3: Use React Native CLI

For production apps, React Native CLI is recommended but requires more setup:

**Prerequisites:**
- Android Studio + Android SDK (for Android)
- Xcode + CocoaPods (for iOS on Mac)

Setup is more complex - let me know if you want to go this route.

## Quick Test with Current Setup

Since you have Node v24, the easiest way to see the mobile app running is:

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1\mobile
npx expo start --web
```

This will open the mobile app in your browser at http://localhost:8081

## Recommended Next Steps

1. **Install nvm-windows** from https://github.com/coreybutler/nvm-windows/releases
2. **Switch to Node 20:**
   ```powershell
   nvm install 20.11.0
   nvm use 20.11.0
   ```
3. **Run the mobile app:**
   ```powershell
   cd mobile
   npm install
   npx expo start
   ```
4. **Download Expo Go** on your phone from App Store/Play Store
5. **Scan the QR code** to run on your device

The web admin (already running at http://localhost:3000) works perfectly with Node v24!
