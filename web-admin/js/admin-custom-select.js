/**
 * Replaces native select dropdowns with a minimal custom listbox (styled panel).
 * Keeps the real <select> for values, IDs, and change events. Skips on coarse-pointer mobile.
 */

let openInstance = null;
let seq = 0;
let docCloseBound = false;

function preferNativePicker() {
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function closeOpen() {
  if (!openInstance) return;
  const { wrap, trigger, list, selectEl } = openInstance;
  list.hidden = true;
  wrap.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
  window.removeEventListener('scroll', openInstance.reposition, true);
  window.removeEventListener('resize', openInstance.reposition, true);
  // Return panel to the widget so it is not clipped by modal overflow on next open.
  if (list.parentNode !== wrap && selectEl?.parentNode === wrap) {
    wrap.insertBefore(list, selectEl);
  }
  openInstance = null;
}

function ensureDocumentCloseListener() {
  if (docCloseBound) return;
  docCloseBound = true;
  document.addEventListener(
    'click',
    (e) => {
      if (!openInstance) return;
      const { wrap, list } = openInstance;
      const t = e.target;
      if (wrap.contains(t) || list.contains(t)) return;
      closeOpen();
    },
    true,
  );
}

function buildListItems(select, list) {
  list.innerHTML = '';
  for (let i = 0; i < select.options.length; i += 1) {
    const opt = select.options[i];
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.className = 'admin-select-custom__option';
    li.dataset.value = opt.value;
    li.textContent = opt.text;
    if (opt.disabled) {
      li.classList.add('admin-select-custom__option--disabled');
      li.setAttribute('aria-disabled', 'true');
      li.tabIndex = -1;
    } else {
      li.tabIndex = 0;
    }
    if (opt.selected) li.setAttribute('aria-selected', 'true');
    else li.setAttribute('aria-selected', 'false');
    list.appendChild(li);
  }
}

function syncTriggerLabel(trigger, select) {
  const opt = select.options[select.selectedIndex];
  trigger.textContent = opt ? opt.text : '';
}

function enhanceSelect(select) {
  if (!select || select.multiple || select.disabled) return;
  if (select.dataset.adminSelectEnhanced === '1') return;
  if (select.options.length === 0) return;

  const parent = select.parentNode;
  if (!parent) return;

  select.dataset.adminSelectEnhanced = '1';

  const wrap = document.createElement('div');
  wrap.className = 'admin-select-custom';
  if (select.classList.contains('incidents-select')) {
    wrap.classList.add('admin-select-custom--toolbar');
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'admin-select-custom__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const listId = select.id ? `${select.id}-listbox` : `admin-select-list-${++seq}`;
  const triggerId = select.id ? `${select.id}-trigger` : `admin-select-trg-${seq}`;

  trigger.id = triggerId;
  trigger.setAttribute('aria-controls', listId);

  const list = document.createElement('ul');
  list.id = listId;
  list.className = 'admin-select-custom__panel';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  list.tabIndex = -1;

  if (select.id) {
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(select.id) : select.id.replace(/"/g, '\\"');
    document.querySelectorAll(`label[for="${safeId}"]`).forEach((lab) => {
      lab.setAttribute('for', triggerId);
    });
  }

  parent.insertBefore(wrap, select);
  wrap.appendChild(trigger);
  wrap.appendChild(list);
  wrap.appendChild(select);

  const prevEl = wrap.previousElementSibling;
  if (prevEl instanceof HTMLLabelElement && prevEl.id) {
    trigger.setAttribute('aria-labelledby', prevEl.id);
  }

  select.classList.add('admin-select-custom__native');
  select.setAttribute('tabindex', '-1');
  select.setAttribute('aria-hidden', 'true');

  buildListItems(select, list);
  syncTriggerLabel(trigger, select);

  const reposition = () => {
    if (!openInstance || openInstance.wrap !== wrap) return;
    const r = trigger.getBoundingClientRect();
    const margin = 4;
    const maxH = Math.min(280, window.innerHeight - r.bottom - margin - 12);
    list.style.position = 'fixed';
    list.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - r.width - 12))}px`;
    list.style.top = `${r.bottom + margin}px`;
    list.style.minWidth = `${r.width}px`;
    list.style.maxHeight = `${maxH}px`;
    list.style.zIndex = '11000';
  };

  const open = () => {
    closeOpen();
    buildListItems(select, list);
    syncTriggerLabel(trigger, select);
    // Port list to body so modal overflow / stacking does not clip or cover the panel.
    if (list.parentNode !== document.body) {
      document.body.appendChild(list);
    }
    list.hidden = false;
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    openInstance = { wrap, trigger, list, selectEl: select, reposition };
    reposition();
    requestAnimationFrame(() => reposition());
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition, true);
  };

  const chooseValue = (value) => {
    const prev = select.value;
    select.value = value;
    if (prev !== value) {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    buildListItems(select, list);
    syncTriggerLabel(trigger, select);
    closeOpen();
    trigger.focus();
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrap.classList.contains('is-open')) {
      closeOpen();
    } else {
      open();
    }
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest?.('.admin-select-custom__option');
    if (!li || li.classList.contains('admin-select-custom__option--disabled')) return;
    chooseValue(li.dataset.value ?? '');
  });

  ensureDocumentCloseListener();

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeOpen();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (!wrap.classList.contains('is-open')) {
        e.preventDefault();
        open();
        const first = list.querySelector('.admin-select-custom__option:not(.admin-select-custom__option--disabled)');
        first?.focus?.();
      }
    }
  });

  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('.admin-select-custom__option:not(.admin-select-custom__option--disabled)')];
    const cur = document.activeElement;
    const idx = items.indexOf(cur);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOpen();
      trigger.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[Math.min(items.length - 1, idx + 1)] || items[0];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[Math.max(0, idx - 1)] || items[items.length - 1];
      prev?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cur instanceof HTMLElement && cur.dataset.value != null) {
        chooseValue(cur.dataset.value);
      }
    }
  });

  const mo = new MutationObserver(() => {
    buildListItems(select, list);
    syncTriggerLabel(trigger, select);
  });
  mo.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  select.addEventListener('change', () => {
    buildListItems(select, list);
    syncTriggerLabel(trigger, select);
  });
}

/** Call after DOM for admin pages is ready (selects present). */
export function initAdminCustomSelects(root = document) {
  if (preferNativePicker()) return;
  const scope =
    root && typeof root.classList !== 'undefined' && root.classList.contains('admin-dashboard')
      ? root
      : root?.querySelector?.('.admin-dashboard') || root;
  scope.querySelectorAll('select:not([multiple])').forEach((sel) => {
    enhanceSelect(sel);
  });
}
