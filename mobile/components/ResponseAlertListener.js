import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { goToMainScreen } from '../utils/navigation';
import { auth, db } from '../utils/firebase';
import CustomAlert from './CustomAlert';
import { scheduleLocalNotification } from '../utils/notifications';

const formatDistance = (dist) => {
  const n = Number(dist);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return `${Math.round(n * 1000)} m away`;
  return `${n.toFixed(1)} km away`;
};

// [QA-FIX #12] Reworked listener. Before:
//  - both Firestore listeners were torn down and re-created every time a popup
//    opened/closed or preferences changed (each time re-reading every
//    notification and incident of the user);
//  - alerts that arrived while a popup was showing were dropped;
//  - the same dispatch could pop twice (notification doc + incident change);
//  - a local system notification fired even while the app was open, on top
//    of the in-app popup.
// Now: each listener subscribes once, the current popup / preferences live in
// refs, new alerts are queued and shown one after another, dispatch alerts are
// de-duplicated per incident, and the system notification is only scheduled
// when ThreatTrack isn't in the foreground.
//
// [POPUP-FIX #23] "Help is on the way" kept re-popping after Acknowledge /
// Track Status. Causes and fixes:
//  - the incident listener popped for EVERY already-responding incident in its
//    first snapshot (all docs arrive as `added`), queueing one popup per
//    incident on every launch. Now the first snapshot only seeds state and we
//    pop only when an incident newly transitions into a dispatch;
//  - acknowledging an incident-sourced popup never persisted anything, and the
//    matching notification doc (dropped by the duplicate window) stayed unread
//    and popped on the next launch. Now acknowledging marks every unread
//    dispatch notification for that incident as read;
//  - an unread backlog is collapsed to the newest alert per incident, and
//    alerts older than STALE_ALERT_MS are marked read without a popup.
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const NEXT_ALERT_DELAY_MS = 350; // let the previous popup finish its close animation
const STALE_ALERT_MS = 12 * 60 * 60 * 1000;

const markNotificationDocRead = async (notificationId) => {
  if (!notificationId || String(notificationId).startsWith('resp_')) return;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error marking response notification read:', error);
  }
};

