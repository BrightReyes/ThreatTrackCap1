import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import CustomAlert from '../components/CustomAlert';

const generateMockNotifications = () => {
  return [
    { id: 'n1', type: 'High Crime Activity Detected', body: 'Increased reports near Main Street area. Avoid if possible.', severity: 'high', read: false },
    { id: 'n2', type: 'Safety Alert Resolved', body: 'Increased reports near Main Street area. Avoid if possible.', severity: 'low', read: false },
    { id: 'n3', type: 'Precinct Office Hours Updated', body: 'Central Police Station now open 24/7 for emergencies.', severity: 'medium', read: true },
    { id: 'n4', type: 'Theft Reported Nearby', body: 'Vehicle break-in reported at 5th Ave parking lot.', severity: 'high', read: false },
    { id: 'n5', type: 'Community Safety Meeting', body: 'Join us this Friday at 6 PM for a community safety discussion.', severity: 'low', read: true },
  ];
};

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // all | unread
  const [alertConfig, setAlertConfig] = useState({ visible:false, title:'', message:'', type:'info', buttons:[] });

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(notificationsRef, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const notifs = [];
      snapshot.forEach(docSnap => notifs.push({ id: docSnap.id, ...docSnap.data() }));
      if (notifs.length === 0) {
        setNotifications(generateMockNotifications());
      } else {
        setNotifications(notifs);
      }
    } catch (e) {
      setNotifications(generateMockNotifications());
    }
  };

  const markAllRead = async () => {
    // attempt to update remote docs if they exist
    try {
      const notifsRef = collection(db, 'notifications');
      const q = query(notifsRef, orderBy('timestamp','desc'));
      const snapshot = await getDocs(q);
      const updates = [];
      snapshot.forEach(s => {
        const ref = doc(db, 'notifications', s.id);
        updates.push(updateDoc(ref, { read: true }).catch(()=>{}));
      });
      await Promise.all(updates);
    } catch (e) {
      // ignore
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setAlertConfig({ visible:true, title:'Marked read', message:'All notifications marked as read', type:'info', buttons:[{text:'OK'}] });
  };

  const visibleNotifications = notifications.filter(n => filter === 'all' ? true : !n.read);

  return (
    <>
    <LinearGradient colors={['#3d5a8c','#2d4a7c','#1a2f5c']} style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.navItem}><Text style={styles.navIcon}>🏠</Text><Text style={styles.navLabel}>Home</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Text style={styles.navIcon}>📄</Text><Text style={styles.navLabel}>Reports</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Text style={styles.navIcon}>🔔</Text><Text style={styles.navLabel}>Alerts</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Text style={styles.navIcon}>⚙️</Text><Text style={styles.navLabel}>Settings</Text></TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{paddingBottom:120}}>
        <View style={styles.headerAlt}>
          <Text style={styles.headerTitleAlt}>Notifications</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabButton, filter==='all' && styles.tabActive]} onPress={()=>setFilter('all')}>
              <Text style={[styles.tabText, filter==='all' && styles.tabTextActive]}>All ({notifications.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabButton, filter==='unread' && styles.tabActive]} onPress={()=>setFilter('unread')}>
              <Text style={[styles.tabText, filter==='unread' && styles.tabTextActive]}>Unread ({notifications.filter(n=>!n.read).length})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.markAll} onPress={markAllRead}><Text style={styles.markAllText}>Mark all read</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          {visibleNotifications.map(n => (
            <View key={n.id} style={[styles.notifCard, n.read ? styles.notifRead : styles.notifUnread]}>
              <View style={styles.notifRowTop}>
                <Text style={styles.notifTitle}>{n.type}</Text>
                {n.severity === 'high' && <View style={styles.warningIcon}><Text style={styles.warningText}>!</Text></View>}
              </View>
              <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

    </LinearGradient>

    <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} buttons={alertConfig.buttons} onClose={()=>setAlertConfig({...alertConfig, visible:false})} />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex:1 },
  topNav: { backgroundColor:'#d32f2f', flexDirection:'row', justifyContent:'space-around', paddingTop:36, paddingBottom:12 },
  navItem:{alignItems:'center', width:'25%'},
  navIcon:{color:'#fff', fontSize:18, marginBottom:4},
  navLabel:{color:'#fff', fontWeight:'700', fontSize:11},
  scrollView: { flex:1 },
  headerAlt: { paddingHorizontal:20, paddingTop:18, paddingBottom:8 },
  headerTitleAlt: { fontSize:22, fontWeight:'900', color:'#111827' },
  tabRow: { flexDirection:'row', marginTop:12, alignItems:'center' },
  tabButton: { paddingHorizontal:12, paddingVertical:6, backgroundColor:'#fff', borderRadius:12, marginRight:8 },
  tabActive: { backgroundColor:'#d32f2f' },
  tabText: { color:'#6b7280', fontWeight:'700' },
  tabTextActive: { color:'#fff' },
  markAll: { marginLeft:'auto' },
  markAllText: { color:'#6b7280', fontWeight:'700' },
  content: { paddingHorizontal:20, paddingTop:10 },
  notifCard: { backgroundColor:'#fff', borderRadius:12, padding:12, marginBottom:12 },
  notifUnread: { borderLeftWidth:4, borderLeftColor:'#dc2626' },
  notifRead: { opacity:0.9 },
  notifRowTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  notifTitle: { fontSize:16, fontWeight:'900', color:'#111827' },
  warningIcon: { backgroundColor:'#fff3f3', paddingHorizontal:6, paddingVertical:2, borderRadius:8 },
  warningText: { color:'#b91c1c', fontWeight:'900' },
  notifBody: { color:'#6b7280' },
});

export default NotificationsScreen;
