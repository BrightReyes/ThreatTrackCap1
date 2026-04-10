import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../../shared/firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { confirmDanger, toastError, toastSuccess } from './alerts.js';
import { logAudit } from './audit.js';

/**
 * Shared admin layout: auth gate, user email, sign out, sidebar (# links only blocked).
 * @param {{ pageId: string; onReady?: (user: import('firebase/auth').User) => void }} options
 */
export function initAdminPage({ pageId, onReady }) {
  const page = document.getElementById(pageId);
  const userEmail = document.getElementById('user-email');
  const btnSignout = document.getElementById('btn-signout');
  let timeoutId = null;
  let lastActivity = Date.now();
  let timeoutMs = null;

  async function loadSessionTimeoutMs() {
    try {
      const snap = await getDoc(doc(db, 'settings', 'system'));
      if (!snap.exists()) return null;
      const mins = Number(snap.data()?.securitySettings?.sessionTimeoutMinutes);
      if (!Number.isFinite(mins) || mins <= 0) return null;
      return mins * 60_000;
    } catch (err) {
      console.warn('[admin-auth] settings load failed', err);
      return null;
    }
  }

  function bumpActivity() {
    lastActivity = Date.now();
  }

  async function startInactivityTimer() {
    timeoutMs = await loadSessionTimeoutMs();
    if (!timeoutMs) return;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, bumpActivity, { passive: true }));

    const tick = async () => {
      if (!timeoutMs) return;
      const idle = Date.now() - lastActivity;
      if (idle >= timeoutMs) {
        try {
          // eslint-disable-next-line no-void
          void logAudit('auth.session_timeout', { timeoutMinutes: Math.round(timeoutMs / 60_000) });
        } catch {}
        try {
          await signOut(auth);
        } catch {}
        toastError('Session timed out due to inactivity');
        window.location.replace('login.html');
        return;
      }
      timeoutId = window.setTimeout(tick, 15_000);
    };
    timeoutId = window.setTimeout(tick, 15_000);
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('login.html');
      return;
    }
    if (userEmail) {
      userEmail.textContent = user.email ?? '';
      userEmail.title = user.email ?? '';
    }
    if (page) page.hidden = false;
    // eslint-disable-next-line no-void
    void startInactivityTimer();
    if (typeof onReady === 'function') onReady(user);
  });

  btnSignout?.addEventListener('click', async () => {
    const ok = await confirmDanger({
      title: 'Sign out?',
      text: 'You will be returned to the login page.',
      confirmText: 'Sign out',
    });
    if (!ok) return;
    try {
      await signOut(auth);
      toastSuccess('Signed out');
      // eslint-disable-next-line no-void
      void logAudit('auth.logout', {});
      window.location.replace('login.html');
    } catch (err) {
      console.error('[admin-auth] sign out', err);
      toastError(err?.message || 'Failed to sign out');
    }
  });

  document.querySelectorAll('.sidebar__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') {
      link.addEventListener('click', (e) => e.preventDefault());
    }
  });
}
