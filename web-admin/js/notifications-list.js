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
  if (!list) return;

  list.innerHTML = '<div class="notifications-empty">Loading…</div>';
  if (meta) meta.textContent = 'Loading…';

  const q = query(
    collection(db, 'notifications'),
    orderBy('sentAt', 'desc'),
    limit(LIST_LIMIT),
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    list.innerHTML =
      '<div class="notifications-empty">No notifications yet.</div>';
    if (meta) meta.textContent = '0 notifications';
    return;
  }

  const cards = [];
  snap.forEach((docSnap) => cards.push(buildCard(docSnap)));
  list.innerHTML = cards.join('');

  const n = snap.size;
  if (meta) {
    meta.textContent =
      n >= LIST_LIMIT
        ? `${n}+ notifications (showing latest ${LIST_LIMIT})`
        : `${n} notification${n === 1 ? '' : 's'}`;
  }

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
      } catch (err) {
        console.error('[notifications] delete', err);
        toastError(err?.message || 'Failed to delete notification');
        btn.disabled = false;
      }
    }
  }, { once: true });
}

