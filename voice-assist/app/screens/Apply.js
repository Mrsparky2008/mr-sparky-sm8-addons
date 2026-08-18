// Having a look around — signing up for the demo.
//
// A recruitment pitch, not an application. Steven has already spoken to this
// person; the screen exists so they can get in and see what the work pays
// without filling in anything heavy. Insurance, workers comp, service areas and
// the contract all belong to onboarding, after someone is interested.
//
// The licence comes FIRST and the name comes from the register, not the
// keyboard. Nobody can mistype their own name into a mismatch, the legal name
// is the one the register holds — which is what an RCTI needs — and being told
// "we found you" in the first ten seconds does more for credibility than any
// wording could. A preferred name sits alongside it, because Frederick goes by
// Fred and Mohammad goes by Moe.
//
// The licence check FAILS SOFT throughout. Not found, cancelled, register down:
// they still get in and it lands on Steven's desk. Turning away a real
// electrician because a government website had a bad morning is much the worse
// failure.
import { useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta, Header } from "../components/ui";
import {
  startSignup, verifyCode, setPassword, searchBusiness, checkLicence, isFieldError,
} from "../lib/demo";
import { C, R, S, T } from "../lib/theme";

const MOBILE = /^0\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "mx"]);

/** "Mr Steven Sukar" -> "Steven". Greeting someone as "Mr" undoes the rest. */
const firstName = (full) => {
  const words = String(full || "").trim().split(/\s+/)
    .filter((w) => w && !TITLES.has(w.replace(/\./g, "").toLowerCase()));
  return words[0] || String(full || "").trim();
};

