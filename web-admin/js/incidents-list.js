import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

const LIST_LIMIT = 150;

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
    'spam',
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
  // Stable 4-digit code derived from docId (not sequential).
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

export async function loadIncidentsTable() {
  const tbody = document.getElementById('incidents-tbody');
  const meta = document.getElementById('incidents-count');
  if (!tbody) return;

  tbody.innerHTML =
    '<tr class="incidents-table__empty"><td colspan="6">Loading…</td></tr>';
  if (meta) meta.textContent = 'Loading…';

  const q = query(
    collection(db, 'incidents'),
    orderBy('timestamp', 'desc'),
    limit(LIST_LIMIT),
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="6">No incidents yet.</td></tr>';
    if (meta) meta.textContent = '0 incidents';
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
        ? `${n}+ incidents (showing latest ${LIST_LIMIT} by date)`
        : `${n} incident${n === 1 ? '' : 's'}`;
  }
}
