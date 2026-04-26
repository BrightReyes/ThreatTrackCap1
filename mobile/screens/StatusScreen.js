import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  StatusBar,
} from 'react-native';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import CustomAlert from '../components/CustomAlert';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;

const INCIDENT_TYPE_LABELS = {
  theft_snatching: 'Theft / Snatching',
  robbery_holdup: 'Robbery / Hold-up',
  physical_assault_injury: 'Physical Assault / Injury',
  domestic_violence: 'Domestic Violence',
  drug_related_activity: 'Drug-Related Activity',
  public_disturbance: 'Public Disturbance',
  vandalism_property_damage: 'Vandalism / Property Damage',
  traffic_accident: 'Traffic Accidents',
  illegal_weapons: 'Illegal Possession of Weapons',
  suspicious_activity: 'Suspicious Activity / Persons',
};

const STATUS_META = {
  responding: {
    label: 'Help On The Way',
    shortLabel: 'Responding',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 3,
    assurance: 'A responder has acknowledged your report. Keep your phone reachable and stay in a safe place.',
  },
  verified: {
    label: 'Verified',
    shortLabel: 'Verified',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    step: 3,
    assurance: 'Your report was validated and is available for responder review.',
  },
  under_review: {
    label: 'Under Review',
    shortLabel: 'Review',
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    step: 2,
    assurance: 'Your report is in the review queue. Keep your phone reachable for possible updates.',
  },
  pending: {
    label: 'Submitted',
    shortLabel: 'Submitted',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'Your report was received and is waiting for review.',
  },
  submitted: {
    label: 'Submitted',
    shortLabel: 'Submitted',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'Your report was received and is waiting for review.',
  },
  open: {
    label: 'Responder Review',
    shortLabel: 'Active',
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    step: 3,
    assurance: 'Your report is active for responder coordination.',
  },
  rejected: {
    label: 'Needs Attention',
    shortLabel: 'Attention',
    color: '#991b1b',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'This report needs more information before it can move forward.',
  },
  spam: {
    label: 'Needs Attention',
    shortLabel: 'Attention',
    color: '#991b1b',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'This report was flagged and needs admin review.',
  },
  error: {
    label: 'Needs Attention',
    shortLabel: 'Attention',
    color: '#991b1b',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'There was a validation issue. Refresh or submit a new report if needed.',
  },
  done: {
    label: 'Completed',
    shortLabel: 'Done',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    step: 3,
    assurance: 'This report has been marked completed by the admin team.',
  },
};

const TRACKING_STEPS = ['Submitted', 'Review', 'Responder'];

const getStatusMeta = (status) => {
  return STATUS_META[status] || STATUS_META.pending;
};

