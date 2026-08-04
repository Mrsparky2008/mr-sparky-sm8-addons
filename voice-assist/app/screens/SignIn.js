// Screen 1 — Sign in. The same account as the Mr Sparky portal, so there is
// one identity per person and nothing new to remember.
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta, Logo } from "../components/ui";
import { C, R, S, T } from "../lib/theme";
import {
  friendlyAuthError, hasStoredSession, setNewPassword, signIn, storedEmail, unlock,
} from "../lib/auth";

export default function SignIn({ onSignedIn }) {
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
        if (res.expired) setError("That session has expired — sign in again.");
        setReturning(false);
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
    if (res.expired) setError("That session has expired — sign in again.");
    setReturning(false);
  }

  // Hold the logo until we know whether this phone already has a session —
  // otherwise the password field flashes up on every launch.
  if (booting) {
    return (
      <View style={[s.screen, s.centre]}>
        <Logo width={200} />
        <ActivityIndicator color={C.brand} style={{ marginTop: 28 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <Logo width={224} />
        </View>

        {challenge ? (
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
          </>
        ) : (
          <>
            <Field
              label="Email" value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              textContentType="username" returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              inputRef={passwordRef}
              label="Password" value={password} onChangeText={setPassword}
              secureTextEntry autoCapitalize="none" textContentType="password"
              returnKeyType="go" onSubmitEditing={submit}
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Cta label={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy} />
            <Text style={s.note}>One sign-in per phone — Face ID unlocks it after that.</Text>
          </>
        )}

        <Text style={s.footer}>Same login as the Mr Sparky portal</Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  logoWrap: { alignItems: "center", marginBottom: 36 },
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
  footer: { ...T.small, textAlign: "center", marginTop: 34, opacity: 0.75 },
});
