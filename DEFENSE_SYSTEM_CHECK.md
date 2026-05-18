# ThreatTrack Defense System Check

Date checked: May 18, 2026  
Scope: mobile user app, web admin dashboard, admin AI analytics, Firebase rules, Cloud Functions, storage rules, dependency audit, and defense-demo readiness.

## Readiness Summary

ThreatTrack is demo-capable, but it should still be presented as a capstone prototype rather than a production-ready public safety platform. The latest analytics decision-support UI and refresh persistence are now working and should not remain as open UI blockers. The remaining defense risks are admin authorization, Firestore/Storage privacy, Cloud Functions lint/deploy readiness, dependency vulnerabilities, test coverage, and AI secret handling.

Recommended defense framing:

> ThreatTrack is a capstone prototype for incident reporting, SOS escalation, crime mapping, admin moderation, responder selection, and AI-assisted recommendations. Before real deployment, the system must harden admin authorization, Firestore privacy rules, AI secret handling, Cloud Functions deployment, dependency security, and automated tests.

## Priority Legend

| Priority | Meaning | Defense impact |
| --- | --- | --- |
| P0 - Critical | Must fix before defense if possible | Panel may question security, correctness, or deploy readiness. |
| P1 - High | Strongly recommended before defense | Feature works, but has visible lapses or weak explanation. |
| P2 - Medium | Polish if time allows | Improves maintainability and panel confidence. |
| P3 - Low | After defense | Cleanup or future hardening. |

## Checks Run

| Check | Result | Notes |
| --- | --- | --- |
| `git status --short` | Dirty | Existing uncommitted change found in `mobile/screens/SOSReportScreen.js`. It appears to replace emoji incident icons with `Ionicons`; not treated as a blocker in this pass. |
| `npm --prefix web-admin run build` | Passed | Admin production build succeeds. Vite still warns that the Firebase chunk is larger than 500 kB. |
| `npm --prefix functions run lint` | Failed | 2577 ESLint errors. Mostly CRLF line endings, trailing spaces, missing JSDoc, and Google style issues. This can block deploy because `firebase.json` runs lint in `predeploy`. |
| `npm --prefix functions test -- --runInBand` | Failed | Jest found 0 tests across 13 function files. |
| `node --check` on Cloud Functions and key admin scripts | Passed | Syntax check passed for 13 JavaScript files: `functions/index.js`, all `functions/src/*.js`, `web-admin/js/analytics.js`, `admin-auth.js`, `admin-response.js`, and `admin-sos-alerts.js`. |
| Test file scan | Failed coverage expectation | No local `*.test.js` or `*.spec.js` files found outside `node_modules` and `dist`. |
| `npm --prefix web-admin audit --audit-level=moderate` | Failed | 6 vulnerabilities: 1 critical, 1 high, 4 moderate. Includes `protobufjs`, `rollup`, `esbuild`, and `postcss`. |
| `npm --prefix mobile audit --audit-level=moderate` | Failed | 7 vulnerabilities: 2 high, 5 moderate. Includes `protobufjs`, `fast-xml-builder`, and Expo/PostCSS chain. |
| `npm --prefix functions audit --audit-level=moderate` | Failed | 11 vulnerabilities: 2 high, 1 moderate, 8 low. Includes `protobufjs`, `fast-xml-builder`, and `firebase-admin` dependency chain. |
| Mobile build/test script check | Not available | `mobile/package.json` has `start`, `android`, `ios`, and `web` only; no test or CI build script is defined. |
| AI scan | Needs changes | Gemini callable exists with `GEMINI_API_KEY`, but analytics still prompts for a browser Gemini key and the OpenAI summary function is still exported. |

## Removed From Open Priority List

These were rechecked and should not stay as active defense blockers:

