# ThreatTrack - Mobile App & Web Admin

A security threat tracking application with mobile app and web admin panel.

## Project Structure

```
├── mobile/           # React Native mobile app
├── web-admin/        # Web admin panel (React + Vite)
└── shared/           # Shared code and utilities
```

## Getting Started

### Web Admin

The web admin panel runs on Vite and works with Node.js v24+.

```bash
cd web-admin
npm install
npm run dev
```

Access at: http://localhost:3000

### Mobile App

The mobile app uses React Native CLI (compatible with Node.js v24).

**Prerequisites:**
- Node.js v20+ (v24 recommended)
- For iOS: Xcode, CocoaPods
- For Android: Android Studio, JDK

**Setup:**
```bash
cd mobile
npm install

# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

**Note:** If using Expo (requires Node.js v20 LTS):
```bash
# Use nvm to switch Node versions
nvm install 20
nvm use 20

cd mobile
npm install
npx expo start
```

## Features

### Mobile App
- User authentication (login/register)
- Threat reporting
- Real-time notifications
- Offline support

### Web Admin
- Admin dashboard
- User management
- Threat monitoring
- Analytics and reports

## Technology Stack

- **Mobile:** React Native
- **Web Admin:** React + Vite
- **Shared:** Common utilities and API clients