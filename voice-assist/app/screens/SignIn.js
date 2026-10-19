// Screen 1 — Sign in. The same account as the Mr Sparky portal, so there is
// one identity per person and nothing new to remember.
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta } from "../components/ui";

/*
 * The app icon, not the horizontal banner. That banner is made for a van and
 * a letterhead - white and yellow blocks on a white page - and on a dark
 * phone screen it is a rectangle pasted onto navy. This is the thing he just
 * tapped to get here (Steven, 14 Oct 2026).
 */
const ICON = require("../assets/icon.png");
import { C, R, S, T } from "../lib/theme";
import {
  finishReset, friendlyAuthError, hasStoredSession, setNewPassword, signIn,
  startReset, storedEmail, unlock,
} from "../lib/auth";

/**
 * `onBack` is the way OFF this screen, and it is not decoration.
 *
 * SignIn has never had one. It did not show while Welcome was the first thing
 * every launch - you got here by choosing to, and force-closing was the way
 * out. Two things changed that on 19 Oct 2026: a phone with a stored session
 * now opens here without being asked, and `unlock()` on a dead session throws
 * the Keychain entry away and leaves you on the password field. So a handset
 * handed on, whose last owner's session has lapsed, would land on a password
 * screen for somebody else's account with nowhere to go - and "start an
 * application" lives on Welcome and nowhere else, so that is the whole route
 * to Apply gone.
 *
 * It costs one launch at most, because the Keychain entry is already gone and
 * the next launch answers false and shows Welcome. One launch is enough for a
 * man to decide the app is broken.
 */
