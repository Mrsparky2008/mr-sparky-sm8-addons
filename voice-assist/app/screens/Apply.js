// Having a look around — signing up for the demo.
//
// This is a recruitment pitch, not an application. Steven has already spoken to
// this person; the screen exists so they can get in and see what the work pays
// without filling in anything heavy. Four boxes and a text message, doable
// standing at a wholesaler counter.
//
// Insurance, workers comp, ABN, service areas and the contract are all
// deliberately absent. They belong to onboarding, which happens after someone
// is interested, and putting any of it here would kill the signup.
//
// Two things are verified because they are cheap and they prove a real sparky:
// the mobile, by a code, and the licence, against the live NSW register. The
// licence check must FAIL SOFT - if the register cannot be reached the person
// still gets in and the number lands on Steven's desk. Never turn away a real
// electrician because a government website had a bad morning.
import { useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta, Header } from "../components/ui";
import { startSignup, verifyCode, setPassword, searchBusiness, isFieldError } from "../lib/demo";
import { C, R, S, T } from "../lib/theme";

const MOBILE = /^0\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;

const FIELDS = [
  {
    key: "name", label: "YOUR NAME", placeholder: "Dave Miller",
    autoCapitalize: "words", autoComplete: "name",
  },
  {
    key: "mobile", label: "MOBILE", placeholder: "0412 345 678",
    keyboardType: "phone-pad", autoComplete: "tel",
    hint: "We'll text you a code",
  },
  {
    key: "email", label: "EMAIL", placeholder: "dave@millerelectrical.com.au",
    keyboardType: "email-address", autoCapitalize: "none", autoComplete: "email",
  },
  {
    key: "licence", label: "ELECTRICAL LICENCE NUMBER", placeholder: "184060C",
    autoCapitalize: "characters",
    hint: "Checked against the NSW register",
  },
];

function validate(v) {
  const e = {};
  if (String(v.name || "").trim().length < 2) e.name = "Enter your full name";
  if (!MOBILE.test(String(v.mobile || "").replace(/\s/g, ""))) {
    e.mobile = "Enter a 10-digit Australian mobile";
  }
  if (!EMAIL.test(String(v.email || "").trim())) e.email = "Enter a valid email address";
  if (String(v.licence || "").trim().length < 4) {
    e.licence = "Enter your electrical licence number";
  }
  return e;
}

/**
 * "Mr Steven Sukar" -> "Steven". People put a title in the name box, and
 * greeting someone as "Mr" undoes the impression the rest of the screen is
 * working to make. Falls back to the whole string rather than showing nothing
 * if a name is only a title.
 */
const firstName = (full) => {
  const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "mx"]);
  const words = String(full || "").trim().split(/\s+/)
    .filter((w) => w && !TITLES.has(w.replace(/\./g, "").toLowerCase()));
  return words[0] || String(full || "").trim();
};

