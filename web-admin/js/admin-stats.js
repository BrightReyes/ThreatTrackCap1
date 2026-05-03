import {
    collection,
    getCountFromServer,
    onSnapshot,
    query,
    Timestamp,
    where,
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";

/** Pending + under review — needs admin attention */
const OPEN_STATUSES = ["pending", "under_review"];

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
            collection(db, "incidents"),
            where("status", "in", OPEN_STATUSES),
        );
        const openSnap = await getCountFromServer(openQ);
        setText("stat-open-incidents", String(openSnap.data().count));
    } catch (e) {
        console.error("[admin-stats] open incidents", e);
        setText("stat-open-incidents", "—");
    }

    try {
        const q24 = query(
            collection(db, "incidents"),
            where("timestamp", ">=", since24h),
        );
        const snap24 = await getCountFromServer(q24);
        setText("stat-reports-24h", String(snap24.data().count));
    } catch (e) {
        console.error("[admin-stats] reports 24h", e);
        setText("stat-reports-24h", "—");
    }

    try {
        const totalSnap = await getCountFromServer(collection(db, "incidents"));
        setText("stat-total-incidents", String(totalSnap.data().count));
    } catch (e) {
        console.error("[admin-stats] total incidents", e);
        setText("stat-total-incidents", "—");
    }

    onSnapshot(
        collection(db, "users"),
        (snap) => {
            setText("stat-active-users", String(snap.size));
        },
        (err) => {
            console.error("[admin-stats] users count", err);
            setText("stat-active-users", "—");
        },
    );

}
