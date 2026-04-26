import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../utils/firebase';
import { getCurrentLocation, getAddressFromCoordinates } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

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
    description: 'Fights or violent encounters',
  },
  {
    id: 'domestic_violence',
    label: 'Domestic Violence',
    icon: '🏠',
    severity: 'high',
    description: 'Household abuse cases',
  },
  {
    id: 'traffic_accident',
    label: 'Traffic Accidents',
    icon: '🚑',
    severity: 'high',
    description: 'Road collisions or injuries',
  },
  {
    id: 'illegal_weapons',
    label: 'Illegal Weapons',
    icon: '⚠️',
    severity: 'high',
    description: 'Firearms or deadly weapons',
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
    description: 'Noise, conflict, or riots',
  },
  {
    id: 'suspicious_activity',
    label: 'Suspicious Activity / Persons',
    icon: '👀',
    severity: 'medium',
    description: 'Unusual behavior or threats',
  },
  {
    id: 'vandalism_property_damage',
    label: 'Vandalism / Property Damage',
    icon: '🧱',
    severity: 'low',
    description: 'Damage or defacing property',
  },
];

const REPORTING_OPTIONS = [
  {
    id: 'victim',
    label: 'Victim',
    description: 'I was directly affected by this incident.',
    icon: '👤',
  },
  {
    id: 'witness',
    label: 'Witness',
    description: 'I saw or heard the incident happen.',
    icon: '👁️',
  },
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

const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;

const getSeverityFromType = (type) => {
  return INCIDENT_TYPES.find((incidentType) => incidentType.id === type)?.severity || 'medium';
};

const getIncidentByType = (type) => {
  return INCIDENT_TYPES.find((incidentType) => incidentType.id === type);
};

const ReportIncidentScreen = ({ navigation }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [incidentType, setIncidentType] = useState('');
  const [reportingAs, setReportingAs] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    getLocationAutomatically();
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
      const currentLocation = await getCurrentLocation();
      if (currentLocation) {
        setLocation(currentLocation);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Denied', 'Camera roll permission is required to upload photos.', 'warning');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showAlert('Error', 'Unable to pick image. Please try again.', 'error');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Denied', 'Camera permission is required to take photos.', 'warning');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert('Error', 'Unable to take photo. Please try again.', 'error');
    }
  };

  const uploadImage = async (uri, userId, incidentId) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const storagePath = `incident-photos/${userId}/${incidentId}/${filename}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const validateStep = () => {
    if (currentStep === 1 && !incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return false;
    }

    if (currentStep === 2 && !reportingAs) {
      showAlert('Missing Information', 'Please select who you are reporting as.', 'warning');
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    if (!incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return;
    }
    if (!reportingAs) {
      showAlert('Missing Information', 'Please select who you are reporting as.', 'warning');
      return;
    }
    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      showAlert('Missing Information', 'Please provide a description.', 'warning');
      return;
    }
    if (trimmedDescription.length < DESCRIPTION_MIN_LENGTH) {
      showAlert(
        'Description Too Short',
        `Please enter at least ${DESCRIPTION_MIN_LENGTH} characters so the report can be submitted.`,
        'warning',
      );
      return;
    }
    if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
      showAlert(
        'Description Too Long',
        `Please keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`,
        'warning',
      );
      return;
    }

    let reportLocation = location;
    if (!reportLocation) {
      try {
        reportLocation = await getCurrentLocation();
        if (!reportLocation) {
          showAlert('Missing Information', 'Location is required. Please enable location services.', 'warning');
          return;
        }
        setLocation(reportLocation);
      } catch (error) {
        console.error('Error getting location:', error);
        showAlert('Error', 'Unable to get your location. Please try again.', 'error');
        return;
      }
    }

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

      const incidentData = {
        type: incidentType,
        typeLabel: selectedIncident?.label || incidentType,
        severity: selectedSeverity,
        reportingAs,
        description: trimmedDescription,
        location: {
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
          address: locationAddress,
        },
        status: 'under_review',
        timestamp: serverTimestamp(),
        clientTimestamp: new Date().toISOString(),
        reporterId: currentUser.uid,
      };

      const docRef = await addDoc(collection(db, 'incidents'), incidentData);

      if (image) {
        try {
          setUploading(true);
          const photoURL = await uploadImage(image, currentUser.uid, docRef.id);
          setUploading(false);

          await updateDoc(doc(db, 'incidents', docRef.id), {
            photoURL,
          });
        } catch (photoError) {
          console.error('Photo upload failed, but incident saved:', photoError);
          setUploading(false);
        }
      }

      showAlert(
        'Report Submitted',
        'Your report has been submitted securely. Your identity remains protected.',
        'success',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      console.error('Error submitting incident:', error);
      showAlert('Error', 'Failed to submit incident. Please try again.', 'error');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
              <Text style={styles.closeButtonText}>x</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>Report Incident</Text>
          <Text style={styles.headerSubtitle}>Classify the event, confirm your role, and submit details for review.</Text>
          <View style={styles.progressContainer}>
            <View style={styles.stepsRow}>
              {[1, 2, 3].map((step) => (
                <View key={step} style={styles.stepWrapper}>
                  <View
                    style={[
                      styles.stepCircle,
                      currentStep >= step && styles.stepCircleActive,
                      currentStep === step && styles.stepCircleCurrent,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepNumber,
                        currentStep >= step && styles.stepNumberActive,
                      ]}
                    >
                      {step}
                    </Text>
                  </View>
                  {step < 3 && (
                    <View
                      style={[
                        styles.stepLine,
                        currentStep > step && styles.stepLineActive,
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.stepLabel}>
              {currentStep === 1 ? 'Incident Type' : currentStep === 2 ? 'Reporting Role' : 'Details and Evidence'}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {currentStep === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Select incident category</Text>

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
                      onPress={() => setIncidentType(type.id)}
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
                      <Text
                        style={[
                          styles.incidentTypeLabel,
                          isSelected && styles.incidentTypeLabelSelected,
                        ]}
                        numberOfLines={2}
                      >
                        {type.label}
                      </Text>
                      <Text style={styles.incidentTypeDescription} numberOfLines={2}>
                        {type.description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Who is reporting?</Text>
              <Text style={styles.stepSubtitle}>This helps responders interpret the details while keeping your account protected.</Text>

              <View style={styles.reportingAsContainer}>
                {REPORTING_OPTIONS.map((option) => {
                  const isSelected = reportingAs === option.id;

                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.reportingAsButton,
                        isSelected && styles.reportingAsButtonSelected,
                      ]}
                      onPress={() => setReportingAs(option.id)}
                      activeOpacity={0.86}
                    >
                      <View
                        style={[
                          styles.reportingIconBadge,
                          isSelected && styles.reportingIconBadgeSelected,
                        ]}
                      >
                        <Text style={styles.reportingIconText}>{option.icon}</Text>
                      </View>
                      <Text
                        style={[
                          styles.reportingAsLabel,
                          isSelected && styles.reportingAsLabelSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text style={styles.reportingAsDescription}>{option.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <View style={styles.summaryPanel}>
                <View>
                  <Text style={styles.summaryLabel}>Selected incident</Text>
                  <Text style={styles.summaryTitle}>{selectedIncident?.label || 'Incident'}</Text>
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

              <Text style={styles.stepTitle}>Describe what happened</Text>
              <TextInput
                style={styles.descriptionInput}
                placeholder="Include what happened, who was involved, and visible risks..."
                placeholderTextColor="#9ca3af"
                value={description}
                onChangeText={setDescription}
                maxLength={DESCRIPTION_MAX_LENGTH}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              <Text style={styles.photoTitle}>Evidence photo</Text>
              {image ? (
                <View style={styles.imageContainer}>
                  <Image source={{ uri: image }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={() => setImage(null)}>
                    <Text style={styles.removeImageText}>x</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoButtonsContainer}>
                  <TouchableOpacity style={styles.photoActionButton} onPress={takePhoto}>
                    <Text style={styles.photoActionText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoActionButton} onPress={pickImage}>
                    <Text style={styles.photoActionText}>Choose Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Reports are sent with your location and selected severity. Your identity is protected from public views.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.spacer} />
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, styles.backButton]} onPress={handleBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          {currentStep < 3 ? (
            <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={handleNext}>
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#ffffff" />
                  <Text style={styles.submitButtonText}>
                    {uploading ? 'Uploading...' : 'Submitting...'}
                  </Text>
                </>
              ) : (
                <Text style={styles.submitButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

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
    paddingTop: 42,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 6,
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
    fontSize: 25,
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
  scrollView: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  stepCircleActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  stepCircleCurrent: {
    borderColor: '#991b1b',
    borderWidth: 3,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6b7280',
  },
  stepNumberActive: {
    color: '#ffffff',
  },
  stepLine: {
    width: 42,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 5,
  },
  stepLineActive: {
    backgroundColor: '#dc2626',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7f1d1d',
    textAlign: 'center',
  },
  stepContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sectionHeadingRow: {
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 14,
  },
  stepSubtitle: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 16,
  },
  incidentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  incidentTypeButton: {
    width: '48.5%',
    minHeight: 84,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 9,
    marginBottom: 8,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 2,
  },
  incidentTypeButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fff7f7',
  },
  incidentIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  incidentIconBadgeSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  incidentTypeIcon: {
    fontSize: 16,
  },
  incidentTypeLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 3,
  },
  incidentTypeLabelSelected: {
    color: '#991b1b',
  },
  incidentTypeDescription: {
    color: '#6b7280',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  reportingAsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  reportingAsButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 18,
    padding: 18,
    minHeight: 168,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  reportingAsButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fff7f7',
  },
  reportingIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reportingIconBadgeSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  reportingIconText: {
    fontSize: 22,
  },
  reportingAsLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  reportingAsLabelSelected: {
    color: '#991b1b',
  },
  reportingAsDescription: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  summaryPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fee2e2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryLabel: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    maxWidth: 220,
  },
  summarySeverityPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  summarySeverityText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  descriptionInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    color: '#111827',
    fontSize: 14,
    minHeight: 132,
    textAlignVertical: 'top',
    marginBottom: 24,
    fontWeight: '600',
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
  },
  photoButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  photoActionButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  photoActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#dc2626',
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  previewImage: {
    width: '100%',
    height: 240,
    borderRadius: 16,
  },
  removeImageButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#dc2626',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: -2,
  },
  infoBox: {
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 15,
    marginTop: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#7f1d1d',
    fontWeight: '700',
    lineHeight: 20,
  },
  spacer: {
    height: 108,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#fee2e2',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  backButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#991b1b',
  },
  nextButton: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#fca5a5',
    opacity: 0.8,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
});

export default ReportIncidentScreen;
