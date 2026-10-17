// Every claim — the history bucket off the Money hub.
//
// Redesigned 13 Oct 2026 against the canvas. What was wrong, in Steven's own
// screenshot: CLM-20261012-PQLR was the biggest text on the row and wrapped
// over two lines. Nobody has ever read one of those. And every status wore the
// same grey pill, so approved, awaiting, paid and rejected looked identical at
// a glance — which is the one thing a glance is for.
//
// So: THE MONEY IS THE HEADLINE, the reference is a reference, and colour is
// kept for the rows that went wrong. Three groups, each answering a different
// question — what is the office holding, what is owed to me, and what is done.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Header, SectionLabel } from "../../components/ui";
import { C, R, S, mono, money } from "../../lib/theme";

// The last block of a claim id is the only part anybody could repeat down a
// phone, so that is the part shown. The whole thing is on the claim itself.
const shortRef = (id) => {
  const bits = String(id || "").split("-");
  return bits.length > 1 ? bits[bits.length - 1] : String(id || "");
};

export default function ClaimsList({ claims = [], onOpenClaim, onBack }) {
  const ordered = [...claims].sort((a, b) =>
    String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));

  // Grouped by whose move it is, not by a status word. Submitted and
  // approved-but-not-issued are both waiting on the office, so they sit
  // together — which is the honest answer to "what is happening to my money".
  const office = ordered.filter((c) => c.status === "submitted" || c.status === "approved");
  const owed = ordered.filter((c) => c.status === "invoiced");
  const done = ordered.filter((c) => c.status === "paid" || c.status === "rejected");
  const other = ordered.filter((c) => !office.includes(c) && !owed.includes(c) && !done.includes(c));

  return (
    <View style={{ flex: 1 }}>
      <Header title="Claims" meta={`${claims.length}`} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {claims.length === 0 ? <Empty>No claims yet. The first one starts on the Money screen.</Empty> : null}

        <Group label="With the office" claims={office} onOpenClaim={onOpenClaim} />
        <Group label="Approved — waiting on payment" claims={owed} onOpenClaim={onOpenClaim} />
        <Group label="Settled" claims={done} onOpenClaim={onOpenClaim} />
        {/* A status nobody has thought of yet still has a floor under it. A
            claim that matches no bucket used to vanish off the screen. */}
        <Group label="Everything else" claims={other} onOpenClaim={onOpenClaim} />
      </ScrollView>
    </View>
  );
}

function Group({ label, claims, onOpenClaim }) {
  if (!claims.length) return null;
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      <Card>
        {claims.map((c, i) => (
          <ClaimRow key={c.claimId} claim={c} onPress={() => onOpenClaim(c)} last={i === claims.length - 1} />
        ))}
      </Card>
    </View>
  );
}

function ClaimRow({ claim, onPress, last }) {
  const overdue = claim.payment?.state === "overdue";
  const rejected = claim.status === "rejected";
  const settled = claim.status === "paid" || rejected;
  const jobs = (claim.jobs || []).length;

  // Date, job count and the short reference on one quiet line. An exception
  // REPLACES that line rather than crowding it: when a claim was rejected,
  // that is the only thing on the row worth reading next.
  const meta = rejected
    ? `Rejected ${(claim.decidedAt || claim.submittedAt || "").slice(0, 10)} — tap to see why`
    : [
        (claim.submittedAt || "").slice(0, 10),
        jobs ? `${jobs} job${jobs === 1 ? "" : "s"}` : "",
        overdue ? `${claim.payment.daysOverdue}d overdue` : "",
        shortRef(claim.claimId),
      ].filter(Boolean).join(" · ");

  const pill = rejected ? "REJECTED"
    : claim.status === "submitted" ? "AWAITING"
    : claim.status === "approved" ? "APPROVED"
    : "";

  return (
    <Pressable onPress={onPress} style={[s.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.amount, mono, settled && { color: C.muted }]}>
          {money(claim.settlement?.payableIncGst)}
        </Text>
        <Text
          style={[s.meta, mono, (rejected || overdue) && { color: C.active }]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </View>
      {/* Only something waiting on a person earns a pill. Paid says so by
          sitting under Settled in grey, which had to be read anyway. */}
      {pill ? <Text style={[s.pill, rejected ? s.pillBad : s.pillWait]}>{pill}</Text> : null}
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: S.touch,
    paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  // The number he came for, at the size he came for it.
  amount: { color: C.ink, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  meta: { color: C.muted, fontSize: 12.5, marginTop: 3 },
  pill: {
    fontSize: 10, fontWeight: "800", letterSpacing: 0.7,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.chip, overflow: "hidden",
  },
  pillWait: { color: C.warnChipInk, backgroundColor: C.warnChipBg },
  pillBad: { color: C.active, backgroundColor: C.warnChipBg },
  chev: { color: C.muted, fontSize: 20 },
});
