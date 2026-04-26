import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a2744',
  },
  hint: {
    color: '#94a8d8',
    textAlign: 'center',
    paddingHorizontal: 24,
    fontSize: 14,
    lineHeight: 20,
  },
});

const MapView = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
  }));
  return (
    <View style={[props.style, styles.placeholder]}>
      <Text style={styles.hint}>
        Map is not available in web preview. Use Expo Go on a device or emulator for the full map. You can still test the rest of the UI here.
      </Text>
    </View>
  );
});

function Marker() {
  return null;
}

function Polygon() {
  return null;
}

function Heatmap() {
  return null;
}

function Circle() {
  return null;
}

export default MapView;
export { Marker, Polygon, Heatmap, Circle };
