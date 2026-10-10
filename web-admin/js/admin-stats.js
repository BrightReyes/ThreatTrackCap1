import {
    collection,
    getCountFromServer,
    getDocs,
    limit,
    onSnapshot,
    query,
    Timestamp,
    where,
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { getCurrentAdminBarangayId, hasIncidentAccess } from "./admin-auth.js";

/** Pending + under review — needs admin attention */
const OPEN_STATUSES = ["pending", "under_review"];

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Loads dashboard stat cards from Firestore.
 * Requires signed-in user (users count needs Auth + read on `users`).
 * Automatically partitions stats by jurisdiction for Barangay Admins.
 */
export async function loadAdminStats() {
    const since24h = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const currentBarangayId = getCurrentAdminBarangayId();

    if (!currentBarangayId) {
        // Police Admin or unassigned: Valenzuela City wide stats via fast server counts
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

        try {
            const sosQ = query(
                collection(db, "incidents"),
                where("isSOSReport", "==", true),
            );
            const sosSnap = await getCountFromServer(sosQ);
            setText("stat-sos-alerts", String(sosSnap.data().count));
        } catch (e) {
            console.error("[admin-stats] sos alerts", e);
            setText("stat-sos-alerts", "0");
        }

        try {
            const pendingQ = query(
                collection(db, "incidents"),
                where("status", "==", "pending"),
            );
            const pendingSnap = await getCountFromServer(pendingQ);
            setText("stat-pending-review", String(pendingSnap.data().count));
        } catch (e) {
            console.error("[admin-stats] pending review", e);
            setText("stat-pending-review", "0");
        }
    } else {
        // Barangay Admin: Filter stats strictly by assigned jurisdiction
        try {
            const poolSnap = await getDocs(
                query(collection(db, "incidents"), limit(300)),
            );
            const docs = poolSnap.docs
                .map((d) => d.data())
                .filter((d) => hasIncidentAccess(d));

            const openCount = docs.filter((d) =>
                OPEN_STATUSES.includes(d.status),
            ).length;
            const reports24hCount = docs.filter((d) => {
                const ts = d.timestamp || d.reportedAt;
                if (!ts) return false;
                const ms =
                    typeof ts.toMillis === "function"
                        ? ts.toMillis()
                        : ts.seconds
                          ? ts.seconds * 1000
                          : 0;
                return ms >= Date.now() - 24 * 60 * 60 * 1000;
            }).length;
            const sosCount = docs.filter((d) => d.isSOSReport === true).length;
            const pendingCount = docs.filter((d) => d.status === "pending").length;

            setText("stat-open-incidents", String(openCount));
            setText("stat-reports-24h", String(reports24hCount));
            setText("stat-total-incidents", String(docs.length));
            setText("stat-sos-alerts", String(sosCount));
            setText("stat-pending-review", String(pendingCount));
        } catch (err) {
            console.error("[admin-stats] barangay stats error", err);
            setText("stat-open-incidents", "0");
            setText("stat-reports-24h", "0");
            setText("stat-total-incidents", "0");
            setText("stat-sos-alerts", "0");
            setText("stat-pending-review", "0");
        }
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
