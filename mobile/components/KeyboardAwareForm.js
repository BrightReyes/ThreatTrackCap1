// [KEYBOARD-FIX] New file: part of the auto-clicking / keyboard bug fix (see mobile/QA_FIX_LOG.md, Part 1).
import React, { forwardRef } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/**
 * Scroll container for any screen with text inputs.
 *
 * The app runs edge-to-edge on Android, so the window no longer shrinks when
 * the keyboard opens and the keyboard covers the focused input. This keeps
 * the focused input scrolled above the keyboard on both platforms.
 *
 * - keyboardShouldPersistTaps="handled": tapping another input or a button
 *   works while the keyboard is open, and tapping empty space closes it.
 * - keyboardDismissMode="interactive": only a real user drag closes the
 *   keyboard, never a layout change.
 */
const KeyboardAwareForm = forwardRef(function KeyboardAwareForm(
  { children, bottomOffset = 24, ...scrollProps },
  ref
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

export default KeyboardAwareForm;
