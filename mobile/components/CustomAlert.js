import React, { useEffect, useRef } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  type = 'info', // 'success', 'error', 'warning', 'info'
  buttons = [], 
  onClose,
  autoCloseDelay = 0 // No auto-close by default
}) => {
  
  const timerRef = useRef(null);

  // Auto-close timer
  useEffect(() => {
    if (visible && autoCloseDelay > 0) {
      timerRef.current = setTimeout(() => {
        // Auto-click first button or just close
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
    // Clear auto-close timer when user interacts
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (button.onPress) {
      button.onPress();
    }
    onClose();
  };

  const handleManualClose = () => {
    // Clear auto-close timer when user closes manually
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onClose();
  };

  // Get header color and icon based on alert type
  const getTypeConfig = () => {
    switch(type) {
      case 'success':
        return { 
          headerColor: '#dc2626', 
          icon: '✓',
          iconColor: '#ffffff' 
        };
      case 'error':
        return { 
          headerColor: '#dc2626', 
          icon: '✕',
          iconColor: '#ffffff' 
        };
      case 'warning':
        return { 
          headerColor: '#dc2626', 
          icon: '⚠️',
          iconColor: '#ffffff' 
        };
      default: // info
        return { 
          headerColor: '#dc2626', 
          icon: 'ℹ',
          iconColor: '#ffffff' 
        };
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
          {/* Header with colored bar */}
          <View style={[styles.header, { backgroundColor: typeConfig.headerColor }]}>
            <Text style={styles.headerIcon}>{typeConfig.icon}</Text>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity 
              onPress={handleManualClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.contentContainer}>
            {/* Message */}
            <Text style={styles.message}>{message}</Text>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {buttons.length === 0 ? (
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.primaryButton,
                    { backgroundColor: typeConfig.headerColor }
                  ]}
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
                      button.style === 'cancel' 
                        ? styles.secondaryButton 
                        : [styles.primaryButton, { backgroundColor: typeConfig.headerColor }],
                      buttons.length > 1 && styles.multiButton
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text style={[
                      styles.buttonText,
                      button.style === 'cancel' && styles.secondaryButtonText
                    ]}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    width: width * 0.88,
    maxWidth: 400,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcon: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginRight: 14,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  message: {
    fontSize: 16,
    color: '#1f2937',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 28,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 14,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  multiButton: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#dc2626',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#dc2626',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  secondaryButtonText: {
    color: '#dc2626',
  },
});

export default CustomAlert;
