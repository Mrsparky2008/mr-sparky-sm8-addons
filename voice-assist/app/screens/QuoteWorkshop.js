// Screen 4 — Quote workshop. Charlie never reads line items aloud; they land
// here to be eyeballed. Nothing on this screen exists in ServiceM8 until the
// green button is pressed, and the design says so in as many ways as it can.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, JobChip } from "../components/ui";
import { C, R, S, T, money, mono } from "../lib/theme";

const GST = 0.1;

const qtyOf = (l) => (Number(l.quantity) > 0 ? Number(l.quantity) : 1);
const priceOf = (l) => Number(l.unit_price) || 0;

export default function QuoteWorkshop({ job, lines = [], onKeepTalking, onLockIn, committing }) {
  const subtotal = lines.reduce((t, l) => t + qtyOf(l) * priceOf(l), 0);
  const gst = subtotal * GST;

  return (
    <View style={s.screen}>
      <View style={s.banner}>
        <Text style={s.bannerText}>● DRAFTING WITH CHARLIE — NOTHING SAVED YET</Text>
      </View>

      {!!job && (
        <View style={s.chipWrap}>
          <JobChip job={job} />
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list}>
        <Card>
          {lines.map((l, i) => (
            <View key={i} style={[s.row, i === lines.length - 1 && s.rowLast]}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{l.name}</Text>
                <Text style={[s.qty, mono]}>{qtyOf(l)} × {money(priceOf(l))}</Text>
              </View>
              <Text style={[s.linePrice, mono]}>{money(qtyOf(l) * priceOf(l))}</Text>
            </View>
          ))}

          <View style={s.totals}>
            <Total label="Subtotal" value={subtotal} />
            <Total label="GST" value={gst} />
            <Total label="Total" value={subtotal + gst} strong />
          </View>
        </Card>
      </ScrollView>

      <View style={s.dock}>
        <Cta
          label={committing ? "Locking in…" : "Lock it in"}
          tone="earth"
          onPress={onLockIn}
          disabled={committing || lines.length === 0}
        />
        <View style={{ height: 10 }} />
        <Cta label="Keep talking" tone="ghost" onPress={onKeepTalking} />
        <Text style={s.guard}>
          <Text style={s.guardGreen}>Add-only</Text>: Charlie can never delete or change existing billing lines
        </Text>
      </View>
    </View>
  );
}

function Total({ label, value, strong }) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalLabel, strong && s.totalLabelStrong]}>{label}</Text>
      <Text style={[s.totalValue, mono, strong && s.totalValueStrong]}>{money(value)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  banner: { paddingHorizontal: S.screen, paddingTop: 10, paddingBottom: 12 },
  bannerText: { color: C.active, fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  chipWrap: { paddingHorizontal: S.screen, paddingBottom: 12 },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },

  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10,
    borderBottomColor: C.line, borderBottomWidth: 1, borderStyle: "dashed",
  },
  rowLast: { borderBottomWidth: 0 },
  name: { ...T.body, fontSize: 12.5, lineHeight: 17 },
  qty: { ...T.small, fontSize: 11.5, marginTop: 3 },
  linePrice: { color: C.ink, fontSize: 13, fontWeight: "600" },

  totals: { borderTopColor: C.line, borderTopWidth: 1, marginTop: 4, paddingTop: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { ...T.small, fontSize: 13 },
  totalLabelStrong: { color: C.ink, fontSize: 15, fontWeight: "800" },
  totalValue: { color: C.muted, fontSize: 13 },
  totalValueStrong: { color: C.ink, fontSize: 15, fontWeight: "800" },

  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1,
  },
  guard: { ...T.small, fontSize: 10.5, textAlign: "center", marginTop: 10, lineHeight: 15 },
  guardGreen: { color: C.earth, fontWeight: "800" },
});
