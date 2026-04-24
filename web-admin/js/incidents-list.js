import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

const LIST_LIMIT = 150;

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

function formatReported(data) {
  const ts = data.timestamp ?? data.reportedAt;
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

function statusBadgeClass(status) {
  const allowed = [
    'pending',
    'under_review',
    'verified',
    'rejected',
    'done',
  ];
  const s = status && allowed.includes(status) ? status : 'unknown';
  return `incidents-badge incidents-badge--${s}`;
}

function severityBadgeClass(severity) {
  const allowed = ['high', 'medium', 'low'];
  const s =
    severity && allowed.includes(String(severity).toLowerCase())
      ? String(severity).toLowerCase()
      : 'unknown';
  return `incidents-badge incidents-badge--${s}`;
}

function formatIncidentCode(docId) {
  let hash = 0;
  const s = String(docId || '');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) % 10000;
  }
  return `TR-${String(hash).padStart(4, '0')}`;
}

function buildRow(docSnap) {
  const id = docSnap.id;
  const d = docSnap.data();
  const reported = formatReported(d);
  const typeLabel = humanize(d.type);
  const sevLabel = humanize(d.severity);
  const statusLabel = humanize(d.status);
  const desc = truncate(d.description, 120);
  const code = formatIncidentCode(id);

  return `<tr data-incident-id="${escapeAttr(id)}">
    <td><span class="incidents-code incidents-code--cell" title="Incident code">${escapeHtml(code)}</span></td>
    <td>${escapeHtml(reported)}</td>
    <td>${escapeHtml(typeLabel)}</td>
    <td><span class="${severityBadgeClass(d.severity)}">${escapeHtml(sevLabel)}</span></td>
    <td><span class="${statusBadgeClass(d.status)}">${escapeHtml(statusLabel)}</span></td>
    <td class="incidents-table__desc" title="${escapeAttr(d.description || '')}">${escapeHtml(desc)}</td>
    <td>
      <button type="button" class="incidents-action-btn" title="View full report">View</button>
    </td>
  </tr>`;
}

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .trim();
}

function docMatchesSearch(docSnap, q) {
  if (!q) return true;
  const d = docSnap.data();
  const code = formatIncidentCode(docSnap.id);
  const typeStr = norm(d.type);
  const descStr = norm(d.description);
  const typeHuman = norm(humanize(d.type));
  return (
    norm(code).includes(q) ||
    typeStr.includes(q) ||
    typeHuman.includes(q) ||
    descStr.includes(q) ||
    norm(docSnap.id).includes(q)
  );
}

function docMatchesStatus(docSnap, statusVal) {
  if (!statusVal || statusVal === 'all') return true;
  const s = norm(docSnap.data().status);
  return s === norm(statusVal);
}

function docMatchesSeverity(docSnap, sevVal) {
  if (!sevVal || sevVal === 'all') return true;
  const s = norm(docSnap.data().severity);
  return s === norm(sevVal);
}

function getFilterValues() {
  const searchEl = document.getElementById('incidents-search');
  const statusEl = document.getElementById('incidents-filter-status');
  const sevEl = document.getElementById('incidents-filter-severity');
  return {
    search: norm(searchEl?.value || ''),
    status: statusEl?.value || 'all',
    severity: sevEl?.value || 'all',
  };
}

function filterDocs() {
  const { search, status, severity } = getFilterValues();
  return allDocs.filter(
    (docSnap) =>
      docMatchesSearch(docSnap, search) &&
      docMatchesStatus(docSnap, status) &&
      docMatchesSeverity(docSnap, severity),
  );
}

