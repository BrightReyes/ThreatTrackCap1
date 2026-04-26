import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';

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
        return { icon: 'OK', label: 'Success' };
      case 'error':
        return { icon: '!', label: 'Alert' };
      case 'warning':
        return { icon: '!', label: 'Warning' };
      default:
        return { icon: 'i', label: 'Notice' };
    }
  };

  const typeConfig = getTypeConfig();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleManualClose}
    >
      <View style={styles.overlay}>
        <View style={styles.alertCard}>
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Text style={styles.headerIcon}>{typeConfig.icon}</Text>
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>{typeConfig.label}</Text>
              <Text style={styles.headerTitle}>{title}</Text>
            </View>
            <TouchableOpacity onPress={handleManualClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>X</Text>
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    width: width * 0.88,
    maxWidth: 400,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 18,
  },
  header: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  headerIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerIcon: {
    fontSize: 15,
    fontWeight: '900',
    color: '#dc2626',
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    color: '#fee2e2',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  closeIcon: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  message: {
    fontSize: 15,
    color: '#1f2937',
    textAlign: 'left',
    lineHeight: 23,
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
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 15,
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 7,
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dc2626',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: '#dc2626',
  },
});

export default CustomAlert;