export default function SignIn({ onSignedIn, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);
  const [returning, setReturning] = useState(false);
  // Cognito can demand a password of their own before it will issue tokens —
  // the first time Steven sets a tech up, this is what they land on.
  const [challenge, setChallenge] = useState(null);
  const [newPassword, setNewPasswordValue] = useState("");

  /*
   * Resetting a forgotten password. Steven, 14 Oct 2026: "build a reset
   * password option."
   *
   * Two steps, one screen: ask for the code, then take the code and the new
   * password together. "" is off, "sent" means Cognito has emailed one.
   *
   * It does NOT confirm whether an account exists. Cognito will tell you,
   * which turns a sign-in screen into a way of finding out who is on the
   * network, so the message after sending is the same either way.
   */
  const [reset, setReset] = useState("");
  const [code, setCode] = useState("");

  const passwordRef = useRef(null);

  // A phone that has signed in before goes straight to Face ID. Only a fresh
  // phone (or a revoked session) ever sees the password field.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await hasStoredSession())) return;
        if (cancelled) return;
        setReturning(true);
        setEmail(await storedEmail());
        const res = await unlock();
        if (cancelled) return;
        if (res.ok) { onSignedIn(res.email); return; }
        // Only a dead session sends them back to the password field. Dismissing
        // Face ID should leave the Unlock button sitting there to try again.
        if (res.expired) {
          setError("That session has expired — sign in again.");
          setReturning(false);
        } else if (res.offline) {
          setError("Can't reach the network. Try again once you've got signal.");
        }
      } catch {
        if (!cancelled) setReturning(false);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) { setError("Email and password, please."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await signIn(email, password);
      if (res.needsNewPassword) {
        setChallenge({ session: res.session, email: res.email });
        setPassword("");
      } else {
        onSignedIn(res.email);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword() {
    if (busy) return;
    if (newPassword.length < 8) { setError("At least 8 characters."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await setNewPassword(challenge.email, challenge.session, newPassword);
      onSignedIn(res.email);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function retryUnlock() {
    setError("");
    setReturning(true);
    const res = await unlock();
    if (res.ok) { onSignedIn(res.email); return; }
    if (res.expired) {
      setError("That session has expired — sign in again.");
      setReturning(false);
    } else if (res.offline) {
      setError("Can't reach the network. Try again once you've got signal.");
    }
  }

  // Hold the logo until we know whether this phone already has a session —
  // otherwise the password field flashes up on every launch.
  if (booting) {
    return (
      <View style={[s.screen, s.centre]}>
        <Image source={ICON} style={s.icon} resizeMode="cover" />
        <ActivityIndicator color={C.brand} style={{ marginTop: 28 }} />
      </View>
    );
  }

  async function sendCode() {
    const who = email.trim();
    if (!who) { setError("Put your email in first."); return; }
    setBusy(true); setError("");
    try {
      await startReset(who);
      setReset("sent");
    } catch (err) {
      // A wrong email still reads as sent - see the note on the state above.
      if (err?.code === "UserNotFoundException") setReset("sent");
      else setError(friendlyAuthError(err));
    } finally { setBusy(false); }
  }

  async function applyReset() {
    if (!code.trim() || !newPassword) { setError("Both the code and a new password."); return; }
    setBusy(true); setError("");
    try {
      await finishReset(email.trim(), code, newPassword);
      // Straight in rather than handing him back to a form he has just filled
      // in. He proved who he was twice over to get here.
      const res = await signIn(email.trim(), newPassword);
      if (res?.ok) { onSignedIn(res.email); return; }
      setReset(""); setCode(""); setNewPasswordValue("");
      setPassword(newPassword);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally { setBusy(false); }
  }

  // Keyboard handling is iOS's own (automaticallyAdjustKeyboardInsets) rather
  // than KeyboardAvoidingView: the JS relayout on focus is what took the whole
  // screen out the moment the cursor landed in the email field.
  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <View style={s.logoWrap}>
          <Image source={ICON} style={s.icon} resizeMode="cover" />
        </View>

        {reset ? (
          <>
            {reset === "sent" ? (
              <>
                <Text style={s.lead}>
                  If that email has an account, a code is on its way to it.
                </Text>
                <Field
                  label="Code from the email" value={code} onChangeText={setCode}
                  keyboardType="number-pad" autoFocus returnKeyType="next"
                  placeholder="6 digits"
                />
                <Field
                  label="New password" value={newPassword} onChangeText={setNewPasswordValue}
                  secureTextEntry autoCapitalize="none" textContentType="newPassword"
                  returnKeyType="go" onSubmitEditing={applyReset}
                  placeholder="8+ characters with a number"
                />
                {!!error && <Text style={s.error}>{error}</Text>}
                <Cta label={busy ? "Setting…" : "Set it and sign in"} onPress={applyReset} disabled={busy} />
                <Pressable onPress={sendCode} disabled={busy} style={s.linkWrap}>
                  <Text style={s.link}>Send another code</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.lead}>
                  We will email you a code to set a new password.
                </Text>
                <Field
                  label="Email" value={email} onChangeText={setEmail}
                  keyboardType="email-address" autoCapitalize="none" autoComplete="email"
                  textContentType="username" returnKeyType="go" onSubmitEditing={sendCode}
                  placeholder="you@example.com.au"
                />
                {!!error && <Text style={s.error}>{error}</Text>}
                <Cta label={busy ? "Sending…" : "Email me a code"} onPress={sendCode} disabled={busy} />
              </>
            )}
            <Pressable
              onPress={() => { setReset(""); setCode(""); setNewPasswordValue(""); setError(""); }}
              style={s.linkWrap}
            >
              <Text style={s.link}>Back to signing in</Text>
            </Pressable>
          </>
        ) : challenge ? (
          <>
            <Text style={s.lead}>Pick a password for this account.</Text>
            <Field
              label="New password" value={newPassword} onChangeText={setNewPasswordValue}
              secureTextEntry autoFocus onSubmitEditing={submitNewPassword} returnKeyType="go"
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Cta label={busy ? "Setting…" : "Set password"} onPress={submitNewPassword} disabled={busy} />
          </>
        ) : returning ? (
          <>
            <Text style={s.lead}>{email || "Signed in on this phone"}</Text>
            {!!error && <Text style={s.error}>{error}</Text>}
            <Cta label="Unlock" onPress={retryUnlock} />
            <Pressable onPress={() => { setReturning(false); setError(""); }} style={s.linkWrap}>
              <Text style={s.link}>Sign in as someone else</Text>
            </Pressable>
            {onBack ? (
              <Pressable onPress={onBack} style={s.linkWrap}>
                <Text style={s.link}>Back to the start</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Field
              label="Email" value={email} onChangeText={setEmail}
              placeholder="you@example.com.au"
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              textContentType="username" returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            {/* Beside the password, not under the button: a man looks for the
                way out at the field that beat him, and burying it means he
                has already failed twice before he finds it. */}
            <Pressable onPress={() => { setReset("ask"); setError(""); }} hitSlop={8} style={s.resetWrap}>
              <Text style={s.link}>Reset password</Text>
            </Pressable>
            <Field
              inputRef={passwordRef}
              label="Password" value={password} onChangeText={setPassword}
              secureTextEntry autoCapitalize="none" textContentType="password"
              returnKeyType="go" onSubmitEditing={submit}
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Cta label={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy} />
            <Text style={s.note}>Once only on this phone. Face ID after that.</Text>
            {onBack ? (
              <Pressable onPress={onBack} style={s.linkWrap}>
                <Text style={s.link}>Back to the start</Text>
              </Pressable>
            ) : null}
          </>
        )}

      </ScrollView>
    </View>
  );
}

function Field({ label, inputRef, ...props }) {
  return (
    <View style={{ marginBottom: S.gap }}>
      <Text style={[T.label, { marginBottom: 7 }]}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={s.input}
        placeholderTextColor={C.muted}
        selectionColor={C.brand}
        {...props}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  centre: { alignItems: "center", justifyContent: "center" },
  scroll: { padding: S.screen, paddingTop: 60, paddingBottom: 40 },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  resetWrap: { alignSelf: "flex-end", marginTop: -4, marginBottom: 4 },
  icon: { width: 138, height: 138, borderRadius: 31 },
  lead: { ...T.body, textAlign: "center", marginBottom: S.gap },
  input: {
    minHeight: S.touch, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 14, color: C.ink, fontSize: 16,
  },
  error: {
    color: C.warnChipInk, fontSize: 13, lineHeight: 18, marginBottom: S.gap,
    backgroundColor: C.warnChipBg, borderRadius: R.card, padding: 11,
  },
  note: { ...T.small, textAlign: "center", marginTop: 14 },
  linkWrap: { paddingVertical: 14, alignItems: "center" },
  link: { color: C.neutral, fontSize: 13.5, fontWeight: "600" },
});
