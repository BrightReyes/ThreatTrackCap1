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
import * as Location from 'expo-location';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../utils/firebase';
import { getCurrentLocation, getAddressFromCoordinates } from '../utils/location';
import CustomAlert from '../components/CustomAlert';

const ReportIncidentScreen = ({ navigation }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [incidentType, setIncidentType] = useState('');
  const [reportingAs, setReportingAs] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const incidentTypes = [
    { id: 'theft', label: 'Theft', icon: '👜' },
    { id: 'murder', label: 'Murder', icon: '⚠️' },
    { id: 'physical_injury', label: 'Physical Injury', icon: '🤕' },
    { id: 'robbery', label: 'Robbery', icon: '💰' },
    { id: 'rape_sexual_abuse', label: 'Rape and Sexual Abuse', icon: '🚨' },
    { id: 'drugs', label: 'Drugs', icon: '💊' },
    { id: 'human_trafficking', label: 'Human Trafficking', icon: '🚫' },
    { id: 'kidnapping', label: 'Kidnapping', icon: '⛔' },
    { id: 'vandalism', label: 'Vandalism', icon: '🔨' },
    { id: 'sus_act', label: 'Sus Act', icon: '🔍' },
    { id: 'other', label: 'Other', icon: 'ℹ️' },
  ];

  useEffect(() => {
    getLocationAutomatically();
  }, []);

  const getLocationAutomatically = async () => {
    try {
      const location = await getCurrentLocation();
      if (location) {
        setLocation(location);
        console.log('Location obtained:', location);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // Location will be required at submit time, so we'll try again then
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
      // Match storage rules path: incident-photos/{userId}/{incidentId}/{filename}
      const storagePath = `incident-photos/${userId}/${incidentId}/${filename}`;
      const storageRef = ref(storage, storagePath);
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return;
    }
    if (!reportingAs) {
      showAlert('Missing Information', 'Please select who you are reporting as.', 'warning');
      return;
    }
    if (!description.trim()) {
      showAlert('Missing Information', 'Please provide a description.', 'warning');
      return;
    }

    // Get fresh location if not available
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
      
      // Get address from coordinates - COPY FROM SOS LOGIC
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
      
      // Create incident document first to get ID
      const incidentData = {
        type: incidentType,
        severity: getSeverityFromType(incidentType),
        reportingAs: reportingAs,
        description: description.trim(),
        location: {
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
          address: locationAddress,
        },
        status: 'under_review',
        timestamp: serverTimestamp(),
        reporterId: currentUser.uid,
      };

      const docRef = await addDoc(collection(db, 'incidents'), incidentData);
      
      // Upload photo if exists (don't fail submission if photo upload fails)
      if (image) {
        try {
          setUploading(true);
          const photoURL = await uploadImage(image, currentUser.uid, docRef.id);
          setUploading(false);
          
          // Update incident with photo URL
          await updateDoc(doc(db, 'incidents', docRef.id), {
            photoURL
          });
        } catch (photoError) {
          console.error('Photo upload failed, but incident saved:', photoError);
          setUploading(false);
          // Continue without photo
        }
      }

      showAlert(
        'Success',
        'Incident reported successfully! Your report has been submitted anonymously to protect your identity.',
        'success',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting incident:', error);
      showAlert('Error', 'Failed to submit incident. Please try again.', 'error');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !incidentType) {
      showAlert('Missing Information', 'Please select an incident type.', 'warning');
      return;
    }
    if (currentStep === 2 && !reportingAs) {
      showAlert('Missing Information', 'Please select who you are reporting as.', 'warning');
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const getSeverityFromType = (type) => {
    // Determine severity based on incident type
    const highSeverityTypes = ['murder', 'rape_sexual_abuse', 'human_trafficking', 'kidnapping'];
    const mediumSeverityTypes = ['physical_injury', 'robbery', 'drugs', 'theft'];
    const lowSeverityTypes = ['vandalism', 'sus_act', 'other'];

    if (highSeverityTypes.includes(type)) return 'high';
    if (mediumSeverityTypes.includes(type)) return 'medium';
    if (lowSeverityTypes.includes(type)) return 'low';
    return 'medium'; // Default to medium
  };

  return (
    <>
      <View style={styles.container}>
        {/* Header with Red Background */}
        <View style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View style={styles.headerIconBox}>
              <Text style={styles.headerIcon}>⚠️</Text>
            </View>
            <Text style={styles.headerTitle}>Report Incident</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Progress Indicator */}
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
              {currentStep === 1
                ? 'Incident Type'
                : currentStep === 2
                ? "I'm reporting as"
                : 'Description'}
            </Text>
          </View>

          {/* Step 1: Incident Type */}
          {currentStep === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Select Incident Type</Text>
              <View style={styles.incidentTypeGrid}>
                {incidentTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.incidentTypeButton,
                      incidentType === type.id && styles.incidentTypeButtonSelected,
                    ]}
                    onPress={() => setIncidentType(type.id)}
                  >
                    <Text style={styles.incidentTypeIcon}>{type.icon}</Text>
                    <Text style={styles.incidentTypeLabel}>{type.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Step 2: Reporting As */}
          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>I'm reporting as</Text>
              <View style={styles.reportingAsContainer}>
                <TouchableOpacity
                  style={[
                    styles.reportingAsButton,
                    reportingAs === 'victim' && styles.reportingAsButtonSelected,
                  ]}
                  onPress={() => setReportingAs('victim')}
                >
                  <Text style={styles.reportingAsIcon}>👤</Text>
                  <Text style={styles.reportingAsLabel}>Victim</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reportingAsButton,
                    reportingAs === 'witness' && styles.reportingAsButtonSelected,
                  ]}
                  onPress={() => setReportingAs('witness')}
                >
                  <Text style={styles.reportingAsIcon}>👁️</Text>
                  <Text style={styles.reportingAsLabel}>Witness</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Step 3: Description and Photo */}
          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Description</Text>
              <TextInput
                style={styles.descriptionInput}
                placeholder="Describe what happened in detail..."
                placeholderTextColor="#d1d5db"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              <Text style={styles.photoTitle}>Photo / Video</Text>
              {image ? (
                <View style={styles.imageContainer}>
                  <Image source={{ uri: image }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setImage(null)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoButtonsContainer}>
                  <TouchableOpacity
                    style={styles.photoActionButton}
                    onPress={takePhoto}
                  >
                    <Text style={styles.photoActionIcon}>📷</Text>
                    <Text style={styles.photoActionText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoActionButton}
                    onPress={pickImage}
                  >
                    <Text style={styles.photoActionIcon}>➕</Text>
                    <Text style={styles.photoActionText}>Add Video</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.infoBox}>
                <Text style={styles.infoIcon}>ℹ️</Text>
                <Text style={styles.infoText}>
                  Your report will be submitted anonymously to protect your identity. Only essential information will be shared with authorities.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.spacer} />
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.backButton]}
            onPress={handleBack}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          {currentStep < 3 ? (
            <TouchableOpacity
              style={[styles.button, styles.nextButton]}
              onPress={handleNext}
            >
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
    backgroundColor: '#f8f9fa',
  },
  headerContainer: {
    backgroundColor: '#dc2626',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBox: {
    position: 'absolute',
    left: 20,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stepWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  stepCircleActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  stepCircleCurrent: {
    borderColor: '#dc2626',
    borderWidth: 3,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },
  stepNumberActive: {
    color: '#ffffff',
  },
  stepLine: {
    width: 50,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 5,
  },
  stepLineActive: {
    backgroundColor: '#10b981',
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  stepContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  incidentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  incidentTypeButton: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  incidentTypeButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fef2f2',
  },
  incidentTypeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  incidentTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  reportingAsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportingAsButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  reportingAsButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fef2f2',
  },
  reportingAsIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  reportingAsLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  descriptionInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    color: '#111827',
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  photoButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  photoActionButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#dc2626',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  photoActionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  photoActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    lineHeight: 20,
  },
  spacer: {
    height: 100,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    backgroundColor: '#e5e7eb',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  nextButton: {
    backgroundColor: '#dc2626',
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#fca5a5',
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default ReportIncidentScreen;
