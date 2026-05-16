# ThreatTrack Defense Priority Fix List

Date checked: May 16, 2026  
Scope: mobile user app, web admin dashboard, Firebase rules, Cloud Functions, deployment config, and defense-demo readiness.

## Priority Legend

| Priority | Meaning | Defense impact |
| --- | --- | --- |
| P0 - Critical | Must fix before defense | Panel may question security, correctness, or deployment readiness. |
| P1 - High | Strongly recommended before defense | Feature works, but has visible lapses or weak explanation. |
| P2 - Medium | Improve if time allows | Helps polish, maintainability, and confidence. |
| P3 - Low | After defense | Cleanup, refactor, or future production hardening. |

## Overall Readiness

ThreatTrack is demo-capable, but not yet ready to present as a secure production-like public safety system. The main lapses are:

- Admin pages are shown to any signed-in Firebase user before role validation.
- Firestore role rules may allow too much profile and role editing.
- Mobile app had mock/demo fallbacks that could make fake data look live; the user-side Home and SOS P0 items are now addressed.
- SOS can submit using a default location when real location fails.
- Cloud Functions lint currently fails and can block deployment.
- No project tests were found for functions, rules, or core workflows.

Recommended defense framing:

> ThreatTrack is a capstone prototype for incident reporting, SOS reporting, crime mapping, admin moderation, and responder notification. Before real-world deployment, the system must tighten role access, remove demo fallbacks, add tests, and harden privacy rules.

## Checks Run

| Check | Result | Notes |
| --- | --- | --- |
| `npm --prefix web-admin run build` | Passed | Web admin production build completed successfully. |
| `npm --prefix functions run lint` | Failed | 1519 lint errors. Mostly CRLF line endings, trailing spaces, missing JSDoc, and Google ESLint style issues. This can block deploy because `firebase.json` runs lint in `predeploy`. |
| `npm --prefix functions test -- --runInBand` | Failed | Jest found 0 project tests. |
| Test file scan excluding `node_modules` | Failed coverage expectation | No local `*.test.js` or `*.spec.js` files found outside dependency folders. |

## P0 Critical Fixes

These are the highest priority before facing the panel.

| Area | Side | Lapse | Required change | Files |
| --- | --- | --- | --- | --- |
| Admin access control | Admin | Any authenticated Firebase user can be redirected to admin pages before role checking. | Check `users/{uid}.role` before showing any admin page. Allow only `admin` or approved staff roles. | `web-admin/js/admin-auth.js`, `web-admin/js/login.js` |
| Role escalation | Admin / Backend | `police` staff can manage user profiles, and staff updates may include `role`. | Split profile editing from role management. Only admins should change roles. | `firestore.rules`, `web-admin/js/user-modal.js` |
| Public incident reads | Shared | `incidents` has `allow read: if true`, exposing descriptions and coordinates. | Restrict detailed reads or create public sanitized incident summaries for map use. | `firestore.rules`, mobile map/admin queries |
| User PII exposure | Shared | Any authenticated user can read all `users` documents. | Limit user reads to self and admin/staff. | `firestore.rules` |
| SOS fake location | User | Addressed: SOS no longer uses `DEFAULT_LOCATION` if real location fails. | Keep SOS blocked until real user location is confirmed. | `mobile/screens/SOSReportScreen.js` |
| Mock data in demo | User | Addressed: active Home screen no longer generates mock incidents and now uses real Valenzuela PCP 1-12 coordinates for map precincts. | Keep Firestore seeded for incidents; precinct map has a local public-source baseline. | `mobile/screens/HomeScreen.js`, `mobile/data/valenzuelaPrecincts.js` |
| Functions deploy blocker | Shared | Functions lint fails, and deploy runs lint as predeploy. | Fix line endings/style or adjust ESLint rules, then rerun lint until it passes. | `functions/.eslintrc.js`, `functions/src/*.js`, `firebase.json` |

## Admin Side Fixes

