// An invoice the contractor sends US — the phone half of it.
//
// Steven, 24 September 2026: "Jason needs to send me an invoice for some
// labour he helped with on a job. It would be easier to raise it here and
// submit it here than get one from his software." That went into the portal
// then; this is the same thing on the Money screen, where he already is
// (Steven, 30 September 2026).
//
// This is NOT the RCTI and does not touch it. An RCTI is us writing the
// invoice on his behalf for his OWN jobs. This is the other direction: his
// document, his ABN, his numbering, for hours he put into somebody else's
// job — and it is paid on its own, never folded into a claim.
//
// Every figure here is HIS. That is the opposite of a claim, where the app
// sends only which jobs and the portal derives every number. What the app
// never sends is who is sending it: the name, the ABN and the bank details
// all come off the record the office holds.
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Card, Cta, Empty, Header, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";

const blank = () => ({ what: "", qty: "", price: "" });
const num = (v) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default function RaiseInvoice({ onBack }) {
  const [job, setJob] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState([blank()]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setMine((await portal.myInvoices()).invoices || []); } catch { /* the list is a nicety */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (i, key, value) => setLines((ls) => {
    const next = ls.map((l, n) => (n === i ? { ...l, [key]: value } : l));
    setPreview(null);
    return next;
  });

  /*
   * Only the lines somebody actually filled in. An empty one left behind by a
   * mis-tap would otherwise come back as "Each line needs a description"
   * against a form that looks complete.
   */
  const body = () => ({
    jobNumber: job.trim() || null,
    reference: reference.trim() || null,
    lines: lines
      .filter((l) => l.what.trim() || l.qty.trim() || l.price.trim())
      .map((l) => ({ description: l.what, qty: l.qty, unitPriceExGst: l.price })),
  });

  // Ex GST, the way a trade price is quoted. The portal adds the GST and its
  // figure is the one that counts — this is only so the total is not a
  // surprise when the preview opens.
  const subtotal = lines.reduce((t, l) => t + num(l.qty) * num(l.price), 0);

  const doPreview = async () => {
    setBusy(true); setError(null);
    try {
      setPreview((await portal.raiseInvoice({ ...body(), preview: true })).text);
    } catch (e) {
      setError(e?.message || "It would not go through");
    } finally { setBusy(false); }
  };

  const doSend = () => {
    Alert.alert(
      "Send this invoice?",
      "It goes to the office as a tax invoice from your business, and is paid on its own — not with a claim.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send it",
          onPress: async () => {
            setBusy(true); setError(null);
            try {
              const r = await portal.raiseInvoice(body());
              setJob(""); setReference(""); setLines([blank()]); setPreview(null);
              await load();
              Alert.alert("Sent", `Invoice ${r.number} is with the office.`);
            } catch (e) {
              setError(e?.message || "It would not go through");
            } finally { setBusy(false); }
          },
        },
      ],
    );
  };

  if (preview) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Your invoice" onBack={() => setPreview(null)} />
        <ScrollView contentContainerStyle={s.body}>
          {/* Monospaced and unstyled on purpose: this is the document as the
              office receives it, not a picture of one. */}
          <Card><Text style={[s.doc, mono]}>{preview}</Text></Card>
          <Cta label={busy ? "Sending…" : "Send it"} tone="earth" disabled={busy} onPress={doSend} />
          <Pressable onPress={() => setPreview(null)} style={s.link}>
            <Text style={s.linkText}>Go back and change it</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="Invoice us" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>What it is for</SectionLabel>
          <Text style={[T.small, { marginBottom: 10 }]}>
            Hours you put into somebody else's job. Paid on its own — it does not go
            into a claim.
          </Text>
          <Field label="Job number (optional)" value={job} onChange={setJob}
            placeholder="167673" keyboardType="number-pad" />
          <Field label="Reference (optional)" value={reference} onChange={setReference}
            placeholder="Helping hand" />
        </Card>

        <Card>
          <SectionLabel>Lines</SectionLabel>
          {lines.map((l, i) => (
            <View key={i} style={i ? s.line : null}>
              <Field label="What you did" value={l.what} onChange={(v) => set(i, "what", v)}
                placeholder="Labour - helping hand" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Hours / qty" value={l.qty} onChange={(v) => set(i, "qty", v)}
                    placeholder="6" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Rate ex GST" value={l.price} onChange={(v) => set(i, "price", v)}
                    placeholder="85" keyboardType="decimal-pad" />
                </View>
              </View>
              {lines.length > 1 ? (
                <Pressable onPress={() => { setLines(lines.filter((_, n) => n !== i)); setPreview(null); }}
                  style={s.link}>
                  <Text style={s.linkText}>Remove this line</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable onPress={() => setLines([...lines, blank()])} style={s.link}>
            <Text style={s.linkText}>+ Another line</Text>
          </Pressable>
          <View style={s.total}>
            <Text style={T.small}>Subtotal ex GST</Text>
            <Text style={[s.totalAmt, mono]}>{money(subtotal)}</Text>
          </View>
        </Card>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Cta label={busy ? "Working…" : "See the invoice"} disabled={busy || !subtotal}
          onPress={doPreview} />

        {mine.length ? (
          <Card>
            <SectionLabel>Already sent</SectionLabel>
            {mine.map((inv) => (
              <View key={inv.id} style={s.sentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sentNo}>{inv.number}</Text>
                  <Text style={T.small}>
                    {inv.date}{inv.jobNumber ? ` · job ${inv.jobNumber}` : ""}
                    {inv.waitingOn ? ` · ${inv.waitingOn}` : inv.sent ? " · with the office" : ""}
                  </Text>
                </View>
                <Text style={[s.sentAmt, mono]}>{money(inv.total)}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
      />
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, gap: S.gap, paddingBottom: 60 },
  label: { color: C.muted, fontSize: 12, marginBottom: 4 },
  input: {
    minHeight: S.touch, borderWidth: 1, borderColor: C.line, borderRadius: R.button,
    paddingHorizontal: 12, color: C.ink, fontSize: 16, backgroundColor: C.bg,
  },
  line: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 4 },
  link: { paddingVertical: 10 },
  linkText: { color: C.brand, fontWeight: "600" },
  total: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 4,
  },
  totalAmt: { color: C.ink, fontSize: 18, fontWeight: "700" },
  doc: { color: C.ink, fontSize: 11, lineHeight: 16 },
  error: { color: C.active, fontSize: 13 },
  sentRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 10,
  },
  sentNo: { color: C.ink, fontWeight: "600" },
  sentAmt: { color: C.ink, fontWeight: "700" },
});
