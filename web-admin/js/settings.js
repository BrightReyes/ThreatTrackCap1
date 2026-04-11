import { initAdminPage } from './admin-auth.js';
import { confirmDanger, toastError, toastSuccess } from './alerts.js';
import { auth, db } from '../../shared/firebase.js';
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { fetchAuditLogs, logAudit } from './audit.js';
import Papa from 'papaparse';

initAdminPage({
  pageId: 'page-settings',
  async onReady(user) {
    const title = document.getElementById('settings-title');
    const links = Array.from(document.querySelectorAll('[data-settings-tab]'));
    const sections = Array.from(document.querySelectorAll('[data-settings-section]'));

    const els = {
      bannerReadonly: document.getElementById('settings-readonly'),
      systemName: document.getElementById('system-name'),
      systemDescription: document.getElementById('system-description'),
      defaultCity: document.getElementById('default-city'),
      barangayInput: document.getElementById('barangay-input'),
      barangaysList: document.getElementById('barangays-list'),
      btnBarangayAdd: document.getElementById('btn-barangay-add'),
      lat: document.getElementById('map-lat'),
      lng: document.getElementById('map-lng'),
      zoom: document.getElementById('map-zoom'),
      timezone: document.getElementById('timezone'),
      dateTimeFormat: document.getElementById('datetime-format'),
      toggleAutosave: document.getElementById('toggle-autosave'),
      btnSave: document.getElementById('btn-save-settings'),
      btnReset: document.getElementById('btn-reset-defaults'),
      lastUpdated: document.getElementById('settings-last-updated'),
      status: document.getElementById('settings-status'),
      incCatName: document.getElementById('inc-cat-name'),
      incCatColor: document.getElementById('inc-cat-color'),
      incCatEnabled: document.getElementById('inc-cat-enabled'),
      btnIncCatAdd: document.getElementById('btn-inc-cat-add'),
      incCategoriesList: document.getElementById('inc-categories-list'),
      incDefaultCategory: document.getElementById('inc-default-category'),
    };

    const SETTINGS_DOC = doc(db, 'settings', 'system');
    const USER_DOC = doc(db, 'users', user.uid);

    let isAdmin = false;
    let autosave = false;
    let coveredBarangays = [];
    let incidentCategories = [];
    let lastLoaded = null;
    let saveTimer = null;
    let logsLoaded = false;

    const LOGS_LIMIT = 25;

    const SETTINGS_PANEL_META = {
      general: 'System name, location defaults, and behavior.',
      account: 'Your profile and sign-in identity.',
      map: 'Heatmap, markers, map controls, and appearance.',
      incidents: 'Categories, severity, rules, and workflows.',
      notifications: 'Alerts, nearby radius, and notification logs.',
      security: 'Password, session, RBAC, and audit logs.',
      data: 'Backup, export, import, and cleanup tools.',
    };

    function setPanelMeta(key) {
      const meta = document.getElementById('settings-panel-meta');
      if (meta) meta.textContent = SETTINGS_PANEL_META[key] || '';
    }

    function tabKeyFromLink(el) {
      return el?.getAttribute?.('data-settings-tab') || '';
    }

    function sectionKeyFromEl(el) {
      return el?.getAttribute?.('data-settings-section') || '';
    }

    function setActive(key) {
      links.forEach((a) => a.classList.toggle('is-active', tabKeyFromLink(a) === key));
      sections.forEach((s) => {
        s.hidden = sectionKeyFromEl(s) !== key;
      });
      if (title) {
        const active = links.find((a) => tabKeyFromLink(a) === key);
        title.textContent = active ? active.textContent.trim() : 'Settings';
      }
      setPanelMeta(key);
      if (key === 'account') {
        // eslint-disable-next-line no-void
        void loadAccountProfile();
      }
      if (key === 'notifications') {
        // eslint-disable-next-line no-void
        void loadNotificationLogs();
      }
      if (key === 'security') {
        // eslint-disable-next-line no-void
        void loadAuditLogs();
      }
    }

    function keyFromHash() {
      const h = window.location.hash.replace('#', '');
      if (h === 'general') return 'general';
      if (h === 'account') return 'account';
      if (h === 'map') return 'map';
      if (h === 'incidents') return 'incidents';
      if (h === 'notifications') return 'notifications';
      if (h === 'security') return 'security';
      if (h === 'data') return 'data';
      return 'general';
    }

    function humanizeAccountRole(role) {
      if (!role) return '—';
      return String(role)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    async function loadAccountProfile() {
      const emailEl = document.getElementById('account-email');
      const uidEl = document.getElementById('account-uid');
      const fnEl = document.getElementById('account-first-name');
      const lnEl = document.getElementById('account-last-name');
      const roleEl = document.getElementById('account-role');
      const statusEl = document.getElementById('account-save-status');
      const u = auth.currentUser;
      if (emailEl) emailEl.textContent = u?.email || '—';
      if (uidEl) uidEl.textContent = u?.uid || '—';
      try {
        const snap = await getDoc(USER_DOC);
        if (snap.exists()) {
          const d = snap.data();
          if (fnEl) fnEl.value = d.firstName != null ? String(d.firstName) : '';
          if (lnEl) lnEl.value = d.lastName != null ? String(d.lastName) : '';
          if (roleEl) roleEl.textContent = humanizeAccountRole(d.role);
          if (statusEl) statusEl.textContent = '';
        } else {
          if (fnEl) fnEl.value = '';
          if (lnEl) lnEl.value = '';
          if (roleEl) roleEl.textContent = '—';
          if (statusEl) {
            statusEl.textContent =
              'No Firestore profile yet. Saving will create users/{uid} (ask an admin to set your role if needed).';
          }
        }
      } catch (err) {
        console.error('[settings] account profile', err);
        if (statusEl) statusEl.textContent = err?.message || 'Failed to load profile';
      }
    }

    async function saveAccountProfile() {
      const fn = normText(document.getElementById('account-first-name')?.value);
      const ln = normText(document.getElementById('account-last-name')?.value);
      const statusEl = document.getElementById('account-save-status');
      const email = auth.currentUser?.email;
      if (!email) {
        toastError('Not signed in');
        return;
      }
      try {
        if (statusEl) statusEl.textContent = 'Saving…';
        const snap = await getDoc(USER_DOC);
        if (snap.exists()) {
          await updateDoc(USER_DOC, { firstName: fn, lastName: ln });
        } else {
          await setDoc(USER_DOC, {
            uid: user.uid,
            email,
            firstName: fn,
            lastName: ln,
            createdAt: serverTimestamp(),
          });
        }
        if (statusEl) statusEl.textContent = 'Profile saved.';
        toastSuccess('Profile saved');
        // eslint-disable-next-line no-void
        void logAudit('account.profile_update', {});
        await loadAccountProfile();
      } catch (err) {
        console.error('[settings] save profile', err);
        if (statusEl) statusEl.textContent = err?.message || 'Failed to save';
        toastError(err?.message || 'Failed to save profile');
      }
    }

    function setStatus(text) {
      if (!els.status) return;
      els.status.textContent = text || '';
    }

    function formatTs(ts) {
      if (!ts) return '—';
      try {
        const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString();
      } catch {
        return '—';
      }
    }

    function normText(v) {
      return String(v ?? '').trim();
    }

    function parseNum(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }

    function escapeHtml(text) {
      if (text == null || text === '') return '';
      const div = document.createElement('div');
      div.textContent = String(text);
      return div.innerHTML;
    }

    /** @param {'all'|'general'|'map'|'incidents'|'notifications'|'security'|'data'|'account'} section */
    function validate(payload, section = 'all') {
      const errors = [];
      const all = section === 'all';
      const want = (name) => all || section === name;

      if (want('general')) {
        if (!payload.systemName) errors.push('System name is required.');

        const lat = payload.location?.defaultCoordinates?.lat;
        const lng = payload.location?.defaultCoordinates?.lng;
        const zoom = payload.location?.defaultZoom;

        if (lat != null && (lat < -90 || lat > 90)) errors.push('Latitude must be between -90 and 90.');
        if (lng != null && (lng < -180 || lng > 180)) errors.push('Longitude must be between -180 and 180.');
        if (zoom != null && (zoom < 1 || zoom > 19)) errors.push('Zoom must be between 1 and 19.');
      }

      if (want('map')) {
        const map = payload.mapSettings || {};
        const hm = map.heatmap || {};
        if (hm.opacity != null && (hm.opacity < 0 || hm.opacity > 1)) errors.push('Heatmap opacity must be between 0 and 1.');
        if (hm.radius != null && (hm.radius < 5 || hm.radius > 80)) errors.push('Heatmap radius must be between 5 and 80.');
        if (hm.minThreshold != null && (hm.minThreshold < 1 || hm.minThreshold > 50)) errors.push('Hotspot threshold must be between 1 and 50.');

        const inter = map.interaction || {};
        const minZ = inter.minZoom;
        const maxZ = inter.maxZoom;
        if (minZ != null && (minZ < 1 || minZ > 19)) errors.push('Min zoom must be between 1 and 19.');
        if (maxZ != null && (maxZ < 1 || maxZ > 19)) errors.push('Max zoom must be between 1 and 19.');
        if (minZ != null && maxZ != null && minZ > maxZ) errors.push('Min zoom cannot be greater than max zoom.');

        const perf = map.performance || {};
        if (perf.markerLimit != null && (perf.markerLimit < 50 || perf.markerLimit > 2000)) errors.push('Marker limit must be between 50 and 2000.');
        if (perf.refreshIntervalSec != null && (perf.refreshIntervalSec < 5 || perf.refreshIntervalSec > 600)) errors.push('Refresh interval must be between 5 and 600 seconds.');
      }

      if (want('incidents')) {
        const inc = payload.incidentSettings || {};
        if (
          inc.inputRules?.minDescriptionLength != null &&
          (inc.inputRules.minDescriptionLength < 0 || inc.inputRules.minDescriptionLength > 2000)
        ) {
          errors.push('Minimum description length must be between 0 and 2000.');
        }
        if (
          inc.location?.accuracyThresholdMeters != null &&
          (inc.location.accuracyThresholdMeters < 5 || inc.location.accuracyThresholdMeters > 500)
        ) {
          errors.push('Accuracy threshold must be between 5 and 500 meters.');
        }
        if (
          inc.timeRules?.maxBackdateDays != null &&
          (inc.timeRules.maxBackdateDays < 0 || inc.timeRules.maxBackdateDays > 365)
        ) {
          errors.push('Max backdate limit must be between 0 and 365 days.');
        }
        if (inc.retention?.enabled) {
          if (inc.retention.afterDays == null || inc.retention.afterDays < 1 || inc.retention.afterDays > 3650) {
            errors.push('Retention days must be between 1 and 3650 when retention is enabled.');
          }
        }
        if (inc.duplicatePrevention?.enabled) {
          const r = inc.duplicatePrevention.radiusMeters;
          const w = inc.duplicatePrevention.timeWindowMinutes;
          if (r != null && (r < 10 || r > 1000)) errors.push('Duplicate radius must be between 10 and 1000 meters.');
          if (w != null && (w < 1 || w > 1440)) errors.push('Duplicate time window must be between 1 and 1440 minutes.');
        }
        if (inc.alerts?.enabled) {
          const t = inc.alerts.areaThresholdCount;
          if (t != null && (t < 2 || t > 100)) errors.push('Area threshold must be between 2 and 100 incidents.');
        }
      }

      if (want('notifications')) {
        const n = payload.notificationSettings || {};
        if (n.hotspot?.enabled) {
          const t = n.hotspot.thresholdCount;
          if (t == null || t < 2 || t > 100) errors.push('Notification hotspot threshold must be between 2 and 100.');
        }
        if (n.nearby?.enabled) {
          const r = n.nearby.radiusMeters;
          if (r == null || ![500, 1000].includes(r)) errors.push('Nearby radius must be 500m or 1000m.');
        }
      }

      if (want('security')) {
        const s = payload.securitySettings || {};
        if (
          s.passwordPolicy?.minLength != null &&
          (s.passwordPolicy.minLength < 6 || s.passwordPolicy.minLength > 64)
        ) {
          errors.push('Password min length must be between 6 and 64.');
        }
        if (s.loginLimit?.maxAttempts != null && (s.loginLimit.maxAttempts < 1 || s.loginLimit.maxAttempts > 20)) {
          errors.push('Max failed attempts must be between 1 and 20.');
        }
        if (
          s.loginLimit?.lockoutMinutes != null &&
          (s.loginLimit.lockoutMinutes < 1 || s.loginLimit.lockoutMinutes > 60)
        ) {
          errors.push('Lockout minutes must be between 1 and 60.');
        }
        if (s.sessionTimeoutMinutes != null && (s.sessionTimeoutMinutes < 1 || s.sessionTimeoutMinutes > 240)) {
          errors.push('Session timeout must be between 1 and 240 minutes.');
        }
      }

      return errors;
    }

    function setEditable(canEdit) {
      const allInputs = Array.from(
        document.querySelectorAll('.settings-panel input, .settings-panel textarea, .settings-panel select, .settings-panel button'),
      ).filter((el) => !el.closest('[data-settings-section="account"]'));
      allInputs.forEach((el) => {
        if (el === els.btnSave || el === els.btnReset || el === els.btnBarangayAdd || el === els.btnIncCatAdd) {
          el.disabled = !canEdit;
          return;
        }
        if (el.classList?.contains('settings-chip__remove')) {
          el.disabled = !canEdit;
          return;
        }
        if (el.classList?.contains('settings-inc-cat__delete')) {
          el.disabled = !canEdit;
          return;
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          el.disabled = !canEdit;
        }
      });
      if (els.bannerReadonly) els.bannerReadonly.hidden = canEdit;
      if (!canEdit) setStatus('Read-only');
    }

    function slugKey(name) {
      const s = normText(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      return s || 'category';
    }

    function syncDefaultCategoryOptions() {
      if (!els.incDefaultCategory) return;
      const current = els.incDefaultCategory.value;
      const enabled = incidentCategories.filter((c) => c.enabled);
      const options = [{ value: 'all', label: 'All categories' }, ...enabled.map((c) => ({ value: c.key, label: c.name }))];
      els.incDefaultCategory.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
      els.incDefaultCategory.value = options.some((o) => o.value === current) ? current : 'all';
    }

    function renderIncidentCategories() {
      if (!els.incCategoriesList) return;
      els.incCategoriesList.innerHTML = '';

      if (!incidentCategories.length) {
        const empty = document.createElement('div');
        empty.className = 'settings-help';
        empty.textContent = 'No categories added yet.';
        els.incCategoriesList.appendChild(empty);
        syncDefaultCategoryOptions();
        return;
      }

      incidentCategories.forEach((cat) => {
        const row = document.createElement('div');
        row.className = 'settings-list__item';

        const nameWrap = document.createElement('div');
        nameWrap.className = 'settings-list__name';

        const name = document.createElement('input');
        name.className = 'settings-input';
        name.type = 'text';
        name.value = cat.name;
        name.disabled = !isAdmin;
        name.addEventListener('input', () => {
          cat.name = normText(name.value) || cat.name;
          cat.key = slugKey(cat.name);
          syncDefaultCategoryOptions();
          requestSave('Auto-saved');
        });

        const hint = document.createElement('div');
        hint.className = 'settings-help';
        hint.textContent = `Key: ${cat.key}`;

        nameWrap.appendChild(name);
        nameWrap.appendChild(hint);

        const color = document.createElement('input');
        color.className = 'settings-input';
        color.type = 'color';
        color.value = cat.color || '#2563eb';
        color.disabled = !isAdmin;
        color.addEventListener('input', () => {
          cat.color = color.value;
          requestSave('Auto-saved');
        });

        const enabled = document.createElement('label');
        enabled.className = 'settings-inline';
        enabled.style.gap = '8px';
        enabled.style.fontWeight = '700';
        enabled.style.color = '#111827';

        const enabledCb = document.createElement('input');
        enabledCb.type = 'checkbox';
        enabledCb.checked = !!cat.enabled;
        enabledCb.disabled = !isAdmin;
        enabledCb.addEventListener('change', () => {
          cat.enabled = !!enabledCb.checked;
          syncDefaultCategoryOptions();
          requestSave('Auto-saved');
        });
        const enabledTxt = document.createElement('span');
        enabledTxt.textContent = 'Enabled';

        enabled.appendChild(enabledCb);
        enabled.appendChild(enabledTxt);

        const actions = document.createElement('div');
        actions.className = 'settings-list__actions';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'incidents-action-btn incidents-action-btn--danger settings-inc-cat__delete';
        del.textContent = 'Delete';
        del.disabled = !isAdmin;
        del.addEventListener('click', async () => {
          if (!isAdmin) return;
          const ok = await confirmDanger({
            title: 'Delete category?',
            text: `This will remove "${cat.name}".`,
            confirmText: 'Delete',
          });
          if (!ok) return;
          incidentCategories = incidentCategories.filter((c) => c !== cat);
          renderIncidentCategories();
          requestSave('Auto-saved');
        });

        actions.appendChild(del);

        row.appendChild(nameWrap);
        row.appendChild(color);
        row.appendChild(enabled);
        row.appendChild(actions);

        els.incCategoriesList.appendChild(row);
      });

      syncDefaultCategoryOptions();
    }

    function renderBarangays() {
      if (!els.barangaysList) return;
      els.barangaysList.innerHTML = '';

      if (!coveredBarangays.length) {
        const empty = document.createElement('div');
        empty.className = 'settings-help';
        empty.textContent = 'No barangays added yet.';
        els.barangaysList.appendChild(empty);
        return;
      }

      coveredBarangays.forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'settings-chip';
        chip.textContent = name;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-chip__remove';
        btn.textContent = '×';
        btn.title = `Remove ${name}`;
        btn.disabled = !isAdmin;
        btn.addEventListener('click', () => {
          coveredBarangays = coveredBarangays.filter((b) => b !== name);
          renderBarangays();
          requestSave('Barangay removed');
        });

        chip.appendChild(btn);
        els.barangaysList.appendChild(chip);
      });
    }

    function readForm() {
      const systemName = normText(els.systemName?.value);
      const systemDescription = normText(els.systemDescription?.value);
      const defaultCity = normText(els.defaultCity?.value);

      const lat = parseNum(els.lat?.value);
      const lng = parseNum(els.lng?.value);
      const zoom = parseNum(els.zoom?.value);

      const timezone = normText(els.timezone?.value) || 'Asia/Manila';
      const dateTimeFormat = normText(els.dateTimeFormat?.value) || '';

      return {
        systemName,
        systemDescription,
        location: {
          defaultCity,
          coveredBarangays: coveredBarangays.slice(),
          defaultCoordinates: {
            lat,
            lng,
          },
          defaultZoom: zoom,
        },
        region: {
          timezone,
          dateTimeFormat,
        },
        behavior: {
          autoSave: !!autosave,
        },
        mapSettings: {
          heatmap: {
            enabled: !!document.getElementById('map-heatmap-enabled')?.checked,
            intensity: normText(document.getElementById('map-heatmap-intensity')?.value) || 'medium',
            radius: parseNum(document.getElementById('map-heatmap-radius')?.value),
            opacity: parseNum(document.getElementById('map-heatmap-opacity')?.value),
            sensitivity: normText(document.getElementById('map-hotspot-sensitivity')?.value) || 'medium',
            minThreshold: parseNum(document.getElementById('map-hotspot-threshold')?.value),
          },
          markers: {
            enabled: !!document.getElementById('map-markers-enabled')?.checked,
            type: normText(document.getElementById('map-marker-type')?.value) || 'dot',
            clustering: normText(document.getElementById('map-marker-clustering')?.value) || 'off',
            severityColors: {
              low: '#22c55e',
              medium: '#facc15',
              high: '#ef4444',
            },
          },
          pcp: {
            enabled: false,
            highlightNearest: false,
            markerStyle: 'icon',
          },
          interaction: {
            zoomControl: !!document.getElementById('map-zoom-control')?.checked,
            dragging: !!document.getElementById('map-dragging')?.checked,
            scrollZoom: !!document.getElementById('map-scroll-zoom')?.checked,
            doubleClickZoom: !!document.getElementById('map-doubleclick-zoom')?.checked,
            minZoom: parseNum(document.getElementById('map-min-zoom')?.value),
            maxZoom: parseNum(document.getElementById('map-max-zoom')?.value),
          },
          appearance: {
            theme: normText(document.getElementById('map-theme')?.value) || 'light',
            tiles: normText(document.getElementById('map-tiles')?.value) || 'street',
            boundaryOverlay: !!document.getElementById('map-boundary-overlay')?.checked,
          },
          performance: {
            markerLimit: parseNum(document.getElementById('map-marker-limit')?.value),
            refreshMode: normText(document.getElementById('map-refresh-mode')?.value) || 'realtime',
            refreshIntervalSec: parseNum(document.getElementById('map-refresh-interval')?.value),
            lazyLoad: true,
          },
          filters: {
            defaultTimeRangeDays: 30,
            defaultCrimeType: 'all',
            defaultSeverity: 'all',
          },
        },
        incidentSettings: {
          categories: incidentCategories.map((c) => ({
            key: c.key,
            name: c.name,
            enabled: !!c.enabled,
            color: c.color || '#2563eb',
          })),
          severity: {
            colors: {
              low: normText(document.getElementById('sev-low-color')?.value) || '#22c55e',
              medium: normText(document.getElementById('sev-med-color')?.value) || '#facc15',
              high: normText(document.getElementById('sev-high-color')?.value) || '#ef4444',
            },
            defaultSeverity: normText(document.getElementById('inc-default-severity')?.value) || 'medium',
          },
          inputRules: {
            required: {
              location: !!document.getElementById('inc-req-location')?.checked,
              description: !!document.getElementById('inc-req-description')?.checked,
              dateTime: !!document.getElementById('inc-req-datetime')?.checked,
            },
            minDescriptionLength: parseNum(document.getElementById('inc-min-desc-len')?.value),
            preventSpamMinLength: parseNum(document.getElementById('inc-spam-min-len')?.value),
            autoFillCurrentDateTime: !!document.getElementById('inc-autofill-datetime')?.checked,
          },
          location: {
            gpsEnabled: !!document.getElementById('inc-gps-enabled')?.checked,
            manualPinEnabled: !!document.getElementById('inc-pin-enabled')?.checked,
            accuracyThresholdMeters: parseNum(document.getElementById('inc-accuracy-threshold')?.value),
            restrictWithinCovered: !!document.getElementById('inc-restrict-covered')?.checked,
          },
          timeRules: {
            allowPastEntry: !!document.getElementById('inc-allow-past')?.checked,
            maxBackdateDays: parseNum(document.getElementById('inc-max-backdate-days')?.value),
            autoTimestampOnSubmit: !!document.getElementById('inc-auto-timestamp')?.checked,
          },
          defaultFilters: {
            timeRangeDays: parseNum(document.getElementById('inc-default-range')?.value) || 30,
            categoryKey: normText(document.getElementById('inc-default-category')?.value) || 'all',
            severity: normText(document.getElementById('inc-default-severity-filter')?.value) || 'all',
          },
          retention: {
            enabled: !!document.getElementById('inc-retention-enabled')?.checked,
            afterDays: parseNum(document.getElementById('inc-retention-days')?.value),
            mode: normText(document.getElementById('inc-retention-mode')?.value) || 'archive',
          },
          approval: {
            enabled: !!document.getElementById('inc-approval-enabled')?.checked,
            statuses: ['pending', 'approved', 'rejected'],
            approverRoles: ['admin', 'police'],
          },
          duplicatePrevention: {
            enabled: !!document.getElementById('inc-dup-enabled')?.checked,
            radiusMeters: parseNum(document.getElementById('inc-dup-radius-m')?.value),
            timeWindowMinutes: parseNum(document.getElementById('inc-dup-window-min')?.value),
          },
          alerts: {
            enabled: !!document.getElementById('inc-alerts-enabled')?.checked,
            onHighSeverity: !!document.getElementById('inc-alert-high')?.checked,
            areaThresholdCount: parseNum(document.getElementById('inc-alert-area-threshold')?.value),
          },
          hotspotContribution: {
            onlyEnabledCategories: !!document.getElementById('inc-hotspot-only-enabled')?.checked,
            severityWeights: { low: 0.45, medium: 0.7, high: 1.0 },
          },
          access: {
            roleCreate: normText(document.getElementById('inc-role-create')?.value) || 'user',
            roleEdit: normText(document.getElementById('inc-role-edit')?.value) || 'admin',
            roleDelete: normText(document.getElementById('inc-role-delete')?.value) || 'admin',
          },
        },
        notificationSettings: {
          enabled: !!document.getElementById('notif-enabled')?.checked,
          mode: normText(document.getElementById('notif-mode')?.value) || 'realtime',
          highSeverity: {
            enabled: !!document.getElementById('notif-high-sev')?.checked,
          },
          hotspot: {
            enabled: !!document.getElementById('notif-hotspot-enabled')?.checked,
            thresholdCount: parseNum(document.getElementById('notif-hotspot-threshold')?.value),
          },
          nearby: {
            enabled: !!document.getElementById('notif-nearby-enabled')?.checked,
            radiusMeters: parseNum(document.getElementById('notif-nearby-radius')?.value),
          },
          logs: {
            enabled: true,
            limit: LOGS_LIMIT,
          },
        },
        securitySettings: {
          passwordPolicy: {
            minLength: parseNum(document.getElementById('sec-pw-minlen')?.value),
            requireLettersAndNumbers: !!document.getElementById('sec-pw-require-alnum')?.checked,
          },
          loginLimit: {
            maxAttempts: parseNum(document.getElementById('sec-login-max-attempts')?.value),
            lockoutMinutes: parseNum(document.getElementById('sec-login-lockout-mins')?.value),
          },
          sessionTimeoutMinutes: parseNum(document.getElementById('sec-session-timeout-mins')?.value),
          rbac: {
            policeCanManageIncidents: !!document.getElementById('sec-police-incidents')?.checked,
          },
          dataProtection: {
            lockApprovedIncidents: !!document.getElementById('sec-lock-approved')?.checked,
          },
        },
      };
    }

    function writeForm(data) {
      if (els.systemName) els.systemName.value = data.systemName ?? '';
      if (els.systemDescription) els.systemDescription.value = data.systemDescription ?? '';
      if (els.defaultCity) els.defaultCity.value = data.location?.defaultCity ?? '';

      coveredBarangays = Array.isArray(data.location?.coveredBarangays) ? data.location.coveredBarangays.map((x) => String(x)).filter(Boolean) : [];
      coveredBarangays = Array.from(new Set(coveredBarangays)).sort((a, b) => a.localeCompare(b));
      renderBarangays();

      const lat = data.location?.defaultCoordinates?.lat;
      const lng = data.location?.defaultCoordinates?.lng;
      const zoom = data.location?.defaultZoom;
      if (els.lat) els.lat.value = lat == null ? '' : String(lat);
      if (els.lng) els.lng.value = lng == null ? '' : String(lng);
      if (els.zoom) els.zoom.value = zoom == null ? '' : String(zoom);

      if (els.timezone) els.timezone.value = data.region?.timezone ?? 'Asia/Manila';
      if (els.dateTimeFormat) els.dateTimeFormat.value = data.region?.dateTimeFormat ?? '';

      autosave = !!data.behavior?.autoSave;
      if (els.toggleAutosave) els.toggleAutosave.checked = autosave;

      const inc = data.incidentSettings || {};
      incidentCategories = Array.isArray(inc.categories)
        ? inc.categories
            .map((c) => ({
              key: normText(c?.key) || slugKey(c?.name),
              name: normText(c?.name) || 'Category',
              enabled: c?.enabled !== false,
              color: normText(c?.color) || '#2563eb',
            }))
            .filter((c) => c.name)
        : [];
      // de-dupe by key
      const byKey = new Map();
      incidentCategories.forEach((c) => byKey.set(c.key, c));
      incidentCategories = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
      renderIncidentCategories();

      const sev = inc.severity || {};
      const sevColors = sev.colors || {};
      const setValueRaw = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v ?? '';
      };
      setValueRaw('sev-low-color', sevColors.low ?? '#22c55e');
      setValueRaw('sev-med-color', sevColors.medium ?? '#facc15');
      setValueRaw('sev-high-color', sevColors.high ?? '#ef4444');
      setValueRaw('inc-default-severity', sev.defaultSeverity ?? 'medium');

      const req = inc.inputRules?.required || {};
      const setCheckedRaw = (id, v, fb = false) => {
        const el = document.getElementById(id);
        if (el && 'checked' in el) el.checked = v ?? fb;
      };
      setCheckedRaw('inc-req-location', req.location, true);
      setCheckedRaw('inc-req-description', req.description, true);
      setCheckedRaw('inc-req-datetime', req.dateTime, true);
      setCheckedRaw('inc-autofill-datetime', inc.inputRules?.autoFillCurrentDateTime, true);
      setValueRaw('inc-min-desc-len', inc.inputRules?.minDescriptionLength ?? 10);
      setValueRaw('inc-spam-min-len', inc.inputRules?.preventSpamMinLength ?? 10);

      setCheckedRaw('inc-gps-enabled', inc.location?.gpsEnabled, true);
      setCheckedRaw('inc-pin-enabled', inc.location?.manualPinEnabled, true);
      setValueRaw('inc-accuracy-threshold', inc.location?.accuracyThresholdMeters ?? 50);
      setCheckedRaw('inc-restrict-covered', inc.location?.restrictWithinCovered, false);

      setCheckedRaw('inc-allow-past', inc.timeRules?.allowPastEntry, true);
      setCheckedRaw('inc-auto-timestamp', inc.timeRules?.autoTimestampOnSubmit, true);
      setValueRaw('inc-max-backdate-days', inc.timeRules?.maxBackdateDays ?? 30);

      setValueRaw('inc-default-range', inc.defaultFilters?.timeRangeDays ?? 30);
      setValueRaw('inc-default-category', inc.defaultFilters?.categoryKey ?? 'all');
      setValueRaw('inc-default-severity-filter', inc.defaultFilters?.severity ?? 'all');

      setCheckedRaw('inc-retention-enabled', inc.retention?.enabled, false);
      setValueRaw('inc-retention-days', inc.retention?.afterDays ?? 365);
      setValueRaw('inc-retention-mode', inc.retention?.mode ?? 'archive');

      setCheckedRaw('inc-approval-enabled', inc.approval?.enabled, false);

      setCheckedRaw('inc-dup-enabled', inc.duplicatePrevention?.enabled, false);
      setValueRaw('inc-dup-radius-m', inc.duplicatePrevention?.radiusMeters ?? 120);
      setValueRaw('inc-dup-window-min', inc.duplicatePrevention?.timeWindowMinutes ?? 30);

      setCheckedRaw('inc-alerts-enabled', inc.alerts?.enabled, false);
      setCheckedRaw('inc-alert-high', inc.alerts?.onHighSeverity, true);
      setValueRaw('inc-alert-area-threshold', inc.alerts?.areaThresholdCount ?? 3);

      setCheckedRaw('inc-hotspot-only-enabled', inc.hotspotContribution?.onlyEnabledCategories, true);

      setValueRaw('inc-role-create', inc.access?.roleCreate ?? 'user');
      setValueRaw('inc-role-edit', inc.access?.roleEdit ?? 'admin');
      setValueRaw('inc-role-delete', inc.access?.roleDelete ?? 'admin');

      const n = data.notificationSettings || {};
      const setCheckedN = (id, v, fb = false) => {
        const el = document.getElementById(id);
        if (el && 'checked' in el) el.checked = v ?? fb;
      };
      const setValueN = (id, v, fb = '') => {
        const el = document.getElementById(id);
        if (el) el.value = v ?? fb;
      };
      setCheckedN('notif-enabled', n.enabled, true);
      setValueN('notif-mode', n.mode, 'realtime');
      setCheckedN('notif-high-sev', n.highSeverity?.enabled, true);
      setCheckedN('notif-hotspot-enabled', n.hotspot?.enabled, true);
      setValueN('notif-hotspot-threshold', n.hotspot?.thresholdCount ?? 3);
      setCheckedN('notif-nearby-enabled', n.nearby?.enabled, false);
      setValueN('notif-nearby-radius', n.nearby?.radiusMeters ?? 500);

      const s = data.securitySettings || {};
      const pp = s.passwordPolicy || {};
      const ll = s.loginLimit || {};
      const rbac = s.rbac || {};
      const dp = s.dataProtection || {};
      setValueRaw('sec-pw-minlen', pp.minLength ?? 8);
      setCheckedRaw('sec-pw-require-alnum', pp.requireLettersAndNumbers, true);
      setValueRaw('sec-login-max-attempts', ll.maxAttempts ?? 5);
      setValueRaw('sec-login-lockout-mins', ll.lockoutMinutes ?? 10);
      setValueRaw('sec-session-timeout-mins', s.sessionTimeoutMinutes ?? 30);
      setCheckedRaw('sec-police-incidents', rbac.policeCanManageIncidents, true);
      setCheckedRaw('sec-lock-approved', dp.lockApprovedIncidents, true);

      const map = data.mapSettings || {};
      const hm = map.heatmap || {};
      const mk = map.markers || {};
      const inter = map.interaction || {};
      const app = map.appearance || {};
      const perf = map.performance || {};

      const setChecked = (id, v, fallback = false) => {
        const el = document.getElementById(id);
        if (el && 'checked' in el) el.checked = v ?? fallback;
      };
      const setValue = (id, v, fallback = '') => {
        const el = document.getElementById(id);
        if (el) el.value = v ?? fallback;
      };

      setChecked('map-heatmap-enabled', hm.enabled, false);
      setValue('map-heatmap-intensity', hm.intensity, 'medium');
      setValue('map-heatmap-radius', hm.radius ?? 28, 28);
      setValue('map-heatmap-opacity', hm.opacity ?? 0.65, 0.65);
      setValue('map-hotspot-sensitivity', hm.sensitivity, 'medium');
      setValue('map-hotspot-threshold', hm.minThreshold ?? 3, 3);

      setChecked('map-markers-enabled', mk.enabled, true);
      setValue('map-marker-type', mk.type, 'dot');
      setValue('map-marker-clustering', mk.clustering, 'off');

      setChecked('map-zoom-control', inter.zoomControl, true);
      setChecked('map-dragging', inter.dragging, true);
      setChecked('map-scroll-zoom', inter.scrollZoom, true);
      setChecked('map-doubleclick-zoom', inter.doubleClickZoom, true);
      setValue('map-min-zoom', inter.minZoom ?? 10, 10);
      setValue('map-max-zoom', inter.maxZoom ?? 19, 19);

      setValue('map-theme', app.theme, 'light');
      setValue('map-tiles', app.tiles, 'street');
      setChecked('map-boundary-overlay', app.boundaryOverlay, true);

      setValue('map-marker-limit', perf.markerLimit ?? 250, 250);
      setValue('map-refresh-mode', perf.refreshMode, 'realtime');
      setValue('map-refresh-interval', perf.refreshIntervalSec ?? 30, 30);
    }

    function defaultConfig() {
      return {
        systemName: 'ThreatTrack',
        systemDescription: '',
        location: {
          defaultCity: 'Valenzuela',
          coveredBarangays: [],
          defaultCoordinates: { lat: 14.7000, lng: 120.9800 },
          defaultZoom: 13,
        },
        region: {
          timezone: 'Asia/Manila',
          dateTimeFormat: '',
        },
        behavior: {
          autoSave: false,
        },
        mapSettings: {
          heatmap: {
            enabled: true,
            intensity: 'medium',
            radius: 28,
            opacity: 0.65,
            sensitivity: 'medium',
            minThreshold: 3,
          },
          markers: {
            enabled: true,
            type: 'dot',
            clustering: 'off',
            severityColors: { low: '#22c55e', medium: '#facc15', high: '#ef4444' },
          },
          pcp: { enabled: false, highlightNearest: false, markerStyle: 'icon' },
          interaction: { zoomControl: true, dragging: true, scrollZoom: true, doubleClickZoom: true, minZoom: 10, maxZoom: 19 },
          appearance: { theme: 'light', tiles: 'street', boundaryOverlay: true },
          performance: { markerLimit: 250, refreshMode: 'realtime', refreshIntervalSec: 30, lazyLoad: true },
          filters: { defaultTimeRangeDays: 30, defaultCrimeType: 'all', defaultSeverity: 'all' },
        },
        incidentSettings: {
          categories: [
            { key: 'theft', name: 'Theft', enabled: true, color: '#2563eb' },
            { key: 'robbery', name: 'Robbery', enabled: true, color: '#7c3aed' },
            { key: 'assault', name: 'Assault', enabled: true, color: '#ef4444' },
            { key: 'vandalism', name: 'Vandalism', enabled: true, color: '#f59e0b' },
          ],
          severity: {
            colors: { low: '#22c55e', medium: '#facc15', high: '#ef4444' },
            defaultSeverity: 'medium',
          },
          inputRules: {
            required: { location: true, description: true, dateTime: true },
            minDescriptionLength: 10,
            preventSpamMinLength: 10,
            autoFillCurrentDateTime: true,
          },
          location: {
            gpsEnabled: true,
            manualPinEnabled: true,
            accuracyThresholdMeters: 50,
            restrictWithinCovered: false,
          },
          timeRules: {
            allowPastEntry: true,
            maxBackdateDays: 30,
            autoTimestampOnSubmit: true,
          },
          defaultFilters: {
            timeRangeDays: 30,
            categoryKey: 'all',
            severity: 'all',
          },
          retention: {
            enabled: false,
            afterDays: 365,
            mode: 'archive',
          },
          approval: {
            enabled: false,
            statuses: ['pending', 'approved', 'rejected'],
            approverRoles: ['admin', 'police'],
          },
          duplicatePrevention: {
            enabled: false,
            radiusMeters: 120,
            timeWindowMinutes: 30,
          },
          alerts: {
            enabled: false,
            onHighSeverity: true,
            areaThresholdCount: 3,
          },
          hotspotContribution: {
            onlyEnabledCategories: true,
            severityWeights: { low: 0.45, medium: 0.7, high: 1.0 },
          },
          access: {
            roleCreate: 'user',
            roleEdit: 'admin',
            roleDelete: 'admin',
          },
        },
        notificationSettings: {
          enabled: true,
          mode: 'realtime',
          highSeverity: { enabled: true },
          hotspot: { enabled: true, thresholdCount: 3 },
          nearby: { enabled: false, radiusMeters: 500 },
          logs: { enabled: true, limit: LOGS_LIMIT },
        },
        securitySettings: {
          passwordPolicy: { minLength: 8, requireLettersAndNumbers: true },
          loginLimit: { maxAttempts: 5, lockoutMinutes: 10 },
          sessionTimeoutMinutes: 30,
          rbac: { policeCanManageIncidents: true },
          dataProtection: { lockApprovedIncidents: true },
        },
      };
    }

    async function loadNotificationLogs() {
      if (logsLoaded) return;
      logsLoaded = true;

      const meta = document.getElementById('notif-logs-meta');
      const root = document.getElementById('notif-logs');
      if (!root) return;

      root.innerHTML = '<div class="settings-help">Loading…</div>';
      if (meta) meta.textContent = 'Loading…';

      try {
        const q = query(collection(db, 'notifications'), orderBy('sentAt', 'desc'), limit(LOGS_LIMIT));
        const snap = await getDocs(q);
        if (snap.empty) {
          root.innerHTML = '<div class="settings-help">No notifications yet.</div>';
          if (meta) meta.textContent = '0 logs';
          return;
        }

        const cards = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const type = normText(d.type) || 'incident';
          const msg = normText(d.title) || normText(d.body) || '(no message)';
          let when = '—';
          const ts = d.sentAt;
          if (ts && typeof ts.toDate === 'function') {
            try {
              when = ts.toDate().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
            } catch {}
          }

          cards.push(
            `<div class="settings-log">
              <div class="settings-log__top">
                <div class="settings-log__type">${escapeHtml(type)}</div>
                <div class="settings-log__time">${escapeHtml(when)}</div>
              </div>
              <div class="settings-log__msg">${escapeHtml(msg)}</div>
            </div>`,
          );
        });

        root.innerHTML = cards.join('');
        if (meta) meta.textContent = `${snap.size} log${snap.size === 1 ? '' : 's'} (latest)`;
      } catch (err) {
        console.error('[settings] notification logs', err);
        const msg =
          err?.code === 'permission-denied'
            ? 'Permission denied (notifications logs).'
            : err?.message || 'Failed to load logs';
        root.innerHTML = `<div class="settings-help">${escapeHtml(msg)}</div>`;
        if (meta) meta.textContent = 'Failed to load';
      }
    }

    async function loadAuditLogs() {
      const meta = document.getElementById('audit-logs-meta');
      const root = document.getElementById('audit-logs');
      if (!root) return;

      root.innerHTML = '<div class="settings-help">Loading…</div>';
      if (meta) meta.textContent = 'Loading…';

      try {
        const snap = await fetchAuditLogs({ max: 25 });
        if (snap.empty) {
          root.innerHTML = '<div class="settings-help">No activity yet.</div>';
          if (meta) meta.textContent = '0 logs';
          return;
        }

        const rows = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const action = normText(d.action) || 'unknown';
          const who = normText(d.email) || normText(d.uid) || '—';
          let when = '—';
          const ts = d.at;
          if (ts && typeof ts.toDate === 'function') {
            try {
              when = ts.toDate().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
            } catch {}
          }
          rows.push(
            `<div class="settings-log">
              <div class="settings-log__top">
                <div class="settings-log__type">${escapeHtml(action)}</div>
                <div class="settings-log__time">${escapeHtml(when)}</div>
              </div>
              <div class="settings-log__msg">${escapeHtml(who)}</div>
            </div>`,
          );
        });

        root.innerHTML = rows.join('');
        if (meta) meta.textContent = `${snap.size} log${snap.size === 1 ? '' : 's'} (latest)`;
      } catch (err) {
        console.error('[settings] audit logs', err);
        const msg =
          err?.code === 'permission-denied' ? 'Permission denied (audit logs).' : err?.message || 'Failed to load logs';
        root.innerHTML = `<div class="settings-help">${escapeHtml(msg)}</div>`;
        if (meta) meta.textContent = 'Failed to load';
      }
    }

    async function saveNow({ reason = 'Saved', validateAll = false } = {}) {
      if (!isAdmin) return;
      const payload = readForm();
      const tab = keyFromHash();
      // One merged document is written, but validation is scoped to the active tab so General
      // is not blocked by unrelated sections. Full validation after reset and when saving from Account.
      const section =
        validateAll || tab === 'account' ? 'all' : tab === 'data' ? 'data' : tab;
      const errors = validate(payload, section);
      if (errors.length) {
        toastError(errors[0]);
        setStatus('Fix validation errors');
        return;
      }

      try {
        setStatus('Saving…');
        await setDoc(
          SETTINGS_DOC,
          {
            ...payload,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid ?? null,
            createdAt: lastLoaded?.createdAt ?? serverTimestamp(),
          },
          { merge: true },
        );
        // eslint-disable-next-line no-void
        void logAudit('settings.update', { reason });
        setStatus(reason);
        toastSuccess(reason);
      } catch (err) {
        console.error('[settings] save', err);
        setStatus('Save failed');
        toastError(err?.message || 'Failed to save settings');
      }
    }

    function requestSave(reason) {
      if (!isAdmin) return;
      if (!autosave) {
        setStatus('Unsaved changes');
        return;
      }
      setStatus('Pending auto-save…');
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveNow({ reason }), 850);
    }

    async function loadSettings() {
      setStatus('Loading…');
      try {
        await auth.authStateReady();
        await user.getIdToken();
      } catch (err) {
        console.warn('[settings] auth token', err);
      }

      try {
        const roleSnap = await getDoc(USER_DOC);
        const role = roleSnap.exists() ? roleSnap.data()?.role : null;
        isAdmin = role === 'admin' || role === 'moderator';
      } catch (err) {
        console.warn('[settings] role check failed', err);
        isAdmin = false;
      }

      setEditable(isAdmin);

      try {
        const snap = await getDoc(SETTINGS_DOC);
        if (snap.exists()) {
          lastLoaded = snap.data();
          writeForm(snap.data());
          if (els.lastUpdated) els.lastUpdated.textContent = `Last updated: ${formatTs(snap.data()?.updatedAt)}`;
          setStatus('Loaded');
          // Best-effort: load logs when settings exist.
          // eslint-disable-next-line no-void
          void loadNotificationLogs();
          // eslint-disable-next-line no-void
          void loadAuditLogs();
          return;
        }

        // First run: if admin, create defaults; otherwise show defaults read-only.
        const defaults = defaultConfig();
        writeForm(defaults);
        if (els.lastUpdated) els.lastUpdated.textContent = 'Last updated: —';
        setStatus('Defaults loaded');

        if (isAdmin) {
          try {
            await setDoc(SETTINGS_DOC, { ...defaults, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            setStatus('Initialized defaults');
          } catch (err) {
            console.error('[settings] init defaults', err);
            setStatus('Could not save defaults');
            if (err?.code === 'permission-denied') {
              toastError(
                'Could not save default settings. Ensure users/{your uid} has role admin or moderator in Firestore, and rules allow admin writes to settings.',
              );
            } else {
              toastError(err?.message || 'Failed to initialize settings');
            }
            // eslint-disable-next-line no-void
            void loadNotificationLogs();
            // eslint-disable-next-line no-void
            void loadAuditLogs();
            return;
          }
        }
        // eslint-disable-next-line no-void
        void loadNotificationLogs();
        // eslint-disable-next-line no-void
        void loadAuditLogs();
      } catch (err) {
        console.error('[settings] load', err);
        setStatus('Load failed');
        const msg =
          err?.code === 'permission-denied'
            ? 'Permission denied loading settings. Sign in again, or confirm Firestore rules allow signed-in reads on settings/system (see firestore.rules in the project).'
            : err?.message || 'Failed to load settings';
        toastError(msg);
      }
    }

    // Events
    els.btnBarangayAdd?.addEventListener('click', () => {
      if (!isAdmin) return;
      const raw = normText(els.barangayInput?.value);
      if (!raw) return;
      const name = raw.replace(/\s+/g, ' ');
      if (!coveredBarangays.includes(name)) coveredBarangays.push(name);
      coveredBarangays = coveredBarangays.filter(Boolean);
      coveredBarangays = Array.from(new Set(coveredBarangays)).sort((a, b) => a.localeCompare(b));
      if (els.barangayInput) els.barangayInput.value = '';
      renderBarangays();
      requestSave('Barangay added');
    });

    els.toggleAutosave?.addEventListener('change', async () => {
      if (!isAdmin) return;
      autosave = !!els.toggleAutosave?.checked;
      setStatus(autosave ? 'Auto-save enabled' : 'Manual save');
      // Persist just the autosave flag immediately.
      try {
        await updateDoc(SETTINGS_DOC, { 'behavior.autoSave': autosave, updatedAt: serverTimestamp() });
      } catch (err) {
        console.warn('[settings] persist autosave flag failed', err);
      }
    });

    els.btnSave?.addEventListener('click', () => saveNow({ reason: 'Saved' }));

    els.btnReset?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const ok = await confirmDanger({
        title: 'Reset to default settings?',
        text: 'This will overwrite the current configuration.',
        confirmText: 'Reset',
      });
      if (!ok) return;
      const defaults = defaultConfig();
      writeForm(defaults);
      await saveNow({ reason: 'Reset to defaults', validateAll: true });
    });

    els.btnIncCatAdd?.addEventListener('click', () => {
      if (!isAdmin) return;
      const nameRaw = normText(els.incCatName?.value);
      if (!nameRaw) {
        toastError('Category name is required.');
        return;
      }
      const name = nameRaw.replace(/\s+/g, ' ');
      const key = slugKey(name);
      const color = normText(els.incCatColor?.value) || '#2563eb';
      const enabled = !!els.incCatEnabled?.checked;

      // Upsert by key
      const existing = incidentCategories.find((c) => c.key === key);
      if (existing) {
        existing.name = name;
        existing.color = color;
        existing.enabled = enabled;
      } else {
        incidentCategories.push({ key, name, color, enabled });
      }

      incidentCategories = Array.from(new Map(incidentCategories.map((c) => [c.key, c])).values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      if (els.incCatName) els.incCatName.value = '';
      renderIncidentCategories();
      requestSave('Auto-saved');
    });

    document.getElementById('btn-account-save')?.addEventListener('click', () => saveAccountProfile());

    document.getElementById('btn-change-password')?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const userEmail = auth.currentUser?.email;
      if (!userEmail) {
        toastError('Missing current user email');
        return;
      }

      const currentPw = String(document.getElementById('sec-current-password')?.value || '');
      const newPw = String(document.getElementById('sec-new-password')?.value || '');
      const confirmPw = String(document.getElementById('sec-confirm-password')?.value || '');
      const minLen = parseNum(document.getElementById('sec-pw-minlen')?.value) ?? 8;
      const requireAlnum = !!document.getElementById('sec-pw-require-alnum')?.checked;

      if (!currentPw) {
        toastError('Current password is required.');
        return;
      }
      if (newPw.length < minLen) {
        toastError(`New password must be at least ${minLen} characters.`);
        return;
      }
      if (requireAlnum) {
        const hasLetter = /[a-zA-Z]/.test(newPw);
        const hasNumber = /\d/.test(newPw);
        if (!hasLetter || !hasNumber) {
          toastError('New password must include letters and numbers.');
          return;
        }
      }
      if (newPw !== confirmPw) {
        toastError('New password and confirmation do not match.');
        return;
      }

      try {
        const cred = EmailAuthProvider.credential(userEmail, currentPw);
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updatePassword(auth.currentUser, newPw);
        toastSuccess('Password updated');
        // eslint-disable-next-line no-void
        void logAudit('auth.password_change', {});
        // clear fields
        ['sec-current-password', 'sec-new-password', 'sec-confirm-password'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
      } catch (err) {
        console.error('[settings] change password', err);
        toastError(err?.message || 'Failed to change password');
      }
    });

    const inputsToWatch = [
      els.systemName,
      els.systemDescription,
      els.defaultCity,
      els.lat,
      els.lng,
      els.zoom,
      els.timezone,
      els.dateTimeFormat,
    ].filter(Boolean);
    inputsToWatch.forEach((el) => {
      el.addEventListener('input', () => requestSave('Auto-saved'));
      el.addEventListener('change', () => requestSave('Auto-saved'));
    });

    // Map settings inputs
    const mapIds = [
      'map-heatmap-enabled',
      'map-heatmap-intensity',
      'map-heatmap-radius',
      'map-heatmap-opacity',
      'map-hotspot-sensitivity',
      'map-hotspot-threshold',
      'map-markers-enabled',
      'map-marker-type',
      'map-marker-clustering',
      'map-zoom-control',
      'map-dragging',
      'map-scroll-zoom',
      'map-doubleclick-zoom',
      'map-min-zoom',
      'map-max-zoom',
      'map-theme',
      'map-tiles',
      'map-boundary-overlay',
      'map-marker-limit',
      'map-refresh-mode',
      'map-refresh-interval',
    ];
    mapIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((el) => {
        el.addEventListener('input', () => requestSave('Auto-saved'));
        el.addEventListener('change', () => requestSave('Auto-saved'));
      });

    // Incident settings inputs
    const incidentIds = [
      'sev-low-color',
      'sev-med-color',
      'sev-high-color',
      'inc-default-severity',
      'inc-req-location',
      'inc-req-description',
      'inc-req-datetime',
      'inc-min-desc-len',
      'inc-spam-min-len',
      'inc-autofill-datetime',
      'inc-gps-enabled',
      'inc-pin-enabled',
      'inc-accuracy-threshold',
      'inc-restrict-covered',
      'inc-allow-past',
      'inc-max-backdate-days',
      'inc-auto-timestamp',
      'inc-default-range',
      'inc-default-category',
      'inc-default-severity-filter',
      'inc-retention-enabled',
      'inc-retention-days',
      'inc-retention-mode',
      'inc-approval-enabled',
      'inc-dup-enabled',
      'inc-dup-radius-m',
      'inc-dup-window-min',
      'inc-alerts-enabled',
      'inc-alert-high',
      'inc-alert-area-threshold',
      'inc-hotspot-only-enabled',
      'inc-role-create',
      'inc-role-edit',
      'inc-role-delete',
    ];
    incidentIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((el) => {
        el.addEventListener('input', () => requestSave('Auto-saved'));
        el.addEventListener('change', () => requestSave('Auto-saved'));
      });

    // Notification settings inputs
    const notifIds = [
      'notif-enabled',
      'notif-high-sev',
      'notif-hotspot-enabled',
      'notif-hotspot-threshold',
      'notif-nearby-enabled',
      'notif-nearby-radius',
      'notif-mode',
    ];
    notifIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((el) => {
        el.addEventListener('input', () => requestSave('Auto-saved'));
        el.addEventListener('change', () => requestSave('Auto-saved'));
      });

    // Security settings inputs (excluding password fields; those are handled by button)
    const secIds = [
      'sec-pw-minlen',
      'sec-pw-require-alnum',
      'sec-login-max-attempts',
      'sec-login-lockout-mins',
      'sec-session-timeout-mins',
      'sec-police-incidents',
      'sec-lock-approved',
    ];
    secIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((el) => {
        el.addEventListener('input', () => requestSave('Auto-saved'));
        el.addEventListener('change', () => requestSave('Auto-saved'));
      });

    // === Data management ===
    function downloadBlob(filename, text, mime) {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function csvEscape(v) {
      const s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }

    function toIncidentRow(docSnap) {
      const d = docSnap.data() || {};
      const loc = d.location || {};
      const ts = d.timestamp;
      const when = ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : '';
      return {
        id: docSnap.id,
        type: d.type ?? '',
        severity: d.severity ?? '',
        status: d.status ?? '',
        description: d.description ?? '',
        timestamp: when,
        latitude: loc.latitude ?? '',
        longitude: loc.longitude ?? '',
        address: loc.address ?? '',
        reporterId: d.reporterId ?? '',
      };
    }

    async function refreshDataSummary() {
      const out = {
        incidents: document.getElementById('dm-count-incidents'),
        archived: document.getElementById('dm-count-archived'),
        users: document.getElementById('dm-count-users'),
        settings: document.getElementById('dm-settings-exists'),
      };
      try {
        const [cInc, cArch, cUsers, sSnap] = await Promise.all([
          getCountFromServer(collection(db, 'incidents')),
          getCountFromServer(collection(db, 'incidents_archive')),
          getCountFromServer(collection(db, 'users')),
          getDoc(doc(db, 'settings', 'system')),
        ]);
        if (out.incidents) out.incidents.textContent = String(cInc.data().count);
        if (out.archived) out.archived.textContent = String(cArch.data().count);
        if (out.users) out.users.textContent = String(cUsers.data().count);
        if (out.settings) out.settings.textContent = sSnap.exists() ? 'Yes' : 'No';
      } catch (err) {
        console.error('[data] summary', err);
        toastError(err?.message || 'Failed to refresh summary');
      }
    }

    document.getElementById('btn-dm-refresh')?.addEventListener('click', refreshDataSummary);

    document.getElementById('btn-dm-backup-json')?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const max = parseNum(document.getElementById('dm-backup-limit')?.value) ?? 500;
      if (max < 50 || max > 5000) {
        toastError('Backup limit must be between 50 and 5000.');
        return;
      }
      try {
        setStatus('Backing up…');
        const [incSnap, userSnap, settingsSnap] = await Promise.all([
          getDocs(query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(max))),
          getDocs(query(collection(db, 'users'), limit(max))),
          getDoc(doc(db, 'settings', 'system')),
        ]);
        const backup = {
          exportedAt: new Date().toISOString(),
          limits: { perCollection: max },
          incidents: incSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          users: userSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          settings: settingsSnap.exists() ? { id: settingsSnap.id, ...settingsSnap.data() } : null,
        };
        downloadBlob(`threattrack-backup-${Date.now()}.json`, JSON.stringify(backup, null, 2), 'application/json');
        // eslint-disable-next-line no-void
        void logAudit('data.backup_json', { max });
        setStatus('Backup downloaded');
        toastSuccess('Backup downloaded');
      } catch (err) {
        console.error('[data] backup', err);
        setStatus('Backup failed');
        toastError(err?.message || 'Backup failed');
      }
    });

    function syncExportCategoryOptions() {
      const sel = document.getElementById('dm-export-category');
      if (!sel) return;
      const enabled = incidentCategories.filter((c) => c.enabled);
      const opts = [{ value: 'all', label: 'All categories' }, ...enabled.map((c) => ({ value: c.key, label: c.name }))];
      sel.innerHTML = opts.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
      if (!opts.some((o) => o.value === sel.value)) sel.value = 'all';
    }

    // Prime export category dropdown
    syncExportCategoryOptions();

    document.getElementById('btn-dm-export-csv')?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const statusEl = document.getElementById('dm-export-status');
      if (statusEl) statusEl.textContent = 'Exporting…';
      try {
        const days = parseNum(document.getElementById('dm-export-days')?.value) ?? 30;
        const category = String(document.getElementById('dm-export-category')?.value || 'all');
        const severity = String(document.getElementById('dm-export-severity')?.value || 'all');
        const since = new Date(Date.now() - days * 24 * 60 * 60_000);

        let q = query(collection(db, 'incidents'), where('timestamp', '>=', since), orderBy('timestamp', 'desc'), limit(2000));
        if (severity !== 'all') q = query(q, where('severity', '==', severity));
        if (category !== 'all') q = query(q, where('type', '==', category));

        const snap = await getDocs(q);
        const rows = snap.docs.map(toIncidentRow);
        const headers = Object.keys(rows[0] || { id: '' });
        const lines = [
          headers.map(csvEscape).join(','),
          ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
        ];
        downloadBlob(`incidents-export-${Date.now()}.csv`, lines.join('\n'), 'text/csv');
        // eslint-disable-next-line no-void
        void logAudit('data.export_incidents_csv', { days, category, severity, count: snap.size });
        if (statusEl) statusEl.textContent = `Exported ${snap.size} record(s).`;
        toastSuccess('CSV downloaded');
      } catch (err) {
        console.error('[data] export csv', err);
        if (statusEl) statusEl.textContent = 'Export failed';
        toastError(err?.message || 'Export failed');
      }
    });

    function normalizeIncidentForImport(raw) {
      const type = normText(raw.type);
      const severity = normText(raw.severity).toLowerCase();
      const description = normText(raw.description);
      const reporterId = normText(raw.reporterId) || auth.currentUser?.uid || '';
      const lat = Number(raw.latitude);
      const lng = Number(raw.longitude);
      const timestamp = raw.timestamp ? new Date(raw.timestamp) : new Date();

      return {
        type,
        severity,
        description,
        reporterId,
        status: normText(raw.status) || 'pending',
        timestamp,
        location: {
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lng) ? lng : null,
          address: normText(raw.address) || '',
        },
        meta: {
          source: 'import',
          importedAt: new Date().toISOString(),
        },
      };
    }

    function validateImportIncident(d) {
      const errs = [];
      if (!d.type) errs.push('Missing type');
      if (!['low', 'medium', 'high'].includes(d.severity)) errs.push('Invalid severity');
      if (!d.description) errs.push('Missing description');
      if (d.location.latitude == null || d.location.longitude == null) errs.push('Missing coordinates');
      if (d.location.latitude < -90 || d.location.latitude > 90) errs.push('Latitude out of range');
      if (d.location.longitude < -180 || d.location.longitude > 180) errs.push('Longitude out of range');
      if (!(d.timestamp instanceof Date) || Number.isNaN(d.timestamp.getTime())) errs.push('Invalid timestamp');
      return errs;
    }

    document.getElementById('btn-dm-import-run')?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const statusEl = document.getElementById('dm-import-status');
      const fileEl = document.getElementById('dm-import-file');
      const mode = String(document.getElementById('dm-import-mode')?.value || 'validate');
      const file = fileEl?.files?.[0];
      if (!file) {
        toastError('Choose a CSV or JSON file first.');
        return;
      }

      try {
        if (statusEl) statusEl.textContent = 'Reading file…';
        const text = await file.text();

        let rows = [];
        if (file.name.toLowerCase().endsWith('.json')) {
          const parsed = JSON.parse(text);
          rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.incidents) ? parsed.incidents : [];
        } else {
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          if (parsed.errors?.length) throw new Error(parsed.errors[0].message || 'CSV parse error');
          rows = parsed.data || [];
        }

        const normalized = rows.map(normalizeIncidentForImport);
        const errors = [];
        normalized.forEach((d, i) => {
          const e = validateImportIncident(d);
          if (e.length) errors.push(`Row ${i + 1}: ${e.join('; ')}`);
        });

        if (errors.length) {
          if (statusEl) statusEl.textContent = `Validation failed (${errors.length} issue(s)). Check console.`;
          console.warn('[import] validation errors', errors);
          toastError('Import validation failed');
          return;
        }

        if (mode === 'validate') {
          if (statusEl) statusEl.textContent = `Validated ${normalized.length} row(s).`;
          toastSuccess('Validation OK');
          return;
        }

        const ok = await confirmDanger({
          title: 'Import incidents?',
          text: `This will create ${normalized.length} incident document(s).`,
          confirmText: 'Import',
        });
        if (!ok) return;

        if (statusEl) statusEl.textContent = 'Importing…';

        let created = 0;
        for (let i = 0; i < normalized.length; i += 1) {
          const d = normalized[i];
          await addDoc(collection(db, 'incidents'), {
            type: d.type,
            severity: d.severity,
            status: d.status,
            description: d.description,
            reporterId: d.reporterId,
            timestamp: d.timestamp,
            location: d.location,
            meta: d.meta,
            reportedAt: serverTimestamp(),
          });
          created += 1;
        }

        // eslint-disable-next-line no-void
        void logAudit('data.import_incidents', { count: created, format: file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv' });
        if (statusEl) statusEl.textContent = `Imported ${created} record(s).`;
        toastSuccess('Import complete');
        // refresh summary best-effort
        // eslint-disable-next-line no-void
        void refreshDataSummary();
      } catch (err) {
        console.error('[data] import', err);
        if (statusEl) statusEl.textContent = 'Import failed';
        toastError(err?.message || 'Import failed');
      }
    });

    document.getElementById('btn-dm-cleanup-run')?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const statusEl = document.getElementById('dm-cleanup-status');
      const days = parseNum(document.getElementById('dm-cleanup-older-days')?.value);
      const action = String(document.getElementById('dm-cleanup-action')?.value || 'archive');
      if (!days || days < 1) {
        toastError('Enter "older than" days.');
        return;
      }
      const ok = await confirmDanger({
        title: action === 'delete' ? 'Delete old incidents?' : 'Archive old incidents?',
        text: `This will process incidents older than ${days} day(s).`,
        confirmText: action === 'delete' ? 'Delete' : 'Archive',
      });
      if (!ok) return;

      try {
        if (statusEl) statusEl.textContent = 'Loading…';
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000);
        const snap = await getDocs(query(collection(db, 'incidents'), where('timestamp', '<', cutoff), orderBy('timestamp', 'asc'), limit(500)));
        if (snap.empty) {
          if (statusEl) statusEl.textContent = 'No matching incidents.';
          toastSuccess('Nothing to do');
          return;
        }

        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          if (action === 'archive') {
            batch.set(doc(db, 'incidents_archive', d.id), { ...d.data(), archivedAt: serverTimestamp(), archivedBy: auth.currentUser?.uid ?? null }, { merge: true });
            batch.delete(doc(db, 'incidents', d.id));
          } else {
            batch.delete(doc(db, 'incidents', d.id));
          }
        });
        await batch.commit();
        // eslint-disable-next-line no-void
        void logAudit('data.cleanup', { action, days, count: snap.size });
        if (statusEl) statusEl.textContent = `Processed ${snap.size} incident(s).`;
        toastSuccess('Cleanup complete');
        // eslint-disable-next-line no-void
        void refreshDataSummary();
      } catch (err) {
        console.error('[data] cleanup', err);
        if (statusEl) statusEl.textContent = 'Cleanup failed';
        toastError(err?.message || 'Cleanup failed');
      }
    });

    document.getElementById('btn-dm-clear-test')?.addEventListener('click', async () => {
      if (!isAdmin) return;
      const statusEl = document.getElementById('dm-clear-test-status');
      const ok = await confirmDanger({
        title: 'Clear test incidents?',
        text: 'This deletes incidents where meta.isTest == true OR meta.source == "test".',
        confirmText: 'Clear',
      });
      if (!ok) return;
      try {
        if (statusEl) statusEl.textContent = 'Scanning…';
        const q1 = query(collection(db, 'incidents'), where('meta.isTest', '==', true), limit(500));
        const q2 = query(collection(db, 'incidents'), where('meta.source', '==', 'test'), limit(500));
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const ids = new Set([...s1.docs.map((d) => d.id), ...s2.docs.map((d) => d.id)]);
        if (!ids.size) {
          if (statusEl) statusEl.textContent = 'No test incidents found.';
          toastSuccess('Nothing to clear');
          return;
        }
        const batch = writeBatch(db);
        Array.from(ids).forEach((id) => batch.delete(doc(db, 'incidents', id)));
        await batch.commit();
        // eslint-disable-next-line no-void
        void logAudit('data.clear_test', { count: ids.size });
        if (statusEl) statusEl.textContent = `Deleted ${ids.size} test incident(s).`;
        toastSuccess('Test data cleared');
        // eslint-disable-next-line no-void
        void refreshDataSummary();
      } catch (err) {
        console.error('[data] clear test', err);
        if (statusEl) statusEl.textContent = 'Clear failed';
        toastError(err?.message || 'Clear failed');
      }
    });

    function syncTabFromHash() {
      setActive(keyFromHash());
    }

    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);

    // Keep UI in sync if hash updates without a hashchange (rare) or for clearer UX on click.
    links.forEach((a) => {
      a.addEventListener('click', () => {
        const k = tabKeyFromLink(a);
        if (k) queueMicrotask(syncTabFromHash);
      });
    });

    await loadSettings();

    // Prime summary on load (best-effort).
    // eslint-disable-next-line no-void
    void refreshDataSummary();
  },
});

