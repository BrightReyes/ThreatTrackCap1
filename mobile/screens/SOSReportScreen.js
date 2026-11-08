import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// [QA-FIX #11] RN's SafeAreaView does nothing on Android; insets now come from
// react-native-safe-area-context (header top + footer bottom padding).
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, BRAND_GRADIENT_START, BRAND_GRADIENT_END } from '../theme/colors';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getReportEligibility, resendEmailVerification, acknowledgeFalseReportPolicy } from '../utils/auth';
// [QA-FIX #8] watchLocation import removed with the dead streaming code.
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
    severity: 'high',
    description: 'Force or intimidation',
  },
  {
    id: 'physical_assault_injury',
    label: 'Physical Assault / Injury',
    severity: 'high',
    description: 'Fight or violent injury',
  },
  {
    id: 'domestic_violence',
    label: 'Domestic Violence',
    severity: 'high',
    description: 'Household abuse',
  },
  {
    id: 'traffic_accident',
    label: 'Traffic Accidents',
    severity: 'high',
    description: 'Collision or injured person',
  },
  {
    id: 'illegal_weapons',
    label: 'Illegal Weapons',
    severity: 'high',
    description: 'Firearm or deadly weapon',
  },
  {
    id: 'theft_snatching',
    label: 'Theft / Snatching',
    severity: 'high',
    description: 'Phone or bag snatching',
  },
  {
    id: 'drug_related_activity',
    label: 'Drug-Related Activity',
    severity: 'high',
    description: 'Illegal selling or usage',
  },
  {
    id: 'public_disturbance',
    label: 'Public Disturbance',
    severity: 'high',
    description: 'Noise, conflict, riot',
  },
  {
    id: 'suspicious_activity',
    label: 'Suspicious Activity',
    severity: 'high',
    description: 'Unusual behavior',
  },
  {
    id: 'vandalism_property_damage',
    label: 'Vandalism / Damage',
    severity: 'high',
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

const getSeverityFromType = (type) => {
  return getIncidentByType(type)?.severity || 'high';
};

const isValidReportLocation = (location) => {
  return Boolean(
    location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude))
  );
};

// [QA-FIX #4] Max wait for a fresh SOS fix before falling back to last known.
const SOS_FIX_TIMEOUT_MS = 10000;
// [QA-FIX #9] Max wait for the server to confirm the SOS write. Firestore keeps
// the write queued and sends it once the connection is back, so after this we
// tell the user it's queued instead of spinning forever.
const SOS_WRITE_CONFIRM_TIMEOUT_MS = 15000;
const NATIONAL_EMERGENCY_HOTLINE = '911';

const isOfflineError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === 'unavailable' ||
    code === 'auth/network-request-failed' ||
    message.includes('offline') ||
    message.includes('network');
};

const formatAccuracy = (location) => {
  const accuracy = Number(location?.accuracy);
  return Number.isFinite(accuracy) && accuracy > 0 ? ` (±${Math.round(accuracy)} m)` : '';
};

const SOSReportScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const passedLocation = route?.params?.userLocation;
  const hasPassedLocation = isValidReportLocation(passedLocation);

  const [incidentType, setIncidentType] = useState('');
  const [reportingAs, setReportingAs] = useState('witness');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  // [QA-FIX #3] A passed-in location is only a preview: it may be a cached fix.
  // A fresh fix is always requested on mount and replaces it.
  const [currentLocation, setCurrentLocation] = useState(hasPassedLocation ? passedLocation : null);
  const [locationIsApproximate, setLocationIsApproximate] = useState(hasPassedLocation);
  const isMountedRef = useRef(true);
  // [QA-FIX #3] Prevents a double submit (e.g. "I've Verified" + main button).
  const submittingRef = useRef(false);

  // [QA-FIX #8] Removed SOSReportScreen's own GPS-streaming state, effect,
  // pulse animation, handleStopDistressTracking and handleClose. Nothing ever
  // passed `activeIncidentId`, so it never ran, and if it had it would have
  // been a second writer next to HomeScreen. HomeScreen owns live SOS tracking.

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
    autoCloseDelay: 5000,
  });

  const selectedIncident = getIncidentByType(incidentType);
  const selectedSeverity = getSeverityFromType(incidentType);
  const severityStyle = SEVERITY_CONFIG[selectedSeverity];
  const locationReady = isValidReportLocation(currentLocation);

  useEffect(() => {
    isMountedRef.current = true;
    // [QA-FIX #3] Always take a fresh fix, even when a location was passed in.
    // Before, any passed location (including Home's Valenzuela-center default)
    // skipped GPS entirely and could be submitted as the emergency location.
    const initializeLocation = async () => {
      try {
        await getLocationAutomatically();
      } finally {
        if (isMountedRef.current) setLocationLoading(false);
      }
    };

    initializeLocation();
    return () => {
      isMountedRef.current = false;
    };
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
  // onPress isn't overwritten by a stale copy of alertConfig.
  const hideAlert = useCallback(() => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  // [POPUP-FIX #22] Reset the stack to Home instead of pushing it. A push kept this
  // screen (and its closing CustomAlert Modal) mounted but detached underneath
  // Home, so the "SOS Dispatched" popup stayed stuck on top. Resetting also
  // keeps Back from returning to an already-submitted SOS form.
  const goHomeAfterSubmit = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

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
                  showAlert('Already Verified', 'Your email is already verified! You can now send an SOS report.', 'success');
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
              handleSubmit();
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
        'Under Valenzuela City Ordinance, false or prank SOS distress alerts are strictly prohibited by law. Do you acknowledge and agree to report truthfully?',
        'warning',
        [
          {
            text: 'I Acknowledge & Send SOS',
            onPress: async () => {
              setLoading(true);
              const ok = await acknowledgeFalseReportPolicy();
              if (ok) {
                handleSubmit();
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

  // [QA-FIX #3, #4] Fresh high-accuracy fix, bounded to SOS_FIX_TIMEOUT_MS.
  // getCurrentLocation falls back to the last known position (isApproximate).
  // If nothing at all is available, keep any preview that was passed in
  // (marked approximate) rather than wiping it.
  const getLocationAutomatically = async () => {
    try {
      const location = await getCurrentLocation({
        timeoutMs: SOS_FIX_TIMEOUT_MS,
        accuracy: Location.Accuracy.High,
      });
      if (!isMountedRef.current) return;
      if (isValidReportLocation(location)) {
        setCurrentLocation(location);
        setLocationIsApproximate(location.isApproximate === true);
      } else if (!isValidReportLocation(passedLocation)) {
        setCurrentLocation(null);
      } else {
        setCurrentLocation(passedLocation);
        setLocationIsApproximate(true);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      if (isMountedRef.current && !isValidReportLocation(passedLocation)) {
        setCurrentLocation(null);
      }
    }
  };

  const retryLocationLock = async () => {
    setLocationLoading(true);
    await getLocationAutomatically();
    if (isMountedRef.current) setLocationLoading(false);
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

    const reportLocation = currentLocation;

    if (!isValidReportLocation(reportLocation)) {
      showAlert(
        'Location Required',
        'Unable to confirm your current location. Please enable location services and try again before sending an SOS report.',
        'error'
      );
      return;
    }

    // [QA-FIX #3] Ignore a second tap while a submit is already running.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const eligibility = await getReportEligibility();

      if (!eligibility.allowed) {
        showReportEligibilityAlert(eligibility);
        return;
      }

      const currentUser = eligibility.user;

      let locationAddress = 'Valenzuela City, Philippines';
      try {
        // [QA-FIX #9] Geocoding is now capped at ~2.5 s (see utils/location.js).
        const address = await getAddressFromCoordinates(reportLocation.latitude, reportLocation.longitude);
        if (address) {
          locationAddress = address;
        }
      } catch (error) {
        console.error('Error getting address:', error);
      }

      const safeDescription = description.trim() ||
        `SOS quick report: ${selectedIncident?.label || 'Incident'} reported via emergency flow.`;

      const detectedQuickTags = detectActiveQuickTags(safeDescription);
      const incidentData = {
        type: incidentType,
        typeLabel: selectedIncident?.label || incidentType,
        severity: selectedSeverity,
        description: safeDescription,
        reportingAs,
        quickTags: detectedQuickTags.map((t) => t.label),
        hasQuickTags: detectedQuickTags.length > 0,
        location: {
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
          address: locationAddress,
          // [QA-FIX #3] Additive: fix accuracy in metres + whether it was a
          // cached (approximate) fix, so responders know how precise it is.
          ...(Number.isFinite(reportLocation.accuracy) ? { accuracy: reportLocation.accuracy } : {}),
          isApproximate: locationIsApproximate,
        },
        initialLocation: {
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
          address: locationAddress,
        },
        locationTrail: [
          {
            latitude: reportLocation.latitude,
            longitude: reportLocation.longitude,
            timestamp: Date.now(),
          },
        ],
        status: 'under_review',
        timestamp: serverTimestamp(),
        reportedAt: serverTimestamp(),
        clientTimestamp: new Date().toISOString(),
        reporterId: currentUser.uid,
        reporterEmailVerified: (currentUser.emailVerified === true) || eligibility.profile?.emailVerified === true || eligibility.profile?.isVerified === true,
        reporterAccountStatus: eligibility.profile?.accountStatus || 'active',
        isSOSReport: true,
        liveStreamingActive: true,
        lastGpsStreamAt: serverTimestamp(),
      };

      // [QA-FIX #9] Same create as before (addDoc == doc() + setDoc), but the
      // wait for server confirmation is capped. On a weak connection the write
      // stays queued in Firestore and is sent automatically when back online.
      const incidentRef = doc(collection(db, 'incidents'));
      const writeResult = await withTimeout(
        setDoc(incidentRef, incidentData).then(() => 'confirmed'),
        SOS_WRITE_CONFIRM_TIMEOUT_MS,
        'pending'
      );

      if (writeResult === 'pending') {
        showAlert(
          'SOS Queued – Weak Connection',
          `Your SOS is saved on this phone and will be sent automatically as soon as you are back online. Keep ThreatTrack open.\n\nIf you are in immediate danger, call ${NATIONAL_EMERGENCY_HOTLINE} now.`,
          'warning',
          [
            { text: `Call ${NATIONAL_EMERGENCY_HOTLINE}`, onPress: () => Linking.openURL(`tel:${NATIONAL_EMERGENCY_HOTLINE}`) },
            { text: 'View on Home', onPress: goHomeAfterSubmit },
          ],
          0
        );
        return;
      }

      const isFirstGrace = eligibility?.isFirstReportGracePeriod;
      // [QA-FIX #10] Honest copy: live GPS sharing is foreground-only.
      const baseSOSSuccess = 'Emergency report sent! Your live location is shared from the Home screen while ThreatTrack is open. Keep the app open until you are safe.';
      const sosSuccessMsg = isFirstGrace
        ? `${baseSOSSuccess}\n\n⚠️ Notice: This was your 1st report grace period. Please verify your email before submitting future reports.`
        : baseSOSSuccess;

      showAlert(
        'SOS Dispatched!',
        sosSuccessMsg,
        'success',
        [
          {
            text: 'View on Home',
            onPress: goHomeAfterSubmit,
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting SOS report:', error);
      // [QA-FIX #9] Clear offline message with a direct hotline option.
      if (isOfflineError(error)) {
        showAlert(
          'No Connection',
          `ThreatTrack could not reach the server, so your SOS was not sent. Check your mobile data or Wi-Fi and try again.\n\nIf you are in immediate danger, call ${NATIONAL_EMERGENCY_HOTLINE} now.`,
          'error',
          [
            { text: `Call ${NATIONAL_EMERGENCY_HOTLINE}`, onPress: () => Linking.openURL(`tel:${NATIONAL_EMERGENCY_HOTLINE}`) },
            { text: 'Try Again', style: 'cancel' },
          ],
          0
        );
      } else {
        showAlert('Error', 'Failed to submit SOS report. Please try again.', 'error');
      }
    } finally {
      submittingRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  };

  return (
    <>
      {/* [QA-FIX #11] Plain View + explicit insets (RN SafeAreaView is a no-op on Android). */}
      <View style={styles.container}>
        <LinearGradient colors={BRAND_GRADIENT} start={BRAND_GRADIENT_START} end={BRAND_GRADIENT_END} style={[styles.headerContainer, { paddingTop: Math.max(34, insets.top + 10) }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.sosBadge}>
              <Text style={styles.sosBadgeText}>SOS</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
              <Text style={styles.closeButtonText}>x</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>Quick Emergency Report</Text>
          <Text style={styles.headerSubtitle}>
            Choose the incident, confirm your role, and send your location fast.
          </Text>
          <View style={styles.statusStrip}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {/* [QA-FIX #3] Show precision so the user knows what responders get. */}
              {locationLoading
                ? (locationReady ? `Refining location...${formatAccuracy(currentLocation)}` : 'Locking location...')
                : locationReady
                ? (locationIsApproximate
                  ? `Approximate location (last known)${formatAccuracy(currentLocation)}`
                  : `Location ready${formatAccuracy(currentLocation)}`)
                : 'Location unavailable'}
            </Text>
          </View>
        </LinearGradient>


            <KeyboardAwareForm style={styles.scrollView}>
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
                          <Ionicons
                            name={getIncidentIconName(type.id)}
                            size={22}
                            color={isSelected ? '#ffffff' : '#7f1d1d'}
                          />
                        </View>
                        <View style={styles.incidentTextWrap}>
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
                <QuickDescriptionChips
                  incidentType={incidentType}
                  reportingAs={reportingAs}
                  description={description}
                  onDescriptionChange={setDescription}
                />
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

                {!locationLoading && !locationReady && (
                  <View style={styles.locationWarningBox}>
                    <Text style={styles.locationWarningTitle}>Location is required</Text>
                    <Text style={styles.locationWarningText}>
                      Enable location services before sending an SOS report so responders receive your real position.
                    </Text>
                    <TouchableOpacity
                      style={styles.locationRetryButton}
                      onPress={retryLocationLock}
                      disabled={loading}
                    >
                      <Text style={styles.locationRetryText}>Retry Location</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.bottomSpacing} />
              </View>
            </KeyboardAwareForm>

        {/* [QA-FIX #11] Original 18px bottom padding + system navigation inset. */}
        <View style={[styles.footer, { paddingBottom: 18 + insets.bottom }]}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (loading || locationLoading || !locationReady) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading || locationLoading || !locationReady}
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
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
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
    fontSize: 14,
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
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
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
    fontSize: 14,
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
    minHeight: 98,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  incidentIconBadgeSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  incidentTextWrap: {
    flex: 1,
  },
  incidentTypeLabel: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '900',
    marginBottom: 3,
  },
  incidentTypeLabelSelected: {
    color: '#991b1b',
  },
  incidentTypeDescription: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
  },
  reportingButtonTextSelected: {
    color: '#dc2626',
    fontWeight: '900',
  },
  descriptionInput: {
    minHeight: 96,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
  },
  infoText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  locationWarningBox: {
    backgroundColor: '#fff7f7',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  locationWarningTitle: {
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  locationWarningText: {
    color: '#7f1d1d',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  locationRetryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 10,
  },
  locationRetryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
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
    borderTopColor: '#e2e8f0',
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
