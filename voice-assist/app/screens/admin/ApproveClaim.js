// Deciding on a claim, from the phone.
//
// The checks shown here are not worked out on the device. `approvalChecks` is
// computed in the portal, next to the rules, with the comment that says why:
// "so the browser is never the thing deciding whether a claim is safe to pay."
// The phone is another browser as far as that reasoning goes.
//
// Three of the portal's answers are real outcomes this screen has to show
// rather than swallow:
//   - a rejection with no reason is refused
//   - invoicing a contractor whose company details cannot carry an RCTI is a 409
//   - only certain moves are allowed at all, so only those are offered
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";

// Mirrors the portal's own table. Offering a move it will refuse is a dead
// button, and a dead button on a money screen reads as something being broken.
const NEXT = {
  submitted: ["approved", "rejected"],
  approved: ["invoiced", "rejected"],
  invoiced: ["paid"],
  paid: [],
  rejected: [],
};

const LEVEL = {
  stop: { ink: C.warnChipInk, bg: C.warnChipBg, mark: "■" },
  warn: { ink: C.thinking, bg: "rgba(249,171,0,.14)", mark: "▲" },
  note: { ink: C.infoChipInk, bg: C.infoChipBg, mark: "●" },
  ok: { ink: "#6FD096", bg: "rgba(47,158,87,.14)", mark: "✓" },
};

export default function ApproveClaim({ claim: summary, onBack, onDone }) {
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const name = summary?.contractorName;

  // The inbox row is a bare stored claim. The checks, the payment state and the
  // review clock are all built by the statement route, so that is what gets
  // loaded once a claim is actually opened.
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await portal.statement(name);
      const found = (data?.claims || []).find((c) => c.claimId === summary.claimId);
      setClaim(found || null);
      setError(found ? null : new Error("That claim is no longer on this contractor's statement."));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [name, summary?.claimId]);

  useEffect(() => { load(); }, [load]);

  async function move(status) {
    if (status === "rejected" && !reason.trim()) {
      setRejecting(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await portal.setClaimStatus({
        name,
        claimId: summary.claimId,
        status,
        reason: status === "rejected" ? reason.trim() : undefined,
      });
      onDone?.();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (!claim) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Claim" onBack={onBack} />
        {error ? (
          <View style={s.body}>
            <Card style={{ borderColor: C.active }}>
              <Text style={[T.body, { color: C.warnChipInk }]}>{error.message}</Text>
            </Card>
            <Cta label="Try again" onPress={load} />
          </View>
        ) : (
          <Empty>{busy ? "Loading the checks…" : "Nothing to show."}</Empty>
        )}
      </View>
    );
  }

  const checks = claim.approval?.checks || [];
  const worst = claim.approval?.worst;
  const allowed = NEXT[claim.status] || [];
  const st = claim.settlement || {};

  return (
    <View style={{ flex: 1 }}>
      <Header title={name || "Claim"} meta={claim.claimId} onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[s.hero, mono]}>{money(st.payableIncGst)}</Text>
          <Text style={T.small}>
            Payable inc GST · {(claim.lines || []).length} line
            {(claim.lines || []).length === 1 ? "" : "s"} · submitted{" "}
            {(claim.submittedAt || "").slice(0, 10)}
          </Text>
        </Card>

        {claim.review?.daysWaiting != null ? (
          <Text style={s.note}>
            Waiting {claim.review.daysWaiting} day{claim.review.daysWaiting === 1 ? "" : "s"}.
            {claim.review.dueDate ? ` Office deadline ${claim.review.dueDate}.` : ""}
          </Text>
        ) : null}

        <View>
          <SectionLabel>Before you decide</SectionLabel>
          <View style={{ gap: 8 }}>
            {checks.map((c, i) => {
              const l = LEVEL[c.level] || LEVEL.note;
              return (
                <View key={i} style={[s.check, { backgroundColor: l.bg }]}>
                  <Text style={[s.checkMark, { color: l.ink }]}>{l.mark}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.checkTitle, { color: l.ink }]}>{c.label}</Text>
                    {c.detail ? <Text style={T.small}>{c.detail}</Text> : null}
                  </View>
                </View>
              );
            })}
            {checks.length === 0 ? <Empty>No checks returned for this claim.</Empty> : null}
          </View>
        </View>

        <View>
          <SectionLabel>How it settles</SectionLabel>
          <Card>
            <Row label="Work" value={money(st.workIncGst)} />
            {st.chargedToClaim ? (
              <Row label="Charged to this claim" value={money(-st.chargedToClaim)} dim />
            ) : null}
            {st.withheldToRetention ? (
              <Row label="Withheld to retention" value={money(-st.withheldToRetention)} dim />
            ) : null}
            <Row label="Payable" value={money(st.payableIncGst)} last />
          </Card>
        </View>

        {rejecting ? (
          <View>
            <SectionLabel>Why is it being rejected?</SectionLabel>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="They need to know what to fix"
              placeholderTextColor={C.muted}
              multiline
              style={s.input}
            />
            <Text style={s.note}>
              The portal refuses a rejection with no reason, and it is the only thing the
              contractor will see.
            </Text>
          </View>
        ) : null}

        {error ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.body, { color: C.warnChipInk }]}>{error.message}</Text>
          </Card>
        ) : null}

        {allowed.includes("approved") ? (
          <Cta
            label={busy ? "Working…" : "Approve"}
            tone="earth"
            disabled={busy}
            onPress={() => move("approved")}
            sub={
              worst === "stop"
                ? "A check says stop. Approving anyway is your call, but read it first."
                : undefined
            }
          />
        ) : null}

        {allowed.includes("invoiced") ? (
          <Cta
            label={busy ? "Working…" : "Issue RCTI"}
            tone="earth"
            disabled={busy}
            onPress={() => move("invoiced")}
          />
        ) : null}

        {allowed.includes("paid") ? (
          <Cta
            label={busy ? "Working…" : "Mark paid"}
            tone="earth"
            disabled={busy}
            onPress={() => move("paid")}
          />
        ) : null}

        {allowed.includes("rejected") ? (
          <Cta
            label={rejecting ? "Confirm rejection" : "Reject"}
            tone="ghost"
            disabled={busy || (rejecting && !reason.trim())}
            onPress={() => move("rejected")}
          />
        ) : null}

        {allowed.length === 0 ? (
          <Text style={s.note}>
            Nothing further to do — a {claim.status} claim is finished.
          </Text>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginBottom: 3 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16 },
  check: { flexDirection: "row", gap: 10, borderRadius: R.card, padding: 11 },
  checkMark: { fontSize: 13, lineHeight: 18, width: 14 },
  checkTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  input: {
    minHeight: 88, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, padding: 12, color: C.ink, fontSize: 15,
    textAlignVertical: "top",
  },
});
