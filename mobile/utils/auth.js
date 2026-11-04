// Shared authentication logic with Firebase
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  reload,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

// [QA-FIX #2] Signup lock. createUserWithEmailAndPassword signs the new user in
// immediately, which fires App.js onAuthStateChanged and used to swap the
// SignUpScreen for the main app before the profile was written (and before the
// "Account Created" alert could show). App.js now ignores signed-in events
// while this flag is set. It is module-level (not persisted), so a killed app
// always restarts with the lock released.
let signupInProgress = false;
export const isSignupInProgress = () => signupInProgress;

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password) => {
  return password.length >= 6;
};

export const validatePhoneNumber = (phoneNumber) => {
  const digitsOnly = String(phoneNumber || '').replace(/\D/g, '');
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
};

export const normalizePhoneNumber = (phoneNumber) => {
  return String(phoneNumber || '').trim().replace(/\s+/g, ' ');
};

export const validateRequiredText = (value, minLength = 2) => {
  return String(value || '').trim().length >= minLength;
};

export const handleLogin = async (email, password) => {
  const cleanEmail = String(email || '').trim().toLowerCase();

  // Validate inputs
  if (!cleanEmail || !password) {
    throw new Error('Please fill in all fields');
  }

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email');
  }

  if (!validatePassword(password)) {
    throw new Error('Password must be at least 6 characters');
  }

  try {
    // Firebase authentication
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;
    // [QA-FIX #20] Removed `await reload(user)` here: a fresh sign-in already
    // returns an up-to-date emailVerified, so the reload was an extra round trip.

    let profile = null;
    // [QA-FIX #1] Declared at function scope. It used to be a `const` inside
    // the `if (userSnap.exists())` block but was read in the return statement
    // below, which threw a ReferenceError on every login.
    let isAlreadyVerified = false;
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      profile = userSnap.data();

      const profileUpdates = {
        lastLoginAt: new Date().toISOString(),
      };

      isAlreadyVerified = Boolean(
        profile.isVerified === true ||
        profile.emailVerified === true ||
        String(profile.verificationStatus || '').toLowerCase() === 'approved'
      );

      if (profile.emailVerified !== user.emailVerified) {
        // Only update if Firebase Auth email is verified, or if account has not been approved by HQ override
        if (user.emailVerified || !isAlreadyVerified) {
          profileUpdates.emailVerified = user.emailVerified;
        }
      }

      if (isAlreadyVerified && profile.falseReportAcknowledged !== true) {
        profileUpdates.falseReportAcknowledged = true;
        profileUpdates.falseReportAcknowledgedAt = new Date().toISOString();
      }

      try {
        await updateDoc(userRef, profileUpdates);
        profile = { ...profile, ...profileUpdates };
      } catch (profileUpdateError) {
        console.warn('[AUTH] Unable to update login metadata:', profileUpdateError);
      }
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: user.displayName || 'User',
        emailVerified: user.emailVerified || isAlreadyVerified,
        accountStatus: profile?.accountStatus || 'active',
      },
      profile,
      // [QA-FIX #20] Removed `token: await user.getIdToken(true)`. No caller
      // used it, and forcing a token refresh cost another network call.
    };
  } catch (error) {
    // Handle Firebase errors
    if (error.code === 'auth/user-not-found') {
      throw new Error('No account found with this email');
    } else if (error.code === 'auth/wrong-password') {
      throw new Error('Incorrect password');
    } else if (error.code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password');
    } else {
      throw new Error(error.message);
    }
  }
};

