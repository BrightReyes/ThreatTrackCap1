import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  return (
    <LinearGradient
      colors={['#3d5a8c', '#2d4a7c', '#1a2f5c', '#0f1d3d', '#0a1428']}
      locations={[0, 0.3, 0.6, 0.85, 1]}
      style={styles.container}
    >
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>HOME</Text>
          <TouchableOpacity style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </TouchableOpacity>
        </View>

        {/* Map Placeholder */}
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>🗺️</Text>
            <Text style={styles.mapPlaceholderLabel}>Heatmap Area</Text>
            <Text style={styles.mapPlaceholderSubtext}>Interactive map will load here</Text>
          </View>
        </View>

        {/* Report Incident Button */}
        <TouchableOpacity style={styles.reportButton}>
          <Text style={styles.reportButtonIcon}>📷</Text>
          <Text style={styles.reportButtonText}>Report an Incident</Text>
        </TouchableOpacity>

        {/* Risk Level Cards */}
        <View style={styles.riskSection}>
          <View style={styles.riskRow}>
            <View style={[styles.riskCard, styles.riskHighCard]}>
              <Text style={styles.riskNumber}>1</Text>
              <Text style={styles.riskLabel}>High Risk</Text>
            </View>
            
            <View style={[styles.riskCard, styles.riskMediumCard]}>
              <Text style={styles.riskNumber}>6</Text>
              <Text style={styles.riskLabel}>Medium</Text>
            </View>
            
            <View style={[styles.riskCard, styles.riskLowCard]}>
              <Text style={styles.riskNumber}>7</Text>
              <Text style={styles.riskLabel}>Low Risk</Text>
            </View>
          </View>
        </View>

        {/* Nearest Precinct Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nearest Precinct</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.precinctCard}>
            <View style={styles.precinctIcon}>
              <Text style={styles.precinctIconText}>🛡️</Text>
            </View>
            <View style={styles.precinctInfo}>
              <Text style={styles.precinctName}>3s Mapulang Lupa</Text>
              <View style={styles.precinctLocation}>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={styles.precinctAddress}>Sto. Rosario Rd • oculiloocupationsukula/</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.navigateIcon}>
              <Text style={styles.navigateIconText}>▶️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Incidents Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Incidents</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {/* Incident Card - Theft */}
          <View style={styles.incidentCard}>
            <View style={[styles.incidentIcon, styles.incidentTheftIcon]}>
              <Text style={styles.incidentIconText}>⚠️</Text>
            </View>
            <View style={styles.incidentInfo}>
              <Text style={styles.incidentTitle}>Theft</Text>
              <Text style={styles.incidentDetails}>Opan, Brgy sa Palangga</Text>
              <Text style={styles.incidentTime}>3 hours ago</Text>
            </View>
            <TouchableOpacity style={styles.incidentArrow}>
              <Text style={styles.incidentArrowText}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Incident Card - Assault */}
          <View style={styles.incidentCard}>
            <View style={[styles.incidentIcon, styles.incidentAssaultIcon]}>
              <Text style={styles.incidentIconText}>🚨</Text>
            </View>
            <View style={styles.incidentInfo}>
              <Text style={styles.incidentTitle}>Assault</Text>
              <Text style={styles.incidentDetails}>Sta Kapuolya, tapaman</Text>
              <Text style={styles.incidentTime}>6 hours ago</Text>
            </View>
            <TouchableOpacity style={styles.incidentArrow}>
              <Text style={styles.incidentArrowText}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Incident Card - Vandalism */}
          <View style={styles.incidentCard}>
            <View style={[styles.incidentIcon, styles.incidentVandalismIcon]}>
              <Text style={styles.incidentIconText}>✓</Text>
            </View>
            <View style={styles.incidentInfo}>
              <Text style={styles.incidentTitle}>Vandalism</Text>
              <Text style={styles.incidentDetails}>Sta.Brigdang na Payascosay</Text>
              <Text style={styles.incidentTime}>7 hours ago</Text>
            </View>
            <TouchableOpacity style={styles.incidentArrow}>
              <Text style={styles.incidentArrowText}>→</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Spacing for Tab Bar */}
        <View style={styles.bottomSpacer} />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  newBadge: {
    backgroundColor: '#1a2d52',
    borderWidth: 1,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  newBadgeText: {
    color: '#6a8eef',
    fontSize: 12,
    fontWeight: '700',
  },
  
  // Map Section
  mapContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  mapPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#1a2d52',
    borderWidth: 2,
    borderColor: '#3d5a8c',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  mapPlaceholderText: {
    fontSize: 48,
    marginBottom: 8,
  },
  mapPlaceholderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  mapPlaceholderSubtext: {
    fontSize: 12,
    color: '#8b95a8',
  },
  
  // Report Button
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  reportButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  reportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  
  // Risk Cards
  riskSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  riskCard: {
    width: (width - 60) / 3,
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskHighCard: {
    backgroundColor: '#1a2d52',
    borderColor: '#dc2626',
  },
  riskMediumCard: {
    backgroundColor: '#1a2d52',
    borderColor: '#f59e0b',
  },
  riskLowCard: {
    backgroundColor: '#1a2d52',
    borderColor: '#10b981',
  },
  riskNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  riskLabel: {
    fontSize: 12,
    color: '#8b95a8',
    fontWeight: '600',
  },
  
  // Sections
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  viewAllText: {
    fontSize: 13,
    color: '#6a8eef',
    fontWeight: '600',
  },
  
  // Precinct Card
  precinctCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 16,
  },
  precinctIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#5178e8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  precinctIconText: {
    fontSize: 24,
  },
  precinctInfo: {
    flex: 1,
  },
  precinctName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  precinctLocation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  precinctAddress: {
    fontSize: 12,
    color: '#8b95a8',
    flex: 1,
  },
  navigateIcon: {
    padding: 8,
  },
  navigateIconText: {
    fontSize: 16,
    color: '#6a8eef',
  },
  
  // Incident Cards
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2d52',
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  incidentIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  incidentTheftIcon: {
    backgroundColor: '#f59e0b',
  },
  incidentAssaultIcon: {
    backgroundColor: '#dc2626',
  },
  incidentVandalismIcon: {
    backgroundColor: '#10b981',
  },
  incidentIconText: {
    fontSize: 20,
  },
  incidentInfo: {
    flex: 1,
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  incidentDetails: {
    fontSize: 12,
    color: '#8b95a8',
    marginBottom: 2,
  },
  incidentTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  incidentArrow: {
    padding: 8,
  },
  incidentArrowText: {
    fontSize: 18,
    color: '#6a8eef',
  },
  
  // Bottom Spacer
  bottomSpacer: {
    height: 100,
  },
});

export default HomeScreen;