| Fixed area | Current state |
| --- | --- |
| Decision support summary UI | Analytics now shows a clearer modern decision-support brief with risk, pattern, strategy, execution steps, advisory, and admin-review notes. |
| AI generated plan refresh behavior | Generated hotspot plans are saved in `sessionStorage`, restored after browser refresh, and cleared on admin logout/timeout. |
| Fixed responder assignment | Admin chooses from nearest precinct options instead of always using Malinta. |
| SOS modal auto-disappearing / overlapping | Priority modal uses a queue and stays until admin action. |
| Done button not updating user side | `done` writes completed response fields, and the user status screen prioritizes terminal statuses. |
| User map precinct/boundary alignment | User map and admin map use the same detailed Valenzuela boundary style. |
| User-side tiny map/UI text issue | Active user map/report text was improved; no remaining P0 found in that area during this pass. |

## P0 - What Needs To Be Done Right Now

| Order | Side | Flaw | Required change | Main files |
| --- | --- | --- | --- | --- |
| 1 | Admin | Admin pages still allow any signed-in Firebase user to reach the dashboard flow. Role is loaded, but normal admin pages are not blocked unless `requirePolice` is set. | Add a general admin role gate. Only approved admin/staff roles should see admin pages. Redirect or sign out normal users. | `web-admin/js/admin-auth.js`, `web-admin/js/login.js` |
| 2 | Shared | Firestore exposes sensitive data too broadly. Any authenticated user can read all `users`; anyone can read all `incidents`; notifications are publicly readable. | Restrict reads to owner/staff, create sanitized public map summaries, and restrict notification reads to owner/admin. | `firestore.rules` |
| 3 | Shared/Admin | Role escalation is still possible through rules and admin UI. Police/staff can manage roles and profile trust fields. | Split profile editing from role management. Only true admin should change `role`, `trustScore`, `falseReportCount`, and staff flags. | `firestore.rules`, `web-admin/js/user-modal.js`, `web-admin/js/users-list.js` |
| 4 | Backend | Functions deployment is blocked by lint because `firebase.json` runs lint before deploy. | Fix line endings/style or adjust ESLint config intentionally, then rerun lint until it passes. | `functions/.eslintrc.js`, `functions/src/*.js`, `functions/index.js`, `firebase.json` |
| 5 | Shared | Dependency audit has high/critical findings in web, mobile, and functions. | Run safe `npm audit fix` where possible, then review breaking upgrades separately. Rebuild after upgrades. | `web-admin/package-lock.json`, `mobile/package-lock.json`, `functions/package-lock.json` |
| 6 | Backend | Report rate limiting is a placeholder: `hasNotExceededRateLimit()` always returns `true`. | Enforce report limits through Cloud Functions or server-owned counters. Add emulator tests. | `firestore.rules`, report submission functions |
| 7 | Backend | `aggregateHeatmapData` reuses a committed Firestore batch after every 500 writes. This can fail on larger datasets. | Create a new `db.batch()` after each commit; also batch cleanup deletes in chunks. | `functions/src/aggregateHeatmapData.js` |
| 8 | AI/Admin | Analytics still asks for a Gemini key in the browser, stores it in `localStorage`, and calls Gemini directly. | For defense security, move generation behind the Firebase callable with `GEMINI_API_KEY`. If kept for demo, clearly label it as local demo mode. | `web-admin/js/analytics.js`, `functions/src/generateAdminAISummary.js` |

## Admin Side Fixes

### P0 - Admin Access Control

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| `initAdminPage` loads a profile but does not block non-admin roles on normal admin pages. | A normal mobile user can be signed in and redirected into `dashboard.html`. | Add `isAllowedAdminRole(profile.role)` before `page.hidden = false`. |
| `login.js` redirects any existing signed-in user to the dashboard. | A regular account can enter the admin shell after login. | After auth, load `users/{uid}` and redirect only if role is approved. |
| Unauthorized handling is missing. | Defense demo may expose a blank/partial admin state. | Show "Unauthorized admin access" and sign out or redirect to login. |

