import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import { getCurrentLocation, getAddressFromCoordinates } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

// Default location (Valenzuela City center)
const DEFAULT_LOCATION = {
  latitude: 14.6991,
  longitude: 120.9820,
};

// Severity mapping for each incident type
const INCIDENT_SEVERITY_MAP = {
  'Theft': 'medium',
  'Vandalism': 'low',
  'Murder': 'high',
  'Drugs': 'high',
  'Human Trafficking': 'high',
  'Kidnapping': 'high',
  'Physical Injury': 'high',
  'Carjacking': 'high',
};

// Severity colors and labels
const SEVERITY_CONFIG = {
  'high': { color: '#dc2626', label: 'High - Critical' },
  'medium': { color: '#f59e0b', label: 'Medium - Important' },
  'low': { color: '#10b981', label: 'Low - Minor' },
};

const SOSReportScreen = ({ navigation, route }) => {
  const passedLocation = route?.params?.userLocation;
  
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('');
  const [reportingAs, setReportingAs] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(passedLocation || null);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  // Auto-get location if not provided
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

  const getLocationAutomatically = async () => {
    try {
      const location = await getCurrentLocation();
      if (location) {
        setCurrentLocation(location);
        console.log('Location obtained:', location);
      } else {
        // Use default location if unable to get actual location
        console.log('Using default location');
        setCurrentLocation(DEFAULT_LOCATION);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // Use default location as fallback
      setCurrentLocation(DEFAULT_LOCATION);
    }
  };

  // Handle incident type change and auto-set severity
  const handleIncidentTypeChange = (type) => {
    setIncidentType(type);
    const autoSeverity = INCIDENT_SEVERITY_MAP[type] || 'medium';
    setSeverity(autoSeverity);
  };

  const incidentTypes = [
    'Theft',
    'Vandalism',
    'Murder',
    'Drugs',
    'Human Trafficking',
    'Kidnapping',
    'Physical Injury',
    'Carjacking',
  ];

  const reportingAsOptions = ['Victim', 'Witness'];

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

  const handleSubmit = async () => {
    // Validation
    if (!incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return;
    }
    if (!reportingAs) {
      showAlert('Missing Information', 'Please select your reporting status.', 'warning');
      return;
    }

    // Wait for location to be ready
    if (locationLoading) {
      showAlert('Please Wait', 'Getting your location... Please try again in a moment.', 'warning');
      return;
    }

    // Ensure location is set (use default if not)
    if (!currentLocation) {
      setCurrentLocation(DEFAULT_LOCATION);
    }

    setLoading(true);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        showAlert('Error', 'You must be logged in to report an incident.', 'error');
        setLoading(false);
        return;
      }

      // Create incident document - use current location or default
      const reportLocation = currentLocation || DEFAULT_LOCATION;
      
      if (!reportLocation.latitude || !reportLocation.longitude) {
        showAlert('Error', 'Unable to determine location. Please check your location settings.', 'error');
        setLoading(false);
        return;
      }

      // Get address from coordinates
      let locationAddress = 'Valenzuela City, Philippines';
      try {
        const address = await getAddressFromCoordinates(reportLocation.latitude, reportLocation.longitude);
        if (address) {
          locationAddress = address;
        }
      } catch (error) {
        console.error('Error getting address:', error);
        // Continue with default address
      }
      
      const incidentData = {
        type: incidentType,
        severity: severity,
        description: description.trim() || '',
        reportingAs: reportingAs,
        location: {
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
          address: locationAddress,
        },
        status: 'under_review',
        timestamp: serverTimestamp(),
        reporterId: currentUser.uid,
        isSOSReport: true, // Mark as SOS report for relaxed validation
      };

      await addDoc(collection(db, 'incidents'), incidentData);

      showAlert(
        'Report Submitted',
        'Your incident has been reported successfully. Emergency services have been notified. Your identity is protected.',
        'success',
        [
          {
            text: 'OK',
            onPress: () => {
              hideAlert();
              resetForm();
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting SOS report:', error);
      showAlert('Error', 'Failed to submit report. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIncidentType('');
    setSeverity('');
    setReportingAs('');
    setDescription('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Text style={styles.warningIcon}>!</Text>
            </View>
            <Text style={styles.headerTitle}>SOS Report</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
              <Text style={styles.closeIcon}>X</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Incident Type Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Incident Type</Text>
              <View style={styles.gridContainer}>
                {incidentTypes.map((type, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.gridButton,
                      incidentType === type && styles.gridButtonSelected,
                    ]}
                    onPress={() => handleIncidentTypeChange(type)}
                  >
                    <Text
                      style={[
                        styles.gridButtonText,
                        incidentType === type && styles.gridButtonTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Severity Section */}
            {incidentType && (
              <View style={styles.section}>
                <Text style={styles.severityLabel}>AUTOMATICALLY SEVERITY</Text>
                <View style={styles.severityContainer}>
                  <Text style={[
                    styles.severityText,
                    severity === 'high' && styles.severityHigh,
                    severity === 'medium' && styles.severityMedium,
                    severity === 'low' && styles.severityLow,
                  ]}>
                    {severity ? severity.toUpperCase() : 'MEDIUM'}
                  </Text>
                </View>
              </View>
            )}

            {/* Reporting As Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>I'm reporting as</Text>
              <View style={styles.reportingContainer}>
                {reportingAsOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.reportingButton,
                      reportingAs === option && styles.reportingButtonSelected,
                    ]}
                    onPress={() => setReportingAs(option)}
                  >
                    <Text
                      style={[
                        styles.reportingButtonText,
                        reportingAs === option && styles.reportingButtonTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Description Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <TextInput
                style={styles.descriptionInput}
                placeholder="Describe what happened in detail..."
                placeholderTextColor="#ccc"
                multiline={true}
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
                editable={!loading}
              />
            </View>

            {/* Location Status */}
            <View style={styles.section}>
              {locationLoading ? (
                <View style={styles.locationStatus}>
                  <ActivityIndicator color="#dc2626" size="small" />
                  <Text style={styles.locationStatusText}>Getting your location...</Text>
                </View>
              ) : (
                <View style={styles.locationStatus}>
                  <Text style={styles.locationStatusText}>Location acquired</Text>
                </View>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (loading || locationLoading) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading || locationLoading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>

            {/* Info Box */}
            <View style={styles.infoContainer}>
              <Text style={styles.infoIcon}>i</Text>
              <Text style={styles.infoText}>
                Your report will be submitted anonymously to protect your identity. Only essential information will be shared with authorities.
              </Text>
            </View>

            <View style={styles.bottomSpacing} />
          </ScrollView>
        </View>
      </View>

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff1f2',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    maxHeight: '85%',
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    backgroundColor: '#ff1238',
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningIcon: {
    fontSize: 22,
    color: '#ff1238',
    fontWeight: '900',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0.8,
    flex: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  gridButton: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridButtonSelected: {
    backgroundColor: '#fff1f2',
    borderColor: '#ff1238',
  },
  gridButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  gridButtonTextSelected: {
    color: '#ff1238',
    fontWeight: '900',
  },
  severityLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  severityContainer: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#fff1f2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  severityText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.5,
  },
  severityHigh: {
    color: '#ff1238',
  },
  severityMedium: {
    color: '#f59e0b',
  },
  severityLow: {
    color: '#10b981',
  },
  reportingContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  reportingButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportingButtonSelected: {
    backgroundColor: '#fff1f2',
    borderColor: '#ff1238',
  },
  reportingButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  reportingButtonTextSelected: {
    color: '#ff1238',
    fontWeight: '900',
  },
  descriptionInput: {
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: '#1f2937',
    backgroundColor: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
    fontFamily: 'System',
  },
  locationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff1f2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 10,
  },
  locationStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff1238',
  },
  submitButton: {
    backgroundColor: '#ff1238',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    shadowColor: '#ff1238',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 10,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoContainer: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff1238',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  bottomSpacing: {
    height: 20,
  },
});

export default SOSReportScreen;
