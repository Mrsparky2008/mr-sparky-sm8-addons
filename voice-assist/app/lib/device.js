// This phone, as far as the portal is concerned.
//
// Steven, 13 Oct 2026, having asked what stops somebody signing in on a phone
// that is not theirs: "binding the phone to the verification process... like
// the banks use." The name for it is DEVICE BINDING, and half of it was
// already here.
//
// WHAT WAS ALREADY TRUE, and is better than it looks: the stored sign-in sits
// in the Keychain marked WHEN_UNLOCKED_THIS_DEVICE_ONLY, so it cannot be
// restored onto another handset from an iCloud backup. A SESSION is genuinely
// bound to one phone, and Face ID unlocks it.
//
// WHAT WAS MISSING: nothing stopped a FIRST sign-in anywhere. Email and
// password, any phone in the world. The portal was never told which device it
// was talking to, so it could not tell a handset it knows from one it has
// never seen.
//
// So every phone mints an id once, keeps it in the Keychain beside the refresh
// token, and sends it with every request. The portal remembers the ones it has
// seen. An unknown one needs a code by text before it gets anywhere - which is
// the SMS machinery that has existed since signup and was never wired into
// sign-in.
//
// The id is RANDOM, not a hardware identifier. Apple does not hand out a
// stable device id and the ones people reach for instead (the IDFV, the
// advertising id) change on reinstall, are shared across an app's siblings, or
// are a privacy review waiting to happen. A random id in the Keychain answers
// the only question being asked - "is this the same phone as last time" - and
// says nothing about the phone itself.
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

const KEY_DEVICE = "msai.device";

/*
 * A real random id, from the platform's own secure generator.
 *
 * The first cut built one out of Math.random because expo-crypto is a native
 * module and that meant another App Store trip. Steven, 13 Oct 2026: "if
 * expo-crypto needs to be installed then let's install it. I don't want to be
 * going back and fixing things."
 *
 * Right call, and the reasoning for the shortcut was the weaker half of the
 * argument: the id is only a label, but a label an attacker can PREDICT is a
 * label they can wear. Math.random is seeded, repeatable under the right
 * conditions, and never meant for anything anyone might try to guess.
 */
const mintId = () => Crypto.randomUUID();

let cached = null;

/** This phone's id, minted on first use and kept until the app is deleted. */
export async function deviceId() {
  if (cached) return cached;
  try {
    const found = await SecureStore.getItemAsync(KEY_DEVICE);
    if (found) { cached = found; return cached; }
  } catch { /* fall through and mint a new one */ }

  const fresh = mintId();
  try {
    await SecureStore.setItemAsync(KEY_DEVICE, fresh, {
      // THIS_DEVICE_ONLY matters as much here as it does for the refresh
      // token. Without it the id rides an iCloud backup onto a new handset
      // and the new handset claims to be the old one - which is the whole
      // thing this is meant to stop.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch { /* unstored: it still works for this run, and re-mints next time */ }
  cached = fresh;
  return cached;
}

/**
 * What goes on the wire with every request.
 *
 * The name is for a human reading a list of devices and deciding whether to
 * revoke one. "Steven's iPhone" is a decision somebody can make; a UUID is not.
 */
export async function deviceHeaders() {
  try {
    return {
      "x-device-id": await deviceId(),
      "x-device-platform": Platform.OS,
    };
  } catch {
    return {};
  }
}

/** Forget this phone. Signing out should not make it a stranger again - that
 *  would ask for an SMS code every time somebody signs out and back in - so
 *  this is only for a deliberate "this is not my phone any more". */
export async function forgetDevice() {
  cached = null;
  try { await SecureStore.deleteItemAsync(KEY_DEVICE); } catch {}
}
