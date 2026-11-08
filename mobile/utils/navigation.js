import { CommonActions, StackActions } from '@react-navigation/native';

/**
 * Go to a main page (Home, Status, Alerts, Settings) without stacking copies.
 *
 * React Navigation 7 changed `navigate(name)`: it no longer goes back to a
 * screen that is already in the stack, it pushes a NEW one. Switching
 * Home <-> Reports therefore piled up Home/Status/Home/Status..., remounted
 * Home every time (loading screen, re-running popups) and kept old screens
 * such as the report form, with their alerts, mounted underneath.
 *
 * If the screen is already in the stack we pop back to it (StackActions.popTo);
 * otherwise we navigate to it normally.
 *
 * Works with a screen's `navigation` prop, `useNavigation()`, or a
 * NavigationContainer ref.
 */
export const goToMainScreen = (navigation, name, params) => {
  if (!navigation) return;

  let state = null;
  try {
    state = typeof navigation.getRootState === 'function'
      ? navigation.getRootState()
      : navigation.getState?.();
  } catch (err) {
    state = null;
  }

  const routes = state?.routes || [];
  const currentRoute = routes[state?.index ?? routes.length - 1];
  const existsInStack = routes.some((route) => route.name === name);

  // Already on it: just pass the new params (e.g. Track Status -> Home).
  if (currentRoute?.name === name) {
    if (params) {
      navigation.dispatch({ ...CommonActions.setParams(params), source: currentRoute.key });
    }
    return;
  }

  if (existsInStack) {
    navigation.dispatch(StackActions.popTo(name, params));
  } else {
    navigation.navigate(name, params);
  }
};
