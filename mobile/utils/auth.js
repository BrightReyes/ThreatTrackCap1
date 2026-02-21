// Shared authentication logic with Firebase
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password) => {
  return password.length >= 6;
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

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: user.displayName || 'User',
      },
      token: await user.getIdToken()
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

  try {
    console.log('[AUTH] Creating user with Firebase...');
    // Create user with Firebase
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('[AUTH] User created:', user.uid);

    // Save additional user data to Firestore
    const userDoc = {
      uid: user.uid,
      email: user.email,
      firstName: userData.firstName || '',
      middleName: userData.middleName || '',
      lastName: userData.lastName || '',
      sex: userData.sex || '',
      age: userData.age || '',
      address: userData.address || '',
      createdAt: new Date().toISOString(),
      role: 'user'
    };

    console.log('[AUTH] Saving user data to Firestore...');
    await setDoc(doc(db, 'users', user.uid), userDoc);
    console.log('[AUTH] User data saved successfully');

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: `${userData.firstName} ${userData.lastName}`,
      },
      token: await user.getIdToken()
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
