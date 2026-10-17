import React, { useEffect, useRef, useState } from 'react';
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

const ResponseAlertListener = () => {
  const navigation = useNavigation();
  const shownRef = useRef(new Set());
  const [activeNotification, setActiveNotification] = useState(null);
  const [preferences, setPreferences] = useState({
    pushNotifications: true,
    highPriority: true,
    locationAlerts: true,
  });

  // Load user notification preferences
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    return onSnapshot(
      doc(db, 'users', currentUser.uid),
      (snapshot) => {
        const prefs = snapshot.data()?.notificationPreferences || {};
        setPreferences({
          pushNotifications: prefs.pushNotifications !== false,
          highPriority: prefs.highPriority !== false,
          locationAlerts: prefs.locationAlerts !== false,
        });
      },
      (error) => {
        console.error('Error loading notification preferences:', error);
      }
    );
  }, []);

  // REAL-TIME LISTENER 1: Watch notifications collection
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (activeNotification) return;

        const unreadList = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() }))
          .filter((item) => (
            isPopupNotification(item) &&
            isAllowedByPreferences(item, preferences) &&
            !item.readAt &&
            !shownRef.current.has(item.id)
          ))
          .sort((a, b) => getTimeValue(b.sentAt || b.timestamp) - getTimeValue(a.sentAt || a.timestamp));

        const unreadResponse = unreadList[0];
        if (unreadResponse) {
          shownRef.current.add(unreadResponse.id);

          const responder = unreadResponse.responder || {};
          const response = unreadResponse.response || {};
          const stationName = responder.precinctName || responder.shortName || 'Valenzuela Police Dispatch';
          const distanceStr = formatDistance(response.distanceKm || responder.distanceKm);
          const etaStr = (response.etaMinutes || responder.etaMinutes)
            ? `${response.etaMinutes || responder.etaMinutes} min ETA`
            : null;
          const trafficStr = response.trafficLevel || responder.trafficLevel || null;

          setActiveNotification({
            id: unreadResponse.id,
            incidentId: unreadResponse.incidentId,
            title: unreadResponse.title || 'Help is on the way',
            body: unreadResponse.body || 'First responders have acknowledged your report and are en route to your live GPS coordinates.',
            type: 'dispatch',
            dispatchInfo: {
              stationName,
              distance: distanceStr,
              eta: etaStr,
              traffic: trafficStr,
            },
          });

          // Trigger native push notification
          scheduleLocalNotification({
            title: unreadResponse.title || '🚨 Help is on the way',
            body: unreadResponse.body || `Response units deployed from ${stationName}.`,
            data: {
              incidentId: unreadResponse.incidentId,
              notificationId: unreadResponse.id,
              type: unreadResponse.type,
            },
          }).catch(() => {});
        }
      },
      (error) => {
        console.error('Error listening for response notifications:', error);
      }
    );

    return unsubscribe;
  }, [activeNotification, preferences]);

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
        if (activeNotification) return;

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

                setActiveNotification({
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
                });

                scheduleLocalNotification({
                  title: '🚨 Help is on the way',
                  body: `Response units deployed from ${stationName}.`,
                  data: {
                    incidentId: change.doc.id,
                    type: 'response_update',
                  },
                }).catch(() => {});
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
  }, [activeNotification]);

  const markRead = async () => {
    const current = activeNotification;
    setActiveNotification(null);
    if (!current?.id) return;

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
  };

  const handleTrackStatus = () => {
    markRead();
    try {
      navigation.navigate('Status');
    } catch (navErr) {
      console.warn('Navigation to Status failed:', navErr);
    }
  };

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
