import { initAdminPage } from './admin-auth.js';
import { initAdminCustomSelects } from './admin-custom-select.js';
import { initAdminMap } from './admin-map.js';
import { loadAdminStats } from './admin-stats.js';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

const DASHBOARD_CLOCK_TZ = 'Asia/Manila';
const DASHBOARD_ACTIVITY_LIMIT = 1;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function formatActivityTimestamp(at) {
  if (at && typeof at.toDate === 'function') {
    try {
      return at.toDate().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  }
  return '—';
}

/** Live latest audit log only (Firestore rules: admin/moderator read). */
function startDashboardActivityListener() {
  const list = document.getElementById('dashboard-activity-list');
  if (!list) return;

  const render = (html) => {
    list.innerHTML = html;
  };

  const q = query(collection(db, 'audit_logs'), orderBy('at', 'desc'), limit(DASHBOARD_ACTIVITY_LIMIT));

  onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        render(
          '<li class="admin-dashboard__activity-item muted" role="status">No recent activity yet.</li>',
        );
        return;
      }
      const d = snap.docs[0].data() || {};
      const action = String(d.action || 'unknown').trim() || 'unknown';
      const who = String(d.email || d.uid || '—').trim();
      const when = formatActivityTimestamp(d.at);
      render(
        `<li class="admin-dashboard__activity-item">
          <span class="admin-dashboard__activity-action">${escapeHtml(action)}</span>
          <span class="admin-dashboard__activity-detail">${escapeHtml(who)} · ${escapeHtml(when)}</span>
        </li>`,
      );
    },
    (err) => {
      console.error('[dashboard] activity listener', err);
      const msg =
        err?.code === 'permission-denied'
          ? 'Activity is available to admins and moderators only.'
          : err?.message || 'Could not load activity.';
      render(`<li class="admin-dashboard__activity-item muted" role="alert">${escapeHtml(msg)}</li>`);
    },
  );
}

function startDashboardClock() {
  const timeEl = document.getElementById('dashboard-clock-time');
  const dateEl = document.getElementById('dashboard-clock-date');
  if (!timeEl || !dateEl) return;

  const tick = () => {
    const now = new Date();
    timeEl.textContent = new Intl.DateTimeFormat('en-PH', {
      timeZone: DASHBOARD_CLOCK_TZ,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now);
    dateEl.textContent = new Intl.DateTimeFormat('en-PH', {
      timeZone: DASHBOARD_CLOCK_TZ,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(now);
  };

  tick();
  window.setInterval(tick, 1000);
}

initAdminPage({
  pageId: 'page-dashboard',
  onReady() {
    initAdminCustomSelects(document.getElementById('page-dashboard'));
    startDashboardClock();
    startDashboardActivityListener();
    requestAnimationFrame(() => {
      setTimeout(initAdminMap, 50);
      loadAdminStats().catch((err) => console.error('[dashboard] stats', err));
    });
  },
});
