import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../shared/firebase.js';
import { handleLogin } from '../../shared/auth.js';

const pageLogin = document.getElementById('page-login');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.replace('dashboard.html');
    return;
  }
  pageLogin.hidden = false;
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Logging in…';
  try {
    await handleLogin(email, password);
    window.location.replace('dashboard.html');
  } catch (err) {
    loginError.textContent = err.message ?? 'Login failed';
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Login';
  }
});
