import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../../shared/firebase.js';

const pageDashboard = document.getElementById('page-dashboard');
const userEmail = document.getElementById('user-email');
const btnSignout = document.getElementById('btn-signout');

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace('login.html');
    return;
  }
  userEmail.textContent = user.email ?? '';
  userEmail.title = user.email ?? '';
  pageDashboard.hidden = false;
});

btnSignout.addEventListener('click', async () => {
  await signOut(auth);
  window.location.replace('login.html');
});

document.querySelectorAll('.sidebar__link').forEach((link) => {
  link.addEventListener('click', (e) => e.preventDefault());
});