/** "0412345678" -> "0412 345 678", for reading a number back to someone. */
const prettyMobile = (m) => {
  const d = String(m || "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : m;
};

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

function Field({ label, hint, error, children }) {
  return (
    <View style={st.field}>
      <Text style={T.label}>{label}</Text>
      {children}
      {error ? <Text style={st.err}>{error}</Text> : hint || null}
    </View>
  );
}

export default function Apply({ onBack }) {
  const [step, setStep] = useState("details");
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(null);

  const [licCheck, setLicCheck] = useState(null);
  const [licBusy, setLicBusy] = useState(false);
  const licTimer = useRef(null);
  const licWanted = useRef("");

  const [business, setBusiness] = useState(null);
  const [bizQuery, setBizQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [noMatches, setNoMatches] = useState(false);
  const bizTimer = useRef(null);
  const bizWanted = useRef("");

  const [code, setCode] = useState("");
  const [password, setPasswordValue] = useState("");
  const codeRef = useRef(null);

  const set = (key) => (text) => {
    setValues((v) => ({ ...v, [key]: text }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  /* -------------------------------------------------------------- licence -- */

  // The name is only theirs to type when the register has not given us one.
  const nameFromRegister = Boolean(licCheck?.verified && licCheck.isPerson);
  // A company contractor licence names the business. In NSW it must have a
  // nominated qualified supervisor holding a personal licence, but the public
  // register does not publish that link - so the company licence is taken as
  // proof of the business and the person is asked for separately.
  const companyLicence = Boolean(licCheck?.verified && !licCheck.isPerson);

  const runLicenceCheck = async (q) => {
    if (q.replace(/[^A-Za-z0-9]/g, "").length < 4) return;
    licWanted.current = q;
    setLicBusy(true);
    const res = await checkLicence(q);
    if (licWanted.current !== q) return;   // an older answer, ignore it
    setLicBusy(false);
    setLicCheck(res);
    if (res?.verified && res.isPerson) {
      setValues((v) => ({
        ...v,
        name: res.licensee,
        // Seeded, not forced. Most people leave it; Frederick changes it to Fred.
        preferred: v.preferred || firstName(res.licensee),
      }));
      setErrors((e) => ({ ...e, name: undefined }));
    }
    // A company licence has already told us the business - no point making
    // them search a register for a name we were just handed.
    if (res?.verified && !res.isPerson && !business) {
      setBizQuery(res.licensee);
      onBizQuery(res.licensee);
    }
  };

  const onLicence = (text) => {
    set("licence")(text);
    setLicCheck(null);
    if (licTimer.current) clearTimeout(licTimer.current);
    const q = text.trim();
    licWanted.current = q;
    if (q.replace(/[^A-Za-z0-9]/g, "").length < 4) { setLicBusy(false); return; }
    // Long, because this is a government register and not a search box. Leaving
    // the field is what usually triggers it; this only catches someone who
    // types and then sits there.
    licTimer.current = setTimeout(() => runLicenceCheck(q), 900);
  };

  const onLicenceBlur = () => {
    if (licTimer.current) clearTimeout(licTimer.current);
    const q = String(values.licence || "").trim();
    if (!q || licCheck || licBusy) return;
    runLicenceCheck(q);
  };

  /* ------------------------------------------------------------- business -- */

  const onBizQuery = (text) => {
    setBizQuery(text);
    setBusiness(null);
    setNoMatches(false);
    setMatches([]);   // old matches go the instant they keep typing
    if (bizTimer.current) clearTimeout(bizTimer.current);
    const q = text.trim();
    bizWanted.current = q;
    if (q.length < 3) { setSearching(false); return; }
    setSearching(true);
    bizTimer.current = setTimeout(async () => {
      const found = await searchBusiness(q);
      if (bizWanted.current !== q) return;   // a stale answer
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
    bizWanted.current = "";
  };

  // A name typed but not picked is a half-finished search, and letting it
  // through drops the ABN silently.
  const waitingOnBusiness =
    searching || (bizQuery.trim().length >= 3 && !business && !noMatches);

  /* ---------------------------------------------------------------- steps -- */

  const sendCode = async () => {
    const found = validate(values);
    if (Object.keys(found).some((k) => found[k])) { setErrors(found); return; }
    setBusy(true);
    setNotice("");
    try {
      await startSignup({ ...values, business });
      setStep("code");
    } catch (e) {
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
      await startSignup({ ...values, business });
      setNotice("Code sent again.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setBusy(true);
    setNotice("");
    try {
      await setPassword({ mobile: values.mobile, password });
      setDone(values.preferred || values.name);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------------------------------------------- screens -- */

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Back goes to the details, not the code: once the number is verified
            the code screen is a dead end, and the usual reason for turning back
            is to change the email. */}
        <Header title="Choose a password" onBack={() => { setNotice(""); setStep("details"); }} />
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <Text style={st.blurb}>
            Your number is verified. Pick a password and you're in — you'll sign
            in with {values.email} from now on.
          </Text>
          <Field
            label="PASSWORD"
            hint={<Text style={st.hint}>Needs 8 characters with a capital, a number and a symbol</Text>}
          >
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
          </Field>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header title="Check your phone" onBack={() => setStep("details")} />
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <Text style={st.blurb}>
            We sent a {CODE_LENGTH}-digit code to{" "}
            <Text style={{ color: C.ink }}>{prettyMobile(values.mobile)}</Text>.
          </Text>

          <Pressable style={st.code} onPress={() => codeRef.current?.focus()}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <View key={i} style={[st.cell, i < filled && { borderColor: C.brand }]}>
                <Text style={[st.cellText, i >= filled && { color: C.muted }]}>{code[i] || "·"}</Text>
              </View>
            ))}
          </Pressable>

          {/* One real input behind the six boxes. Six separate fields fight the
              keyboard and break pasting the code out of the SMS, which is how
              most people enter one. */}
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={(t) => {
              const clean = t.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(clean);
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
          {notice ? <View style={st.refer}><Text style={T.small}>{notice}</Text></View> : null}

          <Text style={st.foot}>
            Didn't get it? <Text style={{ color: C.brand }} onPress={resend}>Send again</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header title="Have a look around" onBack={onBack} />
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Text style={st.blurb}>
          See the jobs, see what they pay, see what you'd have earned. Takes a
          minute and there's nothing to upload.
        </Text>

        <Field
          label="ELECTRICAL LICENCE NUMBER"
          error={errors.licence}
          hint={
            licBusy ? <Text style={st.hint}>Checking the NSW register…</Text>
              : companyLicence
                ? <Text style={st.ok}>✓ {licCheck.licensee} · company licence · {licCheck.summary}</Text>
              : licCheck?.verified
                ? <Text style={st.ok}>✓ {licCheck.licensee} · {licCheck.summary}</Text>
                : licCheck
                  ? <Text style={st.warn}>{licCheck.note}</Text>
                  : <Text style={st.hint}>We'll look you up on the NSW register</Text>
          }
        >
          <TextInput
            value={values.licence || ""}
            onChangeText={onLicence}
            onBlur={onLicenceBlur}
            placeholder="184060C"
            placeholderTextColor={C.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            style={[st.input, errors.licence && { borderColor: C.active }]}
          />
        </Field>

        {companyLicence ? (
          <View style={st.refer}>
            <Text style={T.small}>
              That's the company licence. A company licence needs a nominated
              qualified supervisor, so tell us your name and we'll match your
              own licence when we talk.
            </Text>
          </View>
        ) : null}

        <Field
          label={nameFromRegister ? "NAME ON YOUR LICENCE" : "YOUR NAME"}
          error={errors.name}
          hint={nameFromRegister
            ? <Text style={st.hint}>Straight from the register — nothing to type</Text>
            : null}
        >
          <TextInput
            value={values.name || ""}
            onChangeText={set("name")}
            placeholder="Dave Miller"
            placeholderTextColor={C.muted}
            editable={!nameFromRegister}
            autoCapitalize="words"
            autoComplete="name"
            style={[
              st.input,
              nameFromRegister && st.locked,
              errors.name && { borderColor: C.active },
            ]}
          />
        </Field>

        {nameFromRegister ? (
          <Field
            label="WHAT DO WE CALL YOU?"
            hint={<Text style={st.hint}>Fred for Frederick, Moe for Mohammad</Text>}
          >
            <TextInput
              value={values.preferred || ""}
              onChangeText={set("preferred")}
              placeholder={firstName(values.name)}
              placeholderTextColor={C.muted}
              autoCapitalize="words"
              style={st.input}
            />
          </Field>
        ) : null}

        <Field
          label="MOBILE"
          error={errors.mobile}
          hint={<Text style={st.hint}>We'll text you a code</Text>}
        >
          <TextInput
            value={values.mobile || ""}
            onChangeText={set("mobile")}
            placeholder="0412 345 678"
            placeholderTextColor={C.muted}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={[st.input, errors.mobile && { borderColor: C.active }]}
          />
        </Field>

        <Field label="EMAIL" error={errors.email}>
          <TextInput
            value={values.email || ""}
            onChangeText={set("email")}
            placeholder="dave@millerelectrical.com.au"
            placeholderTextColor={C.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            style={[st.input, errors.email && { borderColor: C.active }]}
          />
        </Field>

        <Field
          label="BUSINESS NAME"
          hint={
            business ? <Text style={st.ok}>✓ ABN {business.abn} · from the business register</Text>
              : searching ? <Text style={st.hint}>Searching the business register…</Text>
                : noMatches ? <Text style={st.hint}>Not on the register under that name — carry on, we'll sort it later</Text>
                  : <Text style={st.hint}>Optional — helps us verify you faster</Text>
          }
        >
          <TextInput
            value={bizQuery}
            onChangeText={onBizQuery}
            placeholder="Start typing, then pick yours"
            placeholderTextColor={C.muted}
            autoCapitalize="words"
            autoCorrect={false}
            style={st.input}
          />
          {matches.length ? (
            <View style={st.matches}>
              {matches.slice(0, 5).map((m) => (
                <Pressable key={m.abn + m.name} onPress={() => pickBusiness(m)} style={st.match}>
                  <Text style={st.matchName}>{m.name}</Text>
                  <Text style={T.small}>ABN {m.abn}{m.state ? ` · ${m.state}` : ""}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Field>

        {notice ? <Text style={st.err}>{notice}</Text> : null}

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
  // A locked field should look settled, not broken. Same ink, quieter ground.
  locked: { backgroundColor: C.bg, borderColor: C.line },
  hint: { ...T.small, fontSize: 11.5, marginTop: 5 },
  ok: { ...T.small, fontSize: 11.5, marginTop: 5, color: C.earth },
  warn: { ...T.small, fontSize: 11.5, marginTop: 5, color: C.warnChipInk },
  err: { ...T.small, fontSize: 11.5, marginTop: 5, color: C.activeLight },
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
  refer: {
    backgroundColor: C.warnChipBg,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 13,
    marginTop: 12,
  },
  foot: { ...T.small, fontSize: 11.5, textAlign: "center", marginTop: 16 },
  bigTick: { color: C.earth, fontSize: 44, textAlign: "center", marginBottom: 10 },
  bigTitle: { ...T.body, fontSize: 21, fontWeight: "700", textAlign: "center", marginBottom: 10 },
});
