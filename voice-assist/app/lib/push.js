// Being told a job is going, without Telegram.
//
// Steven, 9 Sep 2026: "having one app is always better than two, or three now."
// Telegram keeps the job feed only until this is proven on a real job - both
// fire together first, and the group is switched off after, never before.
//
// WHY THIS CANNOT SHIP OVER THE AIR. Push is a native capability: the
// entitlement is compiled into the binary and the permission is granted by iOS
// to that binary. Every other change in this app reaches the phone in minutes;
// this one needed a provisioning profile with aps-environment on it, a new
// build, and a trip through TestFlight.
//
// WHAT THE TOKEN IS. iOS hands the app an unguessable string that is the
// address for this app on this phone. It is not an account id and it is not
// stable: deleting and reinstalling produces a new one, which is why the portal
// keys devices on the token rather than on the person. Two phones, two rows.
//
// NOTHING HERE DECIDES ANYTHING. It asks, it registers, it listens. Who is told
// about a job is decided by canAccessJobs in the portal, where the rule has
// tests and where it cannot be edited by holding the phone.
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as portal from "./portal";
import { tookOverHandset } from "./auth";

/*
 * An alert that arrives while the app is open should still be seen. The default
 * is to swallow it, which on a job feed means the one time a man is already in
 * the app is the one time he is not told.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask, then register. Returns the token, or null with a reason.
 *
 * Never asks twice. iOS only ever shows the permission box once per install -
 * a second request returns the previous answer silently - so a "no" has to be
 * reported rather than retried, or the app sits there believing it asked.
 */
export async function enable() {
  // A simulator has no push service at all, and asking produces a confusing
  // failure rather than an honest one.
  if (!Device.isDevice) return { token: null, why: "simulator" };

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    /*
     * allowAlert/allowSound are the ask. allowCriticalAlerts is deliberately
     * NOT requested: it needs an entitlement Apple grants case by case, and a
     * job alert is time sensitive, not an emergency siren.
     */
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    status = asked.status;
  }
  if (status !== "granted") return { token: null, why: "denied" };

  /*
   * TWO TOKENS, AND THAT IS DELIBERATE.
   *
   * Steven, 13 Oct 2026, on being told the Expo route means Apple's key lives
   * on Expo's servers and every job alert passes through them: "nope, I'll go
   * straight into Apple."
   *
   * Right call. The key then sits in his own Secrets Manager beside every
   * other key he owns, and a client's address stops passing through a third
   * party on its way to a phone.
   *
   * Going direct needs the DEVICE token - the raw one Apple issues - not the
   * Expo one. But the portal's register route still validates an Expo token
   * today, so sending only the new one would break registration the moment
   * this publishes. Both go up: the portal keeps taking `token` as it always
   * has, and starts using `apnsToken` whenever its half is ready. Nothing has
   * to land in the same minute.
   *
   * The Expo one can be dropped once the direct sender is live and proven.
   */
  const projectId = "d31c0122-3886-4d57-8388-ec1bfd817f9f";
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return { token: null, why: "no token" };

  // Apple's own address for this app on this phone. A hex string, not an
  // ExponentPushToken[...], and the only thing APNs will accept.
  let apnsToken = null;
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    apnsToken = typeof device?.data === "string" ? device.data : null;
  } catch { /* the Expo token still registers; direct push waits */ }

  /*
   * WHICH APPLE, AND IT IS NOT ONE APPLE.
   *
   * APNs has two environments and a token minted in one is refused by the
   * other with BadDeviceToken — which reads as a dead phone rather than as
   * the wrong host, and is the usual way a day disappears.
   *
   *   TestFlight and App Store  ->  api.push.apple.com
   *   a development build       ->  api.sandbox.push.apple.com
   *
   * The dev profile also builds a SEPARATE app with its own bundle id, so its
   * topic is not the one in the secret either. Neither of those can be worked
   * out from the token, so both are sent WITH it and stored beside it. Working
   * it out at send time means guessing months later about a phone nobody can
   * reach.
   */
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier || null;
  const variant = Constants.expoConfig?.extra?.variant || null;

  /*
   * WHETHER THIS PHONE CAN ACTUALLY SHOW ANYTHING.
   *
   * A device token and permission to display an alert are two different
   * things on iOS: the token is issued whether or not the man ever said yes,
   * and APNs reports every push to a refused phone as DELIVERED while iOS
   * drops it in silence.
   *
   * So the portal cannot tell "we told him" from "we sent it to a phone that
   * can show nothing" - and the difference is a missed job. It is sent at
   * registration and refreshed every time, because he can revoke it in
   * Settings months later and nothing would otherwise notice.
   */
  /*
   * WHICH PHONE THIS IS, IN WORDS.
   *
   * The network session, 14 Oct 2026, building the device list: Apple stopped
   * giving apps the user-set device name without an entitlement, so a list of
   * handsets reads "iPhone", "iPhone", "iPhone". Two phones on one account are
   * then told apart only by a date, which is no use to whoever has to decide
   * which one to revoke.
   *
   * Model and OS need no entitlement and are enough: "iPhone 15 Pro, iOS 18.2"
   * is a man's own phone to him and distinguishable to an admin. Nothing here
   * identifies a person - it is the same string every app on the handset can
   * read.
   */
  const model = Device.modelName || null;
  const osVersion = Device.osVersion
    ? `${Device.osName || Platform.OS} ${Device.osVersion}`
    : null;

  await portal.registerPush({
    token,
    apnsToken,
    platform: Platform.OS,
    canShowAlerts: true,
    bundleId,
    model,
    osVersion,
    /*
     * This handset had a DIFFERENT person signed in immediately before, which
     * means the last one left without a clean sign-out. Reported, never acted
     * on here: whether that retires his row is the portal's call, because the
     * portal owns what a device row is keyed on.
     */
    tookOverHandset: tookOverHandset(),
    // The portal decides; this is what it decides FROM. Production unless
    // this is plainly a development build.
    apnsEnvironment: variant === "dev" || __DEV__ ? "sandbox" : "production",
  });
  return { token, why: "" };
}

