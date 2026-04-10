import { initAdminPage } from './admin-auth.js';
import { initAdminMap } from './admin-map.js';
import { loadAdminStats } from './admin-stats.js';

initAdminPage({
  pageId: 'page-dashboard',
  onReady() {
    requestAnimationFrame(() => {
      setTimeout(initAdminMap, 50);
      loadAdminStats().catch((err) => console.error('[dashboard] stats', err));
    });
  },
});
