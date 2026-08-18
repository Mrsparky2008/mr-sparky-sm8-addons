// Applying to join the network — step one of five.
//
// Four questions and nothing else. This is the point where people give up, so
// it asks the least that still lets someone be rung back: who you are, how to
// reach you, where you work, and the licence number that says you are a sparky.
//
// The ABN is deliberately NOT here. It arrives later from the ABR lookup and is
// never typed, because the legal name on an RCTI has to be the name the register
// holds. See lib/abr.mjs in the portal repo.
//
// The rules live in the portal (lib/applicants.mjs, validateTaster) and the
// portal is what will accept or reject this. The checks below are only to save
// a round trip and to put the error next to the field — the phone renders, the
// portal decides.
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta, Header } from "../components/ui";
import { C, R, S, T } from "../lib/theme";

const MOBILE = /^0\d{9}$/;

const FIELDS = [
  { key: "name", label: "Full name", placeholder: "Dave Miller", auto: "name" },
  { key: "mobile", label: "Mobile", placeholder: "0412 345 678", keyboard: "phone-pad" },
  { key: "suburb", label: "Suburb you work from", placeholder: "Penrith" },
  { key: "licence", label: "Electrical licence number", placeholder: "EC12345", caps: "characters" },
];

function check(values) {
  const e = {};
  if (String(values.name || "").trim().length < 2) e.name = "Enter your full name";
  if (!MOBILE.test(String(values.mobile || "").replace(/\s/g, ""))) {
    e.mobile = "Enter a 10-digit Australian mobile";
  }
  if (!String(values.suburb || "").trim()) e.suburb = "Enter the suburb you work from";
  if (String(values.licence || "").trim().length < 4) {
    e.licence = "Enter your electrical licence number";
  }
  return e;
}

export default function Apply({ onBack }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);

  const set = (key) => (text) => {
    setValues((v) => ({ ...v, [key]: text }));
    // Clearing on edit rather than on submit means the error goes away the
    // moment they start fixing it, instead of nagging until they press again.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const submit = () => {
    const found = check(values);
    if (Object.keys(found).some((k) => found[k])) { setErrors(found); return; }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="Apply to join" meta="Step 1 of 5" onBack={onBack} />
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Text style={st.blurb}>
          A few details so we can get back to you. It takes about a minute, and
          you can finish the rest later.
        </Text>

        {FIELDS.map((f) => (
          <View key={f.key} style={st.field}>
            <Text style={T.label}>{f.label}</Text>
            <TextInput
              value={values[f.key] || ""}
              onChangeText={set(f.key)}
              placeholder={f.placeholder}
              placeholderTextColor={C.muted}
              keyboardType={f.keyboard || "default"}
              autoCapitalize={f.caps || "words"}
              autoComplete={f.auto}
              style={[st.input, errors[f.key] && { borderColor: C.active }]}
            />
            {errors[f.key] ? <Text style={st.err}>{errors[f.key]}</Text> : null}
          </View>
        ))}

        {sent ? (
          <View style={st.notice}>
            <Text style={st.noticeTitle}>Details look right</Text>
            <Text style={T.small}>
              Sending is not connected yet — that is the next piece of work. Nothing
              has been submitted.
            </Text>
          </View>
        ) : null}

        <Cta label="Continue" onPress={submit} />

        <Text style={st.foot}>
          Applying does not create an account. We review every application and
          come back to you.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.screen, gap: S.gap, paddingBottom: 48 },
  blurb: { ...T.small, marginBottom: 4 },
  field: { gap: 6 },
  input: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.button,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: C.ink,
    minHeight: S.touch,
  },
  err: { ...T.small, color: C.activeLight },
  notice: {
    backgroundColor: C.infoChipBg,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 14,
    gap: 4,
  },
  noticeTitle: { ...T.body, fontWeight: "700" },
  foot: { ...T.small, textAlign: "center", marginTop: 8 },
});