const ResponseAlertListener = () => {
  const navigation = useNavigation();
  const shownRef = useRef(new Set());
  const [activeNotification, setActiveNotification] = useState(null);
  const activeRef = useRef(null);
  const lastClosedIncidentIdRef = useRef(null);
  const queueRef = useRef([]);
  const recentIncidentAlertsRef = useRef(new Map());
  const preferencesRef = useRef({
    pushNotifications: true,
    highPriority: true,
    locationAlerts: true,
  });
  // Always "loaded": preferences are no longer read (see isAllowedByPreferences).
  const preferencesLoadedRef = useRef(true);
  const pendingNotificationDocsRef = useRef(null);
  const latestNotificationDocsRef = useRef([]);
  const incidentStateRef = useRef(new Map());
  const nextTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    };
  }, []);

  const showNextQueued = useCallback(() => {
    if (!isMountedRef.current || activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    activeRef.current = next.popup;
    setActiveNotification(next.popup);

    // System notification only when the in-app popup can't be seen.
    if (AppState.currentState !== 'active') {
      scheduleLocalNotification(next.localNotification).catch(() => {});
    }
  }, []);

  const enqueueAlert = useCallback((popup, localNotification) => {
    // De-duplicate dispatch alerts for the same incident (the notification
    // doc and the incident status change describe the same event).
    if (popup.incidentId) {
      const lastShownAt = recentIncidentAlertsRef.current.get(popup.incidentId);
      if (lastShownAt && Date.now() - lastShownAt < DUPLICATE_WINDOW_MS) {
        // [POPUP-FIX #23] If this incident's alert was already acknowledged, a
        // late duplicate notification doc would otherwise stay unread and pop
        // on the next launch. (Active/queued ones are handled by markRead.)
        const stillPending =
          activeRef.current?.incidentId === popup.incidentId ||
          queueRef.current.some((entry) => entry.popup.incidentId === popup.incidentId);
        if (!stillPending) markNotificationDocRead(popup.id);
        return;
      }
      recentIncidentAlertsRef.current.set(popup.incidentId, Date.now());
    }
    queueRef.current.push({ popup, localNotification });
    showNextQueued();
  }, [showNextQueued]);

  const processNotificationDocs = useCallback((docs) => {
    latestNotificationDocsRef.current = docs;
    const now = Date.now();
    const candidates = docs.filter((item) => (
      isPopupNotification(item) &&
      isAllowedByPreferences(item, preferencesRef.current) &&
      !isNotificationRead(item) &&
      !shownRef.current.has(item.id)
    ));

    // [POPUP-FIX #23] Collapse the backlog: newest unread alert per incident,
    // older duplicates and stale alerts are marked read without a popup.
    const newestByIncident = new Map();
    const silenced = [];
    candidates.forEach((item) => {
      shownRef.current.add(item.id);
      const sentAt = getTimeValue(item.sentAt || item.timestamp);
      // sentAt 0 = server timestamp not resolved yet, i.e. brand new.
      if (sentAt && now - sentAt > STALE_ALERT_MS) {
        silenced.push(item);
        return;
      }
      const key = item.incidentId || item.id;
      const existing = newestByIncident.get(key);
      if (!existing) {
        newestByIncident.set(key, item);
      } else if (getTimeValue(existing.sentAt || existing.timestamp) < sentAt) {
        silenced.push(existing);
        newestByIncident.set(key, item);
      } else {
        silenced.push(item);
      }
    });
    silenced.forEach((item) => markNotificationDocRead(item.id));

    const unreadList = [...newestByIncident.values()]
      // Oldest first so queued alerts appear in the order they happened.
      .sort((a, b) => getTimeValue(a.sentAt || a.timestamp) - getTimeValue(b.sentAt || b.timestamp));

    unreadList.forEach((unreadResponse) => {

      const responder = unreadResponse.responder || {};
      const response = unreadResponse.response || {};
      const stationName = responder.precinctName || responder.shortName || 'Valenzuela Police Dispatch';
      const distanceStr = formatDistance(response.distanceKm || responder.distanceKm);
      const etaStr = (response.etaMinutes || responder.etaMinutes)
        ? `${response.etaMinutes || responder.etaMinutes} min ETA`
        : null;
      const trafficStr = response.trafficLevel || responder.trafficLevel || null;

      enqueueAlert(
        {
          id: unreadResponse.id,
          incidentId: unreadResponse.incidentId,
          title: unreadResponse.title || 'Help is on the way',
          body: unreadResponse.body || 'First responders have acknowledged your report and are en route to your location.',
          type: 'dispatch',
          dispatchInfo: {
            stationName,
            distance: distanceStr,
            eta: etaStr,
            traffic: trafficStr,
          },
        },
        {
          title: unreadResponse.title || '🚨 Help is on the way',
          body: unreadResponse.body || `Response units deployed from ${stationName}.`,
          data: {
            incidentId: unreadResponse.incidentId,
            notificationId: unreadResponse.id,
            type: unreadResponse.type,
          },
        }
      );
    });
  }, [enqueueAlert]);

  // Notification preferences are no longer used (the Settings toggles were
  // removed and isAllowedByPreferences always allows), so there is no
  // users/{uid} listener anymore and alerts are never held back waiting for it.

  // REAL-TIME LISTENER 1: Watch notifications collection
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        if (!preferencesLoadedRef.current) {
          pendingNotificationDocsRef.current = docs;
          return;
        }
        processNotificationDocs(docs);
      },
      (error) => {
        console.error('Error listening for response notifications:', error);
      }
    );

    return unsubscribe;
  }, [processNotificationDocs]);

  // REAL-TIME LISTENER 2: Direct incident status listener
  // Provides instantaneous (<100ms) popup when admin clicks "Respond" anywhere
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    const incidentsRef = collection(db, 'incidents');
    const q = query(incidentsRef, where('reporterId', '==', currentUser.uid));

    let isFirstSnapshot = true;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const seedOnly = isFirstSnapshot;
        isFirstSnapshot = false;
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            incidentStateRef.current.delete(change.doc.id);
            return;
          }
          if (change.type === 'modified' || change.type === 'added') {
            const data = change.doc.data();
            const status = String(data.status || '').toLowerCase().trim();
            const responseStatus = String(data.responseStatus || data.response?.status || '').toLowerCase().trim();
            const isResponding = status === 'responding' || responseStatus === 'help_on_the_way';
            const respondedAtSec = data.respondedAt?.seconds || data.response?.respondedAt?.seconds || null;

            // [POPUP-FIX #23] Only a NEW dispatch pops: the first snapshot just
            // records state (missed dispatches come from unread notification
            // docs instead), and later updates to an already-responding
            // incident (GPS trail, ETA, etc.) are ignored.
            const prev = incidentStateRef.current.get(change.doc.id);
            incidentStateRef.current.set(change.doc.id, { responding: isResponding, respondedAtSec });
            const isNewDispatch = isResponding && !seedOnly && (
              !prev ||
              !prev.responding ||
              Boolean(respondedAtSec && prev.respondedAtSec && respondedAtSec !== prev.respondedAtSec)
            );

            if (isNewDispatch) {
              const responder = data.responder || {};
              const response = data.response || {};
              const stationName =
                data.respondingSubstationName ||
                data.assignedSubstationName ||
                responder.precinctName ||
                'Valenzuela Police Dispatch';
              const distanceStr = formatDistance(response.distanceKm || responder.distanceKm);
              const etaStr = (response.etaMinutes || responder.etaMinutes)
                ? `${response.etaMinutes || responder.etaMinutes} min ETA`
                : null;
              const trafficStr = response.trafficLevel || responder.trafficLevel || null;

              const eventKey = `resp_${change.doc.id}_${respondedAtSec || 'active'}`;
              if (!shownRef.current.has(eventKey)) {
                shownRef.current.add(eventKey);

                enqueueAlert(
                  {
                    id: eventKey,
                    incidentId: change.doc.id,
                    title: 'Help is on the way',
                    body: 'First responders have acknowledged your report and units are deployed to your location.',
                    type: 'dispatch',
                    dispatchInfo: {
                      stationName,
                      distance: distanceStr,
                      eta: etaStr,
                      traffic: trafficStr,
                    },
                  },
                  {
                    title: '🚨 Help is on the way',
                    body: `Response units deployed from ${stationName}.`,
                    data: {
                      incidentId: change.doc.id,
                      type: 'response_update',
                    },
                  }
                );
              }
            }
          }
        });
      },
      (error) => {
        console.error('Error listening to user incidents for real-time dispatch:', error);
      }
    );

    return unsubscribe;
  }, [enqueueAlert]);

  // [QA-FIX #12] Idempotent: CustomAlert calls both the button action and
  // onClose, which used to mark the same notification read twice.
  const markRead = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;
    // CustomAlert closes the popup (this function) BEFORE running a button's
    // action, so remember which incident it was for "Track Status".
    lastClosedIncidentIdRef.current = current.incidentId || null;
    activeRef.current = null;
    setActiveNotification(null);

    // Show the next queued alert once this one has closed.
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    nextTimerRef.current = setTimeout(showNextQueued, NEXT_ALERT_DELAY_MS);

    // [POPUP-FIX #23] Persist the acknowledgement for the whole incident: the
    // popup's own notification doc plus any other unread dispatch notification
    // for the same incident (incl. when the popup came from the incident
    // listener), so none of them re-pop on the next launch.
    const idsToMark = new Set();
    if (current.id && !current.id.startsWith('resp_')) idsToMark.add(current.id);
    if (current.incidentId) {
      latestNotificationDocsRef.current.forEach((item) => {
        if (
          item.incidentId === current.incidentId &&
          isPopupNotification(item) &&
          !isNotificationRead(item)
        ) {
          idsToMark.add(item.id);
        }
      });
    }
    await Promise.all([...idsToMark].map(markNotificationDocRead));
  }, [showNextQueued]);

  // Opens the report's tracking preview on Home (the active report card).
  // Home falls back to the Reports page if the report is no longer active.
  const handleTrackStatus = useCallback(() => {
    const incidentId = activeRef.current?.incidentId || lastClosedIncidentIdRef.current;
    markRead();
    try {
      goToMainScreen(navigation, 'Home', {
        openActiveReportId: incidentId || null,
        openActiveReportAt: Date.now(),
      });
    } catch (navErr) {
      console.warn('Navigation to active report failed:', navErr);
    }
  }, [markRead, navigation]);

  return (
    <CustomAlert
      visible={!!activeNotification}
      title={activeNotification?.title || 'Help is on the way'}
      message={activeNotification?.body || 'First responders have acknowledged your report and are en route to your location.'}
      type="dispatch"
      dispatchInfo={activeNotification?.dispatchInfo}
      buttons={[
        {
          text: 'Acknowledge',
          style: 'cancel',
          onPress: markRead,
        },
        {
          text: 'Track Status',
          onPress: handleTrackStatus,
        },
      ]}
      onClose={markRead}
    />
  );
};

const isPopupNotification = (item) => {
  if (item?.type === 'response_update') return true;
  return item?.type === 'police_urgent_report' && item?.severity === 'high';
};

const isNotificationRead = (item) => Boolean(item?.readAt) || item?.read === true;

// The notification toggles were removed from Settings, so alerts are always
// allowed. Preferences saved earlier (e.g. a toggle left off) are ignored on
// purpose: otherwise a user who once turned one off would silently stop
// getting dispatch alerts with no way to turn them back on.
const isAllowedByPreferences = () => true;

const getTimeValue = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export default ResponseAlertListener;