const StatusScreen = ({ navigation }) => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ verified: 0, under_review: 0, rejected: 0, total: 0 });
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const showAlert = (title, message, type = 'info', buttons = []) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      buttons,
    });
  };

  const hideAlert = () => {
    setAlertConfig({ ...alertConfig, visible: false });
  };

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('No user logged in');
      setLoading(false);
      return undefined;
    }

    const incidentsRef = collection(db, 'incidents');
    const q = query(
      incidentsRef,
      where('reporterId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const fetchedIncidents = [];
        querySnapshot.forEach((doc) => {
          fetchedIncidents.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        applyIncidentSnapshot(fetchedIncidents);
      },
      (error) => {
        console.error('Error listening to incidents:', error);
        setLoading(false);
        setRefreshing(false);
        showAlert('Error', 'Failed to load your incidents', 'error');
      }
    );

    return unsubscribe;
  }, []);

  const applyIncidentSnapshot = (fetchedIncidents) => {
    fetchedIncidents.sort((a, b) => {
      const aTime = getIncidentDate(a)?.getTime() || 0;
      const bTime = getIncidentDate(b)?.getTime() || 0;
      return bTime - aTime;
    });

    setIncidents(fetchedIncidents);
    setSelectedIncident(current => {
      if (!current) return current;
      return fetchedIncidents.find(item => item.id === current.id) || current;
    });

    const verified = fetchedIncidents.filter(i => ['verified', 'done'].includes(i.status)).length;
    const responding = fetchedIncidents.filter(i => i.status === 'responding' || i.responseStatus === 'help_on_the_way').length;
    const under_review = fetchedIncidents.filter(i => ['under_review', 'pending', 'submitted', 'open'].includes(i.status)).length + responding;
    const rejected = fetchedIncidents.filter(i => ['rejected', 'error', 'spam'].includes(i.status)).length;

    setStats({
      verified,
      under_review,
      rejected,
      total: fetchedIncidents.length
    });

    setLoading(false);
    setRefreshing(false);
  };

  const fetchMyIncidents = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log('No user logged in');
        setLoading(false);
        return;
      }

      const incidentsRef = collection(db, 'incidents');
      const q = query(
        incidentsRef,
        where('reporterId', '==', currentUser.uid)
      );

      const querySnapshot = await getDocs(q);
      const fetchedIncidents = [];
      
      querySnapshot.forEach((doc) => {
        fetchedIncidents.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      applyIncidentSnapshot(fetchedIncidents);
    } catch (error) {
      console.error('Error fetching incidents:', error);
      setLoading(false);
      setRefreshing(false);
      showAlert('Error', 'Failed to load your incidents', 'error');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyIncidents();
  };

  const handleSOSPress = async () => {
    try {
      // Import getCurrentLocation here since StatusScreen doesn't have it
      const { getCurrentLocation } = require('../utils/location');
      const location = await getCurrentLocation();
      navigation.navigate('SOSReport', { userLocation: location });
    } catch (error) {
      console.error('Error getting location for SOS:', error);
      // Navigate anyway without location, SOS screen will handle it
      navigation.navigate('SOSReport');
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getIncidentDate = (incident) => {
    const timestamp = incident?.timestamp || incident?.clientTimestamp || incident?.createdAt;
    if (!timestamp) return null;
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatFullTimestamp = (incident) => {
    const date = getIncidentDate(incident);
    if (!date) return 'Unknown date';
    return date.toLocaleString();
  };

  const getStatusIcon = (status) => {
    const meta = getStatusMeta(status);
    if (status === 'responding') return 'SOS';
    return meta.step >= 3 ? 'OK' : meta.step === 2 ? '...' : '1';
  };

  const getDisplayStatus = (incident) => {
    if (
      incident?.status === 'responding' ||
      incident?.responseStatus === 'help_on_the_way' ||
      incident?.response?.status === 'help_on_the_way'
    ) {
      return 'responding';
    }
    return incident?.status;
  };

  const getIncidentIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'theft_snatching': return '👜';
      case 'robbery_holdup': return '🚨';
      case 'physical_assault_injury': return '🤕';
      case 'domestic_violence': return '🏠';
      case 'drug_related_activity': return '🔥';
      case 'public_disturbance': return '⚠️';
      case 'vandalism_property_damage': return '🧱';
      case 'traffic_accident': return '🚗';
      case 'illegal_weapons': return '🔒';
      case 'suspicious_activity': return '👁️';
      default: return '!';
    }
  };

  const formatIncidentType = (incident) => {
    return incident.typeLabel || INCIDENT_TYPE_LABELS[incident.type] || 'Incident';
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return '#dc2626';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getSeverityBackground = (severity) => {
    switch (severity) {
      case 'high': return '#fef2f2';
      case 'medium': return '#fffbeb';
      case 'low': return '#ecfdf5';
      default: return '#f3f4f6';
    }
  };

  const getLocationDisplay = (location) => {
    if (!location) return 'Location not specified';
    
    // If location has address property, use it
    if (location.address) {
      return location.address;
    }
    
    // If location has coordinates, format them
    if (location.latitude && location.longitude) {
      return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
    }
    
    return 'Location not specified';
  };

  const handleIncidentPress = (incident) => {
    setSelectedIncident(incident);
    setDetailsVisible(true);
  };

  const closeDetailsModal = () => {
    setDetailsVisible(false);
    setSelectedIncident(null);
  };

  const renderTrackingSteps = (status, compact = false) => {
    const currentStep = getStatusMeta(status).step;

    return (
      <View style={compact ? styles.trackingCompact : styles.trackingTimeline}>
        {TRACKING_STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = currentStep >= stepNumber;
          const isCurrent = currentStep === stepNumber;

          return (
            <View key={step} style={styles.trackingStepWrap}>
              <View
                style={[
                  styles.trackingDot,
                  isActive && styles.trackingDotActive,
                  isCurrent && styles.trackingDotCurrent,
                ]}
              >
                <Text style={[styles.trackingDotText, isActive && styles.trackingDotTextActive]}>
                  {stepNumber}
                </Text>
              </View>
              <Text style={[styles.trackingLabel, isActive && styles.trackingLabelActive]}>
                {step}
              </Text>
              {index < TRACKING_STEPS.length - 1 && (
                <View style={[styles.trackingLine, currentStep > stepNumber && styles.trackingLineActive]} />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderDetailsModal = () => {
    if (!selectedIncident) return null;

    const displayStatus = getDisplayStatus(selectedIncident);
    const meta = getStatusMeta(displayStatus);
    const severityColor = getSeverityColor(selectedIncident.severity);
    const response = selectedIncident.response || {};
    const responder = selectedIncident.responder || response.responder || {};
    const hasResponse = displayStatus === 'responding' ||
      selectedIncident.responseStatus === 'help_on_the_way' ||
      response.status === 'help_on_the_way';
    const distanceText = Number.isFinite(Number(response.distanceKm))
      ? `${Number(response.distanceKm).toFixed(1)} km away`
      : 'Distance unavailable';
    const etaText = response.etaMinutes ? `${response.etaMinutes} min ETA` : 'ETA unavailable';

    return (
      <Modal
        visible={detailsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDetailsModal}
      >
        <View style={styles.detailsBackdrop}>
          <View style={styles.detailsSheet}>
            <View style={styles.detailsHandle} />
            <View style={styles.detailsHeader}>
              <View style={styles.detailsTitleBlock}>
                <Text style={styles.detailsEyebrow}>REPORT TRACKING</Text>
                <Text style={styles.detailsTitle}>{formatIncidentType(selectedIncident)}</Text>
                <Text style={styles.detailsSubtitle}>Submitted {formatTimestamp(selectedIncident.timestamp || selectedIncident.clientTimestamp)}</Text>
              </View>
              <TouchableOpacity style={styles.detailsCloseButton} onPress={closeDetailsModal}>
                <Text style={styles.detailsCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.detailsStatusPanel}>
                <View style={[styles.detailsStatusIcon, { backgroundColor: meta.backgroundColor, borderColor: meta.borderColor }]}>
                  <Text style={[styles.detailsStatusIconText, { color: meta.color }]}>{getStatusIcon(displayStatus)}</Text>
                </View>
                <View style={styles.detailsStatusCopy}>
                  <Text style={styles.detailsStatusLabel}>{meta.label}</Text>
                  <Text style={styles.detailsStatusMessage}>{meta.assurance}</Text>
                </View>
              </View>

              {renderTrackingSteps(displayStatus)}

              {hasResponse && (
                <View style={styles.responderCard}>
                  <View style={styles.responderHeader}>
                    <View style={styles.responderSignal}>
                      <Text style={styles.responderSignalText}>!</Text>
                    </View>
                    <View style={styles.responderTitleBlock}>
                      <Text style={styles.responderEyebrow}>HELP IS ON THE WAY</Text>
                      <Text style={styles.responderTitle}>
                        {responder.precinctName || 'Police Community Precinct 4 (Malinta)'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.responderMessage}>
                    {response.message || 'A responder has acknowledged your report and is moving from Malinta Precinct.'}
                  </Text>
                  <View style={styles.responderMetaRow}>
                    <View style={styles.responderMetaPill}>
                      <Text style={styles.responderMetaLabel}>Distance</Text>
                      <Text style={styles.responderMetaValue}>{distanceText}</Text>
                    </View>
                    <View style={styles.responderMetaPill}>
                      <Text style={styles.responderMetaLabel}>Arrival</Text>
                      <Text style={styles.responderMetaValue}>{etaText}</Text>
                    </View>
                  </View>
                  <Text style={styles.responderAddress}>
                    {responder.address || 'Governor I. Santiago Rd., Malinta, Valenzuela'}
                  </Text>
                </View>
              )}

              <View style={styles.detailsGrid}>
                <View style={styles.detailsInfoCard}>
                  <Text style={styles.detailsInfoLabel}>Severity</Text>
                  <Text style={[styles.detailsInfoValue, { color: severityColor }]}>
                    {(selectedIncident.severity || 'medium').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.detailsInfoCard}>
                  <Text style={styles.detailsInfoLabel}>Report ID</Text>
                  <Text style={styles.detailsInfoValue} numberOfLines={1}>
                    {selectedIncident.id?.slice(0, 8) || 'Pending'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionLabel}>Description</Text>
                <Text style={styles.detailsSectionText}>
                  {selectedIncident.description || 'No description provided.'}
                </Text>
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionLabel}>Location</Text>
                <Text style={styles.detailsSectionText}>
                  {getLocationDisplay(selectedIncident.location)}
                </Text>
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionLabel}>Reported</Text>
                <Text style={styles.detailsSectionText}>
                  {formatFullTimestamp(selectedIncident)}
                </Text>
              </View>

              <View style={styles.assuranceCard}>
                <Text style={styles.assuranceTitle}>What happens next</Text>
                <Text style={styles.assuranceText}>
                  {hasResponse
                    ? 'Stay near a safe, visible area if possible. The response details above update from the admin side.'
                    : 'Your report is saved with your submitted location. Responder assignment will appear here once the admin acknowledges the report.'}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading your reports...</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
          }
        >
          {/* Header */}
          <View style={styles.headerNew}>
            <Text style={styles.headerNewTitle}>REPORT STATUS</Text>
            <Text style={styles.headerSubtitle}>Track your submitted reports and review response progress.</Text>
          </View>

          {/* Statistics Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total Reports</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.under_review}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.verified}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
          </View>

          <View style={styles.assuranceBanner}>
            <View style={styles.assuranceBannerIcon}>
              <Text style={styles.assuranceBannerIconText}>i</Text>
            </View>
            <View style={styles.assuranceBannerCopy}>
              <Text style={styles.assuranceBannerTitle}>Your reports stay trackable</Text>
              <Text style={styles.assuranceBannerText}>
                Responder updates from the admin side will appear here automatically once help is on the way.
              </Text>
            </View>
          </View>

          {/* Incidents List */}
          <View style={styles.content}>
            {incidents.length > 0 ? (
              incidents.map((incident) => {
                const displayStatus = getDisplayStatus(incident);
                const meta = getStatusMeta(displayStatus);
                const severityColor = getSeverityColor(incident.severity);

                return (
                  <TouchableOpacity
                    key={incident.id}
                    style={styles.incidentCard}
                    onPress={() => handleIncidentPress(incident)}
                    activeOpacity={0.86}
                  >
                    <View style={styles.incidentRowTop}>
                      <View style={[styles.incidentTypeIconWrap, { backgroundColor: getSeverityBackground(incident.severity) }]}>
                        <Text style={styles.incidentTypeIconText}>{getIncidentIcon(incident.type)}</Text>
                      </View>
                      <View style={styles.incidentTitleBlock}>
                        <Text style={styles.incidentTitle} numberOfLines={1}>{formatIncidentType(incident)}</Text>
                        <Text style={styles.incidentTime}>Submitted {formatTimestamp(incident.timestamp || incident.clientTimestamp)}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: meta.backgroundColor, borderColor: meta.borderColor }]}>
                        <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.shortLabel}</Text>
                      </View>
                    </View>

                    {renderTrackingSteps(displayStatus, true)}

                    <Text style={styles.incidentBody} numberOfLines={2}>{incident.description}</Text>

                    <View style={styles.incidentRowBottom}>
                      <Text style={styles.incidentLocation} numberOfLines={1}>{getLocationDisplay(incident.location)}</Text>
                      <Text style={styles.detailsLink}>Details</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Text style={styles.emptyIconText}>!</Text>
                </View>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyTitle}>No Reports Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Your submitted incident reports will appear here
                </Text>
              </View>
            )}
          </View>

          {/* Bottom Spacer */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomNavBarContainer}>
          <View style={styles.bottomNavBar}>
            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Home')}>
              <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />
              <Text style={styles.navBottomLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Status')}>
              <Image source={require('../assets/icons/report.png')} style={styles.navBottomIconImage} />
              <Text style={styles.navBottomLabel}>Reports</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sosButtonBottom} onPress={handleSOSPress}>
            <View style={styles.sosGlowRing} />
            <View style={styles.sosButtonInner}>
              <Text style={styles.sosTextBottom}>SOS</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {renderDetailsModal()}

      {/* Custom Alert Modal */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
        autoCloseDelay={5000}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  
  // Header Styles
  headerNew: {
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerNewTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
    lineHeight: 19,
  },

  // Statistics Cards
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginHorizontal: 5,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#dc2626',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'center',
  },
  assuranceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 14,
  },
  assuranceBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  assuranceBannerIconText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  assuranceBannerCopy: {
    flex: 1,
  },
  assuranceBannerTitle: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 3,
  },
  assuranceBannerText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    lineHeight: 17,
  },

  // Content Area
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  incidentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  incidentRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  incidentTypeIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  incidentTypeIconText: {
    fontSize: 22,
  },
  incidentTitleBlock: {
    flex: 1,
    marginRight: 10,
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  incidentTime: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '700',
  },
  statusPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  trackingCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackingTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 14,
    marginBottom: 14,
  },
  trackingStepWrap: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  trackingDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f3f4f6',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  trackingDotActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  trackingDotCurrent: {
    borderColor: '#991b1b',
    borderWidth: 2.5,
  },
  trackingDotText: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '900',
  },
  trackingDotTextActive: {
    color: '#ffffff',
  },
  trackingLabel: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '800',
  },
  trackingLabelActive: {
    color: '#991b1b',
  },
  trackingLine: {
    position: 'absolute',
    top: 13,
    left: '58%',
    right: '-42%',
    height: 2,
    backgroundColor: '#e5e7eb',
    zIndex: 1,
  },
  trackingLineActive: {
    backgroundColor: '#dc2626',
  },
  incidentBody: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 10,
    lineHeight: 19,
    fontWeight: '600',
  },
  incidentRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  incidentLocation: {
    fontSize: 12,
    color: '#6b7280',
    flex: 1,
    fontWeight: '600',
    marginRight: 12,
  },
  detailsLink: {
    color: '#dc2626',
    fontWeight: '900',
    fontSize: 13,
  },
  detailsBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.46)',
  },
  detailsSheet: {
    maxHeight: '86%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#fee2e2',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 24,
  },
  detailsHandle: {
    alignSelf: 'center',
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fecaca',
    marginBottom: 16,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 16,
  },
  detailsTitleBlock: {
    flex: 1,
  },
  detailsEyebrow: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  detailsTitle: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '900',
  },
  detailsSubtitle: {
    marginTop: 5,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
  },
  detailsCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsCloseText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  detailsScroll: {
    maxHeight: 560,
  },
  detailsStatusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  detailsStatusIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailsStatusIconText: {
    fontSize: 13,
    fontWeight: '900',
  },
  detailsStatusCopy: {
    flex: 1,
  },
  detailsStatusLabel: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 4,
  },
  detailsStatusMessage: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    lineHeight: 18,
  },
  responderCard: {
    backgroundColor: '#fff7f7',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  responderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  responderSignal: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  responderSignalText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  responderTitleBlock: {
    flex: 1,
  },
  responderEyebrow: {
    color: '#dc2626',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  responderTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  responderMessage: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
  },
  responderMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  responderMetaPill: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 14,
    padding: 10,
  },
  responderMetaLabel: {
    color: '#991b1b',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  responderMetaValue: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  responderAddress: {
    color: '#7f1d1d',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  detailsInfoCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  detailsInfoLabel: {
    fontSize: 10,
    color: '#991b1b',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  detailsInfoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '900',
  },
  detailsSection: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 16,
    padding: 13,
    marginBottom: 10,
  },
  detailsSectionLabel: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  detailsSectionText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    lineHeight: 19,
  },
  assuranceCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  assuranceTitle: {
    fontSize: 14,
    color: '#991b1b',
    fontWeight: '900',
    marginBottom: 5,
  },
  assuranceText: {
    fontSize: 12,
    color: '#7f1d1d',
    fontWeight: '700',
    lineHeight: 18,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    color: '#dc2626',
    fontSize: 24,
    fontWeight: '900',
  },
  emptyEmoji: {
    display: 'none',
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },

  // Bottom Navigation Bar Container
  bottomNavBarContainer: {
    position: 'relative',
    backgroundColor: '#991b1b',
  },

  // Bottom Navigation Bar
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: '#991b1b',
    borderTopWidth: 1,
    borderTopColor: '#b91c1c',
    paddingBottom: 15,
    paddingTop: 13,
    paddingHorizontal: 20,
  },

  navBottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0,
    paddingHorizontal: 14,
  },
  navBottomIcon: {
    fontSize: 32,
    color: '#ffffff',
    marginBottom: 4,
  },
  navBottomIconImage: {
    width: 32,
    height: 32,
    marginBottom: 4,
    tintColor: '#ffffff',
  },
  navBottomLabel: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  sosButtonBottom: {
    position: 'absolute',
    top: -58,
    left: '50%',
    marginLeft: -56,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.68,
    shadowRadius: 28,
    elevation: 35,
  },
  sosGlowRing: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: '#ffe4e6',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  sosButtonInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#ff1238',
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  sosTextBottom: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
});

export default StatusScreen;