export const handleSignup = async (email, password, userData = {}) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  // [QA-FIX #20] Removed console.log calls that printed the citizen's email,
  // name, phone and address (PII) to device logs.

  // Validate inputs
  if (!cleanEmail || !password) {
    throw new Error('Please fill in all fields');
  }

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email');
  }

  if (!validatePassword(password)) {
    throw new Error('Password must be at least 6 characters');
  }

  if (!validateRequiredText(userData.firstName) || !validateRequiredText(userData.lastName)) {
    throw new Error('Please enter your complete legal name');
  }

  if (!validatePhoneNumber(userData.phoneNumber)) {
    throw new Error('Please enter a valid phone number');
  }

  if (!validateRequiredText(userData.barangay)) {
    throw new Error('Please enter your barangay');
  }

  if (!validateRequiredText(userData.address, 8)) {
    throw new Error('Please enter your complete address');
  }

  if (userData.falseReportAcknowledged !== true) {
    throw new Error('Please acknowledge the false report policy');
  }

  // [QA-FIX #2] Hold the signup lock for the whole create -> profile -> email ->
  // signOut sequence so App.js doesn't mount the main app mid-signup.
  signupInProgress = true;
  let createdUser = null;
  try {
    // Create user with Firebase
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;
    createdUser = user;

    const displayName = `${userData.firstName} ${userData.lastName}`.trim();
    if (displayName) {
      try {
        await updateProfile(user, { displayName });
      } catch (displayNameErr) {
        // [QA-FIX #2] Non-fatal: the Firestore profile below also stores the name.
        console.warn('[AUTH] Unable to set display name:', displayNameErr?.code || displayNameErr);
      }
    }

    // Save additional user data to Firestore
    const userDoc = {
      uid: user.uid,
      email: user.email,
      firstName: userData.firstName || '',
      middleName: userData.middleName || '',
      lastName: userData.lastName || '',
      phoneNumber: normalizePhoneNumber(userData.phoneNumber),
      barangay: String(userData.barangay || '').trim(),
      sex: userData.sex || '',
      age: userData.age || '',
      address: String(userData.address || '').trim(),
      createdAt: new Date().toISOString(),
      role: 'user',
      accountStatus: 'active',
      emailVerified: user.emailVerified,
      phoneVerified: false,
      falseReportAcknowledged: true,
      falseReportAcknowledgedAt: new Date().toISOString(),
      trustScore: 50,
      reportCount: 0,
      falseReportCount: 0,
      lastReportAt: null,
    };

    try {
      await setDoc(doc(db, 'users', user.uid), userDoc);
    } catch (profileError) {
      // [QA-FIX #2] Roll back the auth account if the profile can't be saved.
      // Before, the account stayed behind without a profile: the email could
      // not be registered again and every report was blocked ("Profile Required").
      try {
        await user.delete();
      } catch (rollbackError) {
        console.warn('[AUTH] Signup rollback failed:', rollbackError?.code || rollbackError);
        try { await signOut(auth); } catch (_) { /* already signed out */ }
      }
      createdUser = null;
      const saveErr = new Error('We could not save your profile. Please check your connection and try again.');
      saveErr.code = 'app/profile-save-failed';
      throw saveErr;
    }

    let verificationEmailSent = false;
    try {
      await sendEmailVerification(user);
      verificationEmailSent = true;
    } catch (verificationError) {
      console.warn('[AUTH] Verification email failed:', verificationError?.code || verificationError);
    }

    // Sign out so the citizen returns to Login after reading the confirmation
    // alert. The signup lock stops App.js from reacting before this point.
    try {
      await signOut(auth);
    } catch (signOutErr) {
      console.warn('[AUTH] Post-signup sign-out warning:', signOutErr);
    }
    createdUser = null;

    return {
      success: true,
      verificationEmailSent,
      user: {
        uid: user.uid,
        email: cleanEmail,
        name: displayName,
        emailVerified: user.emailVerified,
      },
    };
  } catch (error) {
    // [QA-FIX #2] If something unexpected failed after the account was created,
    // still sign out so the user isn't left half signed in on the signup screen.
    if (createdUser) {
      try { await signOut(auth); } catch (_) { /* ignore */ }
    }
    // Handle Firebase errors
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('An account with this email already exists');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password should be at least 6 characters');
    } else if (error.code === 'auth/network-request-failed') {
      throw new Error('No internet connection. Please check your connection and try again.');
    } else {
      throw new Error(error.message);
    }
  } finally {
    // [QA-FIX #2] Always release the lock, even on failure.
    signupInProgress = false;
  }
};

