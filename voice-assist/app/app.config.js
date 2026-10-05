// Which of the two apps this build is.
//
// app.json says what the app IS — permissions, plugins, icons, the things both
// builds share. This file says which one is being built, and nothing else.
//
// The point is that Steven's daily driver never has to come off the phone to
// test the next version. The dev build carries its own bundle identifier, so
// iOS treats it as a separate app and both sit on the home screen at once.
//
//   npx expo start                       -> production identity
//   APP_VARIANT=dev npx expo start       -> the dev app
//
// eas.json sets APP_VARIANT per build profile, so a build never depends on
// remembering to export it.
const IS_DEV = process.env.APP_VARIANT === "dev";

export default ({ config }) => ({
  ...config,

  /*
   * "Mr Sparky", not "AI Assist".
   *
   * Steven, 4 Oct 2026. The app started as one feature and became the whole
   * thing - work, the day, money, invoices - so naming it after the feature
   * stopped making sense. The brand is the honest name, and it is short enough
   * that iOS will not truncate it on the home screen.
   *
   * This is a NATIVE change: the home-screen name lives in Info.plist and is
   * baked in at build time. It cannot ship over the air - it needs a rebuild
   * and an App Store submission, and Jason and his employees get it as an
   * ordinary update.
   *
   * The bundle id is deliberately NOT changed. Same id means the update lands
   * on top of what they already have, their sign-in survives (the keychain is
   * keyed to it) and there is one listing rather than two apps on a phone. A
   * new bundle id would mean a fresh App Store listing, a new review, a manual
   * install and signing in again.
   *
   * The App Store listing name is set separately in App Store Connect and has
   * to be changed there too.
   */
  name: IS_DEV ? "Mr Sparky Dev" : "Mr Sparky",

  // A URL scheme is claimed device-wide and iOS does not define which app wins
  // when two claim the same one. Sharing it would mean the ServiceM8 job-card
  // button opening whichever app iOS felt like — so the dev app gets its own.
  scheme: IS_DEV ? "mrsparky-aiassist-dev" : "mrsparky-aiassist",

  ios: {
    ...config.ios,
    bundleIdentifier: IS_DEV
      ? "au.com.mrsparky.aiassist.dev"
      : "au.com.mrsparky.aiassist",
  },

  android: {
    ...config.android,
    package: IS_DEV ? "au.com.mrsparky.aiassist.dev" : "au.com.mrsparky.aiassist",
  },

  extra: {
    ...config.extra,
    // Read at runtime so the app can say out loud which one you are looking at.
    // Two identical dark apps on one home screen is a mistake waiting to happen,
    // and the mistake would be approving a real claim from a test build.
    variant: IS_DEV ? "dev" : "production",
    // The iOS build number for the current runtime. EAS numbers builds
    // remotely, so the JS bundle cannot read it natively without
    // expo-application (not in build 29). Kept honest by hand: runtime
    // 2.2.0 = build 29. BUMP THIS whenever a new native build ships,
    // in the same commit that bumps version/runtime in app.json.
    iosBuild: "29",
  },
});
