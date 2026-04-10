import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

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
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function formatJoined(data) {
  const ts = data.createdAt;
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

function displayName(d) {
  const fn = (d.firstName || '').trim();
  const ln = (d.lastName || '').trim();
  const parts = [fn, ln].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

function roleBadgeClass(role) {
  const r = String(role || 'user').toLowerCase();
  if (r === 'admin') return 'incidents-badge incidents-badge--role-admin';
  if (r === 'moderator') return 'incidents-badge incidents-badge--role-moderator';
  return 'incidents-badge incidents-badge--role-user';
}

function humanizeRole(role) {
  if (!role) return 'User';
  return String(role)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildRow(docSnap) {
  const id = docSnap.id;
  const d = docSnap.data();
  const email = d.email || '—';
  const name = displayName(d);
  const roleLabel = humanizeRole(d.role);
  const joined = formatJoined(d);

  return `<tr data-user-id="${escapeAttr(id)}">
    <td class="incidents-table__desc" title="${escapeAttr(email)}">${escapeHtml(email)}</td>
    <td>${escapeHtml(name)}</td>
    <td><span class="${roleBadgeClass(d.role)}">${escapeHtml(roleLabel)}</span></td>
    <td>${escapeHtml(joined)}</td>
    <td>
      <button type="button" class="incidents-action-btn" title="View user profile">View</button>
    </td>
  </tr>`;
}

async function fetchUsersQuery() {
  const byCreated = query(
    collection(db, 'users'),
    orderBy('createdAt', 'desc'),
    limit(LIST_LIMIT),
  );
  try {
    return await getDocs(byCreated);
  } catch (e) {
    if (e?.code !== 'failed-precondition') throw e;
  }

  const byEmail = query(
    collection(db, 'users'),
    orderBy('email', 'asc'),
    limit(LIST_LIMIT),
  );
  try {
    return await getDocs(byEmail);
  } catch (e2) {
    if (e2?.code !== 'failed-precondition') throw e2;
  }

  return await getDocs(query(collection(db, 'users'), limit(LIST_LIMIT)));
}

export async function loadUsersTable() {
  const tbody = document.getElementById('users-tbody');
  const meta = document.getElementById('users-count');
  if (!tbody) return;

  tbody.innerHTML =
    '<tr class="incidents-table__empty"><td colspan="5">Loading…</td></tr>';
  if (meta) meta.textContent = 'Loading…';

  const snap = await fetchUsersQuery();

  if (snap.empty) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="5">No users yet.</td></tr>';
    if (meta) meta.textContent = '0 users';
    return;
  }

  const rows = [];
  snap.forEach((docSnap) => {
    rows.push(buildRow(docSnap));
  });
  tbody.innerHTML = rows.join('');

  const n = snap.size;
  if (meta) {
    meta.textContent =
      n >= LIST_LIMIT
        ? `${n}+ users (showing first ${LIST_LIMIT})`
        : `${n} user${n === 1 ? '' : 's'}`;
  }
}
