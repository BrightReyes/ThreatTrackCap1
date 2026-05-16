// Shared authentication logic with Firebase
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  reload,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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
  // Validate inputs
  if (!email || !password) {
    throw new Error('Please fill in all fields');
  }

  if (!validateEmail(email)) {
    throw new Error('Please enter a valid email');
  }

  if (!validatePassword(password)) {
    throw new Error('Password must be at least 6 characters');
  }

  try {
    // Firebase authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await reload(user);

    let profile = null;
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      profile = userSnap.data();

      const profileUpdates = {
        lastLoginAt: new Date().toISOString(),
      };

      if (profile.emailVerified !== user.emailVerified) {
        profileUpdates.emailVerified = user.emailVerified;
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
        emailVerified: user.emailVerified,
        accountStatus: profile?.accountStatus || 'active',
      },
      profile,
      token: await user.getIdToken(true)
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
  console.log('[AUTH] handleSignup called with:', { email, userData });
  
  // Validate inputs
  if (!email || !password) {
    console.log('[AUTH] Validation failed: missing email or password');
    throw new Error('Please fill in all fields');
  }

  if (!validateEmail(email)) {
    console.log('[AUTH] Validation failed: invalid email');
    throw new Error('Please enter a valid email');
  }

  if (!validatePassword(password)) {
    console.log('[AUTH] Validation failed: password too short');
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

  try {
    console.log('[AUTH] Creating user with Firebase...');
    // Create user with Firebase
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('[AUTH] User created:', user.uid);

    const displayName = `${userData.firstName} ${userData.lastName}`.trim();
    if (displayName) {
      await updateProfile(user, { displayName });
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

    console.log('[AUTH] Saving user data to Firestore...');
    await setDoc(doc(db, 'users', user.uid), userDoc);
    console.log('[AUTH] User data saved successfully');

    let verificationEmailSent = false;
    try {
      await sendEmailVerification(user);
      verificationEmailSent = true;
      console.log('[AUTH] Verification email sent');
    } catch (verificationError) {
      console.error('[AUTH] Verification email failed:', verificationError);
    }

    return {
      success: true,
      verificationEmailSent,
      user: {
        uid: user.uid,
        email: user.email,
        name: displayName,
        emailVerified: user.emailVerified,
      },
      token: await user.getIdToken(true)
    };
  } catch (error) {
    // Handle Firebase errors
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('An account with this email already exists');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password should be at least 6 characters');
    } else {
      throw new Error(error.message);
    }
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

  await reload(currentUser);
  await currentUser.getIdToken(true);

  const profileRef = doc(db, 'users', currentUser.uid);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : null;

  if (profileSnap.exists() && profile.emailVerified !== currentUser.emailVerified) {
    try {
      await updateDoc(profileRef, {
        emailVerified: currentUser.emailVerified,
        lastVerificationCheckAt: new Date().toISOString(),
      });
    } catch (profileUpdateError) {
      console.warn('[AUTH] Unable to update verification metadata:', profileUpdateError);
    }
  }

  if (!profile) {
    return {
      allowed: false,
      title: 'Profile Required',
      message: 'Your safety profile is missing. Please contact support before submitting reports.',
    };
  }

  if (profile.accountStatus !== 'active') {
    return {
      allowed: false,
      title: 'Account Restricted',
      message: 'This account must be active before submitting reports. Please contact support if this is a mistake.',
    };
  }

  if (profile.falseReportAcknowledged !== true) {
    return {
      allowed: false,
      title: 'Policy Acknowledgment Required',
      message: 'Please acknowledge the false report policy before submitting reports.',
    };
  }

  return {
    allowed: true,
    user: currentUser,
    profile: {
      ...profile,
      emailVerified: currentUser.emailVerified,
    },
  };
};