### P0 - Admin Authentication and Authorization

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Add role gate to `initAdminPage`. | Prevents normal users from entering admin screens. | After `onAuthStateChanged`, fetch `users/{uid}` and verify role before `page.hidden = false`. |
| Add role check after admin login. | Prevents a regular user from being redirected to `dashboard.html`. | In `web-admin/js/login.js`, call a helper like `getAdminProfile(user.uid)` before redirect. |
| Add unauthorized handling. | Gives clean behavior during demo. | Redirect to `login.html` or show "Unauthorized admin access" message. |
| Remove admin debug text from UI. | Prevents panel seeing UID/project debug info. | Clean `web-admin/js/notifications.js` debug status output. |

Relevant files:

- `web-admin/js/admin-auth.js`
- `web-admin/js/login.js`
- `web-admin/js/notifications.js`
- `shared/auth.js`

### P0 - User and Role Management

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Prevent non-admin role changes. | Avoids privilege escalation. | In rules, only `isAdmin()` can update `role`. |
| Separate police permissions. | Police should not manage account roles or trust fields. | Create separate rule helpers: `canEditProfileFields()` and `canManageRoles()`. |
| Replace profile deletion with account status control. | Deleting only Firestore profile leaves Firebase Auth account active. | Prefer setting `accountStatus: suspended` or `disabled`. |
| Remove development logs. | Console logs weaken defense polish. | Clean `console.log` in `web-admin/js/users-list.js`. |

Relevant files:

- `firestore.rules`
- `web-admin/js/users-list.js`
- `web-admin/js/user-modal.js`

### P1 - Incident Moderation

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Add moderation notes or rejection reason. | Panel may ask how false reports are reviewed. | Require admin note when status is `rejected`, `spam`, or `done`. |
| Avoid fixed responder assignment. | Current response always uses Malinta Precinct. | Use nearest precinct or allow admin to choose precinct. |
| Move status transitions server-side later. | Client-side status updates are easier to manipulate if rules fail. | Future callable function: `moderateIncident`. |
| Explain short incident codes. | Current `TR-0000` style hash can collide. | Use full document ID internally and short code only for display. |

Relevant files:

- `web-admin/js/incident-modal.js`
- `web-admin/js/admin-response.js`
- `web-admin/js/admin-sos-alerts.js`

### P1 - Admin Settings, Audit, and Data Tools

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Restrict audit log creation. | Current rules allow any authenticated user to create audit logs. | Make audit creation admin-only or Cloud Functions-only. |
| Restrict sensitive settings reads. | Any authenticated user can read `settings`. | Split public settings from admin/security settings. |
| Add stronger confirmation for cleanup/import tools. | Prevents accidental data loss during demo. | Require typed confirmation and audit log for destructive data tools. |
| Make audit logs tamper-resistant later. | Client-created logs are not fully trustworthy. | Write audit logs through Cloud Functions. |

Relevant files:

- `web-admin/js/settings.js`
- `web-admin/js/audit.js`
- `firestore.rules`

### P2 - Admin UI Polish

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Normalize joined date display. | User profiles store ISO strings but admin formatter expects Firestore Timestamp. | Accept both ISO string and Firestore Timestamp. |
| Remove debug status messages. | Keeps defense UI professional. | Remove "Loading... uid/role/project" text. |
| Document admin roles. | Panel may ask role differences. | Add small internal notes: admin, moderator, police, user. |

## User Side Fixes

### P0 - SOS Reporting

Status: addressed in `mobile/screens/SOSReportScreen.js`.

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Remove `DEFAULT_LOCATION` submission fallback. | Prevents false emergency location. | Done: SOS now keeps location null when GPS fails. |
| Confirm location before sending SOS. | Builds trust for emergency reporting. | Done: submit is disabled until valid coordinates exist. |
| Make SOS failure state demo-ready. | Panel may deny permissions during demo. | Prepare a clear message for denied location permission. |

Relevant files:

- `mobile/screens/SOSReportScreen.js`
- `mobile/screens/SOSGatewayScreen.js`
- `mobile/utils/location.js`

### P0 - Map and Demo Data

Status: addressed in `mobile/screens/HomeScreen.js`.

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Disable generated mock incidents. | Prevents fake data being mistaken as real reports. | Done: empty/error Firestore incident states now render empty data. |
| Disable generated mock precincts. | Prevents inaccurate precinct display. | Done: map now uses real Valenzuela PCP 1-12 coordinates from the local public-source baseline, with the Valenzuela boundary updated from OSM relation 307470. |
| Label any demo data. | Helps honest defense explanation. | Add visible "Demo data" banner if using seeded samples. |

