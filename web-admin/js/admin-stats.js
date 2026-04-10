import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';

/** Pending + under review — needs admin attention */
const OPEN_STATUSES = ['pending', 'under_review'];

function severityToScore(sev) {
  if (sev === 'high') return 100;
  if (sev === 'medium') return 55;
  if (sev === 'low') return 25;
  return null;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Loads dashboard stat cards from Firestore.
 * Requires signed-in user (users count needs Auth + read on `users`).
 */
export async function loadAdminStats() {
  const since24h = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const openQ = query(
      collection(db, 'incidents'),
      where('status', 'in', OPEN_STATUSES),
    );
    const openSnap = await getCountFromServer(openQ);
    setText('stat-open-incidents', String(openSnap.data().count));
  } catch (e) {
    console.error('[admin-stats] open incidents', e);
    setText('stat-open-incidents', '—');
  }

  try {
    const q24 = query(
      collection(db, 'incidents'),
      where('timestamp', '>=', since24h),
    );
    const snap24 = await getCountFromServer(q24);
    setText('stat-reports-24h', String(snap24.data().count));
  } catch (e) {
    console.error('[admin-stats] reports 24h', e);
    setText('stat-reports-24h', '—');
  }

  try {
    const totalSnap = await getCountFromServer(collection(db, 'incidents'));
    setText('stat-total-incidents', String(totalSnap.data().count));
  } catch (e) {
    console.error('[admin-stats] total incidents', e);
    setText('stat-total-incidents', '—');
  }

  try {
    const usersSnap = await getCountFromServer(collection(db, 'users'));
    setText('stat-active-users', String(usersSnap.data().count));
  } catch (e) {
    console.error('[admin-stats] users count', e);
    setText('stat-active-users', '—');
  }

  try {
    const recentQ = query(
      collection(db, 'incidents'),
      orderBy('timestamp', 'desc'),
      limit(200),
    );
    const recentSnap = await getDocs(recentQ);
    let total = 0;
    let n = 0;
    recentSnap.forEach((docSnap) => {
      const d = docSnap.data();
      let score =
        typeof d.verificationScore === 'number' ? d.verificationScore : null;
      if (score == null) {
        const s = severityToScore(d.severity);
        if (s != null) score = s;
      }
      if (score != null) {
        total += score;
        n += 1;
      }
    });
    setText('stat-avg-risk', n ? String(Math.round(total / n)) : '—');
  } catch (e) {
    console.error('[admin-stats] avg risk', e);
    setText('stat-avg-risk', '—');
  }
}