### P0 - User and Role Management

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| `canManageUserProfiles()` includes police roles and allows `role` updates. | Police/staff should not be able to promote accounts. | Only `isAdmin()` should update roles and trust/account moderation fields. |
| Admin UI exposes role editing to all dashboard staff. | The UI can encourage unsafe role changes even before rules are fixed. | Hide role controls unless the current staff role is true admin. |
| Deleting a profile only deletes Firestore, not Firebase Auth. | The login account can still exist without a profile. | Prefer `accountStatus: suspended`; keep deletion as a super-admin/server action. |

### P0 - AI Recommendations

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| `web-admin/js/analytics.js` has `GEMINI_DEMO_KEY_STORAGE`, `window.prompt`, and direct `generativelanguage.googleapis.com` calls. | API keys in browser/localStorage are not defensible for a public safety admin system. | Move this path behind `generateAdminAISummary` with Firebase auth and Functions secrets, or explicitly explain it as local demo mode. |
| Two AI paths exist: Gemini callable and OpenAI HTTP summary. | Duplicate AI paths are hard to explain to panelists. | Choose one official AI flow for defense. If Gemini is the chosen flow, remove or archive the OpenAI path after confirming no UI depends on it. |
| AI review state is UI-only. | Panel may ask whether AI recommendations are automatically acted on. | Add accept/dismiss/review audit actions later; for defense, state that the AI brief is a draft and admin must review it. |
| AI feature depends on deployable functions/secrets. | It will fail in production if `GEMINI_API_KEY` is not configured or functions cannot deploy. | Configure secret, fix lint, deploy, and test no-data and hotspot cases. |

### P1 - Admin Notifications, Audit, and Data Tools

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| Notifications can be created, updated, or deleted by any authenticated user under current rules. | A normal user could tamper with dashboard/user notification documents. | Owner can mark own notification read only; staff/cloud functions create operational notifications. |
| Audit logs can be created by any authenticated user. | Client-created audit logs are not tamper-proof. | Restrict to staff or Cloud Functions; add server-side audit writer later. |
| Admin account creation happens from the browser using secondary Firebase Auth. | Account/role creation is sensitive and should be server-controlled. | Move staff account creation to a callable Cloud Function or strict admin-only workflow. |
| Data cleanup/import/export tools need stronger guardrails. | Accidental destructive actions can hurt the demo database. | Require typed confirmation and audit every destructive action. |

## User Side Fixes

No current user-side P0 was found in the already-fixed map/responding/done-status/readability areas. The remaining user-side work is P1 because it affects reliability, privacy, and defense polish.

### P1 - Mobile Authentication

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| `App.js` uses local `isAuthenticated` state instead of Firebase auth state. | App restart/session restore can desync from Firebase Auth. | Use `onAuthStateChanged(auth, ...)` with a loading screen. |
| Logout only resets local UI state. | Firebase user may remain signed in in persistence. | Call `signOut(auth)` before returning to login. |
| Signup logs personal data in console. | PII logs weaken privacy defense. | Remove signup/auth console logs or guard them behind dev-only logging. |

### P1 - Reporting and Evidence

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| Unverified users can submit reports, but Storage only allows verified users to upload incident photos. | Report can save while photo upload fails. | Choose one policy: require verification before report, or allow photo upload for active unverified reporters. Show clear photo failure message. |
| Client-side report rate limiting is not enforced server-side. | Users can spam reports. | Add server-side counters/callable validation. |
| Report timestamps can mix ISO strings and Firestore timestamps. | Admin sorting and rules become harder to reason about. | Prefer `serverTimestamp()` for trusted backend fields. |

### P1 - Notifications and Settings

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| Settings toggles are local only. | Push, high-priority, location alerts, and anonymous mode do not persist. | Save preferences to `users/{uid}.alertPreferences` and load them on screen open. |
| Push token is never registered or saved. | `sendNearbyIncidentAlert` expects `fcmToken`, so real push delivery may not happen. | Add Expo/FCM registration and save token to the user profile. |
| Anonymous Mode toggle does not affect report data. | It looks functional but does nothing. | Implement `isAnonymous` behavior or remove the toggle before defense. |
| `NotificationsScreen.js` is unused and still has mock fallback data. | Repo inspection can reveal demo placeholders. | Remove the unused screen or convert it to the same real notification logic as `AlertsScreen`. |