Relevant files:

- `mobile/screens/HomeScreen.js`
- `mobile/data/valenzuelaPrecincts.js`
- `functions/generateTestData.js`

### P1 - Mobile Authentication and Session

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Use Firebase auth state listener in `App.js`. | Current local `isAuthenticated` state can desync after restart. | Add `onAuthStateChanged(auth, ...)` and a loading screen. |
| Call Firebase `signOut`. | Current logout only resets local UI state. | Use `signOut(auth)` before returning to login. |
| Implement forgot password. | Button exists but does not work. | Use `sendPasswordResetEmail(auth, email)`. |
| Remove PII logs. | Signup logs print personal user data. | Remove logs or enable only in dev builds. |

Relevant files:

- `mobile/App.js`
- `mobile/LoginScreen.js`
- `mobile/SignUpScreen.js`
- `mobile/utils/auth.js`

### P1 - Incident Reporting

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Add real report rate limiting. | Prevents repeated false/spam reports. | Enforce with Cloud Functions or server-controlled counters. |
| Align email verification with photo upload. | Unverified users can submit reports but may fail photo upload. | Decide one policy: require verified email for reports or allow photo upload without verification. |
| Show photo upload failure clearly. | User may think evidence was uploaded when it was not. | After failed upload, show "report saved, photo failed" message. |
| Test `serverTimestamp()` rule behavior. | Firestore rule checks `reportedAt == request.time`. | Add emulator test for incident create. |

Relevant files:

- `mobile/screens/ReportIncidentScreen.js`
- `mobile/screens/SOSReportScreen.js`
- `mobile/utils/auth.js`
- `firestore.rules`
- `storage.rules`

### P1 - Notifications and Preferences

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Persist notification settings. | Settings toggles are local only. | Save under `users/{uid}.alertPreferences`. |
| Save push notification token. | Cloud Function expects `fcmToken`, but app does not consistently store it. | Add Expo/FCM registration and save token. |
| Remove or fix unused `NotificationsScreen.js`. | It queries all notifications and uses mock data. | Delete if unused or filter by current user. |
| Implement or remove Anonymous Mode. | Toggle exists but does not change report behavior. | Either add `isAnonymous` support or remove the toggle before defense. |

Relevant files:

- `mobile/screens/SettingsScreen.js`
- `mobile/screens/AlertsScreen.js`
- `mobile/screens/NotificationsScreen.js`
- `mobile/components/ResponseAlertListener.js`
- `functions/src/sendNearbyIncidentAlert.js`

### P2 - Mobile UI and Text Polish

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Fix placeholder typo `sample@.com`. | Visible UI polish issue. | Done: changed to `sample@example.com`. |
| Change "Forget Password?" to "Forgot Password?" | Visible wording issue. | Done: updated label in login screen. |
| Raise small mobile text sizes. | Very small labels are hard to read for older users and during panel demos. | Done: active user-side screens now use at least 14px text with wider line heights and less aggressive truncation. |
| Remove duplicate/old screens and backup files if not used. | Reduces panel confusion if repo is inspected. | Archive or delete stale backups after confirming. |

Relevant files:

- `mobile/LoginScreen.js`
- `mobile/screens/*.backup.js`
- `mobile/screens/HomeScreen.old.js`

## Shared Firebase and Backend Fixes

These affect both admin and user sides.

### P0 - Security Rules

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Restrict detailed incident reads. | Incident descriptions and exact locations are sensitive. | Use admin-only details and public map summary collection. |
| Restrict user profile reads. | Protects name, phone, address, barangay, and status fields. | Users read own profile; staff read only if role allows. |
| Restrict profile picture writes. | Current rule allows any authenticated user to write any profile path. | Use path `profile-pictures/{userId}/{fileName}` and require owner. |
| Restrict notification owner updates. | Owners should only mark read, not edit content. | Allow only `read`, `readAt` changes for user-owned notifications. |
| Replace placeholder rate limit. | Current `hasNotExceededRateLimit()` returns `true`. | Enforce through Cloud Functions or server-side counters. |

Relevant files:

