import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../shared/firebase.js';

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.replace('dashboard.html');
  } else {
    window.location.replace('login.html');
  }
});