### P2 - Mobile Polish

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| Old backup/demo screen still contains mock map data. | Repo inspection can reveal stale demo fallbacks. | Archive or delete `mobile/screens/HomeScreen.old.js` after confirming it is not imported. |
| No mobile test/build script exists. | Harder to prove mobile readiness. | Add a minimal smoke check script and document Expo run steps. |
| Hardcoded Cloud Function URL appears in the mobile map. | Environment changes require source edits. | Move function base URL to config/env. |

## Shared Backend and Rules Fixes

### P0 - Firestore and Storage Security

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| `users` read is open to all authenticated users. | Names, phones, address, barangay, age, status, and role can leak. | User reads self; staff reads only if role-approved. |
| `incidents` read is public. | Exact locations and descriptions are sensitive. | Restrict detailed incidents; create sanitized public/heatmap summaries. |
| `notifications` read is public and writes are too broad. | Notification content and response status can be exposed or modified. | Owner reads own; staff reads admin views; users only update `read/readAt`. |
| `profile-pictures/{allPaths=**}` lets any authenticated user write any profile path. | Users can overwrite other users' profile images. | Use `profile-pictures/{userId}/{fileName}` and require `request.auth.uid == userId`. |
| Public HTTP functions have open CORS and no auth/app-check. | External callers can query risk/heatmap endpoints. | Add auth/App Check or document them as public sanitized endpoints only. |

### P0 - Deployment and Dependencies

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| Functions lint fails and predeploy runs lint. | Cloud Functions deployment can fail during defense prep. | Fix lint or adjust rules intentionally. |
| Web/mobile/functions audits fail. | Panel may ask about dependency security. | Apply safe fixes, review breaking fixes separately, and rebuild. |
| No automated security/rules tests exist. | Rules regressions can go unnoticed. | Add Firestore emulator tests for admin/user/profile/incident/notification access. |

### P1 - Data Consistency

| Flaw | Why it matters | Required change |
| --- | --- | --- |
| Incident statuses are spread across many files. | Inconsistent status handling causes UI/backend bugs. | Centralize allowed statuses and response statuses. |
| Notification read state uses both `read` and `readAt`. | Queries and UI can disagree. | Use `readAt` as source of truth; keep `read` as derived/legacy only. |
| Root `app.json` and `mobile/app.json` describe different apps. | Defense/deployment instructions can be confusing. | Keep one canonical Expo config or document which file is active. |
| Root `android/` and `mobile/android/` both exist. | Build ownership is unclear. | Keep/document the active Android project. |

## Defense Day Go/No-Go Checklist

| Checklist item | Required state |
| --- | --- |
| Admin login | Normal users cannot open dashboard, incidents, users, notifications, settings, analytics, or operation pages. |
| Admin roles | Only true admins can change roles; police can only do operational police work. |
| User privacy | Users cannot read all profiles, all notifications, or detailed private incident data. |
| Report flow | User can submit a report with location; invalid/spam submissions are rate-limited server-side or clearly documented as prototype limitation. |
| SOS flow | SOS requires confirmed location, appears in FIFO admin modal, and admin chooses responder precinct manually. |
| Response flow | Admin-selected precinct response updates user side in real time. |
| Done flow | Mark Done changes user status from responding to completed in real time. |
| Map | User and admin maps show aligned Valenzuela boundary and precinct data. |
| AI UI | Decision support brief is readable, persists across refresh during the admin session, and clears on logout. |
| AI security | AI recommendations run server-side through secrets, or browser demo mode is clearly explained as non-production. |
| Functions | `npm --prefix functions run lint` passes before deploy. |
| Tests | At least rules/auth/report/AI smoke tests pass. |
| Dependencies | High/critical audit items are fixed or documented with a clear mitigation. |
| Demo explanation | Team can state which data is live, seeded, or simulated. |
