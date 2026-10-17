// One job, and how its number was arrived at.
//
// Steven, 30 September 2026, mid-claim: "if I want to see the details of a job
// like values, material and commission while I'm submitting a claim, is it
// possible to select the job and see it?"
//
// It was not. The claim screen and the statement both showed a job number, a
// suburb and one figure, and the arithmetic behind that figure lived only in
// the browser portal. Which is the wrong way round - the moment somebody wants
// to check a number is the moment they are about to sign for it.
//
// Every figure here is served, not worked out on the phone. The browser and
// the app each deriving their own once disagreed by tens of thousands.
import { useState } from "react";
import {
  ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Card, Header, SectionLabel } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { HELD } from "./shared";

export default function JobBreakdown({ job, meta, onBack }) {
  const [opening, setOpening] = useState("");
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState("");
  const bills = meta?.materialBills || meta?.materials || [];

  async function openPaper(b) {
    if (!b.emailId || opening) return;
    setOpening(b.id); setError("");
    try {
      const { url, filename } = await portal.purchaseDoc({ emailId: b.emailId, docIndex: b.docIndex });
      if (String(filename || url).toLowerCase().includes(".pdf")) await Linking.openURL(url);
      else setViewing({ uri: url });
    } catch (e) {
      setError(e?.message || "That document wouldn't open.");
    } finally { setOpening(""); }
  }

  const held = job?.outcome && job.outcome !== "OK";

  return (
    <View style={{ flex: 1 }}>
      <Header title={`Job ${job?.jobNumber || ""}`} meta={meta?.suburb} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {held ? (
          <Card>
            <SectionLabel>Not payable yet</SectionLabel>
            <Text style={T.small}>{HELD[job.outcome] || job.outcome}</Text>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>How it adds up</SectionLabel>
          <Line label="Invoiced to the customer" value={money(job?.invoiceIncGst)} />
          {/* Named the way the office says it, and negative because it comes
              off - a row reading "2,073.75" beside "6,531.18" reads like more
              money, which is the one thing it is not. */}
          <Line label="Less material" value={`- ${money(job?.expenseIncGst)}`} dim />
          <Line label="Gross profit" value={money(job?.grossProfit)} strong />
          <Line
            label={`Your rate${job?.ratePct != null ? ` · ${job.ratePct}%` : ""}`}
            value={rateWords(job)}
            dim
          />
          <Line label="Your share" value={money(job?.share)} strong />
          {job?.helpingHand ? (
            <Line label="Helping hand" value={money(job.helpingHand)} />
          ) : null}
          <Line label="Payable inc GST" value={money(job?.payableIncGst)} hero />
        </Card>

        {job?.rateDate ? (
          <Card>
            <SectionLabel>Why that rate</SectionLabel>
            <Text style={T.small}>
              {job.rateLockedAt === "claim"
                ? `Locked to ${job.rateDate}, the day the lead was taken.`
                : `Taken from ${job.rateDate}, the day it was completed.`}
              {job.rateKey === "completed_only"
                ? " Completed by you, quoted by somebody else."
                : job.rateKey === "quoted_and_completed"
                  ? " Quoted and completed by you."
                  : ""}
              {job.materialsFundedBy === "subbie"
                ? " You fund the material on this rate."
                : ""}
            </Text>
          </Card>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Card>
          <SectionLabel>
            Material on this job{bills.length ? ` · ${bills.length}` : ""}
          </SectionLabel>
          {bills.length ? (
            <>
              <Text style={[T.small, { marginBottom: 2 }]}>Tap one to see the supplier's paperwork.</Text>
              {bills.map((b) => (
                <Pressable key={b.id} onPress={() => openPaper(b)} disabled={!b.emailId} style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.supplier} numberOfLines={1}>{b.supplier || "Supplier"}</Text>
                    <Text style={T.small}>
                      {b.date}{b.invoiceNumber ? ` · ${b.invoiceNumber}` : ""}
                      {b.pickedBy ? ` · ${b.pickedBy}` : ""}
                    </Text>
                  </View>
                  {opening === b.id
                    ? <ActivityIndicator color={C.muted} />
                    : <Text style={[s.amt, mono]}>{money(b.amountIncGst)}</Text>}
                </Pressable>
              ))}
            </>
          ) : (
            <Text style={T.small}>
              {meta?.materialsUnconfirmed
                ? "Not entered yet."
                : "No material was bought for this job."}
            </Text>
          )}
          {meta?.awaitingInvoice ? (
            <Text style={[T.small, { marginTop: 8, color: C.active }]}>
              Material picked up that the supplier has not billed yet — the job waits
              rather than being paid on a profit that is about to shrink.
            </Text>
          ) : null}
        </Card>
      </ScrollView>

      <Modal visible={!!viewing} transparent animationType="fade"
        onRequestClose={() => setViewing(null)}>
        <Pressable style={s.viewer} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing.uri }} style={s.viewerImage} resizeMode="contain" /> : null}
          <Text style={s.viewerHint}>Tap to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

/** What the rate did, in money, so the percentage is not the only evidence. */
function rateWords(job) {
  if (job?.ratePct == null || job?.grossProfit == null) return "—";
  return `${job.ratePct}% of ${money(job.grossProfit)}`;
}

function Line({ label, value, dim, strong, hero }) {
  return (
    <View style={s.line}>
      <Text style={[s.lineLabel, dim && { color: C.muted }]}>{label}</Text>
      <Text style={[s.lineValue, mono, strong && s.strong, hero && s.heroValue, dim && { color: C.muted }]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, gap: S.gap, paddingBottom: 60 },
  line: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingVertical: 7, gap: 12,
  },
  lineLabel: { color: C.ink, fontSize: 14, flexShrink: 1 },
  lineValue: { color: C.ink, fontSize: 14 },
  strong: { fontWeight: "700" },
  heroValue: { fontSize: 19, fontWeight: "700" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: S.touch,
    borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 11,
  },
  supplier: { color: C.ink, fontWeight: "600" },
  amt: { color: C.ink, fontWeight: "700" },
  error: { color: C.active, fontSize: 13 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,.92)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "85%" },
  viewerHint: { color: C.muted, fontSize: 13, paddingTop: 10 },
});
