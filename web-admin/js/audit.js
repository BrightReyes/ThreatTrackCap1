import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase.js';

export async function logAudit(action, meta = {}) {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, 'audit_logs'), {
      action: String(action || 'unknown'),
      meta: meta && typeof meta === 'object' ? meta : { meta: String(meta) },
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      at: serverTimestamp(),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch (err) {
    // Audit logging should never break core UI
    console.warn('[audit] log failed', err);
  }
}

export async function fetchAuditLogs({ max = 25 } = {}) {
  const q = query(collection(db, 'audit_logs'), orderBy('at', 'desc'), limit(max));
  return await getDocs(q);
}

