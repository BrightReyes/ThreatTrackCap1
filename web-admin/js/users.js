import { initAdminPage } from './admin-auth.js';
import { initUserModal } from './user-modal.js';
import { loadUsersTable } from './users-list.js';

initUserModal();

initAdminPage({
  pageId: 'page-users',
  onReady() {
    loadUsersTable().catch((err) => {
      console.error('[users]', err);
      const meta = document.getElementById('users-count');
      if (meta) meta.textContent = 'Failed to load users';
      const tbody = document.getElementById('users-tbody');
      if (tbody) {
        const msg =
          err?.code === 'failed-precondition'
            ? 'Firestore index may be required. Check the browser console.'
            : err?.message || 'Something went wrong';
        tbody.innerHTML = `<tr class="incidents-table__empty"><td colspan="5">${escapeCell(
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
