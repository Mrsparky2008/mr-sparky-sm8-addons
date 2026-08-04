// Sign-in — the SAME Cognito pool as the Mr Sparky subcontractor portal.
// Steven's rule: one login per person across the portal and this app, so there
// is nothing new to remember and no second set of accounts to keep straight.
//
// No Amplify: it drags in a large native surface for what is three HTTPS calls.
// Cognito's plain JSON API is enough.
//
// What lives where:
//   refresh token  -> expo-secure-store (Keychain). Long-lived, so it is the
//                     thing Face ID guards.
//   id token       -> memory only. Short-lived; re-minted from the refresh
//                     token on launch and whenever it is close to expiring.

import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";

const REGION = "us-east-1";
const CLIENT_ID = "5pvilebmogbvcf1edja0uatcrj";
const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;

const KEY_REFRESH = "msai.refresh";
const KEY_EMAIL = "msai.email";

// Re-mint a minute before expiry rather than after a 401 — a token that dies
// mid-sentence would otherwise surface as a mystery failure.
const REFRESH_MARGIN_MS = 60 * 1000;

let idToken = null;
let idTokenExp = 0;
let cachedEmail = "";

async function cognito(target, body) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `Cognito ${res.status}`);
    err.code = String(json.__type || "").split("#").pop();
    throw err;
  }
  return json;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Hermes has atob, but a failure here would silently cost a network refresh on
// every single request, so the decode does not depend on it being there.
function fromBase64(s) {
  if (typeof globalThis.atob === "function") return globalThis.atob(s);
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const ch of s) {
    if (ch === "=") break;
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}

function decodeExp(token) {
  try {
    const payload = token.split(".")[1];
    const pad = "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(fromBase64(payload.replace(/-/g, "+").replace(/_/g, "/") + pad));
    cachedEmail = json.email || cachedEmail;
    return (json.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

function keep(result) {
  const auth = result.AuthenticationResult;
  if (!auth?.IdToken) throw new Error("Sign-in did not return a token");
  idToken = auth.IdToken;
  idTokenExp = decodeExp(auth.IdToken);
  return auth;
}

/**
 * Email + password, single call. The pool's app client allows USER_AUTH, whose
 * PASSWORD challenge can be answered up front — so there is no second round
 * trip and no SRP maths to carry.
 */
export async function signIn(email, password) {
  const result = await cognito("InitiateAuth", {
    AuthFlow: "USER_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME: email.trim(),
      PASSWORD: password,
      PREFERRED_CHALLENGE: "PASSWORD",
    },
  });

  // A brand-new account Steven has just created for a tech lands here: Cognito
  // wants a password of their choosing before it will issue tokens.
  if (result.ChallengeName === "NEW_PASSWORD_REQUIRED") {
    return { needsNewPassword: true, session: result.Session, email: email.trim() };
  }

  const auth = keep(result);
  if (auth.RefreshToken) {
    await SecureStore.setItemAsync(KEY_REFRESH, auth.RefreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(KEY_EMAIL, email.trim().toLowerCase());
  }
  return { ok: true, email: cachedEmail || email.trim() };
}

/** Finish a NEW_PASSWORD_REQUIRED challenge with the password they picked. */
export async function setNewPassword(email, session, newPassword) {
  const result = await cognito("RespondToAuthChallenge", {
    ClientId: CLIENT_ID,
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    Session: session,
    ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
  });
  const auth = keep(result);
  if (auth.RefreshToken) {
    await SecureStore.setItemAsync(KEY_REFRESH, auth.RefreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(KEY_EMAIL, email.toLowerCase());
  }
  return { ok: true, email: cachedEmail || email };
}

/** Is there a stored sign-in on this phone? Cheap; no network. */
export async function hasStoredSession() {
  return Boolean(await SecureStore.getItemAsync(KEY_REFRESH));
}

export async function storedEmail() {
  return (await SecureStore.getItemAsync(KEY_EMAIL)) || "";
}

/**
 * Face ID (or the passcode) to unlock a stored sign-in, then swap the refresh
 * token for a fresh ID token. Falls through without a prompt on a phone that
 * has no biometrics enrolled — the Keychain is still the thing protecting it.
 */
export async function unlock() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (hasHardware && enrolled) {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock AI Assist",
      fallbackLabel: "Use passcode",
    });
    if (!res.success) return { ok: false, cancelled: true };
  }
  try {
    await refresh();
    return { ok: true, email: cachedEmail || (await storedEmail()) };
  } catch (err) {
    // A refresh token that no longer works means a real sign-in is needed —
    // password changed, or Steven revoked the session.
    await signOut();
    return { ok: false, expired: true };
  }
}

async function refresh() {
  const token = await SecureStore.getItemAsync(KEY_REFRESH);
  if (!token) throw new Error("no stored session");
  const result = await cognito("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: { REFRESH_TOKEN: token },
  });
  keep(result);
}

/** A valid ID token for the backend, refreshed if it is about to lapse. */
export async function getIdToken() {
  if (idToken && Date.now() < idTokenExp - REFRESH_MARGIN_MS) return idToken;
  await refresh();
  return idToken;
}

export async function signOut() {
  idToken = null;
  idTokenExp = 0;
  cachedEmail = "";
  await SecureStore.deleteItemAsync(KEY_REFRESH);
  await SecureStore.deleteItemAsync(KEY_EMAIL);
}

/** Turn Cognito's error codes into something worth reading on a phone. */
export function friendlyAuthError(err) {
  switch (err?.code) {
    case "NotAuthorizedException":
      return "That email and password don't match.";
    case "UserNotFoundException":
      return "No account for that email. Ask Steven to set one up.";
    case "PasswordResetRequiredException":
      return "Your password needs resetting — sign in on the portal first.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many tries. Give it a minute.";
    case "InvalidPasswordException":
      return "That password is too weak — 8+ characters with a number.";
    default:
      return err?.message || "Couldn't sign in. Check your signal and try again.";
  }
}