/** Hand a phone back and stop getting other people's jobs on it. */
export async function disable(token) {
  if (!token) return;
  try { await portal.unregisterPush({ token }); } catch { /* signing out anyway */ }
}

/**
 * Wire the app up once it knows who is signed in.
 *
 * `onJob` is given a job number when an alert is TAPPED - both from a cold
 * start (the notification that launched the app) and from one tapped while the
 * app is already running. A push nobody can act on from the lock screen is a
 * Telegram message with extra steps.
 */
export function usePush({ signedIn, onJob }) {
  const token = useRef(null);

  useEffect(() => {
    let gone = false;
    if (!signedIn) return undefined;

    enable()
      .then((r) => { if (!gone) token.current = r.token; })
      // Never blocks anything. A man who said no to notifications still has a
      // working app, and he still has Telegram until it is switched off.
      .catch(() => {});

    const jobFrom = (response) => {
      const n = response?.notification?.request?.content?.data?.jobNumber;
      if (n && onJob) onJob(String(n));
    };

    // The alert that LAUNCHED the app, if that is how it was opened.
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (!gone && r) jobFrom(r);
    }).catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(jobFrom);
    return () => { gone = true; sub.remove(); };
  }, [signedIn, onJob]);

  return { token };
}

/**
 * What the phone can actually tell us about notifications, for the account
 * sheet. Pure enquiry: it never asks for permission, so opening the account
 * screen cannot burn the one permission prompt iOS allows.
 */
export async function pushState() {
  try {
    if (!Device.isDevice) return { granted: false, why: "simulator" };
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return { granted: false, why: status };
    let apns = null;
    try {
      const d = await Notifications.getDevicePushTokenAsync();
      apns = typeof d?.data === "string" ? d.data : null;
    } catch (e) {
      return { granted: true, apns: null, why: e?.message || "no device token" };
    }
    return { granted: true, apns, why: "" };
  } catch (e) {
    return { granted: false, why: e?.message || "unknown" };
  }
}
