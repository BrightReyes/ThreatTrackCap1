import {
  collection,
  deleteDoc,
  deleteField,
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
  return '-';
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
      return '-';
    }
  }
  return '-';
}

function humanize(str) {
  if (!str) return '-';
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function iconForType(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('urgent') || value.includes('sos')) return 'emergency_home';
  if (value.includes('police')) return 'local_police';
  if (value.includes('incident')) return 'warning';
  return 'notifications';
}

function truncate(text, max) {
  const s = text == null ? '' : String(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}...`;
}

function buildCard(docSnap) {
  const id = docSnap.id;
  const d = docSnap.data();
  const sentFull = formatSentAt(d);
  const sentRel = formatRelative(d.sentAt);
  const userId = d.userId || '-';
  const type = humanize(d.type);
  const title = d.title || 'Notification';
  const body = d.body || 'No message body provided.';
  const isRead = Boolean(d.readAt);

  return `<article class="notification-card${isRead ? ' notification-card--read' : ''}" data-notification-id="${escapeAttr(id)}">
    <div class="notification-card__icon" aria-hidden="true">
      <span class="material-symbols-outlined">${escapeHtml(iconForType(d.type))}</span>
    </div>
    <label class="notification-card__select" title="Select notification">
      <input type="checkbox" class="notification-select" value="${escapeAttr(id)}" aria-label="Select notification" />
    </label>
    <div class="notification-card__main">
      <div class="notification-card__top">
        <div>
          <h3 class="notification-card__title">${escapeHtml(title)}</h3>
          <p class="notification-card__body">${escapeHtml(body)}</p>
        </div>
        <div class="notification-card__side">
          <div class="notification-menu">
            <button type="button" class="notification-menu__toggle" data-action="toggle-menu" aria-label="Notification options" aria-expanded="false">
              <span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>
            </button>
            <div class="notification-menu__list" hidden>
              <button type="button" data-action="mark-read">Mark as read</button>
              <button type="button" data-action="mark-unread">Mark as unread</button>
              <button type="button" data-action="archive">Archive</button>
              <button type="button" class="notification-menu__danger" data-action="delete">Delete</button>
            </div>
          </div>
        </div>
      </div>
      <div class="notification-card__meta">
        <span class="notification-pill notification-pill--type">${escapeHtml(type)}</span>
        <span class="notification-pill" title="Recipient userId">User: <span class="incidents-table__desc">${escapeHtml(truncate(userId, 18))}</span></span>
        <span class="notification-pill ${isRead ? 'notification-pill--read' : 'notification-pill--unread'}">${escapeHtml(isRead ? 'Read' : 'Unread')}</span>
        <time class="notification-card__time" title="${escapeAttr(sentFull)}">${escapeHtml(sentRel)}</time>
      </div>
    </div>
  </article>`;
}

function syncNotificationStatsFromDocs(docs) {
  const totalEl = document.getElementById('notifications-total-stat');
  const unreadEl = document.getElementById('notifications-unread-stat');
  const readEl = document.getElementById('notifications-read-stat');
  const total = docs.length;
  const read = docs.filter((docSnap) => Boolean(docSnap.data()?.readAt)).length;
  const unread = total - read;
  if (totalEl) totalEl.textContent = String(total);
  if (unreadEl) unreadEl.textContent = String(unread);
  if (readEl) readEl.textContent = String(read);
}

export async function loadNotificationsTable() {
  const list = document.getElementById('notifications-list');
  const meta = document.getElementById('notifications-count');
  const selectAll = document.getElementById('notifications-select-all');
  const selectMode = document.getElementById('notifications-select-mode');
  const archiveSelected = document.getElementById('notifications-archive-selected');
  const deleteSelected = document.getElementById('notifications-delete-selected');
  if (!list) return;

  list.innerHTML = '<div class="notifications-empty">Loading...</div>';
  if (meta) meta.textContent = 'Loading...';
  updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);

  const q = query(
    collection(db, 'notifications'),
    orderBy('sentAt', 'desc'),
    limit(LIST_LIMIT),
  );

  const snap = await getDocs(q);
  const visibleDocs = snap.docs.filter((docSnap) => !docSnap.data()?.archivedAt);
  syncNotificationStatsFromDocs(visibleDocs);

  if (!visibleDocs.length) {
    list.innerHTML = '<div class="notifications-empty">No notifications yet.</div>';
    if (meta) meta.textContent = '0 notifications';
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
    return;
  }

  list.innerHTML = visibleDocs.map((docSnap) => buildCard(docSnap)).join('');

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

  selectMode?.addEventListener('click', () => {
    const next = !list.classList.contains('notifications-list--selecting');
    setSelectionMode(list, next, selectMode, selectAll);
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
  });

  selectAll?.addEventListener('change', () => {
    if (!list.classList.contains('notifications-list--selecting')) {
      setSelectionMode(list, true, selectMode, selectAll);
    }
    const checked = Boolean(selectAll.checked);
    list.querySelectorAll('.notification-select').forEach((input) => {
      input.checked = checked;
    });
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
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
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
    } catch (err) {
      console.error('[notifications] archive selected', err);
      toastError(err?.message || 'Failed to archive notifications');
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
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
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
    } catch (err) {
      console.error('[notifications] delete selected', err);
      toastError(err?.message || 'Failed to delete notifications');
      updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
    }
  });

  list.addEventListener('change', (e) => {
    if (!e.target.matches('.notification-select')) return;
    updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-notification-id]');
    const id = card?.getAttribute('data-notification-id');
    if (!id) return;
    const action = btn.getAttribute('data-action');

    if (action === 'toggle-menu') {
      const menu = btn.closest('.notification-menu');
      const listEl = menu?.querySelector('.notification-menu__list');
      const willOpen = Boolean(listEl?.hidden);
      closeNotificationMenus(list, menu);
      if (listEl) {
        listEl.hidden = !willOpen;
        btn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) positionNotificationMenu(menu, listEl);
      }
      return;
    }

    if (action === 'mark-read') {
      closeNotificationMenus(list);
      if (card.classList.contains('notification-card--read')) return;
      try {
        await updateDoc(doc(db, 'notifications', id), { readAt: serverTimestamp() });
        toastSuccess('Marked as read');
        card.classList.add('notification-card--read');
        card.querySelector('.notification-pill--unread')?.replaceWith(statusPill('Read', 'notification-pill--read'));
        syncNotificationsMeta(list, meta);
      } catch (err) {
        console.error('[notifications] mark-read', err);
        toastError(err?.message || 'Failed to mark as read');
      }
      return;
    }

    if (action === 'mark-unread') {
      closeNotificationMenus(list);
      if (!card.classList.contains('notification-card--read')) return;
      try {
        await updateDoc(doc(db, 'notifications', id), { readAt: deleteField() });
        toastSuccess('Marked as unread');
        card.classList.remove('notification-card--read');
        card.querySelector('.notification-pill--read')?.replaceWith(statusPill('Unread', 'notification-pill--unread'));
        syncNotificationsMeta(list, meta);
      } catch (err) {
        console.error('[notifications] mark-unread', err);
        toastError(err?.message || 'Failed to mark as unread');
      }
      return;
    }

    if (action === 'archive') {
      closeNotificationMenus(list);
      try {
        await updateDoc(doc(db, 'notifications', id), { archivedAt: serverTimestamp() });
        toastSuccess('Notification archived');
        card.remove();
        syncNotificationsMeta(list, meta);
        updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
      } catch (err) {
        console.error('[notifications] archive', err);
        toastError(err?.message || 'Failed to archive notification');
      }
      return;
    }

    if (action === 'delete') {
      closeNotificationMenus(list);
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
        updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
      } catch (err) {
        console.error('[notifications] delete', err);
        toastError(err?.message || 'Failed to delete notification');
        btn.disabled = false;
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.notification-menu')) return;
    closeNotificationMenus(list);
  });

  updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode);
}

function closeNotificationMenus(list, exceptMenu = null) {
  list.querySelectorAll('.notification-menu').forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.classList.remove('notification-menu--up');
    const menuList = menu.querySelector('.notification-menu__list');
    const toggle = menu.querySelector('.notification-menu__toggle');
    if (menuList) menuList.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
  });
}

function positionNotificationMenu(menu, menuList) {
  menu.classList.remove('notification-menu--up');
  const menuRect = menuList.getBoundingClientRect();
  const buttonRect = menu.getBoundingClientRect();
  const belowSpace = window.innerHeight - buttonRect.bottom;
  const shouldOpenUp = belowSpace < menuRect.height + 14;
  menu.classList.toggle('notification-menu--up', shouldOpenUp);
}

function setSelectionMode(list, enabled, selectMode, selectAll) {
  list.classList.toggle('notifications-list--selecting', enabled);
  if (selectMode) {
    selectMode.setAttribute('aria-pressed', String(enabled));
    selectMode.classList.toggle('notification-btn--active', enabled);
    const icon = selectMode.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = enabled ? 'close' : 'checklist';
  }
  if (!enabled) {
    list.querySelectorAll('.notification-select').forEach((input) => {
      input.checked = false;
    });
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
  }
}

function statusPill(text, className) {
  const span = document.createElement('span');
  span.className = `notification-pill ${className}`;
  span.textContent = text;
  return span;
}

function syncNotificationsMeta(list, meta) {
  if (!list || !meta) return;
  const remaining = list.querySelectorAll('[data-notification-id]').length;
  const read = list.querySelectorAll('.notification-card--read').length;
  const unread = Math.max(0, remaining - read);
  const totalEl = document.getElementById('notifications-total-stat');
  const unreadEl = document.getElementById('notifications-unread-stat');
  const readEl = document.getElementById('notifications-read-stat');
  if (totalEl) totalEl.textContent = String(remaining);
  if (unreadEl) unreadEl.textContent = String(unread);
  if (readEl) readEl.textContent = String(read);

  if (remaining === 0) {
    list.innerHTML = '<div class="notifications-empty">No notifications yet.</div>';
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

function updateBulkControls(list, selectAll, archiveSelected, deleteSelected, selectMode) {
  const boxes = Array.from(list?.querySelectorAll('.notification-select') || []);
  const selected = boxes.filter((box) => box.checked);
  const hasSelected = selected.length > 0;
  const isSelecting = list?.classList.contains('notifications-list--selecting');

  if (archiveSelected) archiveSelected.disabled = !isSelecting || !hasSelected;
  if (deleteSelected) deleteSelected.disabled = !isSelecting || !hasSelected;
  archiveSelected?.closest('.notifications-toolbar__actions')?.classList.toggle('is-visible', Boolean(isSelecting));
  if (selectMode) selectMode.disabled = boxes.length === 0;

  if (!selectAll) return;
  selectAll.closest('.notifications-select-all')?.classList.toggle('is-visible', Boolean(isSelecting));
  selectAll.disabled = boxes.length === 0 || !isSelecting;
  selectAll.checked = boxes.length > 0 && selected.length === boxes.length;
  selectAll.indeterminate = hasSelected && selected.length < boxes.length;
}
