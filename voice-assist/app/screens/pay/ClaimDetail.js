// One claim, as it was agreed.
//
// A claim freezes everything at submission — the rate, the invoice, the
// materials and every figure that came out of them. Later changes never reach
// back; they are corrected forward through the adjustment ledger. So this
// screen is a record, not a calculation: it prints the frozen copy the portal
// sent and works nothing out on its own.
//
// The deductions are shown line by line on purpose. Retention and back charges
// come off the payment but not off the GST, because GST is charged on the full
// value of the supply — netting them off would understate it. Nothing here is
// ever a silent deduction.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import { ClaimStatus } from "./Earnings";

export default function ClaimDetail({ claim, onBack, onViewRcti }) {
  if (!claim) return null;
  const st = claim.settlement || {};
  const lines = claim.lines || [];
  const jobs = lines.filter((l) => l.kind === "job");
  const helping = lines.filter((l) => l.kind === "helping");

  return (
    <View style={{ flex: 1 }}>
      <Header title="Claim" meta={claim.claimId} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <View style={s.statusRow}>
            <ClaimStatus status={claim.status} />
            <Text style={T.small}>{(claim.submittedAt || "").slice(0, 10)}</Text>
          </View>
          <Text style={[s.hero, mono]}>{money(st.payableIncGst)}</Text>
          <Text style={T.small}>Payable, inc GST</Text>
        </Card>

        {claim.status === "rejected" && claim.rejectedReason ? (
          <Card style={{ borderColor: C.active }}>
            <SectionLabel>Why it was rejected</SectionLabel>
            <Text style={T.body}>{claim.rejectedReason}</Text>
          </Card>
        ) : null}

        {claim.payment?.state === "overdue" ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.body, { color: C.warnChipInk }]}>
              {claim.payment.daysOverdue} day{claim.payment.daysOverdue === 1 ? "" : "s"} overdue —
              was due {claim.payment.dueDate}.
            </Text>
          </Card>
        ) : null}

        <View>
          <SectionLabel>Jobs on this claim</SectionLabel>
          <Card>
            {jobs.map((l, i) => (
              <Row
                key={l.jobNumber}
                label={`#${l.jobNumber}`}
                value={money(l.amountIncGst)}
                last={i === jobs.length - 1 && !helping.length}
              />
            ))}
            {helping.map((l, i) => (
              <Row
                key={`H${l.jobNumber}`}
                label={`#${l.jobNumber} — helping ${l.frozen?.helpedName || ""}`.trim()}
                value={money(l.amountIncGst)}
                last={i === helping.length - 1}
              />
            ))}
          </Card>
        </View>

        {claim.adjustments?.length ? (
          <View>
            <SectionLabel>Adjustments</SectionLabel>
            <Card>
              {claim.adjustments.map((a, i) => (
                <Row
                  key={a.id}
                  label={a.reason || a.type}
                  value={money(a.amountIncGst)}
                  last={i === claim.adjustments.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionLabel>How it settles</SectionLabel>
          <Card>
            <Row label="Work" value={money(st.workIncGst)} />
            {st.creditsIncGst ? <Row label="Credits" value={money(st.creditsIncGst)} /> : null}
            {st.chargedToClaim ? (
              <Row label="Charged to this claim" value={money(-st.chargedToClaim)} dim />
            ) : null}
            {st.drawnFromRetention ? (
              <Row label="Drawn from retention" value={money(st.drawnFromRetention)} dim />
            ) : null}
            {st.withheldToRetention ? (
              <Row label="Withheld to retention" value={money(-st.withheldToRetention)} dim />
            ) : null}
            <Row label="Payable" value={money(st.payableIncGst)} last />
          </Card>
        </View>

        <View>
          <SectionLabel>Invoice value</SectionLabel>
          <Card>
            <Row label="Ex GST" value={money(st.invoiceValueExGst)} />
            <Row label="GST" value={money(st.invoiceGstAmount)} />
            <Row label="Total inc GST" value={money(st.invoiceValueIncGst)} last />
          </Card>
          <Text style={s.note}>
            GST is charged on the full supply. Retention and back charges are deductions from the
            payment, not from the invoice.
          </Text>
        </View>

        {claim.materialsUnconfirmedOn?.length ? (
          <Card>
            <SectionLabel>Materials not confirmed</SectionLabel>
            <Text style={T.small}>
              {claim.materialsUnconfirmedOn.join(", ")} had no supplier invoice when this was
              claimed. Any difference is corrected on a later claim.
            </Text>
          </Card>
        ) : null}

        {claim.rctiNumber ? (
          <Cta label={`View RCTI ${claim.rctiNumber}`} onPress={() => onViewRcti(claim)} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hero: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginTop: 8 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
});
