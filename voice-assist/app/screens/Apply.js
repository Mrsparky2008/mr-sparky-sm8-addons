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
  const codeRef = useRef(null);

  const set = (key) => (text) => {
    setValues((v) => ({ ...v, [key]: text }));
    // Clearing on edit rather than on submit means the message goes the moment
    // they start fixing it, instead of nagging until they press again.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const sendCode = async () => {
    const found = validate(values);
    if (Object.keys(found).some((k) => found[k])) { setErrors(found); return; }
    setBusy(true);
    // TODO: POST /api/demo/signup — sends the SMS and runs the licence check.
    // Until that route exists the screen shows the shape of the answer rather
    // than pretending to have sent anything.
    setTimeout(() => {
      setBusy(false);
      setLicence(null);
      setStep("code");
    }, 400);
  };

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
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={CODE_LENGTH}
            style={st.hidden}
          />

          <View style={st.pending}>
            <Text style={st.pendingTitle}>Not connected yet</Text>
            <Text style={T.small}>
              No code has been sent. Sending the text and checking the licence is
              the next piece of work.
            </Text>
          </View>

          {licence ? (
            <View style={st.conf}>
              <Text style={st.tick}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.confTitle}>Licence {licence.number} confirmed</Text>
                <Text style={T.small}>{licence.classes} · current to {licence.expires}</Text>
              </View>
            </View>
          ) : null}

          <Text style={st.foot}>Didn't get it? <Text style={{ color: C.brand }}>Send again</Text></Text>
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

        {busy
          ? <ActivityIndicator color={C.brand} style={{ marginTop: 22 }} />
          : <Cta label="Send me a code" onPress={sendCode} />}

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
});
