import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
// [KEYBOARD-FIX] Auto-clicking / keyboard bug fix (see mobile/QA_FIX_LOG.md, Part 1).
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
// [QA-FIX #11] With edge-to-edge on, RN 0.81 Modals are drawn under the
// Android navigation bar (ReactModalHostView forces it), so bottom sheets need
// the bottom inset added to their own bottom padding.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// [QA-FIX #11] The sheet's own bottom padding, whichever key the caller used.
const getBasePaddingBottom = (style) => {
  const flat = StyleSheet.flatten(style) || {};
  const value = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding ?? 0;
  return typeof value === 'number' ? value : 0;
};

const SmoothModal = ({
  visible,
  onRequestClose,
  children,
  position = 'bottom',
  overlayStyle,
  contentStyle,
}) => {
  const insets = useSafeAreaInsets();
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
      {/* Keyboard-controller's version works on Android edge-to-edge too, so
          bottom-sheet inputs (reset email, barangay search, password change)
          stay above the keyboard on both platforms. */}
      <KeyboardAvoidingView style={styles.keyboardContainer} behavior="padding">
        <Animated.View
          style={[
            styles.overlay,
            position === 'center' && styles.centerOverlay,
            overlayStyle,
            { opacity: backdropOpacity },
          ]}
        >
          <TouchableWithoutFeedback onPress={onRequestClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <Animated.View
            style={[
              contentStyle,
              // [QA-FIX #11] Bottom sheets only; centered dialogs don't touch the nav bar.
              position === 'bottom' && insets.bottom > 0
                ? { paddingBottom: getBasePaddingBottom(contentStyle) + insets.bottom }
                : null,
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
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
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
