import React from 'react';
import {
  CardStyleInterpolators,
  createStackNavigator,
  TransitionSpecs,
} from '@react-navigation/stack';

import HomeScreen from '../screens/HomeScreen';
import SOSGatewayScreen from '../screens/SOSGatewayScreen';
import ReportIncidentScreen from '../screens/ReportIncidentScreen';
import SOSReportScreen from '../screens/SOSReportScreen';
import StatusScreen from '../screens/StatusScreen';
import AlertsScreen from '../screens/AlertsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ResponseAlertListener from '../components/ResponseAlertListener';

const Stack = createStackNavigator();

const baseTransitionOptions = {
  headerShown: false,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  cardStyle: { backgroundColor: '#f8fafc' },
  transitionSpec: {
    open: TransitionSpecs.TransitionIOSSpec,
    close: TransitionSpecs.TransitionIOSSpec,
  },
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
};

const mainPageOptions = {
  cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
  transitionSpec: {
    open: TransitionSpecs.FadeInFromBottomAndroidSpec,
    close: TransitionSpecs.FadeOutToBottomAndroidSpec,
  },
};

const urgentFlowOptions = {
  gestureDirection: 'vertical',
  cardStyleInterpolator: CardStyleInterpolators.forModalPresentationIOS,
};

// Stack Navigator with all screens
const MainNavigator = ({ onLogout }) => {
  return (
    <>
      <Stack.Navigator
        initialRouteName="SOSGateway"
        detachInactiveScreens
        screenOptions={baseTransitionOptions}
      >
        <Stack.Screen name="SOSGateway" component={SOSGatewayScreen} options={urgentFlowOptions} />
        <Stack.Screen name="Home" component={HomeScreen} options={mainPageOptions} />
        <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />
        <Stack.Screen name="SOSReport" component={SOSReportScreen} options={urgentFlowOptions} />
        <Stack.Screen name="Status" component={StatusScreen} options={mainPageOptions} />
        <Stack.Screen name="Alerts" component={AlertsScreen} options={mainPageOptions} />
        <Stack.Screen
          name="Settings"
          options={mainPageOptions}
        >
          {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
        </Stack.Screen>
      </Stack.Navigator>
      <ResponseAlertListener />
    </>
  );
};

export default MainNavigator;
