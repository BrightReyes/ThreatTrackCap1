import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import {
  evaluateIncidentLegitimacy,
  renderLegitimacyBadge,
} from './incident-legitimacy.js';
import { hasIncidentAccess, resolveIncidentBarangayId, resolveIncidentSubstationId } from './admin-auth.js';
import { getBarangayNameById } from '../../shared/barangays.js';
import { getSubstationNameById } from '../../shared/substations.js';

const LIST_LIMIT = 150;
const PAGE_SIZE = 12;

/** @type {import('firebase/firestore').QueryDocumentSnapshot[]} */
let allDocs = [];
let toolbarBound = false;
let searchDebounceTimer = null;
let currentPage = 1;
let activeQuickFilter = 'all';

function isToday(ts) {
  if (!ts) return false;
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  } catch {
    return false;
  }
}

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
  if (!ts) return '—';
  try {
    const d =
      typeof ts.toDate === 'function'
        ? ts.toDate()
        : ts?.seconds
          ? new Date(ts.seconds * 1000)
          : ts instanceof Date
            ? ts
            : new Date(ts);
    if (!d || Number.isNaN(d.getTime())) return '—';
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const year = d.getFullYear();
    const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${month} ${day} ${year} ${time}`;
  } catch {
    return '—';
  }
}

function humanize(str) {
  if (!str) return '—';
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status) {
  const allowed = [
    'pending',
    'under_review',
    'verified',
    'responding',
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

function isIncidentOpened(data = {}) {
  return data.isOpened === true || data.opened === true || !!data.openedAt;
}

function buildRow(docSnap) {
  const id = docSnap.id;
  const d = docSnap.data();
  const reported = formatReported(d);
  const typeLabel = humanize(d.type);
  const sevLabel = humanize(d.severity);
  const statusLabel = humanize(d.status);
  const code = formatIncidentCode(id);
  const opened = isIncidentOpened(d);
  const rowClasses = ['incidents-table__row', 'incidents-table__row--clickable'];
  if (!opened) rowClasses.push('incidents-table__row--unopened');
  const codeClass = opened
    ? 'incidents-code incidents-code--cell'
    : 'incidents-code incidents-code--cell incidents-code--unopened';

  const legitimacy = evaluateIncidentLegitimacy(d);
  const legitimacyBadgeHtml = renderLegitimacyBadge(legitimacy);
  const resolvedBId = resolveIncidentBarangayId(d);
  const resolvedBName = d.barangayName || (resolvedBId ? getBarangayNameById(resolvedBId) : null);
  const resolvedSId = resolveIncidentSubstationId(d);
  const resolvedSName = d.substationName || (resolvedSId ? getSubstationNameById(resolvedSId) : null);

  const unreadBeaconHtml = opened
    ? ''
    : '<span class="incidents-unread-beacon" aria-hidden="true" title="Unopened incident"></span>';

  const rawDesc = d.description || d.details || d.notes || '';
  const descSnippet = rawDesc ? rawDesc.trim().replace(/\s+/g, ' ') : '';

  return `<tr class="${rowClasses.join(' ')}" data-incident-id="${escapeAttr(id)}" tabindex="0" role="button" aria-label="Open incident ${escapeAttr(code)}">
    <td><span class="${codeClass}" title="${opened ? 'Opened incident' : 'Unopened incident'}">${unreadBeaconHtml}<span>${escapeHtml(code)}</span></span></td>
    <td><span class="incidents-reported-time">${escapeHtml(reported)}</span></td>
    <td>
      <div style="font-weight: 750; color: #0f172a; font-size: 0.88rem; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(typeLabel)}</div>
      <div style="font-size: 0.75rem; color: #64748b; margin-top: 3px; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${resolvedBName ? `<span style="display: inline-flex; align-items: center; gap: 2px; font-weight: 600; color: #475569; flex-shrink: 0;"><span class="material-symbols-outlined" style="color: #dc2626; font-size: 13px;">location_on</span>${escapeHtml(resolvedBName)}</span>` : ''}
        ${resolvedBName && descSnippet ? `<span style="color: #cbd5e1; flex-shrink: 0;">•</span>` : ''}
        ${descSnippet ? `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #64748b;" title="${escapeAttr(rawDesc)}">${escapeHtml(descSnippet)}</span>` : ''}
      </div>
    </td>
    <td><span class="${severityBadgeClass(d.severity)}">${escapeHtml(sevLabel)}</span></td>
    <td><span class="${statusBadgeClass(d.status)}">${escapeHtml(statusLabel)}</span></td>
    <td>${legitimacyBadgeHtml}</td>
    <td style="text-align: right;">
      <div class="incidents-row-actions">
        <button type="button" class="incidents-more-btn incidents-action-btn" title="More options" aria-label="More options" aria-expanded="false" data-incident-menu-toggle>
          <span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>
        </button>
        <div class="incidents-row-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-incident-option="archive">Archive</button>
          <button type="button" role="menuitem" class="incidents-row-menu__danger" data-incident-option="delete">Delete</button>
        </div>
      </div>
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
  const bName = norm(d.barangayName || '');
  const sName = norm(d.substationName || '');
  const addr = norm(d.location?.address || '');
  return (
    norm(code).includes(q) ||
    typeStr.includes(q) ||
    typeHuman.includes(q) ||
    descStr.includes(q) ||
    bName.includes(q) ||
    sName.includes(q) ||
    addr.includes(q) ||
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

function docMatchesQuickFilter(docSnap, filter) {
  if (!filter || filter === 'all') return true;
  const d = docSnap.data();
  const sev = norm(d.severity);
  const status = norm(d.status);
  if (filter === 'high') return sev === 'high';
  if (filter === 'pending') return status === 'pending' || status === 'under_review';
  if (filter === 'responding') return status === 'responding';
  if (filter === 'resolved') return status === 'done' || status === 'verified';
  if (filter === 'unopened') return !isIncidentOpened(d);
  if (filter === 'today') return isToday(d.timestamp ?? d.reportedAt);
  return true;
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
      docMatchesSeverity(docSnap, severity) &&
      docMatchesQuickFilter(docSnap, activeQuickFilter),
  );
}

function syncFilterUI() {
  // Update chips active state
  document.querySelectorAll('.incidents-chip').forEach((chip) => {
    const chipFilter = chip.getAttribute('data-chip-filter');
    if (chipFilter === activeQuickFilter) {
      chip.classList.add('incidents-chip--active');
    } else {
      chip.classList.remove('incidents-chip--active');
    }
  });

  // Update stat cards active filter highlights
  const cardTotal = document.getElementById('card-stat-total');
  const cardHigh = document.getElementById('card-stat-high');
  const cardPending = document.getElementById('card-stat-pending');
  const cardResolved = document.getElementById('card-stat-resolved');

  cardTotal?.classList.toggle('stat-card--filter-active', activeQuickFilter === 'all');
  cardHigh?.classList.toggle('stat-card--filter-active-high', activeQuickFilter === 'high');
  cardPending?.classList.toggle('stat-card--filter-active-pending', activeQuickFilter === 'pending');
  cardResolved?.classList.toggle('stat-card--filter-active-resolved', activeQuickFilter === 'resolved');

  // Update filter pill in table header
  const filterPill = document.getElementById('incidents-filter-pill');
  const searchEl = document.getElementById('incidents-search');
  const statusEl = document.getElementById('incidents-filter-status');
  const sevEl = document.getElementById('incidents-filter-severity');
  const isFiltered = (
    activeQuickFilter !== 'all' ||
    Boolean(searchEl?.value?.trim()) ||
    (statusEl && statusEl.value !== 'all') ||
    (sevEl && sevEl.value !== 'all')
  );

  if (filterPill) {
    filterPill.hidden = !isFiltered;
    if (activeQuickFilter !== 'all') {
      const labels = {
        high: 'High Severity',
        pending: 'Pending Review',
        responding: 'Responding',
        resolved: 'Resolved',
        unopened: 'Unopened Only',
        today: "Today's Reports",
      };
      filterPill.textContent = labels[activeQuickFilter] || 'Filtered';
    } else {
      filterPill.textContent = 'Filtered';
    }
  }

  // Update search clear button
  const searchClear = document.getElementById('incidents-search-clear');
  if (searchClear && searchEl) {
    searchClear.hidden = !searchEl.value.trim();
  }
}

function updateIncidentStats() {
  const totalEl = document.getElementById('incidents-stat-total');
  const highEl = document.getElementById('incidents-stat-high');
  const pendingEl = document.getElementById('incidents-stat-pending');
  const resolvedEl = document.getElementById('incidents-stat-resolved');
  const counts = allDocs.reduce(
    (acc, docSnap) => {
      const d = docSnap.data();
      const severity = norm(d.severity);
      const status = norm(d.status);
      acc.total += 1;
      if (severity === 'high') acc.high += 1;
      if (status === 'pending' || status === 'under_review') acc.pending += 1;
      if (status === 'done' || status === 'verified') acc.resolved += 1;
      return acc;
    },
    { total: 0, high: 0, pending: 0, resolved: 0 },
  );

  if (totalEl) totalEl.textContent = String(counts.total);
  if (highEl) highEl.textContent = String(counts.high);
  if (pendingEl) pendingEl.textContent = String(counts.pending);
  if (resolvedEl) resolvedEl.textContent = String(counts.resolved);
}

function clampPage(page, totalPages) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function renderPagination(totalItems, totalPages) {
  const pagination = document.getElementById('incidents-pagination');
  if (!pagination) return;

  if (totalItems <= PAGE_SIZE) {
    pagination.hidden = true;
    pagination.innerHTML = '';
    return;
  }

  pagination.hidden = false;
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(start + PAGE_SIZE - 1, totalItems);

  pagination.innerHTML = `
    <p class="incidents-pagination__meta">Showing ${start}-${end} of ${totalItems}</p>
    <div class="incidents-pagination__actions">
      <button type="button" class="incidents-pagination__btn" data-page-action="prev"${currentPage === 1 ? ' disabled' : ''}>Previous</button>
      <span class="incidents-pagination__page">Page ${currentPage} of ${totalPages}</span>
      <button type="button" class="incidents-pagination__btn" data-page-action="next"${currentPage === totalPages ? ' disabled' : ''}>Next</button>
    </div>
  `;
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

  const statusOrder = ['pending', 'under_review', 'verified', 'responding', 'done', 'rejected'];
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

  syncFilterUI();

  const filtered = filterDocs();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  currentPage = clampPage(currentPage, totalPages);

  if (!allDocs.length) {
    tbody.innerHTML =
      '<tr class="incidents-table__empty"><td colspan="7">No incidents reported yet.</td></tr>';
    if (meta) meta.textContent = '0 incidents';
    renderPagination(0, 1);
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr class="incidents-table__empty">
        <td colspan="7">
          <div style="padding: 28px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="font-size: 38px; color: #94a3b8;">search_off</span>
            <div style="font-size: 0.96rem; font-weight: 750; color: #334155;">No incidents match your search or filters</div>
            <p style="margin: 0; font-size: 0.82rem; color: #64748b;">Try adjusting your keywords, changing categories, or resetting filters.</p>
            <button type="button" id="incidents-empty-reset" class="incidents-filter-reset" style="margin-top: 8px;">
              <span class="material-symbols-outlined" style="font-size: 15px;">restart_alt</span>
              <span>Reset all filters</span>
            </button>
          </div>
        </td>
      </tr>`;
    if (meta) {
      meta.textContent = `0 of ${allDocs.length} shown (filtered)`;
    }
    renderPagination(0, 1);
    return;
  }

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageDocs = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rows = pageDocs.map((docSnap) => buildRow(docSnap));
  tbody.innerHTML = rows.join('');
  renderPagination(filtered.length, totalPages);

  if (meta) {
    const total = allDocs.length;
    const shown = pageDocs.length;
    const suffix =
      filtered.length < total
        ? ` (${filtered.length} of ${total} filtered)`
        : ` (${total} loaded)`;
    meta.textContent =
      `${shown} incident${shown === 1 ? '' : 's'}${suffix}` +
      (total >= LIST_LIMIT ? ` — max ${LIST_LIMIT} loaded by date` : '');
  }
}

function resetPageAndRender() {
  currentPage = 1;
  renderFilteredTable();
}

function bindToolbar() {
  if (toolbarBound) return;
  toolbarBound = true;

  const searchEl = document.getElementById('incidents-search');
  const searchClear = document.getElementById('incidents-search-clear');
  const statusEl = document.getElementById('incidents-filter-status');
  const sevEl = document.getElementById('incidents-filter-severity');
  const resetBtn = document.getElementById('incidents-filter-reset');

  const rerender = () => {
    resetPageAndRender();
  };

  searchEl?.addEventListener('input', () => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(rerender, 180);
  });
  searchEl?.addEventListener('search', rerender);

  searchClear?.addEventListener('click', () => {
    if (searchEl) {
      searchEl.value = '';
      searchEl.focus();
    }
    rerender();
  });

  statusEl?.addEventListener('change', rerender);
  sevEl?.addEventListener('change', rerender);

  const resetAllFilters = () => {
    if (searchEl) searchEl.value = '';
    if (statusEl) statusEl.value = 'all';
    if (sevEl) sevEl.value = 'all';
    activeQuickFilter = 'all';
    rerender();
  };

  resetBtn?.addEventListener('click', resetAllFilters);

  // Empty state reset button click
  document.getElementById('incidents-tbody')?.addEventListener('click', (e) => {
    if (e.target.closest('#incidents-empty-reset')) {
      resetAllFilters();
    }
  });

  // Quick filter chips click
  document.querySelector('.incidents-quick-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip-filter]');
    if (!chip) return;
    const filterVal = chip.getAttribute('data-chip-filter');
    activeQuickFilter = filterVal || 'all';
    rerender();
  });

  // Stat card click to filter
  document.querySelector('.incidents-stats')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-stat-filter]');
    if (!card) return;
    const filterVal = card.getAttribute('data-stat-filter');
    if (activeQuickFilter === filterVal) {
      activeQuickFilter = 'all';
    } else {
      activeQuickFilter = filterVal || 'all';
    }
    rerender();
  });

  // Keyboard accessibility for stat cards
  document.querySelector('.incidents-stats')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('[data-stat-filter]');
      if (card) {
        e.preventDefault();
        card.click();
      }
    }
  });

  // Pagination click
  document
    .getElementById('incidents-pagination')
    ?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-page-action]');
      if (!btn || btn.disabled) return;
      const action = btn.getAttribute('data-page-action');
      currentPage += action === 'next' ? 1 : -1;
      renderFilteredTable();
    });
}

function bindIncidentUpdates() {
  if (window.__threatTrackIncidentUpdatesBound) return;
  window.__threatTrackIncidentUpdatesBound = true;

  window.addEventListener('incident:updated', (event) => {
    const { id, status, isOpened } = event.detail || {};
    if (!id) return;

    const incidentIndex = allDocs.findIndex((docSnap) => docSnap.id === id);
    if (incidentIndex === -1) return;

    const currentDoc = allDocs[incidentIndex];
    allDocs[incidentIndex] = {
      id: currentDoc.id,
      data: () => ({
        ...currentDoc.data(),
        ...(status ? { status } : {}),
        ...(isOpened === true ? { isOpened: true } : {}),
      }),
    };

    updateIncidentStats();
    populateFilterSelects();
    renderFilteredTable();
  });

  window.addEventListener('incident:removed', (event) => {
    const { id } = event.detail || {};
    if (!id) return;

    allDocs = allDocs.filter((docSnap) => docSnap.id !== id);
    updateIncidentStats();
    populateFilterSelects();
    renderFilteredTable();
  });
}

export async function loadIncidentsTable() {
  const tbody = document.getElementById('incidents-tbody');
  const meta = document.getElementById('incidents-count');
  if (!tbody) return;

  tbody.innerHTML =
    '<tr class="incidents-table__empty"><td colspan="7">Loading incidents…</td></tr>';
  if (meta) meta.textContent = 'Loading…';

  const q = query(
    collection(db, 'incidents'),
    orderBy('timestamp', 'desc'),
    limit(LIST_LIMIT),
  );

  const snap = await getDocs(q);
  allDocs = snap.docs.filter((docSnap) => hasIncidentAccess(docSnap.data()));

  // Check initial URL filter query (e.g. ?filter=today from Dashboard)
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get('filter');
  if (initialFilter && ['high', 'pending', 'responding', 'resolved', 'unopened', 'today'].includes(initialFilter)) {
    activeQuickFilter = initialFilter;
  }

  bindToolbar();
  bindIncidentUpdates();
  populateFilterSelects();
  updateIncidentStats();
  renderFilteredTable();
}
