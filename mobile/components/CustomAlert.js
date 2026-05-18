import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const CustomAlert = ({
  visible,
  title,
  message,
  type = 'info',
  buttons = [],
  onClose,
  autoCloseDelay = 0,
}) => {
  const timerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;
  const translateAnim = useRef(new Animated.Value(12)).current;
  const [isMounted, setIsMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 260,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isMounted) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.97,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 10,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setIsMounted(false));
    }
  }, [fadeAnim, isMounted, scaleAnim, translateAnim, visible]);

  useEffect(() => {
    if (visible && autoCloseDelay > 0) {
      timerRef.current = setTimeout(() => {
        if (buttons.length > 0 && buttons[0].onPress) {
          buttons[0].onPress();
        }
        onClose();
      }, autoCloseDelay);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, autoCloseDelay, buttons, onClose]);

  const handleButtonPress = (button) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (button.onPress) {
      button.onPress();
    }
    onClose();
  };

  const handleManualClose = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onClose();
  };

  const getTypeConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle-outline',
          label: 'Success',
          color: '#047857',
          backgroundColor: '#ecfdf5',
          borderColor: '#a7f3d0',
        };
      case 'error':
        return {
          icon: 'alert-circle-outline',
          label: 'Alert',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          borderColor: '#fecaca',
        };
      case 'warning':
        return {
          icon: 'warning-outline',
          label: 'Warning',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          borderColor: '#fecaca',
        };
      default:
        return {
          icon: 'information-circle-outline',
          label: 'Notice',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          borderColor: '#fecaca',
        };
    }
  };

  const typeConfig = getTypeConfig();

  if (!isMounted) return null;

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={handleManualClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.alertCard,
            {
              transform: [
                { translateY: translateAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.headerIconWrap,
                {
                  backgroundColor: typeConfig.backgroundColor,
                  borderColor: typeConfig.borderColor,
                },
              ]}
            >
              <Ionicons name={typeConfig.icon} size={28} color={typeConfig.color} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.headerEyebrow, { color: typeConfig.color }]}>
                {typeConfig.label}
              </Text>
              <Text style={styles.headerTitle}>{title}</Text>
            </View>
            <TouchableOpacity onPress={handleManualClose} style={styles.closeButton}>
              <Ionicons name="close-outline" size={23} color="#991b1b" />
            </TouchableOpacity>
          </View>

          <View style={styles.contentContainer}>
            <Text style={styles.message}>{message}</Text>

            <View style={styles.buttonContainer}>
              {buttons.length === 0 ? (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleManualClose}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              ) : (
                buttons.map((button, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      button.style === 'cancel' ? styles.secondaryButton : styles.primaryButton,
                      buttons.length > 1 && styles.multiButton,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        button.style === 'cancel' && styles.secondaryButtonText,
                      ]}
                      numberOfLines={2}
                    >
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.56)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    width: width * 0.9,
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#fee2e2',
  },
  headerIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.2,
    lineHeight: 25,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  message: {
    fontSize: 16,
    color: '#1f2937',
    textAlign: 'left',
    lineHeight: 24,
    marginBottom: 22,
    fontWeight: '700',
  },
  buttonContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  button: {
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 16,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiButton: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7,
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: '#dc2626',
  },
});

export default CustomAlert;
