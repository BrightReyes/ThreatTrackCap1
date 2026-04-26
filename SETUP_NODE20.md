# Quick Setup Guide - Node.js v20 Installation

## Step 1: Install nvm-windows

1. **Download the installer**: https://github.com/coreybutler/nvm-windows/releases/download/1.1.12/nvm-setup.exe
2. **Run the installer** (it should have downloaded to your Downloads folder)
3. **Follow the installation wizard** - accept all defaults
4. **Close and reopen PowerShell** after installation completes

## Step 2: Install and Use Node.js v20

Open a **NEW** PowerShell window and run:

```powershell
# Install Node.js v20 LTS
nvm install 20.11.0

# Switch to Node.js v20
nvm use 20.11.0

# Verify the version
node --version
```

You should see: `v20.11.0`

## Step 3: Run the Mobile App

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1\mobile
npm install
npx expo start
```

This will:
- Show a QR code in the terminal
- Open Expo DevTools in your browser

## Step 4: View on Your Phone

1. **Download Expo Go** from App Store (iOS) or Play Store (Android)
2. **Scan the QR code** shown in the terminal
3. The app will load on your phone!

## Alternative: Test in Browser

If you want to test in a web browser instead:

```powershell
cd c:\Users\Hazy\Documents\GitHub\ThreatTrackCap1\mobile
npx expo start --web
```

This will open at http://localhost:8081

---

## Need Help?

If nvm doesn't work after installation:
1. Make sure you ran the installer as Administrator
2. Restart your computer (sometimes needed)
3. Open a fresh PowerShell window

Once Node v20 is installed, everything should work perfectly!

backup branch git switch backup-main-current-progress-20260426-211628
Created the backup branch:

backup-main-current-progress-20260426-211628

It points to commit 8413d93. Your working tree was clean, and you’re still on main, so this is a copy of the current committed version. You can restore/check it anytime with:

