import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getReportEligibility, resendEmailVerification, acknowledgeFalseReportPolicy } from '../utils/auth';
import { getCurrentLocation, getAddressFromCoordinates } from '../utils/location';
import { withTimeout } from '../utils/async';
import CustomAlert from '../components/CustomAlert';
// [KEYBOARD-FIX] Auto-clicking / keyboard bug fix (see mobile/QA_FIX_LOG.md, Part 1).
import KeyboardAwareForm from '../components/KeyboardAwareForm';
import QuickDescriptionChips, { detectActiveQuickTags } from '../components/QuickDescriptionChips';

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
    severity: 'medium',
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
    severity: 'high',
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
const IMAGE_PICKER_OPTIONS = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [4, 3],
  quality: 0.85,
};
// Photo compression is unchanged from before the QA pass: the photo is still
// stored as inline base64 (free Spark plan, no Cloud Storage), capped at 650 KB
// by the isValidInlineEvidencePhoto Firestore rule. [QA-FIX #6] only moved WHERE
// it is stored (incident_evidence/{id} instead of inside the incident doc).
const MAX_INLINE_PHOTO_CHARS = 650 * 1024;
const INLINE_PHOTO_VARIANTS = [
  { width: 900, compress: 0.45 },
  { width: 720, compress: 0.35 },
  { width: 560, compress: 0.28 },
  { width: 420, compress: 0.22 },
];
// [QA-FIX #9] Max wait for the server to confirm the report write. After this
// the write stays queued in Firestore and is sent once the phone is back online.
const REPORT_WRITE_CONFIRM_TIMEOUT_MS = 15000;
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

const getImageContentType = (asset) => {
  if (asset?.mimeType && asset.mimeType.startsWith('image/')) {
    return asset.mimeType;
  }

  const uri = asset?.uri || '';
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const extensionMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };

  return extensionMap[extension] || 'image/jpeg';
};

const ReportIncidentScreen = ({ navigation }) => {
  // [QA-FIX #11] Bottom inset for the Back / Next / Submit bar.
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [incidentType, setIncidentType] = useState('');
  const [reportingAs, setReportingAs] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  // [QA-FIX #6] Guards against a second submit while one is running.
  const submittingRef = useRef(false);
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

  // [QA-FIX #13] Functional update so a newer alert opened from a button's
  // onPress (e.g. the photo-upload fallback) isn't overwritten.
  const hideAlert = useCallback(() => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  const showReportEligibilityAlert = (eligibility) => {
    if (eligibility?.needsEmailVerification) {
      showAlert(
        eligibility.title || 'Email Verification Required',
        eligibility.message || 'You have used your first-report grace period. Please verify your email before submitting additional reports.',
        'warning',
        [
          {
            text: 'Resend Link',
            onPress: async () => {
              try {
                const res = await resendEmailVerification();
                if (res.alreadyVerified) {
                  showAlert('Already Verified', 'Your email is already verified! You can now submit your report.', 'success');
                } else {
                  showAlert('Verification Link Sent', 'A new verification link was sent to your email. Please check your inbox or spam folder.', 'info');
                }
              } catch (err) {
                showAlert('Error', err.message || 'Failed to resend verification email.', 'error');
              }
            },
          },
          {
            text: "I've Verified",
            onPress: () => {
              handleConfirmedSubmit();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
        0,
      );
      return;
    }

    if (eligibility?.needsPolicyAcknowledgment || eligibility?.title === 'Policy Acknowledgment Required') {
      showAlert(
        'Policy Acknowledgment Required',
        'Under Valenzuela City Ordinance, false or prank reporting is strictly prohibited by law. Do you acknowledge and agree to report truthfully?',
        'warning',
        [
          {
            text: 'I Acknowledge & Submit',
            onPress: async () => {
              setLoading(true);
              const ok = await acknowledgeFalseReportPolicy();
              if (ok) {
                handleConfirmedSubmit();
              } else {
                setLoading(false);
                showAlert('Error', 'Unable to record policy agreement. Please try again.', 'error');
              }
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
        0,
      );
      return;
    }

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

  // Unchanged original logic: shrink until the base64 JPEG fits the 650 KB cap.
  const buildEvidenceImage = async (asset) => {
    let lastResult = null;

    for (const variant of INLINE_PHOTO_VARIANTS) {
      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: variant.width } }],
        {
          base64: true,
          compress: variant.compress,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      if (!result.base64) {
        throw new Error('Unable to process the selected photo.');
      }

      const dataUrl = `data:image/jpeg;base64,${result.base64}`;
      lastResult = { result, dataUrl, variant };

      if (dataUrl.length <= MAX_INLINE_PHOTO_CHARS) {
        return {
          uri: result.uri,
          dataUrl,
          mimeType: 'image/jpeg',
          sizeChars: dataUrl.length,
          width: result.width,
          height: result.height,
        };
      }
    }

    const lastSize = Math.ceil((lastResult?.dataUrl.length || 0) / 1024);
    throw new Error(
      `The selected photo is still too large after compression (${lastSize} KB). Please choose a simpler or smaller image.`,
    );
  };

  const attachEvidenceImage = async (asset) => {
    if (!asset?.uri) {
      showAlert('Photo Error', 'Unable to load the selected photo. Please try again.', 'error');
      return;
    }

    setProcessingImage(true);
    try {
      const evidenceImage = await buildEvidenceImage(asset);
      setImage({
        ...evidenceImage,
        fileName: asset.fileName || null,
        originalMimeType: getImageContentType(asset),
      });
    } catch (error) {
      console.error('Error processing evidence image:', error);
      showAlert('Photo Too Large', error.message || 'Please choose a smaller photo.', 'warning');
    } finally {
      setProcessingImage(false);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Denied', 'Camera roll permission is required to upload photos.', 'warning');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);

      if (!result.canceled && result.assets?.[0]) {
        await attachEvidenceImage(result.assets[0]);
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

      const result = await ImagePicker.launchCameraAsync(IMAGE_PICKER_OPTIONS);

      if (!result.canceled && result.assets?.[0]) {
        await attachEvidenceImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert('Error', 'Unable to take photo. Please try again.', 'error');
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

  // [QA-FIX #6] `skipPhoto` is set by the "Submit without photo" fallback.
  const handleConfirmedSubmit = async ({ skipPhoto = false } = {}) => {
    const trimmedDescription = description.trim();

    // [QA-FIX #6] Ignore re-entry while a submit is already running.
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await runConfirmedSubmit(trimmedDescription, skipPhoto);
    } finally {
      submittingRef.current = false;
    }
  };

  const runConfirmedSubmit = async (trimmedDescription, skipPhoto) => {
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

      const detectedQuickTags = detectActiveQuickTags(trimmedDescription);
      const incidentData = {
        type: incidentType,
        typeLabel: selectedIncident?.label || incidentType,
        severity: selectedSeverity,
        reportingAs,
        description: trimmedDescription,
        quickTags: detectedQuickTags.map((t) => t.label),
        hasQuickTags: detectedQuickTags.length > 0,
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
        reporterEmailVerified: (currentUser.emailVerified === true) || eligibility.profile?.emailVerified === true || eligibility.profile?.isVerified === true,
        reporterAccountStatus: eligibility.profile?.accountStatus || 'active',
      };

      // [QA-FIX #6] Free-tier (Spark) photo storage. The photo is no longer put
      // inside the public incident doc (Home downloads the latest 50 incidents,
      // so inline photos could cost ~30 MB). Instead it goes into
      // incident_evidence/{incidentId}, written in the SAME atomic batch as the
      // incident: either both are saved or neither is. The incident only gets
      // a `hasEvidencePhoto` flag. Firestore only; no Cloud Storage or Cloud
      // Functions (both need the paid Blaze plan).
      const incidentRef = doc(collection(db, 'incidents'));
      const attachPhoto = Boolean(image?.dataUrl) && !skipPhoto;
      const batch = writeBatch(db);

      if (attachPhoto) {
        incidentData.hasEvidencePhoto = true;
        incidentData.photoStorage = 'firestore_evidence_doc';
        batch.set(doc(db, 'incident_evidence', incidentRef.id), {
          incidentId: incidentRef.id,
          reporterId: currentUser.uid,
          // Same fields/limits the old inline photo used (isValidInlineEvidencePhoto rule).
          photoDataUrl: image.dataUrl,
          photoMimeType: image.mimeType,
          photoStorage: 'firestore_inline',
          photoSizeChars: image.sizeChars,
          photoWidth: image.width,
          photoHeight: image.height,
          createdAt: serverTimestamp(),
        });
      }
      batch.set(incidentRef, incidentData);

      // [QA-FIX #9] Same create as before, but the wait for server
      // confirmation is capped. If it times out, the batch stays queued in
      // Firestore and is sent automatically once back online.
      let writeResult;
      try {
        writeResult = await withTimeout(
          batch.commit().then(() => 'confirmed'),
          REPORT_WRITE_CONFIRM_TIMEOUT_MS,
          'pending'
        );
      } catch (writeError) {
        if (attachPhoto) {
          console.error('Error saving report with evidence photo:', writeError?.code || writeError);
          // [QA-FIX #6] Never lose the report because of the photo: nothing
          // was saved (atomic batch), so offer a retry or sending without it.
          setLoading(false);
          showAlert(
            "Photo Couldn't Be Attached",
            'Your report has not been sent yet because the evidence photo could not be saved. You can try again or send the report without the photo.',
            'warning',
            [
              { text: 'Retry', onPress: () => handleConfirmedSubmit() },
              { text: 'Submit Without Photo', onPress: () => handleConfirmedSubmit({ skipPhoto: true }) },
              { text: 'Cancel', style: 'cancel' },
            ],
            0,
          );
          return;
        }
        throw writeError;
      }

      const isFirstGrace = eligibility?.isFirstReportGracePeriod;
      const photoAttached = attachPhoto;
      const baseSuccess = writeResult === 'pending'
        ? 'Your connection is weak, so your report is saved on this phone and will be sent automatically once you are back online. Keep ThreatTrack open.'
        : photoAttached
        ? 'Your report has been submitted securely with photo evidence attached.'
        : 'Your report has been submitted securely. Your identity remains protected.';
      const successMessage = isFirstGrace
        ? `${baseSuccess}\n\n⚠️ Notice: This was your 1st report grace period. Please verify your email before submitting future reports.`
        : baseSuccess;

      showAlert(
        writeResult === 'pending' ? 'Report Queued' : 'Report Submitted',
        successMessage,
        writeResult === 'pending' ? 'warning' : 'success',
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
      setProcessingImage(false);
    }
  };

  return (
    <>
      <View style={styles.container}>
        <LinearGradient
          colors={['#7f1d1d', '#991b1b', '#dc2626']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerContainer}
        >
          <View style={styles.headerTopBar}>
            <TouchableOpacity
              style={styles.headerBackButton}
              onPress={handleBack}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.headerSecurityBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#fee2e2" />
              <Text style={styles.headerSecurityBadgeText}>CITIZEN DISPATCH PORTAL</Text>
            </View>
          </View>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerEyebrow}>VALENZUELA COMMUNITY SAFETY</Text>
            <Text style={styles.headerTitle}>Report Incident</Text>
            <Text style={styles.headerSubtitle}>
              Classify the event, confirm your role, and submit details for swift official response.
            </Text>
          </View>
          <View style={styles.progressContainer}>
            <View style={styles.stepsRow}>
              {[1, 2, 3].map((step) => {
                const isCompleted = currentStep > step;
                const isCurrent = currentStep === step;

                return (
                  <View key={step} style={styles.stepWrapper}>
                    <View
                      style={[
                        styles.stepCircle,
                        isCompleted && styles.stepCircleCompleted,
                        isCurrent && styles.stepCircleCurrent,
                      ]}
                    >
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      ) : (
                        <Text
                          style={[
                            styles.stepNumber,
                            isCurrent && styles.stepNumberCurrent,
                          ]}
                        >
                          {step}
                        </Text>
                      )}
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
                );
              })}
            </View>
            <View style={styles.stepBadgeRow}>
              <Text style={styles.stepCounterText}>
                STEP {currentStep} OF 3
              </Text>
              <Text style={styles.stepDotSeparator}>•</Text>
              <Text style={styles.stepLabel}>
                {currentStep === 1
                  ? 'INCIDENT CATEGORY'
                  : currentStep === 2
                  ? 'REPORTING ROLE'
                  : 'DETAILS & EVIDENCE'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <KeyboardAwareForm style={styles.scrollView}>
          {currentStep === 1 && (
            <View style={styles.stepContent}>
              <View style={styles.stepHeading}>
                <View style={styles.stepHeadingIcon}>
                  <Ionicons name="layers-outline" size={19} color="#dc2626" />
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
                      {isSelected ? (
                        <LinearGradient
                          colors={['#dc2626', '#991b1b']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.incidentIconBadgeSelectedGradient}
                        >
                          <Ionicons
                            name={getIncidentIconName(type.id)}
                            size={22}
                            color="#ffffff"
                          />
                        </LinearGradient>
                      ) : (
                        <View style={styles.incidentIconBadge}>
                          <Ionicons
                            name={getIncidentIconName(type.id)}
                            size={22}
                            color="#b91c1c"
                          />
                        </View>
                      )}
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
                          ● {SEVERITY_CONFIG[type.severity].label.toUpperCase()}
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
                  <Ionicons name="id-card-outline" size={19} color="#dc2626" />
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
                        {isSelected ? (
                          <LinearGradient
                            colors={['#dc2626', '#991b1b']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.reportingIconBadgeSelectedGradient}
                          >
                            <Ionicons
                              name={getReportingIconName(option.id)}
                              size={25}
                              color="#ffffff"
                            />
                          </LinearGradient>
                        ) : (
                          <View style={styles.reportingIconBadge}>
                            <Ionicons
                              name={getReportingIconName(option.id)}
                              size={25}
                              color="#b91c1c"
                            />
                          </View>
                        )}
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
                        {isSelected && (
                          <View style={styles.reportingCheckPill}>
                            <Ionicons name="checkmark-circle" size={20} color="#dc2626" />
                          </View>
                        )}
                      </View>
                      <Text style={[styles.reportingAsTag, isSelected && styles.reportingAsTagSelected]}>
                        {option.id === 'victim' ? 'DIRECTLY AFFECTED' : 'EYEWITNESS REPORT'}
                      </Text>
                      <Text style={styles.reportingAsDescription}>{option.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.roleAssuranceBox}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#991b1b" />
                <Text style={styles.roleAssuranceText}>
                  Your reporting role assists dispatchers in coordinating the correct emergency assistance. Citizen identity remains confidential from public views.
                </Text>
              </View>
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <View style={styles.stepHeading}>
                <View style={styles.stepHeadingIcon}>
                  <Ionicons name="document-text-outline" size={19} color="#dc2626" />
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
                    <Text style={styles.summaryLabel}>INCIDENT REVIEW</Text>
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
                    ● {severityStyle.label.toUpperCase()}
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
                <QuickDescriptionChips
                  incidentType={incidentType}
                  reportingAs={reportingAs}
                  description={description}
                  onDescriptionChange={setDescription}
                />
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
                  <Image source={{ uri: image.uri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setImage(null)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={17} color="#ffffff" />
                  </TouchableOpacity>
                  <LinearGradient
                    colors={['transparent', 'rgba(15, 23, 42, 0.85)']}
                    style={styles.imageGradientScrim}
                  >
                    <View style={styles.imageAttachedPill}>
                      <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
                      <Text style={styles.imageAttachedText}>Photo Evidence Attached</Text>
                    </View>
                  </LinearGradient>
                </View>
              ) : (
                <View style={styles.photoButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.photoActionButton, processingImage && styles.photoActionButtonDisabled]}
                    onPress={takePhoto}
                    disabled={processingImage || loading}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="camera-outline" size={21} color="#dc2626" />
                    <Text style={styles.photoActionText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.photoActionButton, processingImage && styles.photoActionButtonDisabled]}
                    onPress={pickImage}
                    disabled={processingImage || loading}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="image-outline" size={21} color="#dc2626" />
                    <Text style={styles.photoActionText}>Choose Photo</Text>
                  </TouchableOpacity>
                </View>
              )}
              {processingImage && (
                <View style={styles.processingPhotoBox}>
                  <ActivityIndicator color="#dc2626" />
                  <Text style={styles.processingPhotoText}>Preparing photo evidence...</Text>
                </View>
              )}

              <View style={styles.infoBox}>
                <View style={styles.infoIconBadge}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#991b1b" />
                </View>
                <Text style={styles.infoText}>
                  Verified Citizen Report • Encrypted dispatch routing to Valenzuela City Police and Barangay Operations Command.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.spacer} />
        </KeyboardAwareForm>

        {/* [QA-FIX #11] Original 20px bottom padding + system navigation inset. */}
        <View style={[styles.buttonContainer, { paddingBottom: 20 + insets.bottom }]}>
          <TouchableOpacity
            style={[styles.button, styles.backButton]}
            onPress={handleBack}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={16} color="#991b1b" style={{ marginRight: 6 }} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          {currentStep < 3 ? (
            <TouchableOpacity
              style={[styles.button, styles.gradientButtonWrap]}
              onPress={handleNext}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#dc2626', '#991b1b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.nextButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.button,
                styles.gradientButtonWrap,
                (loading || processingImage) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading || processingImage}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#dc2626', '#7f1d1d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                {loading ? (
                  <>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.submitButtonText}>Submitting...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Submit Report</Text>
                  </>
                )}
              </LinearGradient>
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
    paddingTop: HEADER_TOP_PADDING,
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSecurityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  headerSecurityBadgeText: {
    color: '#fee2e2',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerTitleBlock: {
    marginBottom: 14,
  },
  headerEyebrow: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: 'rgba(255, 241, 242, 0.92)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(254, 226, 226, 0.8)',
    borderRadius: 20,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  stepWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  stepCircleCompleted: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  stepCircleCurrent: {
    backgroundColor: '#ffffff',
    borderColor: '#991b1b',
    borderWidth: 3,
  },
  stepNumber: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#9ca3af',
  },
  stepNumberCurrent: {
    color: '#991b1b',
    fontWeight: '900',
  },
  stepLine: {
    width: 44,
    height: 2.5,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 6,
    borderRadius: 1,
  },
  stepLineActive: {
    backgroundColor: '#dc2626',
  },
  stepBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stepCounterText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#991b1b',
    letterSpacing: 0.6,
  },
  stepDotSeparator: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.3,
  },
  stepContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  stepHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
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
  incidentTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  incidentTypeButton: {
    width: '48.5%',
    minHeight: 156,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
    justifyContent: 'space-between',
  },
  incidentTypeButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fff7f7',
    shadowColor: '#dc2626',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  incidentIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  incidentIconBadgeSelectedGradient: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
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
    marginTop: 10,
  },
  incidentSeverityMiniText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  reportingAsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  reportingAsButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    borderRadius: 18,
    padding: 16,
    minHeight: 176,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    position: 'relative',
  },
  reportingAsButtonSelected: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fff7f7',
    shadowColor: '#dc2626',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  reportingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
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
  reportingIconBadgeSelectedGradient: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  reportingTitleBlock: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  reportingCheckPill: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  reportingAsLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 20,
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
  reportingAsTagSelected: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
  },
  reportingAsDescription: {
    color: '#6b7280',
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  roleAssuranceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  roleAssuranceText: {
    flex: 1,
    fontSize: 12,
    color: '#7f1d1d',
    fontWeight: '700',
    lineHeight: 18,
  },
  summaryPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  summaryMeta: {
    color: '#6b7280',
    fontSize: 11.5,
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
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  photoActionButtonDisabled: {
    opacity: 0.55,
  },
  photoActionText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#dc2626',
  },
  processingPhotoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#fff7f7',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: -8,
    marginBottom: 18,
  },
  processingPhotoText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  imageGradientScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 65,
    justifyContent: 'flex-end',
    padding: 12,
  },
  imageAttachedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
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
    fontSize: 12.5,
    color: '#7f1d1d',
    fontWeight: '700',
    lineHeight: 19,
  },
  spacer: {
    height: 108,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#fee2e2',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  button: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  backButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    flexDirection: 'row',
    paddingVertical: 14,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#991b1b',
  },
  gradientButtonWrap: {
    overflow: 'hidden',
    paddingVertical: 0,
    paddingHorizontal: 0,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  gradientButton: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
});

export default ReportIncidentScreen;
