import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import { getCurrentLocation, getAddressFromCoordinates } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

const DEFAULT_LOCATION = {
  latitude: 14.6991,
  longitude: 120.9820,
};

const INCIDENT_TYPES = [
  {
    id: 'robbery_holdup',
    label: 'Robbery / Hold-up',
    icon: '🚨',
    severity: 'high',
    description: 'Force or intimidation',
  },
  {
    id: 'physical_assault_injury',
    label: 'Physical Assault / Injury',
    icon: '🤕',
    severity: 'high',
    description: 'Fight or violent injury',
  },
  {
    id: 'domestic_violence',
    label: 'Domestic Violence',
    icon: '🏠',
    severity: 'high',
    description: 'Household abuse',
  },
  {
    id: 'traffic_accident',
    label: 'Traffic Accidents',
    icon: '🚑',
    severity: 'high',
    description: 'Collision or injured person',
  },
  {
    id: 'illegal_weapons',
    label: 'Illegal Weapons',
    icon: '⚠️',
    severity: 'high',
    description: 'Firearm or deadly weapon',
  },
  {
    id: 'theft_snatching',
    label: 'Theft / Snatching',
    icon: '🎒',
    severity: 'medium',
    description: 'Phone or bag snatching',
  },
  {
    id: 'drug_related_activity',
    label: 'Drug-Related Activity',
    icon: '💊',
    severity: 'medium',
    description: 'Illegal selling or usage',
  },
  {
    id: 'public_disturbance',
    label: 'Public Disturbance',
    icon: '📢',
    severity: 'medium',
    description: 'Noise, conflict, riot',
  },
  {
    id: 'suspicious_activity',
    label: 'Suspicious Activity',
    icon: '👀',
    severity: 'medium',
    description: 'Unusual behavior',
  },
  {
    id: 'vandalism_property_damage',
    label: 'Vandalism / Damage',
    icon: '🧱',
    severity: 'low',
    description: 'Property damage',
  },
];

const REPORTING_OPTIONS = [
  { id: 'witness', label: 'Witness' },
  { id: 'victim', label: 'Victim' },
];

