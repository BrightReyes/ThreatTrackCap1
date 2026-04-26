import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import CustomAlert from './CustomAlert';

const ResponseAlertListener = () => {
  const shownRef = useRef(new Set());
  const [activeNotification, setActiveNotification] = useState(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (activeNotification) return;

        const unreadResponse = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() }))
          .filter((item) => (
            item.type === 'response_update' &&
            !item.readAt &&
            !shownRef.current.has(item.id)
          ))
          .sort((a, b) => getTimeValue(b.sentAt || b.timestamp) - getTimeValue(a.sentAt || a.timestamp))[0];

        if (unreadResponse) {
          shownRef.current.add(unreadResponse.id);
          setActiveNotification(unreadResponse);
        }
      },
      (error) => {
        console.error('Error listening for response notifications:', error);
      }
    );

    return unsubscribe;
  }, [activeNotification]);

  const markRead = async () => {
    const current = activeNotification;
    setActiveNotification(null);
    if (!current?.id) return;

    try {
      await updateDoc(doc(db, 'notifications', current.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error marking response notification read:', error);
    }
  };

  const responder = activeNotification?.responder || {};
  const response = activeNotification?.response || {};
  const defaultMessage = `Help is on the way from ${responder.precinctName || 'Police Community Precinct 4 (Malinta)'}.`;
  const distance = Number.isFinite(Number(response.distanceKm))
    ? ` Distance: ${Number(response.distanceKm).toFixed(1)} km.`
    : '';
  const eta = response.etaMinutes ? ` ETA: ${response.etaMinutes} min.` : '';

  return (
    <CustomAlert
      visible={!!activeNotification}
      title={activeNotification?.title || 'Help is on the way'}
      message={activeNotification?.body || `${defaultMessage}${distance}${eta}`}
      type="warning"
      buttons={[{ text: 'OK' }]}
      onClose={markRead}
    />
  );
};

const getTimeValue = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export default ResponseAlertListener;
