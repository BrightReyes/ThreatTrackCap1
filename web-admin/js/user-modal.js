import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { confirmDanger, toastError, toastSuccess } from './alerts.js';

function escapeHtml(text) {
  if (text == null || text === '') return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatTimestamp(ts) {
  if (ts && typeof ts.toDate === 'function') {
    try {
      return ts.toDate().toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return '—';
    }
  }
  return '—';
}

function displayName(d) {
  const fn = (d.firstName || '').trim();
  const ln = (d.lastName || '').trim();
  const parts = [fn, ln].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

function humanizeRole(role) {
  if (!role) return 'User';
  return String(role)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleBadgeClass(role) {
  const r = String(role || 'user').toLowerCase();
  if (r === 'admin') return 'incidents-badge incidents-badge--role-admin';
  if (r === 'moderator')
    return 'incidents-badge incidents-badge--role-moderator';
  return 'incidents-badge incidents-badge--role-user';
}

function renderUserDetail(userId, d) {
  const rows = [
    ['User ID (doc)', escapeHtml(userId)],
    ['Email', escapeHtml(d.email || '—')],
    ['Name', escapeHtml(displayName(d))],
    [
      'Role',
      `<span class="${roleBadgeClass(d.role)}">${escapeHtml(humanizeRole(d.role))}</span>`,
    ],
    ['Joined', escapeHtml(formatTimestamp(d.createdAt))],
    [
      'Alert radius (km)',
      escapeHtml(
        typeof d.alertRadius === 'number' ? String(d.alertRadius) : '—',
      ),
    ],
    [
      'Alerts enabled',
      escapeHtml(
        d.alertPreferences?.enabled === true
          ? 'Yes'
          : d.alertPreferences?.enabled === false
            ? 'No'
            : '—',
      ),
    ],
    [
      'Last location',
      escapeHtml(
        d.location?.latitude != null && d.location?.longitude != null
          ? `${d.location.latitude}, ${d.location.longitude}`
          : '—',
      ),
    ],
    ['FCM token', escapeHtml(d.fcmToken ? 'Present' : '—')],
  ];

  return `<dl class="incident-detail">
    ${rows
      .map(
        ([label, inner]) =>
          `<div class="incident-detail__row"><dt>${escapeHtml(label)}</dt><dd>${inner}</dd></div>`,
      )
      .join('')}
  </dl>
  <section class="incident-actions" aria-label="User actions">
    <h3 class="incident-actions__title">Actions</h3>
    <p class="incident-actions__hint">Admin actions on the user profile document.</p>
    <div class="incident-actions__buttons">
      <button type="button" class="incident-action-btn incident-action-btn--danger" data-user-action="delete-profile">
        Delete profile doc
      </button>
    </div>
    <p id="user-actions-feedback" class="incident-actions__feedback" aria-live="polite"></p>
  </section>`;
}

export function initUserModal() {
  const modal = document.getElementById('user-modal');
  const body = document.getElementById('user-modal-body');
  const titleEl = document.getElementById('user-modal-title');
  const closeBtn = document.getElementById('user-modal-close');
  const backdrop = modal?.querySelector('[data-close-modal]');
  const tbody = document.getElementById('users-tbody');

  if (!modal || !body || !tbody) return;

  let currentUserId = null;
  let currentData = null;

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    body.innerHTML = '';
    document.body.style.overflow = '';
    currentUserId = null;
    currentData = null;
  }

  function openModal() {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  function bindActions() {
    const feedback = document.getElementById('user-actions-feedback');
    const delBtn = body.querySelector('[data-user-action="delete-profile"]');
    delBtn?.addEventListener('click', async () => {
      if (!currentUserId) return;
      const ok = await confirmDanger({
        title: 'Delete user profile doc?',
        text: 'This does NOT delete the Firebase Auth account, only the users/{uid} document.',
        confirmText: 'Delete',
      });
      if (!ok) return;
      if (feedback) feedback.textContent = 'Deleting…';
      delBtn.disabled = true;
      try {
        await deleteDoc(doc(db, 'users', currentUserId));
        if (feedback) feedback.textContent = 'Deleted user profile document.';
        toastSuccess('User profile deleted');
        const row = document.querySelector(
          `tr[data-user-id="${currentUserId}"]`,
        );
        row?.remove();
        setTimeout(closeModal, 500);
      } catch (err) {
        console.error('[user-modal] delete profile', err);
        if (feedback)
          feedback.textContent = err?.message || 'Failed to delete profile.';
        toastError(err?.message || 'Failed to delete profile');
        delBtn.disabled = false;
      }
    });
  }

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.incidents-action-btn');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = tr?.dataset?.userId;
    if (!id) return;

    currentUserId = id;
    if (titleEl) titleEl.textContent = 'User details';
    body.innerHTML = '<p class="incident-modal__loading">Loading user…</p>';
    openModal();

    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) {
        body.innerHTML = `<p class="incident-modal__error">${escapeHtml('User profile not found.')}</p>`;
        return;
      }
      currentData = snap.data();
      if (titleEl)
        titleEl.textContent = `User — ${currentData.email || snap.id}`;
      body.innerHTML = renderUserDetail(snap.id, currentData);
      bindActions();
    } catch (err) {
      console.error('[user-modal]', err);
      body.innerHTML = `<p class="incident-modal__error">${escapeHtml(err?.message || 'Failed to load user')}</p>`;
    }
  });
}

