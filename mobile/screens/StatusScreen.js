import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
} from 'react-native';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../utils/firebase';
import CustomAlert from '../components/CustomAlert';
import SmoothModal from '../components/SmoothModal';
import GlobalBottomBar from '../components/GlobalBottomBar';
import { computeInitialDistanceAndEta } from '../utils/responderEta';

const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 12;
const PAGE_SIZE = 5;

const FILTER_TABS = [
  { id: 'all', label: 'All Reports' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'attention', label: 'Needs Attention' },
];

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
    label: 'Report Rejected',
    shortLabel: 'Rejected',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'This report was reviewed and rejected by the administration team.',
  },
  spam: {
    label: 'Flagged Report',
    shortLabel: 'Flagged',
    color: '#991b1b',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    step: 1,
    assurance: 'This report was flagged and needs administrator review.',
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
const TERMINAL_STATUSES = ['done', 'rejected', 'spam'];

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

  // Pagination & Filter States
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const scrollViewRef = useRef(null);

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
    setAlertConfig(prev => ({ ...prev, visible: false }));
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
    const responding = fetchedIncidents.filter(i => !TERMINAL_STATUSES.includes(i.status) && (i.status === 'responding' || i.responseStatus === 'help_on_the_way')).length;
    const under_review = fetchedIncidents.filter(i => ['under_review', 'pending', 'submitted', 'open'].includes(i.status)).length + responding;
    const rejected = fetchedIncidents.filter(i => ['rejected', 'error', 'spam'].includes(i.status)).length;

    setStats({
      verified,
      under_review,
      rejected,
      total: fetchedIncidents.length,
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

  // Filtered & Paginated Incidents computation
  const filteredIncidents = useMemo(() => {
    switch (activeFilter) {
      case 'in_progress':
        return incidents.filter(i => !TERMINAL_STATUSES.includes(i.status) && i.status !== 'verified');
      case 'resolved':
        return incidents.filter(i => ['verified', 'done'].includes(i.status));
      case 'attention':
        return incidents.filter(i => ['rejected', 'error', 'spam'].includes(i.status));
      default:
        return incidents;
    }
  }, [incidents, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / PAGE_SIZE));
  const paginatedIncidents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredIncidents.slice(start, start + PAGE_SIZE);
  }, [filteredIncidents, currentPage]);

  const handleFilterChange = (filterId) => {
    if (activeFilter === filterId) return;
    setActiveFilter(filterId);
    setCurrentPage(1);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
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

  const getStatusIconName = (status) => {
    const meta = getStatusMeta(status);
    if (status === 'responding') return 'radio-outline';
    if (meta.step >= 3) return 'checkmark-circle-outline';
    if (meta.step === 2) return 'time-outline';
    return 'document-text-outline';
  };

  const getDisplayStatus = (incident) => {
    if (TERMINAL_STATUSES.includes(incident?.status)) {
      return incident.status;
    }
    if (
      incident?.status === 'responding' ||
      incident?.responseStatus === 'help_on_the_way' ||
      incident?.response?.status === 'help_on_the_way'
    ) {
      return 'responding';
    }
    return incident?.status;
  };

  const getIncidentIconName = (type) => {
    const icons = {
      theft_snatching: 'bag-handle-outline',
      robbery_holdup: 'alert-circle-outline',
      physical_assault_injury: 'medkit-outline',
      domestic_violence: 'home-outline',
      drug_related_activity: 'flame-outline',
      public_disturbance: 'megaphone-outline',
      vandalism_property_damage: 'construct-outline',
      traffic_accident: 'car-outline',
      illegal_weapons: 'shield-outline',
      suspicious_activity: 'eye-outline',
    };
    return icons[type?.toLowerCase()] || 'alert-outline';
  };

  const formatIncidentType = (incident) => {
    return incident.typeLabel || INCIDENT_TYPE_LABELS[incident.type] || 'Incident';
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return '#dc2626';
      case 'medium': return '#d97706';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  const getSeverityBackground = (severity) => {
    switch (severity) {
      case 'high': return '#fef2f2';
      case 'medium': return '#fffbeb';
      case 'low': return '#f0fdf4';
      default: return '#f3f4f6';
    }
  };

  const getLocationDisplay = (location) => {
    if (!location) return 'Location not specified';
    if (location.address) {
      return location.address;
    }
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
    const hasResponse = displayStatus === 'responding' ||
      selectedIncident.responseStatus === 'help_on_the_way' ||
      response.status === 'help_on_the_way';

    const {
      distanceText,
      etaText,
      trafficNote,
      stationName,
      stationAddress,
    } = computeInitialDistanceAndEta(selectedIncident);

    return (
      <SmoothModal
        visible={detailsVisible}
        onRequestClose={closeDetailsModal}
        overlayStyle={styles.detailsBackdrop}
        contentStyle={styles.detailsSheet}
      >
        <View style={styles.detailsHandle} />
        <View style={styles.detailsHeader}>
          <View style={styles.detailsTitleBlock}>
            <View style={styles.detailsEyebrowBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#991b1b" />
              <Text style={styles.detailsEyebrow}>INCIDENT DOSSIER</Text>
            </View>
            <Text style={styles.detailsTitle}>{formatIncidentType(selectedIncident)}</Text>
            <Text style={styles.detailsSubtitle}>
              Submitted {formatTimestamp(selectedIncident.timestamp || selectedIncident.clientTimestamp)}
            </Text>
          </View>
          <TouchableOpacity style={styles.detailsCloseButton} onPress={closeDetailsModal}>
            <Ionicons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <View style={styles.detailsStatusPanel}>
            <View style={[styles.detailsStatusIcon, { backgroundColor: meta.backgroundColor, borderColor: meta.borderColor }]}>
              <Ionicons name={getStatusIconName(displayStatus)} size={26} color={meta.color} />
            </View>
            <View style={styles.detailsStatusCopy}>
              <Text style={styles.detailsStatusLabel}>{meta.label}</Text>
              <Text style={styles.detailsStatusMessage}>{meta.assurance}</Text>
            </View>
          </View>

          {renderTrackingSteps(displayStatus)}

          {/* Rejection / Flag Notice */}
          {(displayStatus === 'rejected' || !!selectedIncident.rejectionReason) && (
            <View style={styles.rejectionCard}>
              <View style={styles.rejectionHeader}>
                <View style={styles.rejectionIconWrap}>
                  <Ionicons name="close-circle" size={24} color="#dc2626" />
                </View>
                <View style={styles.rejectionTitleBlock}>
                  <Text style={styles.rejectionEyebrow}>STATUS UPDATE</Text>
                  <Text style={styles.rejectionTitle}>Report Rejected</Text>
                </View>
              </View>
              <Text style={styles.rejectionReasonHeading}>Reason for Rejection:</Text>
              <Text style={styles.rejectionMessage}>
                {selectedIncident.rejectionReason || selectedIncident.response?.message || 'This report was reviewed and could not be validated or did not meet submission guidelines.'}
              </Text>
              <View style={styles.rejectionAdvice}>
                <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
                <Text style={styles.rejectionAdviceText}>
                  For active emergencies, please call emergency services immediately or submit a new report with complete street details.
                </Text>
              </View>
            </View>
          )}

          {/* Responder Dispatch & ETA */}
          {hasResponse && (
            <View style={styles.responderCard}>
              <View style={styles.responderHeader}>
                <View style={styles.responderSignal}>
                  <Ionicons name="radio-outline" size={24} color="#ffffff" />
                </View>
                <View style={styles.responderTitleBlock}>
                  <Text style={styles.responderEyebrow}>HELP IS ON THE WAY</Text>
                  <Text style={styles.responderTitle}>
                    {stationName}
                  </Text>
                </View>
              </View>
              <Text style={styles.responderMessage}>
                {response.message || 'A responder has acknowledged your report and is being deployed from the assigned station.'}
              </Text>

              {/* Initial Distance & Traffic-Adjusted Arrival Pills */}
              <View style={styles.responderMetaRow}>
                <View style={styles.responderMetaPill}>
                  <Text style={styles.responderMetaLabel}>INITIAL DISTANCE</Text>
                  <Text style={styles.responderMetaValue}>{distanceText}</Text>
                </View>
                <View style={styles.responderMetaPill}>
                  <Text style={styles.responderMetaLabel}>EST. ARRIVAL</Text>
                  <Text style={styles.responderMetaValue}>{etaText}</Text>
                </View>
              </View>

              {trafficNote ? (
                <Text style={styles.responderTrafficNote}>
                  {trafficNote}
                </Text>
              ) : null}

              {stationAddress ? (
                <Text style={styles.responderAddress}>
                  {stationAddress}
                </Text>
              ) : null}
            </View>
          )}

          {/* Details Grid */}
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
                #{selectedIncident.id?.slice(0, 8).toUpperCase() || 'PENDING'}
              </Text>
            </View>
          </View>

          {/* Description Section */}
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionLabel}>Incident Description</Text>
            <Text style={styles.detailsSectionText}>
              {selectedIncident.description || 'No description provided.'}
            </Text>
          </View>

          {/* Evidence Photo Preview if available */}
          {selectedIncident.photoDataUrl ? (
            <View style={styles.detailsPhotoSection}>
              <View style={styles.detailsPhotoHeader}>
                <Text style={styles.detailsSectionLabel}>Photo Evidence Attached</Text>
                <View style={styles.evidenceBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                  <Text style={styles.evidenceBadgeText}>Verified Upload</Text>
                </View>
              </View>
              <View style={styles.detailsPhotoWrapper}>
                <Image
                  source={{ uri: selectedIncident.photoDataUrl }}
                  style={styles.detailsPhotoImage}
                  resizeMode="cover"
                />
              </View>
            </View>
          ) : null}

          {/* Location Section */}
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionLabel}>Location & Coordinates</Text>
            <Text style={styles.detailsSectionText}>
              {getLocationDisplay(selectedIncident.location)}
            </Text>
          </View>

          {/* Timestamp Section */}
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionLabel}>Timestamp Recorded</Text>
            <Text style={styles.detailsSectionText}>
              {formatFullTimestamp(selectedIncident)}
            </Text>
          </View>

          {/* Assurance Box */}
          <View style={styles.assuranceCard}>
            <View style={styles.assuranceTitleRow}>
              <Ionicons name="shield-checkmark-outline" size={17} color="#991b1b" />
              <Text style={styles.assuranceTitle}>Dispatcher Guidance</Text>
            </View>
            <Text style={styles.assuranceText}>
              {displayStatus === 'done'
                ? 'This report has been finalized by operations command. Incident logs remain encrypted in your citizen history.'
                : hasResponse
                  ? 'Stay near a safe, visible area if possible. Response status updates continuously as units advance.'
                  : 'Your report is registered with GPS precision. Station dispatchers review active queues in priority order.'}
            </Text>
          </View>
        </ScrollView>
      </SmoothModal>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Synchronizing citizen reports...</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
          }
        >
          {/* ThreatTrack Signature Gradient Header */}
          <LinearGradient
            colors={['#7f1d1d', '#991b1b', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerContainer}
          >
            <View style={styles.headerTopBar}>
              <View style={styles.headerBrandBadge}>
                <Ionicons name="shield-checkmark" size={13} color="#fee2e2" />
                <Text style={styles.headerBrandBadgeText}>THREATTRACK CITIZEN PORTAL</Text>
              </View>
              <View style={styles.headerLiveBadge}>
                <View style={styles.livePulseDot} />
                <Text style={styles.headerLiveBadgeText}>LIVE DISPATCH</Text>
              </View>
            </View>

            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>Incident Reports</Text>
              <Text style={styles.headerSubtitle}>
                Real-time review, responder dispatch, and arrival ETA
              </Text>
            </View>
          </LinearGradient>

          {/* Elevated Metric Cards (Double-Bezel Architecture) */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <View style={styles.statHeaderRow}>
                <Text style={styles.statLabel}>Total</Text>
                <Ionicons name="document-text-outline" size={14} color="#dc2626" />
              </View>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statSub}>Submitted</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statHeaderRow}>
                <Text style={styles.statLabel}>Active</Text>
                <Ionicons name="time-outline" size={14} color="#b45309" />
              </View>
              <Text style={[styles.statNumber, { color: '#b45309' }]}>{stats.under_review}</Text>
              <Text style={styles.statSub}>In Progress</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statHeaderRow}>
                <Text style={styles.statLabel}>Resolved</Text>
                <Ionicons name="checkmark-done-outline" size={14} color="#047857" />
              </View>
              <Text style={[styles.statNumber, { color: '#047857' }]}>{stats.verified}</Text>
              <Text style={styles.statSub}>Validated</Text>
            </View>
          </View>

          {/* Filter Tab Chips (Horizontal Touch Strip) */}
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              {FILTER_TABS.map((tab) => {
                const isSelected = activeFilter === tab.id;
                const count = tab.id === 'all'
                  ? stats.total
                  : tab.id === 'in_progress'
                  ? stats.under_review
                  : tab.id === 'resolved'
                  ? stats.verified
                  : stats.rejected;

                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.filterTab, isSelected && styles.filterTabSelected]}
                    onPress={() => handleFilterChange(tab.id)}
                    activeOpacity={0.82}
                  >
                    {isSelected ? (
                      <LinearGradient
                        colors={['#dc2626', '#991b1b']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.filterTabGradient}
                      >
                        <Text style={styles.filterTabTextSelected}>{tab.label}</Text>
                        <View style={styles.filterCountBadgeSelected}>
                          <Text style={styles.filterCountTextSelected}>{count}</Text>
                        </View>
                      </LinearGradient>
                    ) : (
                      <View style={styles.filterTabInner}>
                        <Text style={styles.filterTabText}>{tab.label}</Text>
                        <View style={styles.filterCountBadge}>
                          <Text style={styles.filterCountText}>{count}</Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Incidents List (Windowed / Paginated for Smooth Performance) */}
          <View style={styles.content}>
            {paginatedIncidents.length > 0 ? (
              paginatedIncidents.map((incident) => {
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
                        <Ionicons
                          name={getIncidentIconName(incident.type)}
                          size={22}
                          color={severityColor}
                        />
                      </View>
                      <View style={styles.incidentTitleBlock}>
                        <Text style={styles.incidentTitle} numberOfLines={1}>
                          {formatIncidentType(incident)}
                        </Text>
                        <Text style={styles.incidentTime}>
                          Submitted {formatTimestamp(incident.timestamp || incident.clientTimestamp)}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: meta.backgroundColor, borderColor: meta.borderColor }]}>
                        <Text style={[styles.statusPillText, { color: meta.color }]}>
                          {meta.shortLabel}
                        </Text>
                      </View>
                    </View>

                    {renderTrackingSteps(displayStatus, true)}

                    <Text style={styles.incidentBody} numberOfLines={2}>
                      {incident.description}
                    </Text>

                    {/* Photo attached indicator if image is present */}
                    {incident.photoDataUrl ? (
                      <View style={styles.photoAttachedBadge}>
                        <Ionicons name="camera-outline" size={13} color="#991b1b" />
                        <Text style={styles.photoAttachedText}>Photo Evidence Attached</Text>
                      </View>
                    ) : null}

                    {displayStatus === 'rejected' && (
                      <View style={styles.cardRejectionSnippet}>
                        <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
                        <Text style={styles.cardRejectionSnippetText} numberOfLines={1}>
                          Rejected: {incident.rejectionReason || incident.response?.message || 'Report not accepted'}
                        </Text>
                      </View>
                    )}

                    <View style={styles.incidentRowBottom}>
                      <View style={styles.locationContainer}>
                        <Ionicons name="location-outline" size={14} color="#6b7280" style={{ marginRight: 4 }} />
                        <Text style={styles.incidentLocation} numberOfLines={1}>
                          {getLocationDisplay(incident.location)}
                        </Text>
                      </View>
                      <View style={styles.detailsLinkRow}>
                        <Text style={styles.detailsLink}>Details</Text>
                        <Ionicons name="chevron-forward" size={14} color="#dc2626" />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="document-text-outline" size={32} color="#dc2626" />
                </View>
                <Text style={styles.emptyTitle}>
                  {activeFilter === 'all'
                    ? 'No Reports Submitted Yet'
                    : `No ${FILTER_TABS.find(t => t.id === activeFilter)?.label}`}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeFilter === 'all'
                    ? 'Your submitted incidents will appear here for tracking, validation, and station response.'
                    : 'There are currently no submitted reports matching this filter.'}
                </Text>
                {activeFilter !== 'all' ? (
                  <TouchableOpacity
                    style={styles.clearFilterButton}
                    onPress={() => handleFilterChange('all')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.clearFilterButtonText}>Show All Reports</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Tactical Pagination Bar */}
            {filteredIncidents.length > 0 && (
              <View style={styles.paginationCard}>
                <View style={styles.paginationSummaryRow}>
                  <Text style={styles.paginationSummaryText}>
                    Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredIncidents.length)}–
                    {Math.min(currentPage * PAGE_SIZE, filteredIncidents.length)} of {filteredIncidents.length} reports
                  </Text>
                  <View style={styles.paginationBadge}>
                    <Text style={styles.paginationBadgeText}>PAGE {currentPage} OF {totalPages}</Text>
                  </View>
                </View>

                {totalPages > 1 && (
                  <View style={styles.paginationControlsRow}>
                    <TouchableOpacity
                      style={[
                        styles.paginationButton,
                        currentPage === 1 && styles.paginationButtonDisabled,
                      ]}
                      onPress={handlePrevPage}
                      disabled={currentPage === 1}
                      activeOpacity={0.78}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={16}
                        color={currentPage === 1 ? '#9ca3af' : '#dc2626'}
                      />
                      <Text
                        style={[
                          styles.paginationButtonText,
                          currentPage === 1 && styles.paginationButtonTextDisabled,
                        ]}
                      >
                        Previous
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.pageDotsContainer}>
                      {Array.from({ length: totalPages }).map((_, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.pageDot,
                            currentPage === idx + 1 && styles.pageDotActive,
                          ]}
                          onPress={() => {
                            setCurrentPage(idx + 1);
                            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                          }}
                        />
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.paginationButton,
                        currentPage === totalPages && styles.paginationButtonDisabled,
                      ]}
                      onPress={handleNextPage}
                      disabled={currentPage === totalPages}
                      activeOpacity={0.78}
                    >
                      <Text
                        style={[
                          styles.paginationButtonText,
                          currentPage === totalPages && styles.paginationButtonTextDisabled,
                        ]}
                      >
                        Next
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={currentPage === totalPages ? '#9ca3af' : '#dc2626'}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Bottom Spacer so content is never blocked by GlobalBottomBar */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Bottom Navigation Bar */}
        <GlobalBottomBar navigation={navigation} activeTab="Status" />
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
    marginTop: 14,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },

  // ThreatTrack Signature Gradient Header
  headerContainer: {
    paddingTop: HEADER_TOP_PADDING,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 10,
  },
  headerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 999,
    paddingVertical: 4.5,
    paddingHorizontal: 11,
  },
  headerBrandBadgeText: {
    color: '#fee2e2',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 999,
    paddingVertical: 4.5,
    paddingHorizontal: 10,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4ade80',
  },
  headerLiveBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  headerTitleBlock: {
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: 'rgba(255, 241, 242, 0.94)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },

  // Statistics Cards
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  statHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.2,
  },
  statSub: {
    fontSize: 10.5,
    color: '#9ca3af',
    fontWeight: '700',
    marginTop: 1,
  },

  // Filter Section
  filterSection: {
    marginBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  filterTabSelected: {
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  filterTabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  filterTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.2,
    borderColor: '#fecaca',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 14,
    gap: 8,
  },
  filterTabTextSelected: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '900',
  },
  filterTabText: {
    color: '#374151',
    fontSize: 12.5,
    fontWeight: '800',
  },
  filterCountBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterCountTextSelected: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  filterCountBadge: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  filterCountText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '900',
  },

  // Content Area
  content: {
    paddingHorizontal: 16,
  },
  incidentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: '#fee2e2',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  incidentRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  incidentTypeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  incidentTitleBlock: {
    flex: 1,
    marginRight: 8,
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 3,
  },
  incidentTime: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '700',
  },
  statusPill: {
    borderWidth: 1.2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 11.5,
    fontWeight: '900',
  },
  trackingCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  trackingTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7f7',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  trackingStepWrap: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  trackingDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
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
    fontSize: 12,
    fontWeight: '900',
  },
  trackingDotTextActive: {
    color: '#ffffff',
  },
  trackingLabel: {
    marginTop: 5,
    color: '#9ca3af',
    fontSize: 11.5,
    fontWeight: '800',
    lineHeight: 16,
    textAlign: 'center',
  },
  trackingLabelActive: {
    color: '#991b1b',
  },
  trackingLine: {
    position: 'absolute',
    top: 14,
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
    fontSize: 13.5,
    color: '#374151',
    marginBottom: 10,
    lineHeight: 19,
    fontWeight: '600',
  },
  photoAttachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  photoAttachedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991b1b',
  },
  incidentRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  incidentLocation: {
    fontSize: 12.5,
    color: '#6b7280',
    fontWeight: '700',
    flex: 1,
  },
  detailsLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  detailsLink: {
    color: '#dc2626',
    fontWeight: '900',
    fontSize: 13,
  },

  // Tactical Pagination Card
  paginationCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.2,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 14,
    marginTop: 6,
    marginBottom: 12,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  paginationSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  paginationSummaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4b5563',
  },
  paginationBadge: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  paginationBadgeText: {
    color: '#991b1b',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  paginationControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  paginationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1.2,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
    minHeight: 38,
  },
  paginationButtonDisabled: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  paginationButtonText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#dc2626',
  },
  paginationButtonTextDisabled: {
    color: '#9ca3af',
  },
  pageDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  pageDotActive: {
    width: 18,
    backgroundColor: '#dc2626',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#fee2e2',
    paddingHorizontal: 20,
    marginTop: 6,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '600',
  },
  clearFilterButton: {
    marginTop: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1.2,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  clearFilterButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#dc2626',
  },

  // Detail Modal Styles
  detailsBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.52)',
  },
  detailsSheet: {
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#fee2e2',
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 24,
  },
  detailsHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fecaca',
    marginBottom: 14,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  detailsTitleBlock: {
    flex: 1,
  },
  detailsEyebrowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  detailsEyebrow: {
    fontSize: 11,
    color: '#991b1b',
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  detailsTitle: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '900',
  },
  detailsSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '700',
  },
  detailsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#991b1b',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 18,
    padding: 13,
    marginBottom: 12,
  },
  detailsStatusIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailsStatusCopy: {
    flex: 1,
  },
  detailsStatusLabel: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 3,
  },
  detailsStatusMessage: {
    fontSize: 13,
    color: '#64748b',
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
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  responderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  responderSignal: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  responderTitleBlock: {
    flex: 1,
  },
  responderEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 1,
    marginBottom: 2,
  },
  responderTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#111827',
  },
  responderMessage: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 12,
  },
  responderMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  responderMetaPill: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  responderMetaLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#991b1b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  responderMetaValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#111827',
  },
  responderAddress: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  responderTrafficNote: {
    fontSize: 11,
    color: '#991b1b',
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 15,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  detailsInfoCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  detailsInfoLabel: {
    fontSize: 11,
    color: '#991b1b',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  detailsInfoValue: {
    fontSize: 13.5,
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
    color: '#991b1b',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  detailsSectionText: {
    fontSize: 13.5,
    color: '#374151',
    fontWeight: '700',
    lineHeight: 19,
  },
  detailsPhotoSection: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 13,
    marginBottom: 10,
  },
  detailsPhotoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  evidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  evidenceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
  },
  detailsPhotoWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 190,
    backgroundColor: '#f3f4f6',
  },
  detailsPhotoImage: {
    width: '100%',
    height: '100%',
  },
  assuranceCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  assuranceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  assuranceTitle: {
    fontSize: 13,
    color: '#991b1b',
    fontWeight: '900',
  },
  assuranceText: {
    fontSize: 12.5,
    color: '#7f1d1d',
    fontWeight: '700',
    lineHeight: 18,
  },
  rejectionCard: {
    backgroundColor: '#fff5f5',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 14,
    marginVertical: 10,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rejectionIconWrap: {
    marginRight: 9,
  },
  rejectionTitleBlock: {
    flex: 1,
  },
  rejectionEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 1,
  },
  rejectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#991b1b',
  },
  rejectionReasonHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7f1d1d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  rejectionMessage: {
    fontSize: 13,
    color: '#1f2937',
    lineHeight: 19,
    fontWeight: '600',
    backgroundColor: '#ffffff',
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  rejectionAdvice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 6,
  },
  rejectionAdviceText: {
    flex: 1,
    fontSize: 11.5,
    color: '#6b7280',
    lineHeight: 16,
    fontWeight: '600',
  },
  cardRejectionSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fee2e2',
    marginVertical: 6,
    gap: 5,
  },
  cardRejectionSnippetText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#b91c1c',
    lineHeight: 15,
  },

  // Bottom Spacer to prevent content clipping by bottom nav
  bottomSpacer: {
    height: 120,
  },
});

export default StatusScreen;
