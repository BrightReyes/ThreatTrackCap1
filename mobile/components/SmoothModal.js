import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
} from 'react-native';

const SmoothModal = ({
  visible,
  onRequestClose,
  children,
  position = 'bottom',
  overlayStyle,
  contentStyle,
}) => {
  const [isMounted, setIsMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(position === 'bottom' ? 34 : 14)).current;
  const scale = useRef(new Animated.Value(position === 'center' ? 0.97 : 1)).current;

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 190,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 240,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 18,
          stiffness: 260,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isMounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: position === 'bottom' ? 24 : 10,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: position === 'center' ? 0.98 : 1,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setIsMounted(false));
    }
  }, [backdropOpacity, contentOpacity, isMounted, position, scale, translateY, visible]);

  if (!isMounted) return null;

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      <Animated.View
        style={[
          styles.overlay,
          position === 'center' && styles.centerOverlay,
          overlayStyle,
          { opacity: backdropOpacity },
        ]}
      >
        <Animated.View
          style={[
            contentStyle,
            {
              opacity: contentOpacity,
              transform: [
                { translateY },
                { scale },
              ],
            },
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.46)',
  },
  centerOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

export default SmoothModal;