- `firestore.rules`
- `storage.rules`

### P0 - Cloud Functions Deploy Readiness

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Fix lint failures. | Firebase deploy can fail at predeploy. | Normalize LF line endings, remove trailing spaces, fix JSDoc/indent, or tune ESLint rules. |
| Add tests. | Panel can ask how correctness is proven. | Add Jest tests for validation and rules emulator tests for access control. |
| Recreate Firestore batch after commit. | `aggregateHeatmapData` can fail with many grid cells. | Create a new `db.batch()` after every commit. |
| Protect public HTTP endpoints. | Risk/heatmap endpoints are public/open CORS. | Add Auth/App Check or document as public read-only prototype endpoints. |

Relevant files:

- `functions/src/validateIncident.js`
- `functions/src/aggregateHeatmapData.js`
- `functions/src/getHeatmapData.js`
- `functions/src/calculateRiskLevel.js`
- `functions/src/findNearestPrecinct.js`
- `functions/src/sendNearbyIncidentAlert.js`

### P1 - Data Model Consistency

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Normalize timestamp types. | Some code expects Firestore Timestamp while signup stores ISO strings. | Use `serverTimestamp()` for trusted Firestore timestamps. |
| Centralize incident statuses. | Status values are spread across files. | Document or export one list: `pending`, `under_review`, `verified`, `responding`, `done`, `rejected`, `spam`, `error`. |
| Normalize notification read state. | Code uses both `read` and `readAt`. | Prefer `readAt` as source of truth. |
| Add real seed data docs. | Helps panel demo reliability. | Create Valenzuela seed instructions and identify seed records as demo data. |

Relevant files:

- `DATABASE_SCHEMA.md`
- `firestore.indexes.json`
- `mobile/utils/auth.js`
- `web-admin/js/notifications-list.js`
- `functions/generateTestData.js`

### P1 - Project Configuration

| Fix | Why it matters | Suggested implementation |
| --- | --- | --- |
| Add root scripts. | Makes checks easy before defense. | Add `build:web`, `lint:functions`, `test:functions`, `check:defense`. |
| Choose canonical app config. | Root `app.json` and `mobile/app.json` differ. | Use `mobile/app.json` as canonical if mobile is the app. |
| Clean duplicate Android folders. | Root `android/` and `mobile/android/` differ. | Keep one active Android project and document it. |
| Centralize Firebase config. | Same config is duplicated. | Share config or document why web and mobile differ. |

Relevant files:

- `package.json`
- `app.json`
- `mobile/app.json`
- `android/`
- `mobile/android/`
- `shared/firebase.js`
- `mobile/utils/firebase.js`

## Suggested Fix Order

1. Admin role gate in `web-admin/js/admin-auth.js` and `web-admin/js/login.js`.
2. Firestore role escalation and PII read rules in `firestore.rules`.
3. Re-test SOS real-location blocking in `mobile/screens/SOSReportScreen.js`.
4. Re-test Home map live incidents plus real Valenzuela precinct baseline in `mobile/screens/HomeScreen.js`.
5. Fix Functions lint so deployment is not blocked.
6. Add minimum tests for rules, incident creation, and incident moderation.
7. Align notification preferences, FCM token handling, and settings persistence.
8. Remove debug logs, dead screens, and visible UI wording issues.
9. Clean duplicate app/Android configuration and add root scripts.

## Defense Day Go/No-Go Checklist

| Checklist item | Required state |
| --- | --- |
| Admin login | Normal users cannot open dashboard, incidents, users, notifications, or settings pages. |
| User signup/login | User can create account, log in, log out, and recover password. |
| Normal report | User can submit a real report with location and see it in status screen. |
| SOS report | SOS requires confirmed location and appears as high-priority for admin. |
| Admin moderation | Admin can verify, reject, mark done, and respond with proper audit trail. |
| User response alert | User receives "help is on the way" notification after admin response. |
| Map | Shows real seeded/live data, or clearly labeled demo data. |
| Firestore rules | Users cannot read all profiles, change roles, or edit other users' data. |
| Functions deploy | `npm --prefix functions run lint` passes. |
| Tests | At least core security and incident workflow tests pass. |
| Demo explanation | Team can clearly say which data is live, seeded, or simulated. |
