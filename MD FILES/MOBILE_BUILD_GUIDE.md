# ThreatTrack Mobile – APK Build & Landing Page Release Guide

This guide walks you through building an installable Android APK (`.apk`) for ThreatTrack using **Expo Application Services (EAS) Cloud** and updating the **Landing Page** (download button and QR code installer) so citizens and testers can download the new version.

---

## 🚀 Fast Track (EAS Cloud Build)

Whenever you want to build a new APK to test your latest code changes on an Android phone:

```powershell
# 1. Navigate to the mobile project folder
cd mobile

# 2. Make sure your changes are saved and committed to Git
git add .
git commit -m "feat(mobile): your update description"

# 3. Trigger the EAS Android APK build
npx eas-cli build -p android --profile preview
```

> **Why `--profile preview`?**  
> In `eas.json`, the `preview` profile is pre-configured with `"buildType": "apk"`. This produces a standalone `.apk` installer that you can install directly on any Android device without needing the Google Play Store.

---

## 📋 Detailed Step-by-Step Instructions

### Step 1: Check Git Status
EAS packages your current Git commit into the cloud build container. Always verify your working tree:
```powershell
git status
```
If you have uncommitted files:
```powershell
git add .
git commit -m "style(mobile): update UI and screens"
```

### Step 2: Verify Your EAS Session
Confirm that you are authenticated with Expo/EAS:
```powershell
npx eas-cli whoami
```
* If logged in, you will see your account (`hazybright`).
* If not logged in, run:
  ```powershell
  npx eas-cli login
  ```

### Step 3: Trigger the Build
Run the build command:
```powershell
npx eas-cli build -p android --profile preview
```

#### Optional Flags:
* **Background Mode (`--no-wait`):** Uploads your code and immediately gives you the dashboard URL without waiting in the terminal:
  ```powershell
  npx eas-cli build -p android --profile preview --no-wait
  ```
* **Non-Interactive Mode (`--non-interactive`):** Bypasses interactive prompts:
  ```powershell
  npx eas-cli build -p android --profile preview --non-interactive --no-wait
  ```

### Step 4: Track the Build & Download the APK
1. Once triggered, the terminal displays your live build dashboard URL:
   `https://expo.dev/accounts/hazybright/projects/threattrack-mobile/builds/<BUILD_ID>`
2. Open that URL in your browser.
3. When the build finishes (typically 3–5 minutes):
   * Click **Download** to get the `.apk` file.
   * Or scan the **QR code** directly with your phone's camera to download and install.

---

## 🔄 CRITICAL POST-BUILD STEP: Updating the Landing Page

Once you have the newly built `.apk`, you **must** update the public landing page so visitors and thesis evaluators download the latest version:

### 1. Host the New APK File
Upload the generated `.apk` file to GitHub Releases:
1. Go to your repository on GitHub: `https://github.com/BrightReyes/ThreatTrackCap1/releases`
2. Create a new Release (e.g., `v1.0.2`).
3. Attach your new `.apk` file (name it `ThreatTrack-App.apk`).
4. Copy the direct download link (e.g. `https://github.com/BrightReyes/ThreatTrackCap1/releases/download/v1.0.2/ThreatTrack-App.apk`).

### 2. Update the APK Download Button Link
Open **`web-admin/index.html`** and update the `href` in both download buttons:
* Search for `download-apk-btn` (around lines 90 and 785):
```html
<!-- Replace with your new release APK URL -->
<a href="https://github.com/BrightReyes/ThreatTrackCap1/releases/download/v1.0.2/ThreatTrack-App.apk" download="ThreatTrack-App.apk" class="btn btn-hero-white download-apk-btn">
    Download APK
</a>
```

### 3. Generate & Replace the QR Code Installer
The landing page displays a QR code at `web-admin/assets/threattrack-download-qr.svg` so users can scan to download with their camera.

When your APK URL changes, regenerate the SVG QR code using this single PowerShell command:

```powershell
# In PowerShell (replace YOUR_NEW_APK_URL with your actual download link):
$apkUrl = "https://github.com/BrightReyes/ThreatTrackCap1/releases/download/v1.0.2/ThreatTrack-App.apk"
$encodedUrl = [System.Uri]::EscapeDataString($apkUrl)
curl.exe -o "web-admin\assets\threattrack-download-qr.svg" "https://api.qrserver.com/v1/create-qr-code/?size=370x370&format=svg&data=$encodedUrl"
```

* **Verify the QR Code:** Open `web-admin/assets/threattrack-download-qr.svg` in a browser or test scanning it with your phone to make sure it immediately directs to the new `.apk` download.

### 4. Rebuild the Web Admin / Landing Page
Run the build script to compile the updated assets:
```powershell
cd web-admin
npm run build
```

---

## 💻 Alternative: Local Android Build (Offline / No Cloud)

If you don't have internet access or want to compile the APK directly on your local computer using the Android SDK:

```powershell
cd mobile\android
.\gradlew.bat assembleDebug
```

### Where to Find the Output APK:
Once Gradle finishes:
```text
mobile\android\app\build\outputs\apk\debug\app-debug.apk
```
You can transfer `app-debug.apk` to your phone via USB or run `adb install` to test immediately.

---

## 🛠️ Build Profiles in `eas.json` Reference

| Profile | Output Type | Distribution | When to Use |
| :--- | :--- | :--- | :--- |
| **`preview`** *(Recommended)* | Standalone `.apk` | Internal | Testing on physical devices, thesis panel demonstrations, advisor review |
| **`development`** | Dev Client `.apk` | Internal | Advanced native module debugging with live Metro reload |
| **`production`** | Standalone `.apk` | Production | Final milestone release |

---

## ❓ Frequently Encountered Issues

### 1. `Node.js v20.x is deprecated` Warning
* This is just a deprecation notice from EAS CLI. The build will still proceed without errors. Node 20 LTS is fully supported.

### 2. `Uncommitted changes detected`
* EAS will ask whether to proceed. It is best practice to commit changes first (`git commit`) so every cloud build is permanently linked to an exact Git commit hash in your Expo dashboard.

### 3. Check Live Status of an Ongoing Build
```powershell
npx eas-cli build:view <BUILD_ID>
```
Or view all recent builds:
```powershell
npx eas-cli build:list
```
