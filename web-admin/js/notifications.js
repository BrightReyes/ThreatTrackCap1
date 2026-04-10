import { initAdminPage } from './admin-auth.js';
import { loadNotificationsTable } from './notifications-list.js';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase.js';

initAdminPage({
  pageId: 'page-notifications',
  async onReady() {
    // Quick visibility into whether the app sees you as admin.
    const meta = document.getElementById('notifications-count');
    const debug = {
      uid: auth.currentUser?.uid ?? '(no auth user)',
      role: '(unknown)',
      usersDoc: '(unknown)',
      projectId: '(unknown)',
    };

    try {
      debug.projectId = db.app?.options?.projectId || '(unknown)';
    } catch {}

    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const snap = await getDoc(doc(db, 'users', uid));
        debug.usersDoc = snap.exists() ? 'exists' : 'missing';
        debug.role = snap.exists() ? snap.data()?.role ?? '(none)' : '(missing users doc)';
      }
    } catch (e) {
      console.warn('[notifications] admin-check failed', e);
      debug.role = '(admin-check failed)';
    }

    if (meta) {
      meta.textContent = `Loading… (uid: ${debug.uid}, role: ${debug.role}, project: ${debug.projectId})`;
    }

    loadNotificationsTable().catch((err) => {
      console.error('[notifications]', err);
      const meta = document.getElementById('notifications-count');
      if (meta) {
        meta.textContent = `Failed to load (uid: ${debug.uid}, role: ${debug.role}, project: ${debug.projectId})`;
      }
      const list = document.getElementById('notifications-list');
      if (list) {
        const msg =
          err?.code === 'permission-denied'
            ? 'Permission denied. Ensure Firestore rules allow admin read on notifications.'
            : err?.code === 'failed-precondition'
              ? 'Firestore index may be required. Check the browser console.'
              : err?.message || 'Something went wrong';
        list.innerHTML = `<div class="notifications-empty">${escapeCell(msg)}</div>`;
      }
    });
  },
});

function escapeCell(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

