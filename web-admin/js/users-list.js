import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

const LIST_LIMIT = 200;

/** @type {import('firebase/firestore').QueryDocumentSnapshot[]} */
let allDocs = [];
let toolbarBound = false;
let searchDebounceTimer = null;

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

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .trim();
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

function docMatchesSearch(docSnap, q) {
  if (!q) return true;
  const d = docSnap.data();
  const email = norm(d.email);
  const fn = norm(d.firstName);
  const ln = norm(d.lastName);
  const full = norm(`${d.firstName || ''} ${d.lastName || ''}`);
  const uid = norm(docSnap.id);
  return (
    email.includes(q) ||
    fn.includes(q) ||
    ln.includes(q) ||
    full.includes(q) ||
    uid.includes(q)
  );
}

function docMatchesRole(docSnap, roleVal) {
  if (!roleVal || roleVal === 'all') return true;
  const r = norm(docSnap.data().role || 'user');
  return r === norm(roleVal);
}

function getFilterValues() {
  const searchEl = document.getElementById('users-search');
  const roleEl = document.getElementById('users-filter-role');
  return {
    search: norm(searchEl?.value || ''),
    role: roleEl?.value || 'all',
  };
}

function filterDocs() {
  const { search, role } = getFilterValues();
  return allDocs.filter(
    (docSnap) => docMatchesSearch(docSnap, search) && docMatchesRole(docSnap, role),
  );
}

function populateRoleSelect() {
  const roleSel = document.getElementById('users-filter-role');
  if (!roleSel) return;

  const current = roleSel.value;
  const roles = new Set();
  allDocs.forEach((docSnap) => {
    const r = docSnap.data().role;
    roles.add(r ? String(r).toLowerCase() : 'user');
  });

  const order = ['admin', 'moderator', 'police', 'user'];
  const sorted = [...roles].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  roleSel.innerHTML =
    '<option value="all">All roles</option>' +
    sorted
      .map(
        (r) =>
          `<option value="${escapeAttr(r)}">${escapeHtml(humanizeRole(r))}</option>`,
      )
      .join('');

  if ([...roleSel.options].some((o) => o.value === current)) {
    roleSel.value = current;
  }
}

function renderFilteredTable() {
  const tbody = document.getElementById('users-tbody');
  const meta = document.getElementById('users-count');
  if (!tbody) return;

  const filtered = filterDocs();

  if (!allDocs.length) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="5">No users yet.</td></tr>';
    if (meta) meta.textContent = '0 users';
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="5">No users match your search or filter.</td></tr>';
    if (meta) {
      meta.textContent = `0 of ${allDocs.length} shown (filtered)`;
    }
    return;
  }

  tbody.innerHTML = filtered.map((docSnap) => buildRow(docSnap)).join('');

  if (meta) {
    const total = allDocs.length;
    const shown = filtered.length;
    const suffix =
      shown < total ? ` (${shown} of ${total} shown)` : ` (${total} loaded)`;
    meta.textContent =
      `${shown} user${shown === 1 ? '' : 's'}${suffix}` +
      (total >= LIST_LIMIT ? ` — max ${LIST_LIMIT} loaded` : '');
  }
}

function bindToolbar() {
  if (toolbarBound) return;
  toolbarBound = true;

  const searchEl = document.getElementById('users-search');
  const roleEl = document.getElementById('users-filter-role');

  const rerender = () => renderFilteredTable();

  searchEl?.addEventListener('input', () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(rerender, 200);
  });
  searchEl?.addEventListener('search', rerender);
  roleEl?.addEventListener('change', rerender);
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
  allDocs = snap.docs;

  bindToolbar();
  populateRoleSelect();
  renderFilteredTable();
}
