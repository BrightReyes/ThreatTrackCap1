import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

const DEFAULT_SYSTEM_NAME = 'ThreatTrack';

/**
 * Updates all sidebar brand labels on the current document (admin pages use .sidebar__logo).
 * @param {unknown} name Value from settings/system.systemName; empty uses default.
 */
export function applySidebarSystemName(name) {
  const text = String(name ?? '').trim() || DEFAULT_SYSTEM_NAME;
  document.querySelectorAll('.sidebar__logo').forEach((el) => {
    el.textContent = text;
  });
}

/** Load settings/system and apply systemName to the sidebar (best-effort). */
export async function refreshSidebarSystemName() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'system'));
    const n = snap.exists() ? snap.data()?.systemName : null;
    applySidebarSystemName(n);
  } catch {
    applySidebarSystemName(DEFAULT_SYSTEM_NAME);
  }
}
