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
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../utils/firebase';
import { getReportEligibility } from '../utils/auth';
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
const CONFIRM_REPORT_MESSAGE =
  'By continuing, you declare that this report is true and accurate.\n\nFalse reporting may result in penalties, including account suspension and possible legal action under Philippine law.';
const HEADER_TOP_PADDING = (StatusBar.currentHeight || 24) + 16;

const getSeverityFromType = (type) => {
  return INCIDENT_TYPES.find((incidentType) => incidentType.id === type)?.severity || 'medium';
};

const getIncidentByType = (type) => {
  return INCIDENT_TYPES.find((incidentType) => incidentType.id === type);
};

const getIncidentIconName = (type) => {
  const icons = {
    robbery_holdup: 'alert-circle-outline',
    physical_assault_injury: 'medkit-outline',
    domestic_violence: 'home-outline',
    traffic_accident: 'car-outline',
    illegal_weapons: 'shield-outline',
    theft_snatching: 'bag-handle-outline',
    drug_related_activity: 'flame-outline',
    public_disturbance: 'megaphone-outline',
    suspicious_activity: 'eye-outline',
    vandalism_property_damage: 'construct-outline',
  };
  return icons[type] || 'alert-outline';
};

const getReportingIconName = (role) => {
  const icons = {
    victim: 'person-circle-outline',
    witness: 'eye-outline',
  };
  return icons[role] || 'help-circle-outline';
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
    autoCloseDelay: 5000,
  });

  const selectedIncident = getIncidentByType(incidentType);
  const selectedReportingOption = REPORTING_OPTIONS.find((option) => option.id === reportingAs);
  const selectedSeverity = getSeverityFromType(incidentType);
  const severityStyle = SEVERITY_CONFIG[selectedSeverity];

  useEffect(() => {
    getLocationAutomatically();
  }, []);

  const showAlert = (title, message, type = 'info', buttons = [], autoCloseDelay = 5000) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      buttons,
      autoCloseDelay,
    });
  };

  const hideAlert = () => {
    setAlertConfig({ ...alertConfig, visible: false });
  };

  const showReportEligibilityAlert = (eligibility) => {
    showAlert(
      eligibility.title || 'Reporting Unavailable',
      eligibility.message || 'Your account cannot submit reports right now.',
      'warning',
      [],
      5000,
    );
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

  const validateReportDetails = () => {
    if (!incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return false;
    }
    if (!reportingAs) {
      showAlert('Missing Information', 'Please select who you are reporting as.', 'warning');
      return false;
    }
    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      showAlert('Missing Information', 'Please provide a description.', 'warning');
      return false;
    }
    if (trimmedDescription.length < DESCRIPTION_MIN_LENGTH) {
      showAlert(
        'Description Too Short',
        `Please enter at least ${DESCRIPTION_MIN_LENGTH} characters so the report can be submitted.`,
        'warning',
      );
      return false;
    }
    if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
      showAlert(
        'Description Too Long',
        `Please keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`,
        'warning',
      );
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (!validateReportDetails()) {
      return;
    }

    showAlert(
      'Confirm Report Submission',
      CONFIRM_REPORT_MESSAGE,
      'warning',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          onPress: handleConfirmedSubmit,
        },
      ],
      0,
    );
  };

  const handleConfirmedSubmit = async () => {
    const trimmedDescription = description.trim();

    setLoading(true);

    let eligibility;
    try {
      eligibility = await getReportEligibility();
    } catch (error) {
      console.error('Error checking report eligibility:', error);
      showAlert('Error', 'Unable to check your account. Please try again.', 'error');
      setLoading(false);
      return;
    }

    if (!eligibility.allowed) {
      showReportEligibilityAlert(eligibility);
      setLoading(false);
      return;
    }

    let reportLocation = location;
    if (!reportLocation) {
      try {
        reportLocation = await getCurrentLocation();
        if (!reportLocation) {
          showAlert('Missing Information', 'Location is required. Please enable location services.', 'warning');
          setLoading(false);
          return;
        }
        setLocation(reportLocation);
      } catch (error) {
        console.error('Error getting location:', error);
        showAlert('Error', 'Unable to get your location. Please try again.', 'error');
        setLoading(false);
        return;
      }
    }

    if (!reportLocation.latitude || !reportLocation.longitude) {
      showAlert('Error', 'Unable to determine location. Please check your location settings.', 'error');
      setLoading(false);
      return;
    }

    try {
      const currentUser = eligibility.user;

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
        reportedAt: serverTimestamp(),
        clientTimestamp: new Date().toISOString(),
        reporterId: currentUser.uid,
        reporterEmailVerified: currentUser.emailVerified === true,
        reporterAccountStatus: eligibility.profile?.accountStatus || 'active',
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
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerEyebrow}>Community report</Text>
            <Text style={styles.headerTitle}>Report Incident</Text>
            <Text style={styles.headerSubtitle}>Classify the event, confirm your role, and submit details for review.</Text>
          </View>
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
              <View style={styles.stepHeading}>
                <View style={styles.stepHeadingIcon}>
                  <Ionicons name="layers-outline" size={18} color="#dc2626" />
                </View>
                <View style={styles.stepHeadingCopy}>
                  <Text style={styles.stepHeadingTitle}>Select incident category</Text>
                  <Text style={styles.stepHeadingSubtitle}>Choose the option that best matches what happened.</Text>
                </View>
              </View>

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
                        <Ionicons
                          name={getIncidentIconName(type.id)}
                          size={22}
                          color={isSelected ? '#ffffff' : '#b91c1c'}
                        />
                      </View>
                      {isSelected && (
                        <View style={styles.incidentSelectedCheck}>
                          <Ionicons name="checkmark" size={13} color="#ffffff" />
                        </View>
                      )}
                      <View style={styles.incidentTypeCopy}>
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
                      </View>
                      <View
                        style={[
                          styles.incidentSeverityMini,
                          {
                            backgroundColor: SEVERITY_CONFIG[type.severity].backgroundColor,
                            borderColor: SEVERITY_CONFIG[type.severity].borderColor,
                          },
                        ]}
                      >
                        <Text style={[styles.incidentSeverityMiniText, { color: SEVERITY_CONFIG[type.severity].color }]}>
                          {SEVERITY_CONFIG[type.severity].label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <View style={styles.stepHeading}>
                <View style={styles.stepHeadingIcon}>
                  <Ionicons name="id-card-outline" size={18} color="#dc2626" />
                </View>
                <View style={styles.stepHeadingCopy}>
                  <Text style={styles.stepHeadingTitle}>Who is reporting?</Text>
                  <Text style={styles.stepHeadingSubtitle}>This helps responders interpret the details while keeping your account protected.</Text>
                </View>
              </View>

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
                      <View style={styles.reportingCardHeader}>
                        <View
                          style={[
                            styles.reportingIconBadge,
                            isSelected && styles.reportingIconBadgeSelected,
                          ]}
                        >
                          <Ionicons
                            name={getReportingIconName(option.id)}
                            size={25}
                            color={isSelected ? '#ffffff' : '#b91c1c'}
                          />
                        </View>
                        <View style={styles.reportingTitleBlock}>
                          <Text
                            style={[
                              styles.reportingAsLabel,
                              isSelected && styles.reportingAsLabelSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.reportingAsTag}>
                        {option.id === 'victim' ? 'Directly affected' : 'Observed incident'}
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
              <View style={styles.stepHeading}>
                <View style={styles.stepHeadingIcon}>
                  <Ionicons name="document-text-outline" size={18} color="#dc2626" />
                </View>
                <View style={styles.stepHeadingCopy}>
                  <Text style={styles.stepHeadingTitle}>Details and evidence</Text>
                  <Text style={styles.stepHeadingSubtitle}>Add useful context and attach a photo if you have one.</Text>
                </View>
              </View>

              <View style={styles.summaryPanel}>
                <View style={styles.summaryMain}>
                  <View style={[styles.summaryIconBadge, { backgroundColor: severityStyle.backgroundColor }]}>
                    <Ionicons
                      name={getIncidentIconName(selectedIncident?.id)}
                      size={22}
                      color={severityStyle.color}
                    />
                  </View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryLabel}>Selected incident</Text>
                    <Text style={styles.summaryTitle}>{selectedIncident?.label || 'Incident'}</Text>
                    <Text style={styles.summaryMeta}>
                      Reporting as {selectedReportingOption?.label || 'Reporter'}
                    </Text>
                  </View>
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

              <View style={styles.detailCard}>
                <View style={styles.fieldHeader}>
                  <View>
                    <Text style={styles.fieldTitle}>Describe what happened</Text>
                    <Text style={styles.fieldHint}>What, where, who, and any visible risk.</Text>
                  </View>
                  <Text style={styles.characterCount}>
                    {description.length}/{DESCRIPTION_MAX_LENGTH}
                  </Text>
                </View>
                <TextInput
                  style={styles.descriptionInput}
                  placeholder="Example: A person snatched a bag near the main road and ran toward..."
                  placeholderTextColor="#9ca3af"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.evidenceHeader}>
                <View>
                  <Text style={styles.photoTitle}>Evidence photo</Text>
                  <Text style={styles.photoSubtitle}>Optional, but helpful for verification.</Text>
                </View>
                <View style={styles.optionalPill}>
                  <Text style={styles.optionalPillText}>Optional</Text>
                </View>
              </View>
              {image ? (
                <View style={styles.imageContainer}>
                  <Image source={{ uri: image }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={() => setImage(null)}>
                    <Ionicons name="close" size={19} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.imageAttachedPill}>
                    <Ionicons name="image-outline" size={14} color="#ffffff" />
                    <Text style={styles.imageAttachedText}>Photo attached</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.photoButtonsContainer}>
                  <TouchableOpacity style={styles.photoActionButton} onPress={takePhoto}>
                    <Ionicons name="camera-outline" size={21} color="#dc2626" />
                    <Text style={styles.photoActionText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoActionButton} onPress={pickImage}>
                    <Ionicons name="image-outline" size={21} color="#dc2626" />
                    <Text style={styles.photoActionText}>Choose Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.infoBox}>
                <View style={styles.infoIconBadge}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#991b1b" />
                </View>
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
        autoCloseDelay={alertConfig.autoCloseDelay}
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
    backgroundColor: '#b91c1c',
    paddingTop: HEADER_TOP_PADDING,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
  },
  headerTitleBlock: {
    marginBottom: 14,
  },
  headerEyebrow: {
    color: '#fee2e2',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },
  headerSubtitle: {
    color: '#fff1f2',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 7,
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
    borderColor: '#fee2e2',
    borderRadius: 18,
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
    fontSize: 14,
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
    fontSize: 14,
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
  stepHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  stepHeadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginRight: 12,
  },
  stepHeadingCopy: {
    flex: 1,
  },
  stepHeadingTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  stepHeadingSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 14,
  },
  stepSubtitle: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 16,
  },
  incidentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  incidentTypeButton: {
    width: '48.5%',
    minHeight: 154,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 18,
    padding: 14,
    marginBottom: 0,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    position: 'relative',
    justifyContent: 'space-between',
  },
  incidentTypeButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fff7f7',
  },
  incidentIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  incidentIconBadgeSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  incidentSelectedCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  incidentTypeCopy: {
    flex: 1,
  },
  incidentTypeLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 17,
  },
  incidentTypeLabelSelected: {
    color: '#991b1b',
  },
  incidentTypeDescription: {
    color: '#6b7280',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  incidentSeverityMini: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 12,
  },
  incidentSeverityMiniText: {
    fontSize: 9,
    fontWeight: '900',
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
    padding: 16,
    minHeight: 172,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
    position: 'relative',
  },
  reportingAsButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fff7f7',
  },
  reportingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingRight: 18,
  },
  reportingIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  reportingIconBadgeSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  reportingTitleBlock: {
    flex: 1,
    marginLeft: 12,
    height: 52,
    justifyContent: 'center',
  },
  reportingAsLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 20,
    textAlign: 'center',
  },
  reportingAsLabelSelected: {
    color: '#991b1b',
  },
  reportingAsTag: {
    alignSelf: 'stretch',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  reportingAsDescription: {
    color: '#6b7280',
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  summaryPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fee2e2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  summaryMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  summaryIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryLabel: {
    color: '#991b1b',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  summaryMeta: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  summarySeverityPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summarySeverityText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 18,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  fieldTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  fieldHint: {
    color: '#6b7280',
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
  },
  characterCount: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
  },
  descriptionInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    color: '#111827',
    fontSize: 14,
    minHeight: 150,
    textAlignVertical: 'top',
    fontWeight: '600',
    lineHeight: 20,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  photoSubtitle: {
    color: '#6b7280',
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
  },
  optionalPill: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionalPillText: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '900',
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
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  photoActionText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#dc2626',
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#111827',
  },
  previewImage: {
    width: '100%',
    height: 240,
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
  imageAttachedPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  imageAttachedText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  infoBox: {
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 18,
    padding: 15,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  infoIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
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
