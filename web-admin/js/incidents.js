import { initAdminPage } from './admin-auth.js';
import { initIncidentModal } from './incident-modal.js';
import { loadIncidentsTable } from './incidents-list.js';

initIncidentModal();

initAdminPage({
  pageId: 'page-incidents',
  onReady() {
    loadIncidentsTable().catch((err) => {
      console.error('[incidents]', err);
      const meta = document.getElementById('incidents-count');
      if (meta) meta.textContent = 'Failed to load incidents';
      const tbody = document.getElementById('incidents-tbody');
      if (tbody) {
        const msg =
          err?.code === 'failed-precondition'
            ? 'Firestore index may be required. Check the browser console.'
            : err?.message || 'Something went wrong';
        tbody.innerHTML = `<tr class="incidents-table__empty"><td colspan="6">${escapeCell(
          msg,
        )}</td></tr>`;
      }
    });
  },
});

function escapeCell(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
