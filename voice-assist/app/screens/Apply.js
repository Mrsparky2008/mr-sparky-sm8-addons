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
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta, Header } from "../components/ui";
import {
  startSignup, verifyCode, setPassword, searchBusiness, businessDetails,
  checkLicence, isFieldError, connectTelegram,
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

/**
 * Two business names are the same name if they differ only in case, spacing or
 * punctuation. "Mr Sparky Electrical Services Pty Ltd" off a licence and
 * "MR SPARKY ELECTRICAL SERVICES PTY LTD" off the ABR are one business.
 */
const sameName = (a, b) => {
  const flat = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return Boolean(flat(a)) && flat(a) === flat(b);
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

export default function Apply({ onBack, onDone }) {
  const [step, setStep] = useState("details");
  // Linking Telegram is optional and skippable. It is how job alerts find
  // them later, not a step in signing up, so nothing here can block the
  // Have a look button - a sparky who taps past it loses nothing today.
  const [tgState, setTgState] = useState("idle");
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(null);

  const [licCheck, setLicCheck] = useState(null);
  const [licBusy, setLicBusy] = useState(false);
  const licTimer = useRef(null);
  const licWanted = useRef("");

  // The nominated supervisor's own licence, asked for only when the first one
  // turned out to be a company. That is the licence that names a person.
  const [supCheck, setSupCheck] = useState(null);
  const [supBusy, setSupBusy] = useState(false);
  const supTimer = useRef(null);
  const supWanted = useRef("");

  const [business, setBusiness] = useState(null);
  const [bizQuery, setBizQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [noMatches, setNoMatches] = useState(false);
  const bizTimer = useRef(null);
  const bizWanted = useRef("");

  const [code, setCode] = useState("");
  const [password, setPasswordValue] = useState("");
  // Confirm-and-show, because this password gets typed on a phone keyboard,
  // possibly on a ute bonnet. A hidden field with no second chance is how a
  // typo becomes a locked-out sparky ringing the office on day one.
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const codeRef = useRef(null);

  const set = (key) => (text) => {
    setValues((v) => ({ ...v, [key]: text }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  /* -------------------------------------------------------------- licence -- */

  // The name is only theirs to type when the register has not given us one.
  // Whichever licence named a person is the one the name comes from.
  const personCheck = licCheck?.verified && licCheck.isPerson ? licCheck
    : supCheck?.verified && supCheck.isPerson ? supCheck
      : null;
  const nameFromRegister = Boolean(personCheck);
  // A company contractor licence names the business. In NSW it must have a
  // nominated qualified supervisor holding a personal licence, but the public
  // register does not publish that link - so the company licence is taken as
  // proof of the business and the person is asked for separately.
  const companyLicence = Boolean(licCheck?.verified && !licCheck.isPerson);

  const takeNameFrom = (res) => {
    setValues((v) => ({
      ...v,
      name: res.licensee,
      // Seeded, not forced. Most people leave it; Frederick changes it to Fred.
      preferred: v.preferred || firstName(res.licensee),
    }));
    setErrors((e) => ({ ...e, name: undefined }));
  };

  const runSupervisorCheck = async (q) => {
    if (q.replace(/[^A-Za-z0-9]/g, "").length < 4) return;
    supWanted.current = q;
    setSupBusy(true);
    const res = await checkLicence(q);
    if (supWanted.current !== q) return;
    setSupBusy(false);
    setSupCheck(res);
    if (res?.verified && res.isPerson) takeNameFrom(res);
  };

  const onSupervisor = (text) => {
    set("supervisorLicence")(text);
    setSupCheck(null);
    if (supTimer.current) clearTimeout(supTimer.current);
    const q = text.trim();
    supWanted.current = q;
    if (q.replace(/[^A-Za-z0-9]/g, "").length < 4) { setSupBusy(false); return; }
    supTimer.current = setTimeout(() => runSupervisorCheck(q), 900);
  };

  const onSupervisorBlur = () => {
    if (supTimer.current) clearTimeout(supTimer.current);
    const q = String(values.supervisorLicence || "").trim();
    if (!q || supCheck || supBusy) return;
    runSupervisorCheck(q);
  };

  const runLicenceCheck = async (q) => {
    if (q.replace(/[^A-Za-z0-9]/g, "").length < 4) return;
    licWanted.current = q;
    setLicBusy(true);
    const res = await checkLicence(q);
    if (licWanted.current !== q) return;   // an older answer, ignore it
    setLicBusy(false);
    setLicCheck(res);
    if (res?.verified && res.isPerson) takeNameFrom(res);
    // A company licence has already told us the business, so the ABR is only
    // being asked for the ABN. If it comes back with that exact name and only
    // that one, take it - offering a list when the answer is already known is
    // a step that earns nothing, and the list is full of same-named businesses
    // in other states.
    if (res?.verified && !res.isPerson && !business) {
      setBizQuery(res.licensee);
      setSearching(true);
      const found = await searchBusiness(res.licensee);
      if (licWanted.current !== q) return;
      const exact = found.filter((m) => sameName(m.name, res.licensee));
      setSearching(false);
      if (exact.length === 1) {
        pickBusiness(exact[0]);
      } else {
        setMatches(found);
        setNoMatches(found.length === 0);
      }
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

  const pickBusiness = async (m) => {
    // Show the pick immediately - the details lookup is a round trip and the
    // list should not sit there looking unresponsive.
    setBusiness(m);
    setBizQuery(m.name);
    setMatches([]);
    setNoMatches(false);
    setSearching(false);
    bizWanted.current = "";

    // Then fetch what the register actually holds. What was tapped is a
    // TRADING name; the legal entity behind it can be a different name
    // entirely, and the legal one is what an invoice must carry.
    const details = await businessDetails(m.abn);
    if (details) {
      setBusiness({
        ...details,
        // Keep what they recognised, for the portal's display-name field.
        tradingName: m.name !== details.legalName ? m.name : null,
      });
    }
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
    // Checked here, not while typing: flagging a mismatch before they have
    // finished the second field just nags. When the fields are visible the
    // person can see the match themselves, but the check still runs.
    if (password !== password2) {
      setNotice("The passwords don't match. Have another look.");
      return;
    }
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

  const linkTelegram = async () => {
    setTgState("busy");
    try {
      const { url } = await connectTelegram(values.mobile);
      // Telegram may not be installed. openURL rejects rather than hanging, so
      // the catch below is the whole story - no capability check needed.
      await Linking.openURL(url);
      setTgState("opened");
    } catch {
      setTgState("failed");
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
        <Cta label="Have a look" onPress={() => onDone?.(values.mobile)} />
        <Cta
          tone="ghost"
          label={tgState === "busy" ? "Opening Telegram..." : "Connect Telegram"}
          onPress={tgState === "busy" ? undefined : linkTelegram}
          sub={
            tgState === "failed"
              ? "Couldn't open Telegram. You can do this later."
              : tgState === "opened"
                ? "Tap START in Telegram to finish."
                : "So job alerts can reach you. You can do this later."
          }
        />
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
            <View>
              <TextInput
                value={password}
                onChangeText={(t) => { setPasswordValue(t); setNotice(""); }}
                placeholder="At least 8 characters"
                placeholderTextColor={C.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                autoFocus
                style={[st.input, { paddingRight: 64 }, notice && { borderColor: C.active }]}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={10}
                style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
              >
                <Text style={{ color: C.muted, fontSize: 13, fontWeight: "700" }}>
                  {showPassword ? "HIDE" : "SHOW"}
                </Text>
              </Pressable>
            </View>
          </Field>
          <Field label="CONFIRM PASSWORD">
            <TextInput
              value={password2}
              onChangeText={(t) => { setPassword2(t); setNotice(""); }}
              placeholder="Same again"
              placeholderTextColor={C.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
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
          <Field
            label="NOMINATED SUPERVISOR LICENCE NUMBER"
            hint={
              supBusy ? <Text style={st.hint}>Checking the NSW register…</Text>
                : supCheck?.verified && supCheck.isPerson
                  ? <Text style={st.ok}>✓ {supCheck.licensee} · {supCheck.summary}</Text>
                  : supCheck?.verified
                    ? <Text style={st.warn}>That's another company licence — we need the supervisor's own one</Text>
                    : supCheck
                      ? <Text style={st.warn}>{supCheck.note}</Text>
                      : <Text style={st.hint}>
                          That's the company licence. A company licence needs a
                          nominated supervisor — their personal number tells us
                          who you are.
                        </Text>
            }
          >
            <TextInput
              value={values.supervisorLicence || ""}
              onChangeText={onSupervisor}
              onBlur={onSupervisorBlur}
              placeholder="184060C"
              placeholderTextColor={C.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={st.input}
            />
          </Field>
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
