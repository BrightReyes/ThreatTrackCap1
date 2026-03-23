import React, { useEffect, useRef } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  type = 'info', // 'success', 'error', 'warning', 'info'
  buttons = [], 
  onClose,
  autoCloseDelay = 5000 // Auto-close after 5 seconds by default
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
  
  const getIcon = () => {
    switch(type) {
      case 'success':
        return { name: 'checkmark-circle', color: '#10b981' };
      case 'error':
        return { name: 'close-circle', color: '#dc2626' };
      case 'warning':
        return { name: 'warning', color: '#f59e0b' };
      default:
        return { name: 'information-circle', color: '#6a8eef' };
    }
  };

  const icon = getIcon();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleManualClose}
    >
      <View style={styles.overlay}>
        <View style={styles.alertContainer}>
          <LinearGradient
            colors={['#3d5a8c', '#1a2d52', '#0a1428']}
            style={styles.gradient}
          >
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name={icon.name} size={60} color={icon.color} />
            </View>

            {/* Title */}
            <Text style={styles.title}>{title}</Text>

            {/* Message */}
            <Text style={styles.message}>{message}</Text>

            {/* Buttons */}
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
                      button.style === 'cancel' 
                        ? styles.secondaryButton 
                        : styles.primaryButton,
                      buttons.length > 1 && styles.multiButton
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text style={styles.buttonText}>{button.text}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
            
            {/* Auto-close indicator */}
            {autoCloseDelay > 0 && (
              <Text style={styles.autoCloseText}>
                Auto-closing in {(autoCloseDelay / 1000).toFixed(0)}s...
              </Text>
            )}
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    width: width * 0.85,
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  gradient: {
    padding: 25,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
  },
  buttonContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  multiButton: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#dc2626',
  },
  secondaryButton: {
    backgroundColor: '#3d5a8c',
    borderWidth: 1,
    borderColor: '#6a8eef',
  },
  buttonText: {
  autoCloseText: {
    marginTop: 15,
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomAlert;