function populateFilterSelects() {
  const statusSel = document.getElementById('incidents-filter-status');
  const sevSel = document.getElementById('incidents-filter-severity');
  if (!statusSel || !sevSel) return;

  const currentStatus = statusSel.value;
  const currentSev = sevSel.value;

  const statuses = new Set();
  const severities = new Set();
  allDocs.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.status) statuses.add(String(d.status));
    if (d.severity) severities.add(String(d.severity).toLowerCase());
  });

  const statusOrder = ['pending', 'under_review', 'verified', 'done', 'rejected'];
  const sortedStatus = [...statuses].sort((a, b) => {
    const ia = statusOrder.indexOf(a);
    const ib = statusOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  statusSel.innerHTML =
    '<option value="all">All statuses</option>' +
    sortedStatus
      .map(
        (s) =>
          `<option value="${escapeAttr(s)}">${escapeHtml(humanize(s))}</option>`,
      )
      .join('');

  const sevOrder = ['high', 'medium', 'low'];
  const sortedSev = [...severities].sort(
    (a, b) => sevOrder.indexOf(a) - sevOrder.indexOf(b),
  );
  sevSel.innerHTML =
    '<option value="all">All severities</option>' +
    sortedSev
      .map(
        (s) =>
          `<option value="${escapeAttr(s)}">${escapeHtml(humanize(s))}</option>`,
      )
      .join('');

  if ([...statusSel.options].some((o) => o.value === currentStatus)) {
    statusSel.value = currentStatus;
  }
  if ([...sevSel.options].some((o) => o.value === currentSev)) {
    sevSel.value = currentSev;
  }
}

function renderFilteredTable() {
  const tbody = document.getElementById('incidents-tbody');
  const meta = document.getElementById('incidents-count');
  if (!tbody) return;

  const filtered = filterDocs();

  if (!allDocs.length) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="7">No incidents yet.</td></tr>';
    if (meta) meta.textContent = '0 incidents';
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="7">No incidents match your search or filters.</td></tr>';
    if (meta) {
      meta.textContent = `0 of ${allDocs.length} shown (filtered)`;
    }
    return;
  }

  const rows = filtered.map((docSnap) => buildRow(docSnap));
  tbody.innerHTML = rows.join('');

  if (meta) {
    const total = allDocs.length;
    const shown = filtered.length;
    const suffix =
      shown < total ? ` (${shown} of ${total} shown)` : ` (${total} loaded)`;
    meta.textContent =
      `${shown} incident${shown === 1 ? '' : 's'}${suffix}` +
      (total >= LIST_LIMIT ? ` — max ${LIST_LIMIT} loaded by date` : '');
  }
}

function bindToolbar() {
  if (toolbarBound) return;
  toolbarBound = true;

  const searchEl = document.getElementById('incidents-search');
  const statusEl = document.getElementById('incidents-filter-status');
  const sevEl = document.getElementById('incidents-filter-severity');

  const rerender = () => renderFilteredTable();

  searchEl?.addEventListener('input', () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(rerender, 200);
  });
  searchEl?.addEventListener('search', rerender);

  statusEl?.addEventListener('change', rerender);
  sevEl?.addEventListener('change', rerender);
}

function bindIncidentUpdates() {
  if (window.__threatTrackIncidentUpdatesBound) return;
  window.__threatTrackIncidentUpdatesBound = true;

  window.addEventListener('incident:updated', (event) => {
    const { id, status } = event.detail || {};
    if (!id || !status) return;

    const incidentIndex = allDocs.findIndex((docSnap) => docSnap.id === id);
    if (incidentIndex === -1) return;

    const currentDoc = allDocs[incidentIndex];
    allDocs[incidentIndex] = {
      id: currentDoc.id,
      data: () => ({
        ...currentDoc.data(),
        status,
      }),
    };

    populateFilterSelects();
    renderFilteredTable();
  });
}

export async function loadIncidentsTable() {
  const tbody = document.getElementById('incidents-tbody');
  const meta = document.getElementById('incidents-count');
  if (!tbody) return;

  tbody.innerHTML =
    '<tr class="incidents-table__empty"><td colspan="7">Loading…</td></tr>';
  if (meta) meta.textContent = 'Loading…';

  const q = query(
    collection(db, 'incidents'),
    orderBy('timestamp', 'desc'),
    limit(LIST_LIMIT),
  );

  const snap = await getDocs(q);
  allDocs = snap.docs;

  bindToolbar();
  bindIncidentUpdates();
  populateFilterSelects();
  renderFilteredTable();
}
