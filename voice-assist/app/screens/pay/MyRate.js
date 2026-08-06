// My rate — the ladder as a target to chase, not a thing done to you.
//
// The portal computes conversion and the rung assessment on every statement;
// this screen just lays the ladder out and points at where you stand. If the
// window doesn't have enough history to measure, it says so in the portal's
// own words rather than showing zeros that read as failure.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Header, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono } from "../../lib/theme";

export default function MyRate({ data, onBack }) {
  const conv = data?.conversion;
  const ladder = data?.ladder;

  return (
    <View style={{ flex: 1 }}>
      <Header title="My rate" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {!conv?.measurable ? (
          <Card>
            <Text style={T.body}>
              {conv?.reason || "Not enough history in the window to measure yet."}
            </Text>
          </Card>
        ) : (
          <Card>
            <SectionLabel>Your window</SectionLabel>
            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={[s.statFig, mono]}>{Math.round((conv.conversion || 0) * 100)}%</Text>
                <Text style={s.statLab}>conversion</Text>
              </View>
              <View style={s.stat}>
                <Text style={[s.statFig, mono]}>{conv.claimed ?? "—"}</Text>
                <Text style={s.statLab}>leads taken</Text>
              </View>
              {ladder?.windowDays ? (
                <View style={s.stat}>
                  <Text style={[s.statFig, mono]}>{ladder.windowDays}</Text>
                  <Text style={s.statLab}>day window</Text>
                </View>
              ) : null}
            </View>
          </Card>
        )}

        {ladder?.rungs?.length ? (
          <View>
            <SectionLabel>The ladder</SectionLabel>
            <View style={{ gap: 8 }}>
              {ladder.rungs.map((r) => (
                <View key={r.index} style={[s.rung, r.current && s.rungOn]}>
                  <Text style={[s.rungRate, mono, r.current && { color: C.ink }]}>
                    {Math.round((r.rate || 0) * 100)}%
                  </Text>
                  <Text style={[s.rungReq, r.current && { color: C.muted }]}>
                    {r.minConversion != null ? `${Math.round(r.minConversion * 100)}% conversion` : ""}
                    {r.minClaims ? ` · ${r.minClaims}+ leads` : ""}
                  </Text>
                  {r.current ? <Text style={s.youBadge}>YOU</Text> : null}
                </View>
              ))}
            </View>
            <Text style={s.note}>
              Rates move at the periodic review, never mid-claim — every job keeps the rate it was
              claimed on. A move down needs a trend, not one quiet month.
            </Text>
          </View>
        ) : (
          <Empty>No ladder is set for your agreement — your rate is fixed terms.</Empty>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  statRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  stat: { flex: 1 },
  statFig: { color: C.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
  statLab: { color: C.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 2 },
  rung: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 13, paddingVertical: 11,
  },
  rungOn: { borderColor: C.brand, backgroundColor: C.charlieBg },
  rungRate: { color: C.muted, fontSize: 17, fontWeight: "800", width: 52 },
  rungReq: { flex: 1, color: C.muted, fontSize: 12 },
  youBadge: {
    color: "#fff", backgroundColor: C.brand, fontSize: 9.5, fontWeight: "800",
    letterSpacing: 0.8, borderRadius: R.chip, paddingHorizontal: 8, paddingVertical: 3,
    overflow: "hidden",
  },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 9 },
});
