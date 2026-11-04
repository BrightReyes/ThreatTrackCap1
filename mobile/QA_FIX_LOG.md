# ThreatTrack Mobile: pre-build QA fix log

Every change made in the pre-build QA pass, in one place.

**Finding a change in the code**

Every changed spot has a tag comment, so you can search for it:

| Search for | Finds |
|---|---|
| `[KEYBOARD-FIX]` | Part 1: the "auto clicking" / keyboard bug |
| `[QA-FIX #n]` | Part 2: the QA findings. `n` is the finding number used below. |

```
grep -rn "QA-FIX #6" mobile web-admin firestore.rules
```

**Free tier:** Everything here runs on the **free Spark plan**. Nothing uses Cloud Functions or Cloud Storage, which both need the paid Blaze plan (checked: the project has no deployed functions). Usage notes are in [Free-tier (Spark) notes](#free-tier-spark-notes).

**Status:** All code changes are done and verified locally (see [Verification](#verification)). Two steps still need you:

1. **Deploy** the Firestore rules.
2. **Push** the web admin changes.

Then rebuild the APK. See [Before the next build](#before-the-next-build).

---

## Contents
- [Before the next build](#before-the-next-build)
- [Free-tier (Spark) notes](#free-tier-spark-notes)
- [Part 1: Keyboard / "auto clicking" fix](#part-1-keyboard--auto-clicking-fix)
- [Part 2: QA fixes](#part-2-qa-fixes)
  - [P0: Broken before the fix](#p0-broken-before-the-fix)
  - [P1: Not robust](#p1-not-robust)
  - [P2: Optimization and cleanup](#p2-optimization-and-cleanup)
- [Files changed](#files-changed)
- [Not changed (known gaps)](#not-changed-known-gaps)
- [Verification](#verification)
- [Device test checklist](#device-test-checklist)

---

## Before the next build

| # | Step | Why |
|---|---|---|
| 1 | Run `firebase deploy --only firestore:rules` | Works on Spark. It adds the push-token fields (#5a) and the new `incident_evidence` collection (#6). **Without it, photos can't be attached.** The app then offers "Submit Without Photo", so no report is lost. If anything looks wrong, Firebase console → Firestore → Rules → History lets you roll back in one click. |
| 2 | Commit and push `web-admin/` | The live admin is deployed by Vercel from git (`web-admin/vercel.json`). Firebase Hosting was last released in Feb 2026, so it isn't used. The admin needs this change to show photos from `incident_evidence` and clear them on "done" (#6). `npm run build` passes locally. |
| 3 | *(Optional)* Save `google-services.json` as `mobile/google-services.json` | Firebase console → Project settings → Your apps → Android `com.threattrack.mobile`. It only lets the phone register a push token (#5). On Spark nothing can *send* remote pushes yet (see [Free-tier notes](#free-tier-spark-notes)), so it's not required now. Without it the app builds and runs normally. |
| 4 | Rebuild the APK (`eas build -p android --profile preview`) | Native changes need a new build: keyboard-controller, reanimated, permissions and the notification plugin. |

Do steps 1–2 **before** handing out the new APK. An old APK keeps working: the rule changes are additive only, and old inline photos are still accepted and shown.

---

## Free-tier (Spark) notes

| Feature | On Spark? | How this pass handles it |
|---|---|---|
| Firestore reads/writes/rules | ✅ Free (50K reads, 20K writes per day, 1 GiB stored) | Everything uses Firestore. The QA fixes **reduce** reads: Home no longer re-subscribes on focus, photos aren't downloaded with the incident list, and the alert listener subscribes once instead of on every popup. |
| Cloud Storage | ❌ Needs Blaze | Not used. Photos stay as inline base64 in Firestore (≤650 KB each, as before), now in their own `incident_evidence/{incidentId}` doc. At ~300–650 KB per photo, 1 GiB holds roughly 1,500–3,000 photos. Clearing photos on "done" (as before) keeps this down. |
| Cloud Functions | ❌ Needs Blaze (none are deployed) | Not used. Photo cleanup happens in the web admin itself. The heatmap's remote call to `getHeatmapData` returns 404; the app then uses its local heatmap for the rest of the session (#17). |
| Remote push (FCM) | ⚠️ Sending needs a server, i.e. a Cloud Function | The app registers and stores tokens (#5), so you're ready if you ever upgrade. Today, status alerts reach users **in-app** (ResponseAlertListener popups and local notifications) **while the app is running**. |
| Auth, Hosting | ✅ Free | Unchanged. |

---

## Part 1---

## Part 1: Keyboard / "auto clicking" fix

**Bug:** `app bug auto clicking.mp4` shows that on Android, taps into text fields seemed to "click by themselves". Focus jumped between fields and the keyboard covered the input.

**Cause:**
- The app runs **edge-to-edge**, so the window no longer resizes for the keyboard.
- The old `KeyboardAvoidingView` + `ScrollView` setup kept re-laying out the form while the keyboard animated.
- Every focus change re-rendered the whole form, because one `focusedField` state lived at screen level.

| Change | Files |
|---|---|
| Added `react-native-keyboard-controller` 1.18.5 with its peers `react-native-reanimated` ~4.1.1 and `react-native-worklets` 0.5.1. All are pinned to SDK 54-compatible versions with `expo install`. | `package.json` |
| Wrapped the app in `KeyboardProvider` (`statusBarTranslucent`, `navigationBarTranslucent`). | `App.js` |
| **New:** `KeyboardAwareForm`, a shared scroll container that keeps the focused input above the keyboard. It uses `keyboardShouldPersistTaps="handled"` and interactive dismiss. | `components/KeyboardAwareForm.js` |
| **New:** `FormField`, a memoized input that owns its focus state, so focusing one field re-renders only that field. | `components/FormField.js` |
| Login, Sign-up, Settings (change password), SOS and Report screens now use these components. | `LoginScreen.js`, `SignUpScreen.js`, `screens/SettingsScreen.js`, `screens/SOSReportScreen.js`, `screens/ReportIncidentScreen.js` |
| Fields are chained with **Next**. Focus moves only when the user presses Next. The last field submits. | Login, Sign-up, Settings |
| Bottom-sheet modals use keyboard-controller's `KeyboardAvoidingView`, which works edge-to-edge on both platforms. | `components/SmoothModal.js` |
| `App.js` callbacks are wrapped in `useCallback`, so child effects such as SignUp's BackHandler don't re-subscribe on every render. | `App.js` |

---

## Part 2: QA fixes

Numbers match the QA report.

### P0: Broken before the fix

#### #1 Every login threw an error
- **Was:** `isAlreadyVerified` was declared with `const` inside an `if` block but read outside it, in the return statement. Every login threw a `ReferenceError`. Users only got in because Firebase had already signed them in, and the error alert could flash.
- **Now:** The variable is declared at function scope.
- **File:** `utils/auth.js` (`handleLogin`)

#### #2 Sign-up race and orphan accounts
- **Was:**
  - `createUserWithEmailAndPassword` signs the user in immediately. App.js then swapped SignUpScreen for the main app before the profile was saved, so the "Account Created" alert never showed and a push-permission prompt appeared mid-signup.
  - If saving the profile failed, the auth account stayed behind with no profile. The email couldn't be registered again, and every report was blocked ("Profile Required").
- **Now:**
  - **Signup lock:** `handleSignup` sets a module-level lock (`isSignupInProgress()`), and App.js ignores signed-in events while it's held. The lock is released in `finally`, after `signOut`.
  - **Rollback:** If `setDoc(users/{uid})` fails, `user.delete()` removes the new auth account and the user sees a clear "check your connection" error.
  - **Other hardening:** A failed `updateProfile` (display name) no longer aborts signup, since the name is also in Firestore. Any later failure still signs out. Added a clear offline message (`auth/network-request-failed`).
- **Edge cases:**
  - The lock isn't persisted, so a killed app always restarts unlocked.
  - A user who already exists without a profile still gets the existing "Profile Required" message.
- **Files:** `utils/auth.js`, `App.js`

#### #3 SOS could send the wrong location
- **Was:**
  - Home's `userLocation` starts as the Valenzuela city-center coordinates. It is also replaced by them when the user is outside the city.
  - The bottom-bar SOS passed that value along. SOSReportScreen then **skipped GPS** and could submit city-center coordinates as the emergency location.
- **Now:**
  - **Real fixes only:** Home keeps a separate `lastRealFix` (null until the phone reports a real fix, inside or outside the city). Only that is passed to SOS. The map itself is still clamped to Valenzuela.
  - **Fresh fix:** SOSReportScreen **always** requests a fresh high-accuracy fix on mount. A passed location is only a preview, labelled "Approximate".
  - **Accuracy shown:** The header shows accuracy, for example "Location ready (±12 m)" or "Approximate location (last known)".
  - **Data sent to responders:** The incident stores `location.accuracy` and `location.isApproximate`. Live streaming updates both, and a streamed fix sets `isApproximate: false`.
  - **Tracking quality:** Live SOS tracking uses `Accuracy.High` (it was Balanced).
  - **Trail reset:** Home's SOS breadcrumb refs are reset per incident. Before, an old SOS's trail could be written into a new one.
  - **Double submit:** A double tap can no longer send two SOS reports.
- **Files:** `screens/HomeScreen.js`, `components/GlobalBottomBar.js`, `screens/SOSReportScreen.js`, `utils/location.js`

#### #4 SOS buttons could freeze
- **Was:**
  - All three SOS buttons (Home, bottom bar, Settings) awaited `getCurrentLocation()` before navigating, and it had no timeout. Indoors, a tap could do nothing for many seconds.
  - "Locking location…" could spin forever.
- **Now:**
  - All SOS buttons navigate **immediately**.
  - `getCurrentLocation({ timeoutMs, accuracy })` waits at most `timeoutMs`: 12 s by default, 10 s on the SOS screen. It then falls back to the phone's last known position (`isApproximate: true`).
  - It never invents a location. It returns `null` if there is no fix at all.
  - The return value adds `accuracy`, `isApproximate` and `timestamp`. Existing callers only read lat/lng/deltas, so nothing else changes.
- **Files:** `utils/location.js`, `utils/async.js` (new `withTimeout` helper), `components/GlobalBottomBar.js`, `screens/HomeScreen.js`, `screens/SettingsScreen.js`, `screens/SOSReportScreen.js`

#### #5 Push notifications never worked
| Sub | Was | Now | File |
|---|---|---|---|
| 5a | Firestore rules rejected the push-token save without any error showing. The fields weren't in the owner-update allow-list. | Added `fcmToken`, `expoPushToken`, `pushToken`, `pushNotificationsEnabled`, `lastTokenRegisteredAt`. **This is the only rules change.** | `firestore.rules` |
| 5b | There was no `google-services.json`, so `getDevicePushTokenAsync` failed. | `app.config.js` adds `android.googleServicesFile` **only if the file exists**, so a missing file can't break the build. Added the `expo-notifications` plugin (color, default channel `threattrack-alerts`) and `POST_NOTIFICATIONS`. | `app.config.js`, `app.json` |
| 5c | The Expo token was saved into `fcmToken`, but the Cloud Function sends through FCM (`admin.messaging()`), which rejects Expo tokens. `getExpoPushTokenAsync` had no `projectId`. | The native FCM token goes to `fcmToken`/`pushToken` and the Expo token to `expoPushToken`. An Expo token is never stored as FCM. The EAS `projectId` is passed. | `utils/notifications.js` |
| 5d | The token was never cleared on logout, so a logged-out phone kept getting that user's alerts. | New `unregisterPushToken(uid)` runs before `signOut`, capped at 3 s so logout never hangs offline. Registration only writes if that user is still signed in. | `utils/notifications.js`, `App.js` |

- Added `expo-constants` as a direct dependency (it's needed for `projectId`).
- **Free tier:** sending remote pushes needs a Cloud Function (Blaze). Token registration is still worth having, so push works the moment a sender exists. See [Free-tier notes](#free-tier-spark-notes) and [Not changed](#not-changed-known-gaps).

#### #6 Evidence photos were stored inside the incident document
- **Was:**
  - Photos were saved as base64 inside the incident document, up to 650 KB each.
  - Home listens to the latest 50 incidents, so it could download about 30 MB over mobile data.
  - Home also **re-subscribed on every focus**, downloading everything again each time.
- **Now (Firestore only, free Spark plan):**
  1. **Separate document.** The photo is compressed exactly as before (base64 JPEG, ≤650 KB, same 4-step shrink). It is now saved to its **own document**, `incident_evidence/{incidentId}`. The incident only gets `hasEvidencePhoto: true` and `photoStorage: 'firestore_evidence_doc'`. Home's 50-incident listener no longer downloads any photo.
  2. **Atomic save.** The incident and the evidence doc are written in **one `writeBatch`**, so either both are saved or neither is. No half-saved reports.
  3. **Fallback.** If the batch is rejected, nothing was saved. The user sees "Photo Couldn't Be Attached" with **Retry / Submit Without Photo / Cancel**, so the report is never lost. This also happens if the rules haven't been deployed yet.
- **Firestore rule** (`firestore.rules`, new `incident_evidence` match):
  - **Create:** only by the reporter, for an incident they create in the **same batch** (checked with `getAfter()`). The photo must pass the existing `isValidInlineEvidencePhoto()` checks: JPEG, ≤650 KB, ≤900 px.
  - **Read:** only the reporter and staff. Inline photos used to be publicly readable with the incident.
  - **Update/delete:** staff only.
- **Status screen** (`screens/StatusScreen.js`): when a report's details open, the photo is loaded from `incident_evidence` (one read per opened report, then cached). Old reports with an inline `photoDataUrl` still display. The list badge shows for either kind.
- **Web admin:**
  - **Photo panel** (`web-admin/js/incident-modal.js`): loads the evidence doc when an incident opens and shows it in the existing Photo Review panel and lightbox.
  - **"Done":** clears `hasEvidencePhoto` and deletes the evidence doc. It records "Evidence Cleared" exactly like inline photos.
  - **Media score** (`web-admin/js/incident-legitimacy.js`): `hasEvidencePhoto` (and `photoURL`/`photoUrls`) count as media (+25 credibility).
  - **"Delete Forever"** (`web-admin/js/recently-deleted.js`): also deletes the evidence doc. Soft delete and archive keep it, so Restore still shows the photo.
- **Home:** the `useFocusEffect` refetch is removed. The live `onSnapshot` listener stays subscribed while Home is in the stack, so new reports still appear.
- **Edge cases:**
  - An old APK still sends inline photos inside the incident. The rules still accept them, and both apps still show them.
  - Old incidents keep their inline photos, and the admin still clears them on "done".
  - An admin who has the old (not yet pushed) web admin open won't see new-format photos until the update is live.
- **Why not Cloud Storage:** an earlier draft of this fix used Storage plus a cleanup Cloud Function. Both need the paid Blaze plan, so they were removed. `storage.rules` and `functions/` are back to their original state.

### P1: Not robust

#### #7 "I'm safe" failed silently
- **Was:** A failed Firestore write was swallowed and `onResolveSafe()` still ran. The SOS vanished on the phone and GPS stopped, but responders still saw it as active.
- **Now:**
  - **Success:** `onResolveSafe()` runs only after the write succeeds.
  - **Failure:** the confirm card shows a red error with a **Try Again** button.
  - **Offline:** Firestore applies the change locally and sends it later. The wait is capped at 12 s, after which the card shows a "queued" message instead of spinning.
- **File:** `components/ActiveEmergencyModal.js`

#### #8 Dead GPS-streaming code in SOSReportScreen
- **Was:**
  - SOSReportScreen had its own streaming effect plus `handleStopDistressTracking`, `handleClose` and a pulse animation.
  - Nothing ever passed `activeIncidentId`, so none of it ran. If it had, it would have been a second GPS writer next to Home.
- **Now:** Removed. **HomeScreen is the only writer of live SOS coordinates.**
- **File:** `screens/SOSReportScreen.js`

#### #9 Slow submit, and hanging when offline
- **Was:**
  - SOS and report submit ran `reload` → forced `getIdToken(true)` → `getDoc` → `getDocs` → profile writes → reverse geocoding (no timeout), one after another.
  - Offline, the button could spin forever, because Firestore write promises don't settle while offline.
- **Now:**
  - **Faster eligibility check** (`getReportEligibility`): the profile is read first. `reload()` runs only if the profile isn't already verified, and in parallel with the prior-report query. The forced token refresh is removed. Self-heal profile writes are fire-and-forget.
  - **Geocoding:** reverse geocoding is capped at about 2.5 s, then falls back to "Valenzuela City, Philippines".
  - **Write confirmation:** both SOS and report wait at most 15 s for the server. After that the user sees **"Queued – Weak Connection"**: the write stays queued and is sent automatically once back online. The SOS version also has a **Call 911** button.
  - **Offline errors:** an offline failure shows **"No Connection"** with Call 911 / Try Again, instead of a generic error.
- **Files:** `utils/auth.js`, `utils/location.js`, `screens/SOSReportScreen.js`, `screens/ReportIncidentScreen.js`

#### #10 GPS wording overstated tracking
- **Was:** The app said "First responders have your live position", but streaming only runs while the app is open on Home.
- **Now (foreground-only, as you decided):**
  - **SOS modal:** "Live GPS While App Is Open / Keep ThreatTrack open until you are safe".
  - **Sticky SOS card on Home:** shows **"Paused – app in background • Open to resume"** while the app isn't in the foreground (`AppState`).
  - **SOS success message:** explains that live location is shared from Home while the app is open.
- **Files:** `components/ActiveEmergencyModal.js`, `screens/HomeScreen.js`, `screens/SOSReportScreen.js`, `components/ResponseAlertListener.js` (default text)

#### #11 UI drawn under Android's navigation buttons
- **Was:**
  - With edge-to-edge, the bottom nav bar, SOS footer, Report buttons, SOS gateway and bottom sheets sat under the 3-button or gesture nav bar.
  - RN's `SafeAreaView` does nothing on Android.
- **Now:**
  - **Root:** `SafeAreaProvider` wraps the app.
  - **Bars and footers:** each gets its original padding **plus** `insets.bottom`: GlobalBottomBar, SOS footer, Report button bar, SOS gateway. The SOS header uses `max(34, insets.top + 10)`.
  - **Bottom sheets** (`SmoothModal`, position "bottom"): add the inset to their own bottom padding. RN 0.81 forces Modals edge-to-edge (checked in `ReactModalHostView.kt`), so the sheets need it.
  - **Cleanup:** RN `SafeAreaView` was replaced in SOSGateway and SOSReport.
- **Files:** `App.js`, `components/GlobalBottomBar.js`, `components/SmoothModal.js`, `screens/SOSReportScreen.js`, `screens/SOSGatewayScreen.js`, `screens/ReportIncidentScreen.js`

#### #12 Alert popups dropped, duplicated, or re-subscribed
- **Was:**
  - Both listeners re-subscribed (re-reading all of the user's notifications and incidents) every time a popup opened or closed.
  - Alerts that arrived during a popup were lost.
  - The same dispatch could pop twice.
  - A system notification fired even while the app was open.
- **Now:**
  - **Subscriptions:** each listener subscribes once. The current popup and preferences live in refs.
  - **Queue:** new alerts are queued and shown one after another.
  - **Duplicates:** dispatch alerts are de-duplicated per incident (2 min window).
  - **System notifications:** only sent when the app isn't in the foreground.
  - **Preferences:** notifications that arrive before preferences load wait for them, so a disabled category never pops.
  - **Mark read:** `markRead` is idempotent (it used to write twice).
- **File:** `components/ResponseAlertListener.js`

#### #13 Alerts could hide or overwrite each other
- **Was:**
  - `hideAlert` spread a stale `alertConfig`.
  - `CustomAlert` ran a button's `onPress` **before** `onClose`, so any alert opened by a button, like the photo-upload fallback, was hidden immediately.
- **Now:**
  - `hideAlert` uses a functional update in Home, SOSReport, ReportIncident and Settings.
  - CustomAlert calls `onClose()` first, **then** `onPress()`. Every `onClose` in the app is a plain hide function, which I checked, so the new order is safe.
- **Files:** `components/CustomAlert.js`, those screens

#### #14 Auto-close alerts never closed during an SOS
- **Was:** The timer effect depended on `buttons` and `onClose`, which are new on every parent render. Every GPS ping on Home restarted the timer.
- **Now:** Both are kept in refs, and the effect depends only on `visible` and `autoCloseDelay`.
- **File:** `components/CustomAlert.js`

#### #15 "Mark all read" failed above 500
- **Was:** One `writeBatch` for every unread notification. Firestore's limit is 500 writes per batch.
- **Now:** Commits in chunks of 450.
- **File:** `screens/AlertsScreen.js`

#### #16 Tapping a push notification did nothing
- **Was:** The tap was only logged.
- **Now:**
  - **Navigation:** a navigation ref on `NavigationContainer` opens **Status** for report updates and **Alerts** for `nearby_incident`.
  - **Cold start:** `getLastNotificationResponseAsync` handles taps that launched the app. The target waits for the navigator to be ready.
- **Files:** `App.js`, `utils/notifications.js`

### P2: Optimization and cleanup

| # | Change | File |
|---|---|---|
| 17 | **Heatmap:** computed locally first. The Cloud Function is called only if local points are empty, at most once per minute per area and time range. Before, it ran on every incidents snapshot and every pan, and the result was thrown away. | `screens/HomeScreen.js` |
| 18 | **Map overlays** (boundary, hotspot circles, heatmap, precinct pins) moved unchanged into a `React.memo` `MapOverlays` component. **Lists:** `precinctsByDistance`, `incidentsByPriority` and `recentIncidents` are memoized. Before, every GPS ping re-rendered every map element. | `screens/HomeScreen.js` |
| 19 | **Notification handler:** uses SDK 54's `shouldShowBanner` / `shouldShowList` instead of the deprecated `shouldShowAlert`. **Local notifications:** now actually use the requested Android `channelId`. | `utils/notifications.js` |
| 20 | **Login:** removed the redundant `reload()` and the unused forced `getIdToken(true)`. **Signup:** removed `console.log` calls that printed name, email, phone and address (PII). | `utils/auth.js` |
| 21 | **Permissions:** removed `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` and `READ_EXTERNAL_STORAGE`, none of which are used. Location uses `locationWhenInUsePermission` (no "Always" prompt). Nothing uses background location, which I checked. | `app.json` |
| 22 | **Dependencies:** `expo` ~54.0.37, `expo-image-picker` ~17.0.11, `expo-constants` added. De-duplicated `expo-font`. `expo-doctor` passes 18/18. | `package.json` |

---

## Files changed

**Mobile (`mobile/`)**

| File | Fixes |
|---|---|
| `App.js` | KEYBOARD, #2, #5d, #11, #16 |
| `app.json` | #5b, #21 |
| `app.config.js` | #5b |
| `package.json` | KEYBOARD, #5, #22 |
| `LoginScreen.js`, `SignUpScreen.js` | KEYBOARD |
| `utils/auth.js` | #1, #2, #9, #20 |
| `utils/location.js` | #3, #4, #9 |
| `utils/notifications.js` | #5, #16, #19 |
| `utils/async.js` (**new**) | #4, #5d, #9 |
| `components/FormField.js`, `components/KeyboardAwareForm.js` (**new**) | KEYBOARD |
| `components/GlobalBottomBar.js` | #3, #4, #11 |
| `components/CustomAlert.js` | #13, #14 |
| `components/ResponseAlertListener.js` | #10, #12 |
| `components/ActiveEmergencyModal.js` | #7, #10 |
| `components/SmoothModal.js` | KEYBOARD, #11 |
| `screens/HomeScreen.js` | #3, #6, #8, #10, #13, #17, #18 |
| `screens/SOSReportScreen.js` | KEYBOARD, #3, #4, #8, #9, #10, #11, #13 |
| `screens/ReportIncidentScreen.js` | KEYBOARD, #6, #9, #11, #13 |
| `screens/SettingsScreen.js` | KEYBOARD, #4, #13 |
| `screens/SOSGatewayScreen.js` | #11 |
| `screens/StatusScreen.js` | #6 |
| `screens/AlertsScreen.js` | #15 |

**Backend and web admin**

| File | Fixes |
|---|---|
| `firestore.rules` | #5a (push token fields), #6 (new `incident_evidence` rule) |
| `web-admin/js/incident-legitimacy.js` | #6 |
| `web-admin/js/incident-modal.js` | #6 |
| `web-admin/js/recently-deleted.js` | #6 |

`storage.rules` and `functions/` are **unchanged** (Spark can't use them).

---

## Not changed (known gaps)

These need a decision from you, so they were left as they are:

1. **No remote push on the free plan.**
   - Sending pushes needs server code (a Cloud Function), which Spark can't run. Alerts reach users in-app while ThreatTrack is running.
   - If you ever move to Blaze: `sendNearbyIncidentAlert` also only looks at users with `alertPreferences.enabled` **and** a stored `users.location`. The app writes neither, and storing citizens' locations is a privacy decision.
2. **Live SOS location stops when the app goes to the background.** This is foreground-only, as you chose. The UI now says so (#10). Background tracking would need a foreground service and the "Always" location permission.
3. **Security rules were not tightened**, as you decided. The only changes are the push token fields and the new `incident_evidence` collection.
4. **Dead code left in place** (not part of this pass), all in `screens/HomeScreen.js`: unused helpers `getHeatmapMarkerRadius`, `getHeatmapMarkerPoints`, `centerMapOnUser`, `getIncidentIcon`, `rotationValue`, `riskStats` and Home's old unused `handleSOSPress`. They're harmless.

---

## Verification

Run locally after all changes:

| Check | Result |
|---|---|
| `npx expo export --platform android` | ✅ Bundle builds (5.94 MB Hermes bytecode) |
| `npx expo-doctor` | ✅ 18/18 checks pass |
| `npx expo install --check` | ✅ Dependencies up to date |
| ESLint `no-undef` on all changed mobile files | ✅ 0 errors (no undefined variables, so no runtime `ReferenceError`) |
| `node --check` on the changed web-admin files | ✅ Passes |
| `web-admin`: `npm run build` (Vite) | ✅ Builds |
| `firebase functions:list` | Confirms no functions are deployed (Spark), so nothing here depends on them |
| `npx expo config` | ✅ `locationWhenInUsePermission`, `POST_NOTIFICATIONS`; `googleServicesFile` is left out until the file exists |

**Not verified yet (needs the device and the deploy):** everything in the checklist below.

---

## Device test checklist

After steps 1–2 and installing the new APK:

**Login and sign-up**
- [ ] Login shows no error alert.
- [ ] Sign up: "Account Created" shows, "Go to Sign In" returns to Login, and `users/{uid}` exists in Firestore.
- [ ] Sign up in airplane mode: you get a clear error, and no half-created account (you can register the same email later).

**Keyboard**
- [ ] Tapping fields doesn't jump focus. **Next** moves to the next field, and the keyboard never covers the input.
- [ ] Forgot-password and change-password sheets stay above the keyboard.

**SOS**
- [ ] SOS from the Home bottom bar, Settings and the SOS gateway opens instantly.
- [ ] The header shows "Location ready (±N m)".
- [ ] The coordinates in the web admin are your real position.
- [ ] SOS indoors or with GPS off: it gives up after ≤10 s, shows "Approximate (last known)" or "Location unavailable", and Retry works.
- [ ] SOS in airplane mode: you see "No Connection" with Call 911.
- [ ] During an SOS, put the app in the background and back: the sticky card shows "Paused…", then "Live…" again.
- [ ] "I'm safe" works normally. With a rejected write it shows the red error and Try Again, and the SOS stays active.

**Reports and photos**
- [ ] A report with a photo creates `incidents/{id}` with `hasEvidencePhoto: true` **and** `incident_evidence/{id}` with the photo.
- [ ] The incident doc has **no** `photoDataUrl`.
- [ ] Status → open the report: the photo shows.
- [ ] The web admin shows the photo in Photo Review and the lightbox, and gives the media credibility score.
- [ ] Web admin: marking it **done** removes `hasEvidencePhoto`, deletes the `incident_evidence` doc, and shows "Evidence Cleared".
- [ ] Soft delete / Restore keeps the photo. "Delete Forever" removes the evidence doc too.
- [ ] Before the rules are deployed (or with a rejected write), a report with a photo shows "Photo Couldn't Be Attached", and "Submit Without Photo" works.
- [ ] An old report with an inline photo still shows its photo in Status and in the web admin.

**Push and alerts**
- [ ] *(Only if `google-services.json` is in the build)* `users/{uid}.fcmToken` is filled after login, and removed after logout.
- [ ] A dispatch update while the app is open shows the in-app popup. With the app in the background (but not closed), a local notification appears, and tapping it opens Status.
- [ ] Two dispatch updates in a row: both popups show, one after the other, with no duplicate.
- [ ] "Mark all read" works.

**Layout**
- [ ] On 3-button navigation, the bottom bar, SOS footer, Report buttons and bottom sheets are not covered.
