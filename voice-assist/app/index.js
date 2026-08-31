import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';

// Dev builds paint every console.error as a full-screen red box. This one is a
// known deprecation nag from deep inside the Vapi voice stack — the upgrade is
// on the next-native-build list (@daily-co/react-native-daily-js is a native
// module, so it can't ship OTA). Silencing the nag, not the category: anything
// else still screams.
LogBox.ignoreLogs([/daily-js version .* is no longer supported/]);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