/** "0412345678" -> "0412 345 678", for reading a number back to someone. */
const prettyMobile = (m) => {
  const d = String(m || "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : m;
};

export default function Apply({ onBack }) {
  const [step, setStep] = useState("details");
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [licence, setLicence] = useState(null);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(null);
  const [business, setBusiness] = useState(null);
  const [bizQuery, setBizQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [noMatches, setNoMatches] = useState(false);
  const [password, setPasswordValue] = useState("");
  const codeRef = useRef(null);
  const bizTimer = useRef(null);
  // The query a response must still match to be allowed on screen.
  const bizWanted = useRef("");

  const set = (key) => (text) => {
    setValues((v) => ({ ...v, [key]: text }));
    // Clearing on edit rather than on submit means the message goes the moment
    // they start fixing it, instead of nagging until they press again.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  // Debounced so a search does not fire on every keystroke. The register is a
  // government service and a sparky types faster than it answers.
  const onBizQuery = (text) => {
    setBizQuery(text);
    setBusiness(null);
    setNoMatches(false);
    // Old matches go the instant they keep typing. Leaving them up while a new
    // search runs is what made it look like the search was stuck on "Mr Sparky"
    // long after the box said something else.
    setMatches([]);
    if (bizTimer.current) clearTimeout(bizTimer.current);

    const q = text.trim();
    bizWanted.current = q;
    if (q.length < 3) { setSearching(false); return; }

    setSearching(true);
    bizTimer.current = setTimeout(async () => {
      const found = await searchBusiness(q);
      // Responses come back out of order — a slow search for a short string can
      // land after a fast one for a longer string and overwrite it. Only the
      // answer to what is currently in the box is allowed on screen.
      if (bizWanted.current !== q) return;
      setMatches(found);
      setNoMatches(found.length === 0);
      setSearching(false);
    }, 450);
  };

  const pickBusiness = (m) => {
    setBusiness(m);
    setBizQuery(m.name);
    setMatches([]);
    setNoMatches(false);
    setSearching(false);
    setErrors((e) => ({ ...e, business: undefined }));
  };

  const savePassword = async () => {
    setBusy(true);
    setNotice("");
    try {
      await setPassword({ mobile: values.mobile, password });
      setDone(values.name);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Typed a business but not picked one yet? Wait. A name sitting in the box
  // unchosen is not a business - it is a half-finished search, and letting it
  // through loses the ABN silently. Nothing typed at all is fine: the business
  // is optional and a sparky without his ABN to hand should not be stuck.
  const waitingOnBusiness =
    searching || (bizQuery.trim().length >= 3 && !business && !noMatches);

  const sendCode = async () => {
    const found = validate(values);
    if (Object.keys(found).some((k) => found[k])) { setErrors(found); return; }
    setBusy(true);
    setNotice("");
    try {
      const res = await startSignup({ ...values, business });
      setLicence(res.licence || null);
      setStep("code");
    } catch (e) {
      // The portal validates properly; anything it objects to by field is shown
      // against that field rather than as a banner nobody reads.
      if (isFieldError(e)) setErrors(e.errors);
      else setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (typed) => {
    setBusy(true);
    setNotice("");
    try {
      await verifyCode({ mobile: values.mobile, code: typed });
      setStep("password");
    } catch (e) {
      setNotice(e.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setCode("");
    setNotice("");
    setBusy(true);
    try {
      await startSignup(values);
      setNotice("Code sent again.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ScrollView contentContainerStyle={[st.wrap, { paddingTop: 80 }]}>
        <Text style={st.bigTick}>✓</Text>
        <Text style={st.bigTitle}>You're in, {firstName(done)}</Text>
        <Text style={[st.blurb, { textAlign: "center" }]}>
          Your number is verified. Next we'll show you the jobs and what they pay.
        </Text>
        <Cta label="Have a look" onPress={onBack} />
      </ScrollView>
    );
  }

  if (step === "password") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Back goes to the details, not to the code. Once the number is
            verified the code screen is a dead end, and the reason someone
            turns back from here is usually to change the email — which is
            where the "already an account" message sends them. */}
        <Header title="Choose a password" onBack={() => { setNotice(""); setStep("details"); }} />
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <Text style={st.blurb}>
            Your number is verified. Pick a password and you're in — you'll sign
            in with {values.email} from now on.
          </Text>

          <View style={st.field}>
            <Text style={T.label}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={(t) => { setPasswordValue(t); setNotice(""); }}
              placeholder="At least 8 characters"
              placeholderTextColor={C.muted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              autoFocus
              style={[st.input, notice && { borderColor: C.active }]}
            />
            <Text style={st.hint}>
              Needs 8 characters with a capital, a number and a symbol
            </Text>
          </View>

          {notice ? <Text style={st.err}>{notice}</Text> : null}

          {busy
            ? <ActivityIndicator color={C.brand} style={{ marginTop: 22 }} />
            : <Cta label="Finish" onPress={savePassword} />}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === "code") {
    const filled = code.length;
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Header title="Check your phone" onBack={() => setStep("details")} />
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <Text style={st.blurb}>
            We sent a {CODE_LENGTH}-digit code to{" "}
            <Text style={{ color: C.ink }}>{prettyMobile(values.mobile)}</Text>.
          </Text>

          <Pressable style={st.code} onPress={() => codeRef.current?.focus()}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <View key={i} style={[st.cell, i < filled && { borderColor: C.brand }]}>
                <Text style={[st.cellText, i >= filled && { color: C.muted }]}>
                  {code[i] || "·"}
                </Text>
              </View>
            ))}
          </Pressable>

          {/* One real input behind the six boxes — six separate fields fight the
              keyboard and break paste-from-SMS, which is how most people do it. */}
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={(t) => {
              const clean = t.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(clean);
              // Submitting on the sixth digit saves hunting for a button with
              // the keyboard up. The code came from an SMS; finish the moment
              // it is complete.
              if (clean.length === CODE_LENGTH && !busy) submitCode(clean);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={CODE_LENGTH}
            style={st.hidden}
          />

          {busy ? <ActivityIndicator color={C.brand} style={{ marginBottom: 14 }} /> : null}

          {notice ? (
            <View style={st.pending}>
              <Text style={T.small}>{notice}</Text>
            </View>
          ) : null}

          {licence && !licence.verified ? (
            <View style={st.refer}>
              <Text style={T.small}>{licence.note}</Text>
            </View>
          ) : null}

          {licence?.verified ? (
            <View style={st.conf}>
              <Text style={st.tick}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.confTitle}>Licence {licence.number} confirmed</Text>
                <Text style={T.small}>{licence.classes} · current to {licence.expires}</Text>
              </View>
            </View>
          ) : null}

          <Text style={st.foot}>
            Didn't get it? <Text style={{ color: C.brand }} onPress={resend}>Send again</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="Have a look around" onBack={onBack} />
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Text style={st.blurb}>
          See the jobs, see what they pay, see what you'd have earned. Takes a
          minute and there's nothing to upload.
        </Text>

        {FIELDS.map((f) => (
          <View key={f.key} style={st.field}>
            <Text style={T.label}>{f.label}</Text>
            <TextInput
              value={values[f.key] || ""}
              onChangeText={set(f.key)}
              placeholder={f.placeholder}
              placeholderTextColor={C.muted}
              keyboardType={f.keyboardType || "default"}
              autoCapitalize={f.autoCapitalize || "sentences"}
              autoComplete={f.autoComplete}
              autoCorrect={false}
              style={[st.input, errors[f.key] && { borderColor: C.active }]}
            />
            {errors[f.key]
              ? <Text style={st.err}>{errors[f.key]}</Text>
              : f.hint ? <Text style={st.hint}>{f.hint}</Text> : null}
          </View>
        ))}

        <View style={st.field}>
          <Text style={T.label}>BUSINESS NAME</Text>
          <TextInput
            value={bizQuery}
            onChangeText={onBizQuery}
            placeholder="Start typing, then pick yours"
            placeholderTextColor={C.muted}
            autoCapitalize="words"
            autoCorrect={false}
            style={st.input}
          />
          {business ? (
            <Text style={st.hint}>✓ ABN {business.abn} · from the business register</Text>
          ) : matches.length ? (
            <View style={st.matches}>
              {matches.slice(0, 5).map((m) => (
                <Pressable key={m.abn + m.name} onPress={() => pickBusiness(m)} style={st.match}>
                  <Text style={st.matchName}>{m.name}</Text>
                  <Text style={T.small}>ABN {m.abn}{m.state ? ` · ${m.state}` : ""}</Text>
                </Pressable>
              ))}
            </View>
          ) : searching ? (
            <Text style={st.hint}>Searching the business register…</Text>
          ) : noMatches ? (
            <Text style={st.hint}>
              Not on the register under that name — carry on, we'll sort it later
            </Text>
          ) : (
            <Text style={st.hint}>Optional — helps us verify you faster</Text>
          )}
        </View>

        {busy
          ? <ActivityIndicator color={C.brand} style={{ marginTop: 22 }} />
          : <Cta label="Send me a code" onPress={sendCode} disabled={waitingOnBusiness} />}

        <Text style={st.foot}>
          A look around, not an application. No obligation either way.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.screen, paddingBottom: 56 },
  blurb: { ...T.small, marginBottom: 18 },
  field: { marginBottom: 13 },
  input: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.button,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 6,
    fontSize: 16,
    color: C.ink,
    minHeight: S.touch,
  },
  hint: { ...T.small, fontSize: 11.5, marginTop: 5 },
  err: { ...T.small, fontSize: 11.5, marginTop: 5, color: C.activeLight },
  code: { flexDirection: "row", gap: 6, marginBottom: 16 },
  cell: {
    flex: 1,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 14,
    alignItems: "center",
  },
  cellText: { fontSize: 20, color: C.ink, fontVariant: ["tabular-nums"] },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  pending: {
    backgroundColor: C.infoChipBg,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 13,
    gap: 4,
  },
  pendingTitle: { ...T.body, fontSize: 13.5, fontWeight: "700" },
  conf: {
    flexDirection: "row",
    gap: 9,
    backgroundColor: "rgba(47,158,87,.13)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 12,
    marginTop: 12,
  },
  tick: { color: C.earth, fontSize: 14 },
  confTitle: { ...T.body, fontSize: 13, fontWeight: "700" },
  foot: { ...T.small, fontSize: 11.5, textAlign: "center", marginTop: 16 },
  refer: {
    backgroundColor: C.warnChipBg,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 13,
    marginTop: 12,
  },
  matches: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    marginTop: 6,
    overflow: "hidden",
  },
  match: { padding: 13, borderBottomColor: C.line, borderBottomWidth: 1 },
  matchName: { ...T.body, fontSize: 14.5, fontWeight: "600" },
  bigTick: { color: C.earth, fontSize: 44, textAlign: "center", marginBottom: 10 },
  bigTitle: { ...T.body, fontSize: 21, fontWeight: "700", textAlign: "center", marginBottom: 10 },
});
