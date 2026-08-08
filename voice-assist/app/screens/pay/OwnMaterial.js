// "Own material, no receipt" — van stock, declared on trust.
//
// The case this exists for: three metres of cable, a handful of clips, an RCD
// off the shelf in the van. Bought weeks ago, in bulk, so there is no per-job
// docket and never can be — demanding a receipt here just sends someone to
// the wholesaler to buy a duplicate purely to make paper. So it is declared
// instead, capped, and reimbursed like any other material the tech fronted.
//
// The CAP is the rule and the server enforces it ($50 default, set per
// person in portal settings, zero = receipts only). The 5%-of-invoice check
// is deliberately NOT enforced here — it is a review flag on the office's
// approval panel. A refusal on site teaches under-declaring; a flag keeps
// the declaration honest and puts the judgement where it belongs.
import { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Cta, Header, SectionLabel } from "../../components/ui";
import { C, R, S, mono } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { postJobNote } from "../../lib/api";

export default function OwnMaterial({ jobNumber: initial, onBack, onSaved }) {
  const [jobNumber, setJobNumber] = useState(initial ? String(initial) : "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const ready = !!(jobNumber.trim() && amount.trim() && !saving);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await portal.declareOwnMaterial({
        jobNumber: jobNumber.trim(),
        amountIncGst: Number(amount),
      });
      setSaved(r.declared);
      if (onSaved) onSaved(r.declared);
      // Paper trail on the job card itself (Steven, 9 Aug): the SM8 diary
      // shows the declaration without anyone opening the portal. Best-effort —
      // the declaration is already saved; a failed note never fails the save.
      postJobNote(jobNumber.trim(),
        `Own material (van stock, no receipt): $${Number(amount).toFixed(2)} declared via Mr Sparky app.`,
      ).catch(() => {});
    } catch (e) {
      // The server's message carries the real cap for this account —
      // "capped at $50.00 a job" — so it is shown as-is, not rewritten.
      setError(e?.message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header title="Own material" meta="no receipt" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.blurb}>
          Material off your van — bought earlier, so there's no docket for this
          job. Declared on trust, up to your no-receipt cap. Anything above the
          cap needs a receipt: photograph the docket instead.
        </Text>

        <SectionLabel>Job number</SectionLabel>
        <TextInput
          style={[s.input, mono]}
          value={jobNumber}
          onChangeText={setJobNumber}
          placeholder="167595"
          placeholderTextColor={C.muted}
          keyboardType="number-pad"
          editable={!initial}
        />

        <SectionLabel>Amount inc GST</SectionLabel>
        <TextInput
          style={[s.input, mono]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={C.muted}
          keyboardType="decimal-pad"
        />

        {error ? <Text style={s.warn}>{error}</Text> : null}
        {saved ? (
          <Text style={s.ok}>
            Declared ${Number(saved.amountIncGst).toFixed(2)} on #{saved.jobNumber}. It
            comes back on top of your split, same as a receipted expense.
          </Text>
        ) : null}

        <View style={{ height: 6 }} />
        {saving ? (
          <ActivityIndicator color={C.brand} />
        ) : (
          <Cta label={saved ? "Update it" : "Declare it"} onPress={save} disabled={!ready} />
        )}
        <Pressable onPress={onBack} style={s.cancel} hitSlop={8}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap, paddingBottom: 40 },
  blurb: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  input: {
    minHeight: S.touch, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 13, color: C.ink, fontSize: 15.5,
  },
  warn: { color: C.warnChipInk, fontSize: 12.5, lineHeight: 18 },
  ok: { color: "#6FD096", fontSize: 12.5, lineHeight: 18 },
  cancel: { alignSelf: "center", padding: 10 },
  cancelText: { color: C.muted, fontSize: 12.5, fontWeight: "700" },
});
