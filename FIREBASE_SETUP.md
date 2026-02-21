# Firebase Authentication Setup Guide

## IMPORTANT: Complete these steps before testing login/signup

Your Firebase is configured, but you need to enable authentication:

### Step 1: Enable Email/Password Authentication

1. Go to **Firebase Console**: https://console.firebase.google.com
2. Select your project: **threattrackcap1**
3. Click **Authentication** in the left sidebar
4. Click **Get started** button
5. Click on **Sign-in method** tab
6. Click **Email/Password**
7. **Enable** the first toggle (Email/Password)
8. Click **Save**

### Step 2: Create Firestore Database

1. In Firebase Console, click **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select your location (closest to you)
5. Click **Enable**

### Step 3: Update Firestore Rules (Security)

Go to **Firestore Database** > **Rules** tab and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can read/write their own data
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Crimes collection - authenticated users can read
    match /crimes/{crimeId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }
    
    // Police precincts - public read
    match /police_precincts/{precinctId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

Click **Publish**

### Step 4: Test Authentication

1. Go back to your app at http://localhost:8081
2. Click **Sign Up**
3. Fill in all fields:
   - First Name: John
   - Last Name: Doe
   - Email: test@example.com
   - Password: test123
   - Confirm Password: test123
4. Click **SIGN UP**

If successful, you'll see "Account created successfully!" and be redirected to login.

5. Login with:
   - Email: test@example.com
   - Password: test123

### Step 5: Verify in Firebase Console

After signup, check:
1. **Authentication** > **Users** tab - you should see the new user
2. **Firestore Database** > **users** collection - you should see user data

---

## Common Errors & Solutions:

### "Firebase: Error (auth/operation-not-allowed)"
→ Email/Password authentication not enabled in Firebase Console

### "Missing or insufficient permissions"
→ Firestore rules not set up correctly

### "Network request failed"
→ Check your internet connection or Firebase config

---

## Current Status:

✅ Firebase config added
✅ Authentication code implemented
✅ Firestore integration ready
⏳ Waiting for you to enable auth in Firebase Console

Once you complete Steps 1-2 above, authentication will work perfectly!
