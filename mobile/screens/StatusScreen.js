import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const StatusScreen = () => {
  return (
    <LinearGradient
      colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
      locations={[0, 0.3, 0.6, 0.85, 1]}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>STATUS</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.emoji}>📊</Text>
          <Text style={styles.title}>My Reported Incidents</Text>
          <Text style={styles.subtitle}>Track status of your submitted reports</Text>
          
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Coming Soon</Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8b95a8',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 100,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8b95a8',
    textAlign: 'center',
    marginBottom: 30,
  },
  placeholder: {
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 20,
    minWidth: 200,
  },
  placeholderText: {
    fontSize: 16,
    color: '#6a8eef',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default StatusScreen;
