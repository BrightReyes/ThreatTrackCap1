import { initAdminPage } from './admin-auth.js';
import { initAdminMap } from './admin-map.js';
import { loadAdminStats } from './admin-stats.js';

const DASHBOARD_CLOCK_TZ = 'Asia/Manila';

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
      weekday: 'long',
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
    startDashboardClock();
    requestAnimationFrame(() => {
      setTimeout(initAdminMap, 50);
      loadAdminStats().catch((err) => console.error('[dashboard] stats', err));
    });
  },
});
