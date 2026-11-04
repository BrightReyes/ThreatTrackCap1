// [KEYBOARD-FIX] New file: part of the auto-clicking / keyboard bug fix (see mobile/QA_FIX_LOG.md, Part 1).
import React, { forwardRef, memo, useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ACCENT = '#dc2626';
const MUTED = '#64748b';

/**
 * Labeled text input with its own focus state.
 *
 * Focus styling lives inside this component on purpose: a focus change
 * re-renders only this field, never the whole form. The border width stays
 * the same when focused (only the color changes), so focusing never shifts
 * the layout. Layout shifts while the keyboard opens are what made Android
 * move focus between inputs on its own.
 */
const FormField = forwardRef(function FormField(
  {
    label,
    icon,
    trailing,
    onFocus,
    onBlur,
    labelStyle,
    wrapStyle,
    inputStyle,
    iconStyle,
    ...inputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(
    (event) => {
      setFocused(true);
      onFocus?.(event);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (event) => {
      setFocused(false);
      onBlur?.(event);
    },
    [onBlur]
  );

  return (
    <>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View style={[styles.wrap, wrapStyle, focused && styles.wrapFocused]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={19}
            color={focused ? ACCENT : MUTED}
            style={[styles.icon, iconStyle]}
          />
        ) : null}
        <TextInput
          ref={ref}
          style={[styles.input, inputStyle]}
          placeholderTextColor="#94a3b8"
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...inputProps}
        />
        {trailing}
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 48,
    marginBottom: 14,
  },
  wrapFocused: {
    borderColor: ACCENT,
    backgroundColor: '#fffdfd',
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    paddingVertical: 10,
  },
});

export default memo(FormField);