export const syncEmailVerification = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  try {
    await reload(currentUser);
    await currentUser.getIdToken(true);

    if (currentUser.emailVerified) {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.emailVerified !== true || data.isVerified !== true) {
          await updateDoc(userRef, {
            emailVerified: true,
            isVerified: true,
            lastVerificationCheckAt: new Date().toISOString(),
          });
          console.log('[AUTH] Synchronized email verification to Firestore.');
        }
      }
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[AUTH] Error syncing email verification:', err?.message || err);
    return false;
  }
};

export const resendEmailVerification = async () => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Please login before requesting a verification email');
  }

  await reload(currentUser);
  await currentUser.getIdToken(true);

  if (currentUser.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        emailVerified: true,
        isVerified: true,
        lastVerificationCheckAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[AUTH] Unable to update verification metadata:', err);
    }
    return { success: true, alreadyVerified: true };
  }

  await sendEmailVerification(currentUser);
  return { success: true, alreadyVerified: false };
};

export const getReportEligibility = async () => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return {
      allowed: false,
      title: 'Login Required',
      message: 'Please login before submitting a report.',
    };
  }

  // [QA-FIX #9] Faster eligibility check. Before, this always ran reload() +
  // a forced getIdToken(true) + getDoc + getDocs + profile writes one after
  // another, which made SOS/report submit slow and failed outright on a weak
  // connection. Now:
  //   1. read the profile first;
  //   2. reload the auth user only when the profile isn't already verified
  //      (the only case where a fresh emailVerified value matters);
  //   3. run the prior-report check in parallel with that reload;
  //   4. self-heal profile writes are fire-and-forget (they never block a report).
  const profileRef = doc(db, 'users', currentUser.uid);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : null;

  const isProfileAlreadyVerified = Boolean(
    profile?.isVerified === true ||
    profile?.emailVerified === true ||
    String(profile?.verificationStatus || '').toLowerCase() === 'approved'
  );

  const needsPriorReportCheck = Boolean(profile) && !(Number(profile?.reportCount || 0) > 0);
  const [, priorReportFromQuery] = await Promise.all([
    isProfileAlreadyVerified
      ? Promise.resolve()
      : reload(currentUser).catch((reloadErr) => {
        console.warn('[AUTH] Unable to refresh verification state:', reloadErr?.code || reloadErr);
      }),
    needsPriorReportCheck
      ? getDocs(query(
        collection(db, 'incidents'),
        where('reporterId', '==', currentUser.uid),
        limit(1)
      ))
        .then((snap) => !snap.empty)
        .catch((queryErr) => {
          console.warn('[AUTH] Prior report query error:', queryErr);
          return false;
        })
      : Promise.resolve(false),
  ]);

  if (profileSnap.exists() && profile.emailVerified !== currentUser.emailVerified) {
    // Only synchronize if Firebase Auth is verified; never revoke an HQ administrative override
    if (currentUser.emailVerified || !isProfileAlreadyVerified) {
      // [QA-FIX #9] Fire-and-forget: the report must not wait on this write.
      updateDoc(profileRef, {
        emailVerified: currentUser.emailVerified,
        isVerified: currentUser.emailVerified,
        lastVerificationCheckAt: new Date().toISOString(),
      }).catch((profileUpdateError) => {
        console.warn('[AUTH] Unable to update verification metadata:', profileUpdateError);
      });
    }
  }

  if (!profile) {
    return {
      allowed: false,
      title: 'Profile Required',
      message: 'Your safety profile is missing. Please contact support before submitting reports.',
    };
  }

  // If citizen account is already verified by HQ or email, ensure false report policy acknowledgment is populated
  if (isProfileAlreadyVerified && profile.falseReportAcknowledged !== true) {
    // [QA-FIX #9] Fire-and-forget self-heal. The local value is set right away
    // so the policy check below passes without waiting for the write.
    profile.falseReportAcknowledged = true;
    updateDoc(profileRef, {
      falseReportAcknowledged: true,
      falseReportAcknowledgedAt: new Date().toISOString(),
    }).catch((healErr) => {
      console.warn('[AUTH] Unable to auto-heal falseReportAcknowledged:', healErr);
    });
  }

  const isSuspendedOrBanned =
    profile.accountStatus === 'suspended' ||
    profile.accountStatus === 'banned' ||
    profile.status === 'suspended' ||
    profile.status === 'banned' ||
    profile.suspended === true ||
    profile.disabled === true;

  if (isSuspendedOrBanned) {
    return {
      allowed: false,
      title: 'Account Suspended',
      message: 'This account has been suspended by the administration for policy violations (such as false or prank reporting). You cannot submit incident reports.',
    };
  }

  if (profile.accountStatus !== 'active' || (profile.status && profile.status !== 'active')) {
    return {
      allowed: false,
      title: 'Account Restricted',
      message: 'This account must be active before submitting reports. Please contact support if this is a mistake.',
    };
  }

  if (profile.falseReportAcknowledged !== true) {
    return {
      allowed: false,
      needsPolicyAcknowledgment: true,
      title: 'Policy Acknowledgment Required',
      message: 'Valenzuela City ordinance strictly prohibits false or prank emergency reports. Please acknowledge and agree to this policy before submitting reports.',
    };
  }

  // Check if user has already submitted at least one report
  // [QA-FIX #9] The query result now comes from the parallel check above.
  const hasPriorReport = Number(profile.reportCount || 0) > 0 || priorReportFromQuery === true;

  const isAccountVerified = Boolean(
    currentUser.emailVerified ||
    profile.isVerified === true ||
    profile.emailVerified === true ||
    String(profile.verificationStatus || '').toLowerCase() === 'approved'
  );

  // Policy: First report is allowed without verification (grace period for initial emergencies).
  // Subsequent reports (2nd+) strictly require a verified email address or HQ admin approval.
  if (!isAccountVerified && hasPriorReport) {
    return {
      allowed: false,
      needsEmailVerification: true,
      hasPriorReport: true,
      title: 'Email Verification Required',
      message: `You have submitted your first report. To keep reports reliable and protect community safety, please verify your email (${currentUser.email}) before submitting additional reports.`,
    };
  }

  return {
    allowed: true,
    user: currentUser,
    isFirstReportGracePeriod: !isAccountVerified && !hasPriorReport,
    profile: {
      ...profile,
      emailVerified: isAccountVerified,
      isVerified: isAccountVerified,
    },
  };
};

/**
 * Acknowledges the Valenzuela City anti-false reporting policy and updates the citizen's Firestore profile.
 */
export const acknowledgeFalseReportPolicy = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return false;
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, {
      falseReportAcknowledged: true,
      falseReportAcknowledgedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('[AUTH] Error acknowledging false report policy:', err);
    return false;
  }
};

/**
 * Signs out the current Firebase user and terminates active session.
 */
export const handleLogout = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('[AUTH] Sign out error:', error);
    throw new Error(error.message || 'Failed to sign out');
  }
};

/**
 * Sends a password reset email via Firebase Auth.
 * @param {string} email - Registered email address.
 */
export const handleResetPassword = async (email) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Please enter your email address');
  }

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address');
  }

  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return { success: true };
  } catch (error) {
    console.error('[AUTH] Password reset error:', error);
    if (error.code === 'auth/user-not-found') {
      throw new Error('No account registered with this email address');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many requests. Please try again in a few minutes');
    } else {
      throw new Error(error.message || 'Failed to send password reset email');
    }
  }
};

