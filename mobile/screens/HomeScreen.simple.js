import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const HomeScreen = ({ navigation }) => {
  return (
    <LinearGradient
      colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
      locations={[0, 0.3, 0.6, 0.85, 1]}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>CRIME MAP</Text>
          <Text style={styles.headerSubtitle}>✅ App is working!</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🎉 Success!</Text>
            <Text style={styles.cardText}>
              The app is loading correctly.{'\n'}
              This is a simplified version for testing.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📍 Map Coming Soon</Text>
            <Text style={styles.cardText}>
              The full map with incidents{'\n'}
              and precincts will load next.
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.button}
            onPress={() => alert('Button works!')}
          >
            <Text style={styles.buttonText}>Test Button</Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔧 Troubleshooting</Text>
            <Text style={styles.cardText}>
              If you see this screen,{'\n'}
              the basic app structure is working!
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
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
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 2,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#1a2d52',
    borderWidth: 2,
    borderColor: '#3d5a8c',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  cardText: {
    fontSize: 15,
    color: '#8b95a8',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#6a8eef',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#6a8eef',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default HomeScreen;
