import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase.js';
import { toastError, toastSuccess } from './alerts.js';

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

function updateStatusCell(incidentId, status) {
  const row = document.querySelector(`tr[data-incident-id="${incidentId}"]`);
  if (!row) return;
  // Columns: 0 code, 1 reported, 2 type, 3 severity, 4 status, ...
  const cell = row.children?.[4];
  if (!cell) return;
  cell.innerHTML = `<span class="${statusBadgeClass(status)}">${escapeHtml(humanize(status))}</span>`;
}

function buildPhotosHtml(data) {
  const urls = [];
  if (Array.isArray(data.photoUrls)) {
    data.photoUrls.forEach((u) => {
      if (u) urls.push(String(u));
    });
  }
  if (data.photoURL) urls.push(String(data.photoURL));
  const unique = [...new Set(urls)];
  if (!unique.length) return '<span class="incident-detail__value">—</span>';
  return unique
    .map(
      (u, i) =>
        `<a class="incident-detail__link" href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">Photo ${i + 1}</a>`,
    )
    .join(' · ');
}

function reportedAtDisplay(d) {
  const primary = d.reportedAt || d.timestamp;
  return escapeHtml(formatTimestamp(primary));
}

function reporterSummary(d) {
  if (d.isAnonymous === true) return 'Anonymous';
  if (d.reporterId) return 'Signed-in user';
  return '—';
}

function renderIncidentDetail(docId, d) {
  const loc = d.location || {};
  const lat =
    loc.latitude != null && !Number.isNaN(Number(loc.latitude))
      ? Number(loc.latitude)
      : null;
  const lng =
    loc.longitude != null && !Number.isNaN(Number(loc.longitude))
      ? Number(loc.longitude)
      : null;
  const mapsHref =
    lat != null && lng != null
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
      : null;

  const code = formatIncidentCode(docId);

  const rows = [
    ['Incident code', escapeHtml(code)],
    [
      'Status',
      `<span class="${statusBadgeClass(d.status)}">${escapeHtml(humanize(d.status))}</span>`,
    ],
    [
      'Severity',
      `<span class="${severityBadgeClass(d.severity)}">${escapeHtml(humanize(d.severity))}</span>`,
    ],
    ['Type', escapeHtml(humanize(d.type))],
    [
      'Description',
      `<div class="incident-detail__desc">${escapeHtml(d.description || '—')}</div>`,
    ],
    ['Reported', reportedAtDisplay(d)],
    [
      'Location',
      lat != null && lng != null
        ? `${escapeHtml(String(lat))}, ${escapeHtml(String(lng))}${
            mapsHref
              ? ` · <a class="incident-detail__link" href="${escapeAttr(mapsHref)}" target="_blank" rel="noopener noreferrer">Open map</a>`
              : ''
          }`
        : '—',
    ],
    ['Address', escapeHtml(loc.address || '—')],
    ['Reporter', escapeHtml(reporterSummary(d))],
    ['Photos', buildPhotosHtml(d)],
  ];

  const actionStatus = d.status || 'under_review';
  return `<dl class="incident-detail">
    ${rows
      .map(
        ([label, inner]) =>
          `<div class="incident-detail__row"><dt>${escapeHtml(label)}</dt><dd>${inner}</dd></div>`,
      )
      .join('')}
  </dl>
  <section class="incident-actions incident-actions--moderation" aria-label="Incident actions">
    <h3 class="incident-actions__title">Actions</h3>
    <p class="incident-actions__hint">Set status for this report.</p>
    <div class="incident-actions__buttons">
      <button type="button" class="incident-action-btn${actionStatus === 'under_review' ? ' is-active' : ''}" data-action-status="under_review">Under review</button>
      <button type="button" class="incident-action-btn${actionStatus === 'verified' ? ' is-active' : ''}" data-action-status="verified">Verify</button>
      <button type="button" class="incident-action-btn${actionStatus === 'rejected' ? ' is-active' : ''}" data-action-status="rejected">Reject</button>
      <button type="button" class="incident-action-btn${actionStatus === 'spam' ? ' is-active' : ''}" data-action-status="spam">Mark spam</button>
    </div>
    <p id="incident-actions-feedback" class="incident-actions__feedback" aria-live="polite"></p>
  </section>`;
}

export function initIncidentModal() {
  const modal = document.getElementById('incident-modal');
  const body = document.getElementById('incident-modal-body');
  const titleEl = document.getElementById('incident-modal-title');
  const closeBtn = document.getElementById('incident-modal-close');
  const backdrop = modal?.querySelector('[data-close-modal]');
  const tbody = document.getElementById('incidents-tbody');
  let currentIncidentId = null;
  let currentData = null;

  if (!modal || !body || !tbody) return;

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    body.innerHTML = '';
    document.body.style.overflow = '';
    currentIncidentId = null;
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

  function bindActionHandlers() {
    const feedback = document.getElementById('incident-actions-feedback');
    body.querySelectorAll('[data-action-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!currentIncidentId || !currentData) return;
        const nextStatus = btn.getAttribute('data-action-status');
        if (!nextStatus || currentData.status === nextStatus) return;

        const previous = currentData.status;
        if (feedback) feedback.textContent = 'Updating status...';
        body.querySelectorAll('[data-action-status]').forEach((b) => (b.disabled = true));
        try {
          await updateDoc(doc(db, 'incidents', currentIncidentId), {
            status: nextStatus,
            moderatedBy: auth.currentUser?.uid || null,
            moderatedAt: serverTimestamp(),
          });
          currentData = {
            ...currentData,
            status: nextStatus,
            moderatedBy: auth.currentUser?.uid || currentData.moderatedBy || null,
            moderatedAt: null,
          };
          body.innerHTML = renderIncidentDetail(currentIncidentId, currentData);
          bindActionHandlers();
          updateStatusCell(currentIncidentId, nextStatus);
          if (feedback) feedback.textContent = `Status updated to ${humanize(nextStatus)}.`;
          toastSuccess(`Incident set to ${humanize(nextStatus)}`);
          window.dispatchEvent(
            new CustomEvent('incident:updated', {
              detail: { id: currentIncidentId, status: nextStatus },
            }),
          );
        } catch (err) {
          console.error('[incident-modal] update status', err);
          currentData = { ...currentData, status: previous };
          if (feedback) feedback.textContent = err?.message || 'Failed to update status.';
          toastError(err?.message || 'Failed to update status');
          body.querySelectorAll('[data-action-status]').forEach((b) => (b.disabled = false));
        }
      });
    });
  }

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.incidents-action-btn');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = tr?.dataset?.incidentId;
    if (!id) return;

    currentIncidentId = id;
    if (titleEl) titleEl.textContent = 'Incident details';
    body.innerHTML =
      '<p class="incident-modal__loading">Loading report…</p>';
    openModal();

    try {
      const ref = doc(db, 'incidents', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        body.innerHTML = `<p class="incident-modal__error">${escapeHtml('This incident was not found.')}</p>`;
        return;
      }
      const d = snap.data();
      currentData = d;
      if (titleEl) {
        titleEl.textContent = `Incident — ${humanize(d.type)}`;
      }
      body.innerHTML = renderIncidentDetail(snap.id, d);
      bindActionHandlers();
    } catch (err) {
      console.error('[incident-modal]', err);
      body.innerHTML = `<p class="incident-modal__error">${escapeHtml(err?.message || 'Failed to load incident')}</p>`;
    }
  });
}
