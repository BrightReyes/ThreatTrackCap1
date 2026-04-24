import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from '../screens/HomeScreen';
import ReportIncidentScreen from '../screens/ReportIncidentScreen';
import SOSReportScreen from '../screens/SOSReportScreen';
import StatusScreen from '../screens/StatusScreen';
import AlertsScreen from '../screens/AlertsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();

// Stack Navigator with all screens
const MainNavigator = ({ onLogout }) => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />
      <Stack.Screen name="SOSReport" component={SOSReportScreen} />
      <Stack.Screen name="Status" component={StatusScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen 
        name="Settings"
        options={{}}
      >
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default MainNavigator;
