import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import CustomAlert from './CustomAlert';

const SOSReportModal = ({ visible, onClose, userLocation }) => {
  const [incidentType, setIncidentType] = useState('');
  const [reportingAs, setReportingAs] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

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
    if (!description.trim()) {
      showAlert('Missing Information', 'Please provide a description of the incident.', 'warning');
      return;
    }
    if (!userLocation) {
      showAlert('Missing Information', 'Location is required. Please enable location services.', 'warning');
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

      // Create incident document
      const incidentData = {
        type: incidentType,
        description: description.trim(),
        reportingAs: reportingAs,
        location: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        },
        status: 'under_review',
        timestamp: serverTimestamp(),
        reporterId: currentUser.uid,
        isSOSReport: true, // Mark as SOS report
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
              onClose();
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
    setReportingAs('');
    setDescription('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerContent}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                  <Text style={styles.headerTitle}>Report Incident</Text>
                </View>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={handleClose}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Incident Type Section */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Incident Type</Text>
                <View style={styles.buttonGrid}>
                  {incidentTypes.map((type, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.typeButton,
                        incidentType === type && styles.typeButtonSelected,
                      ]}
                      onPress={() => setIncidentType(type)}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          incidentType === type && styles.typeButtonTextSelected,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Severity Note */}
              <View style={styles.severityNote}>
                <Text style={styles.severityNoteText}>
                  DITO LALABAS AUTOMATICALLY YUNG SEVERITY
                </Text>
              </View>

              {/* Reporting As Section */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>I'm reporting as</Text>
                <View style={styles.reportingAsRow}>
                  {reportingAsOptions.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.reportingAsButton,
                        reportingAs === option && styles.reportingAsButtonSelected,
                      ]}
                      onPress={() => setReportingAs(option)}
                    >
                      <Text
                        style={[
                          styles.reportingAsButtonText,
                          reportingAs === option && styles.reportingAsButtonTextSelected,
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
                <Text style={styles.sectionLabel}>Description</Text>
                <TextInput
                  style={styles.descriptionInput}
                  placeholder="Describe what happened in detail..."
                  placeholderTextColor="#999"
                  multiline={true}
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                  editable={!loading}
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Report</Text>
                )}
              </TouchableOpacity>

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Text style={styles.infoIcon}>ℹ️</Text>
                <Text style={styles.infoText}>
                  Your report will be submitted anonymously to protect your identity. Only essential information will be shared with authorities.
                </Text>
              </View>

              {/* Bottom Spacing */}
              <View style={styles.bottomSpacing} />
            </View>
          </ScrollView>
        </View>
      </Modal>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  header: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  warningIcon: {
    fontSize: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeButtonSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  typeButtonTextSelected: {
    color: '#fff',
  },
  severityNote: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  severityNoteText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  reportingAsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reportingAsButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportingAsButtonSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  reportingAsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  reportingAsButtonTextSelected: {
    color: '#fff',
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1f2937',
    minHeight: 100,
    textAlignVertical: 'top',
    fontFamily: 'System',
  },
  submitButton: {
    marginHorizontal: 20,
    marginVertical: 16,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoBox: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    gap: 10,
  },
  infoIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  bottomSpacing: {
    height: 10,
  },
});

export default SOSReportModal;
