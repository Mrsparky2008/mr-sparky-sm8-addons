// One bucket of claims, across everyone. Actionable buckets (To approve,
// To pay) open the decision screen; the record buckets (Rejected, Settled)
// open the frozen claim read-only. Rejected rows lead with the reason —
// that pile exists to teach.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Header } from "../../components/ui";
import { C, S, mono, money } from "../../lib/theme";
import { ClaimStatus } from "../pay/shared";

export default function BucketList({ title, claims = [], act, onOpenClaim, onBack }) {
  const ordered = [...claims].sort((a, b) =>
    String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));

  return (
    <View style={{ flex: 1 }}>
      <Header title={title} meta={`${claims.length}`} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {claims.length === 0 ? (
          <Empty>Nothing in this bucket.</Empty>
        ) : (
          <Card>
            {ordered.map((c, i) => (
              <Pressable
                key={`${c.contractorId}:${c.claimId}`}
                onPress={() => onOpenClaim(c, act)}
                style={[s.row, i === ordered.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle}>
                    {(c.warnings || []).length ? <Text style={s.flagDot}>● </Text> : null}
                    {c.contractorName || c.claimId}
                  </Text>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {c.claimId} · {(c.submittedAt || "").slice(0, 10)}
                    {c.status === "rejected" && c.rejectedReason ? ` — ${c.rejectedReason}` : ""}
                  </Text>
                </View>
                <ClaimStatus status={c.status} />
                <Text style={[s.rowAmount, mono]}>{money(c.settlement?.payableIncGst)}</Text>
                <Text style={s.chev}>›</Text>
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // A docket on this claim is queried, or is on somebody else's job too. Only
  // a mark — the reason lives on the claim itself, where there is room to say
  // it properly.
  flagDot: { color: C.warnChipInk },
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