const SEVERITY_CONFIG = {
  high: {
    label: 'High',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  medium: {
    label: 'Medium',
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  low: {
    label: 'Low',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
};

const getIncidentByType = (type) => {
  return INCIDENT_TYPES.find((incidentType) => incidentType.id === type);
};

const getSeverityFromType = (type) => {
  return getIncidentByType(type)?.severity || 'medium';
};

const SOSReportScreen = ({ navigation, route }) => {
  const passedLocation = route?.params?.userLocation;

  const [incidentType, setIncidentType] = useState('');
  const [reportingAs, setReportingAs] = useState('witness');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(passedLocation || null);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const selectedIncident = getIncidentByType(incidentType);
  const selectedSeverity = getSeverityFromType(incidentType);
  const severityStyle = SEVERITY_CONFIG[selectedSeverity];

  useEffect(() => {
    const initializeLocation = async () => {
      try {
        if (!passedLocation) {
          await getLocationAutomatically();
        }
      } finally {
        setLocationLoading(false);
      }
    };

    initializeLocation();
  }, []);

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

  const getLocationAutomatically = async () => {
    try {
      const location = await getCurrentLocation();
      setCurrentLocation(location || DEFAULT_LOCATION);
    } catch (error) {
      console.error('Error getting location:', error);
      setCurrentLocation(DEFAULT_LOCATION);
    }
  };

  const handleIncidentTypeChange = (type) => {
    setIncidentType(type);
  };

  const handleSubmit = async () => {
    if (!incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return;
    }

    if (locationLoading) {
      showAlert('Please Wait', 'Getting your location. Please try again in a moment.', 'warning');
      return;
    }

    const reportLocation = currentLocation || DEFAULT_LOCATION;

    if (!reportLocation.latitude || !reportLocation.longitude) {
      showAlert('Error', 'Unable to determine location. Please check your location settings.', 'error');
      return;
    }

    setLoading(true);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        showAlert('Error', 'You must be logged in to report an incident.', 'error');
        setLoading(false);
        return;
      }

      let locationAddress = 'Valenzuela City, Philippines';
      try {
        const address = await getAddressFromCoordinates(reportLocation.latitude, reportLocation.longitude);
        if (address) {
          locationAddress = address;
        }
      } catch (error) {
        console.error('Error getting address:', error);
      }

      const safeDescription = description.trim() ||
        `SOS quick report: ${selectedIncident?.label || 'Incident'} reported via emergency flow.`;

      const incidentData = {
        type: incidentType,
        typeLabel: selectedIncident?.label || incidentType,
        severity: selectedSeverity,
        description: safeDescription,
        reportingAs,
        location: {
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
          address: locationAddress,
        },
        status: 'under_review',
        timestamp: serverTimestamp(),
        clientTimestamp: new Date().toISOString(),
        reporterId: currentUser.uid,
        isSOSReport: true,
      };

      await addDoc(collection(db, 'incidents'), incidentData);

      showAlert(
        'SOS Report Sent',
        'Your urgent report has been submitted with your current location.',
        'success',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      console.error('Error submitting SOS report:', error);
      showAlert('Error', 'Failed to submit SOS report. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <View style={styles.sosBadge}>
              <Text style={styles.sosBadgeText}>SOS</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
              <Text style={styles.closeButtonText}>x</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>Quick Emergency Report</Text>
          <Text style={styles.headerSubtitle}>Choose the incident, confirm your role, and send your location fast.</Text>
          <View style={styles.statusStrip}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {locationLoading ? 'Locking location...' : 'Location ready'}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.summaryPanel}>
              <View>
                <Text style={styles.summaryLabel}>Selected incident</Text>
                <Text style={styles.summaryTitle}>{selectedIncident?.label || 'Choose one below'}</Text>
              </View>
              <View
                style={[
                  styles.summarySeverityPill,
                  {
                    backgroundColor: severityStyle.backgroundColor,
                    borderColor: severityStyle.borderColor,
                  },
                ]}
              >
                <Text style={[styles.summarySeverityText, { color: severityStyle.color }]}>
                  {severityStyle.label}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Incident type</Text>
            <View style={styles.incidentTypeGrid}>
              {INCIDENT_TYPES.map((type) => {
                const isSelected = incidentType === type.id;

                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.incidentTypeButton,
                      isSelected && styles.incidentTypeButtonSelected,
                    ]}
                    onPress={() => handleIncidentTypeChange(type.id)}
                    activeOpacity={0.86}
                  >
                    <View
                      style={[
                        styles.incidentIconBadge,
                        isSelected && styles.incidentIconBadgeSelected,
                      ]}
                    >
                      <Text style={styles.incidentTypeIcon}>{type.icon}</Text>
                    </View>
                    <View style={styles.incidentTextWrap}>
                      <Text
                        style={[
                          styles.incidentTypeLabel,
                          isSelected && styles.incidentTypeLabelSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {type.label}
                      </Text>
                      <Text style={styles.incidentTypeDescription} numberOfLines={1}>
                        {type.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Reporting as</Text>
            <View style={styles.reportingContainer}>
              {REPORTING_OPTIONS.map((option) => {
                const isSelected = reportingAs === option.id;

                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.reportingButton,
                      isSelected && styles.reportingButtonSelected,
                    ]}
                    onPress={() => setReportingAs(option.id)}
                  >
                    <Text
                      style={[
                        styles.reportingButtonText,
                        isSelected && styles.reportingButtonTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Quick details</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Optional: add a short detail for responders..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
              editable={!loading}
              textAlignVertical="top"
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                SOS reports send your location immediately. Details are optional for faster reporting.
              </Text>
            </View>

            <View style={styles.bottomSpacing} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (loading || locationLoading) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading || locationLoading}
          >
            {loading ? (
              <>
                <ActivityIndicator color="#ffffff" />
                <Text style={styles.submitButtonText}>Sending...</Text>
              </>
            ) : (
              <Text style={styles.submitButtonText}>Send SOS Report</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

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
  headerContainer: {
    backgroundColor: '#dc2626',
    paddingTop: 34,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sosBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sosBadgeText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '800',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
  },
  headerSubtitle: {
    color: '#fff1f2',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 5,
    marginBottom: 12,
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  summaryPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#991b1b',
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '900',
  },
  summarySeverityPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  summarySeverityText: {
    fontSize: 12,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 10,
  },
  incidentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 16,
  },
  incidentTypeButton: {
    width: '48.5%',
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  incidentTypeButtonSelected: {
    backgroundColor: '#fef2f2',
    borderColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  incidentIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  incidentIconBadgeSelected: {
    backgroundColor: '#ffffff',
  },
  incidentTypeIcon: {
    fontSize: 17,
  },
  incidentTextWrap: {
    flex: 1,
  },
  incidentTypeLabel: {
    fontSize: 11,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 3,
  },
  incidentTypeLabelSelected: {
    color: '#991b1b',
  },
  incidentTypeDescription: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '600',
  },
  reportingContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  reportingButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  reportingButtonSelected: {
    backgroundColor: '#fef2f2',
    borderColor: '#dc2626',
  },
  reportingButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  reportingButtonTextSelected: {
    color: '#dc2626',
    fontWeight: '900',
  },
  descriptionInput: {
    minHeight: 76,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 16,
    padding: 12,
  },
  infoText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  bottomSpacing: {
    height: 96,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#fee2e2',
  },
  submitButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});

export default SOSReportScreen;
