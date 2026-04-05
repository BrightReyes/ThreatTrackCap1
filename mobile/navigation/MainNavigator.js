import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import ReportIncidentScreen from '../screens/ReportIncidentScreen';
import SOSReportScreen from '../screens/SOSReportScreen';
import StatusScreen from '../screens/StatusScreen';
import AlertsScreen from '../screens/AlertsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ iconText, label, focused }) => (
  <View style={styles.tabIconContainer}>
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {iconText}
    </Text>
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
      {label}
    </Text>
  </View>
);

// Stack Navigator for Home (includes Report and SOS screens)
const HomeStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />
      <Stack.Screen name="SOSReport" component={SOSReportScreen} />
    </Stack.Navigator>
  );
};

const MainNavigator = ({ onLogout }) => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#6a8eef',
        tabBarInactiveTintColor: '#4a5f8a',
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconText="🏠" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen 
        name="Status" 
        component={StatusScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconText="📄" label="Status" focused={focused} />
          ),
        }}
      />
      <Tab.Screen 
        name="Alerts" 
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconText="🔔" label="Alerts" focused={focused} />
          ),
          tabBarBadge: 2,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen 
        name="Settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconText="⚙️" label="Settings" focused={focused} />
          ),
        }}
      >
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1a2d52',
    borderRadius: 16,
    borderTopWidth: 0,
    height: 70,
    paddingBottom: 10,
    paddingTop: 10,
    borderWidth: 1.5,
    borderColor: '#3d5a8c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4a5f8a',
  },
  tabLabelFocused: {
    color: '#6a8eef',
  },
  badge: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    top: 8,
  },
});

export default MainNavigator;
