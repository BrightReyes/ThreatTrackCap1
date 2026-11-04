import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
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
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const NEXT_ALERT_DELAY_MS = 350; // let the previous popup finish its close animation

const ResponseAlertListener = () => {
  const navigation = useNavigation();
  const shownRef = useRef(new Set());
  const [activeNotification, setActiveNotification] = useState(null);
  const activeRef = useRef(null);
  const queueRef = useRef([]);
  const recentIncidentAlertsRef = useRef(new Map());
  const preferencesRef = useRef({
    pushNotifications: true,
    highPriority: true,
    locationAlerts: true,
  });
  const preferencesLoadedRef = useRef(false);
  const pendingNotificationDocsRef = useRef(null);
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
        return;
      }
      recentIncidentAlertsRef.current.set(popup.incidentId, Date.now());
    }
    queueRef.current.push({ popup, localNotification });
    showNextQueued();
  }, [showNextQueued]);

  const processNotificationDocs = useCallback((docs) => {
    const unreadList = docs
      .filter((item) => (
        isPopupNotification(item) &&
        isAllowedByPreferences(item, preferencesRef.current) &&
        !item.readAt &&
        !shownRef.current.has(item.id)
      ))
      // Oldest first so queued alerts appear in the order they happened.
      .sort((a, b) => getTimeValue(a.sentAt || a.timestamp) - getTimeValue(b.sentAt || b.timestamp));

    unreadList.forEach((unreadResponse) => {
      shownRef.current.add(unreadResponse.id);

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

  // Load user notification preferences
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    const flushPendingDocs = () => {
      if (pendingNotificationDocsRef.current) {
        const pendingDocs = pendingNotificationDocsRef.current;
        pendingNotificationDocsRef.current = null;
        processNotificationDocs(pendingDocs);
      }
    };

    return onSnapshot(
      doc(db, 'users', currentUser.uid),
      (snapshot) => {
        const prefs = snapshot.data()?.notificationPreferences || {};
        preferencesRef.current = {
          pushNotifications: prefs.pushNotifications !== false,
          highPriority: prefs.highPriority !== false,
          locationAlerts: prefs.locationAlerts !== false,
        };
        // [QA-FIX #12] Notifications that arrived before the preferences were
        // known are evaluated now, so a disabled category never pops up.
        preferencesLoadedRef.current = true;
        flushPendingDocs();
      },
      (error) => {
        console.error('Error loading notification preferences:', error);
        // Fall back to the defaults rather than holding alerts back forever.
        preferencesLoadedRef.current = true;
        flushPendingDocs();
      }
    );
  }, [processNotificationDocs]);

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

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified' || change.type === 'added') {
            const data = change.doc.data();
            const status = String(data.status || '').toLowerCase().trim();
            const responseStatus = String(data.responseStatus || data.response?.status || '').toLowerCase().trim();
            const isResponding = status === 'responding' || responseStatus === 'help_on_the_way';

            if (isResponding) {
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

              const eventKey = `resp_${change.doc.id}_${data.respondedAt?.seconds || data.updatedAt?.seconds || 'active'}`;
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
    activeRef.current = null;
    setActiveNotification(null);

    // Show the next queued alert once this one has closed.
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    nextTimerRef.current = setTimeout(showNextQueued, NEXT_ALERT_DELAY_MS);

    if (!current.id) return;

    // Only update notification doc if it corresponds to an actual Firestore notification ID
    if (!current.id.startsWith('resp_')) {
      try {
        await updateDoc(doc(db, 'notifications', current.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error marking response notification read:', error);
      }
    }
  }, [showNextQueued]);

  const handleTrackStatus = useCallback(() => {
    markRead();
    try {
      navigation.navigate('Status');
    } catch (navErr) {
      console.warn('Navigation to Status failed:', navErr);
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

const isAllowedByPreferences = (item, preferences) => {
  if (preferences.pushNotifications === false) return false;

  const isHighPriority =
    item?.priority === 'high' ||
    item?.severity === 'high' ||
    item?.type === 'police_urgent_report';

  if (isHighPriority && preferences.highPriority === false) return false;
  if (item?.type === 'police_urgent_report' && preferences.locationAlerts === false) return false;

  return true;
};

const getTimeValue = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export default ResponseAlertListener;
