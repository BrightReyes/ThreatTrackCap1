import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { confirmDanger, toastError, toastSuccess } from './alerts.js';

const LIST_LIMIT = 200;

function escapeHtml(text) {
  if (text == null || text === '') return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/\"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function formatRelative(ts) {
  if (ts && typeof ts.toDate === 'function') {
    const d = ts.toDate();
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.round(hrs / 24);
    return `${days} days ago`;
  }
  return '—';
}

function formatSentAt(d) {
  const ts = d.sentAt;
  if (ts && typeof ts.toDate === 'function') {
    try {
      return ts.toDate().toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return '—';
    }
  }
  return '—';
}

function humanize(str) {
  if (!str) return '—';
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text, max) {
  const s = text == null ? '' : String(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildCard(docSnap) {
  const id = docSnap.id;
  const d = docSnap.data();
  const sentFull = formatSentAt(d);
  const sentRel = formatRelative(d.sentAt);
  const userId = d.userId || '—';
  const type = humanize(d.type);
  const title = d.title || 'Notification';
  const body = d.body || '';
  const isRead = Boolean(d.readAt);

  return `<article class="notification-card${isRead ? ' notification-card--read' : ''}" data-notification-id="${escapeAttr(id)}">
    <label class="notification-card__select" title="Select notification">
      <input type="checkbox" class="notification-select" value="${escapeAttr(id)}" aria-label="Select notification" />
    </label>
    <div class="notification-card__top">
      <h3 class="notification-card__title">${escapeHtml(title)}</h3>
      <time class="notification-card__time" title="${escapeAttr(sentFull)}">${escapeHtml(sentRel)}</time>
    </div>
    <p class="notification-card__body">${escapeHtml(body)}</p>
    <div class="notification-card__meta">
      <span class="notification-pill" title="Recipient userId">User: <span class="incidents-table__desc">${escapeHtml(truncate(userId, 18))}</span></span>
      <span class="notification-pill">Type: ${escapeHtml(type)}</span>
      <span class="notification-pill">Read: ${escapeHtml(isRead ? 'Yes' : 'No')}</span>
    </div>
    <div class="notification-actions">
      <button type="button" class="notification-btn notification-btn--primary" data-action="mark-read" ${isRead ? 'disabled' : ''}>Mark as read</button>
      <button type="button" class="notification-btn notification-btn--danger" data-action="delete">Delete</button>
    </div>
  </article>`;
}

export async function loadNotificationsTable() {
  const list = document.getElementById('notifications-list');
  const meta = document.getElementById('notifications-count');
  const selectAll = document.getElementById('notifications-select-all');
  const archiveSelected = document.getElementById('notifications-archive-selected');
  const deleteSelected = document.getElementById('notifications-delete-selected');
  if (!list) return;

  list.innerHTML = '<div class="notifications-empty">Loading…</div>';
  if (meta) meta.textContent = 'Loading…';
  updateBulkControls(list, selectAll, archiveSelected, deleteSelected);

  const q = query(
    collection(db, 'notifications'),
    orderBy('sentAt', 'desc'),
    limit(LIST_LIMIT),
  );

  const snap = await getDocs(q);

  const visibleDocs = snap.docs.filter((docSnap) => !docSnap.data()?.archivedAt);

  if (!visibleDocs.length) {
    list.innerHTML =
      '<div class="notifications-empty">No notifications yet.</div>';
    if (meta) meta.textContent = '0 notifications';
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
    return;
  }

  const cards = visibleDocs.map((docSnap) => buildCard(docSnap));
  list.innerHTML = cards.join('');

  const n = visibleDocs.length;
  if (meta) {
    meta.textContent =
      n >= LIST_LIMIT
        ? `${n}+ notifications (showing latest ${LIST_LIMIT})`
        : `${n} notification${n === 1 ? '' : 's'}`;
  }

  if (list.dataset.notificationActionsBound === '1') {
    return;
  }
  list.dataset.notificationActionsBound = '1';

  selectAll?.addEventListener('change', () => {
    const checked = Boolean(selectAll.checked);
    list.querySelectorAll('.notification-select').forEach((input) => {
      input.checked = checked;
    });
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
  });

  archiveSelected?.addEventListener('click', async () => {
    const ids = getSelectedNotificationIds(list);
    if (!ids.length) return;
    archiveSelected.disabled = true;
    deleteSelected.disabled = true;
    try {
      await Promise.all(
        ids.map((id) =>
          updateDoc(doc(db, 'notifications', id), {
            archivedAt: serverTimestamp(),
          }),
        ),
      );
      removeNotificationCards(list, ids);
      toastSuccess(`${ids.length} notification${ids.length === 1 ? '' : 's'} archived`);
      syncNotificationsMeta(list, meta);
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
    } catch (err) {
      console.error('[notifications] archive selected', err);
      toastError(err?.message || 'Failed to archive notifications');
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
    }
  });

  deleteSelected?.addEventListener('click', async () => {
    const ids = getSelectedNotificationIds(list);
    if (!ids.length) return;
    const ok = await confirmDanger({
      title: 'Delete selected notifications?',
      text: `This will permanently delete ${ids.length} notification${ids.length === 1 ? '' : 's'}.`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    archiveSelected.disabled = true;
    deleteSelected.disabled = true;
    try {
      await Promise.all(ids.map((id) => deleteDoc(doc(db, 'notifications', id))));
      removeNotificationCards(list, ids);
      toastSuccess(`${ids.length} notification${ids.length === 1 ? '' : 's'} deleted`);
      syncNotificationsMeta(list, meta);
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
    } catch (err) {
      console.error('[notifications] delete selected', err);
      toastError(err?.message || 'Failed to delete notifications');
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
    }
  });

  list.addEventListener('change', (e) => {
    if (!e.target.matches('.notification-select')) return;
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-notification-id]');
    const id = card?.getAttribute('data-notification-id');
    if (!id) return;
    const action = btn.getAttribute('data-action');

    if (action === 'mark-read') {
      btn.disabled = true;
      try {
        await updateDoc(doc(db, 'notifications', id), { readAt: serverTimestamp() });
        toastSuccess('Marked as read');
        card.classList.add('notification-card--read');
      } catch (err) {
        console.error('[notifications] mark-read', err);
        toastError(err?.message || 'Failed to mark as read');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'delete') {
      const ok = await confirmDanger({
        title: 'Delete notification?',
        text: 'This will permanently delete the notification document.',
        confirmText: 'Delete',
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, 'notifications', id));
        toastSuccess('Notification deleted');
        card.remove();
        syncNotificationsMeta(list, meta);
        updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
      } catch (err) {
        console.error('[notifications] delete', err);
        toastError(err?.message || 'Failed to delete notification');
        btn.disabled = false;
      }
    }
  });

  updateBulkControls(list, selectAll, archiveSelected, deleteSelected);
}

function syncNotificationsMeta(list, meta) {
  if (!list || !meta) return;
  const remaining = list.querySelectorAll('[data-notification-id]').length;
  if (remaining === 0) {
    list.innerHTML =
      '<div class="notifications-empty">No notifications yet.</div>';
    meta.textContent = '0 notifications';
    return;
  }
  meta.textContent =
    remaining >= LIST_LIMIT
      ? `${remaining}+ notifications (showing latest ${LIST_LIMIT})`
      : `${remaining} notification${remaining === 1 ? '' : 's'}`;
}

function getSelectedNotificationIds(list) {
  return Array.from(list.querySelectorAll('.notification-select:checked'))
    .map((input) => input.value)
    .filter(Boolean);
}

function removeNotificationCards(list, ids) {
  ids.forEach((id) => {
    list
      .querySelector(`[data-notification-id="${CSS.escape(id)}"]`)
      ?.remove();
  });
}

function updateBulkControls(list, selectAll, archiveSelected, deleteSelected) {
  const boxes = Array.from(list?.querySelectorAll('.notification-select') || []);
  const selected = boxes.filter((box) => box.checked);
  const hasSelected = selected.length > 0;

  if (archiveSelected) archiveSelected.disabled = !hasSelected;
  if (deleteSelected) deleteSelected.disabled = !hasSelected;

  if (!selectAll) return;
  selectAll.disabled = boxes.length === 0;
  selectAll.checked = boxes.length > 0 && selected.length === boxes.length;
  selectAll.indeterminate = hasSelected && selected.length < boxes.length;
}

