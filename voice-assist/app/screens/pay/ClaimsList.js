// Every claim, newest first — the history bucket off the Money hub.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Header, SectionLabel } from "../../components/ui";
import { C, S, mono, money } from "../../lib/theme";
import { ClaimStatus } from "./shared";

export default function ClaimsList({ claims = [], onOpenClaim, onBack }) {
  const ordered = [...claims].sort((a, b) =>
    String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));

  const live = ordered.filter((c) => c.status !== "paid" && c.status !== "rejected");
  const done = ordered.filter((c) => c.status === "paid" || c.status === "rejected");

  return (
    <View style={{ flex: 1 }}>
      <Header title="Claims" meta={`${claims.length}`} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {claims.length === 0 ? <Empty>No claims yet. The first one starts on the Money screen.</Empty> : null}

        {live.length ? (
          <View>
            <SectionLabel>In motion</SectionLabel>
            <Card>
              {live.map((c, i) => (
                <ClaimRow key={c.claimId} claim={c} onPress={() => onOpenClaim(c)} last={i === live.length - 1} />
              ))}
            </Card>
          </View>
        ) : null}

        {done.length ? (
          <View>
            <SectionLabel>Settled</SectionLabel>
            <Card>
              {done.map((c, i) => (
                <ClaimRow key={c.claimId} claim={c} onPress={() => onOpenClaim(c)} last={i === done.length - 1} />
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ClaimRow({ claim, onPress, last }) {
  const overdue = claim.payment?.state === "overdue";
  return (
    <Pressable onPress={onPress} style={[s.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle}>{claim.claimId}</Text>
        <Text style={s.rowSub}>
          {(claim.submittedAt || "").slice(0, 10)}
          {overdue ? ` · ${claim.payment.daysOverdue}d overdue` : ""}
        </Text>
      </View>
      <ClaimStatus status={claim.status} />
      <Text style={[s.rowAmount, mono, overdue && { color: C.warnChipInk }]}>
        {money(claim.settlement?.payableIncGst)}
      </Text>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  row: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: S.touch,
    paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  rowSub: { color: C.muted, fontSize: 11.5, marginTop: 1 },
  rowAmount: { color: C.ink, fontSize: 14, fontWeight: "700" },
  chev: { color: C.muted, fontSize: 20 },
});
