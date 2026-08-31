// What you would have earned — the screen the whole demo exists for.
//
// A sparky signs up to answer one question: is this worth my time. Not "how
// does the app work". So this opens on the money and explains itself second.
//
// The figures are real: real jobs, real invoice values, real commission. The
// customers are not here at all — the portal strips them before the numbers
// leave it, and a sparky sees a suburb and a date, which is what makes a number
// believable without telling him whose house it was.
import { useEffect, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Cta, Header } from "../components/ui";
import { getEarnings } from "../lib/demo";
import { C, R, S, T, money } from "../lib/theme";

/** "2026-08-14" -> "14 Aug". The year is noise on a list of recent work. */
const shortDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return y && m && d ? `${Number(d)} ${MONTHS[Number(m) - 1]}` : "";
};

export default function Earnings({ mobile, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getEarnings(mobile);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mobile]);

  if (busy) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="What you'd have earned" onBack={onBack} />
        <ActivityIndicator color={C.brand} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="What you'd have earned" onBack={onBack} />
        <ScrollView contentContainerStyle={st.wrap}>
          <Text style={st.blurb}>{error || "Nothing to show just yet."}</Text>
          <Cta label="Back" onPress={onBack} tone="ghost" />
        </ScrollView>
      </View>
    );
  }

  const { jobs = [], totals = {} } = data;

  return (
    <View style={{ flex: 1 }}>
      <Header title="What you'd have earned" onBack={onBack} />
      <ScrollView contentContainerStyle={st.wrap}>

        {/* The headline first. Everything under it is the evidence. */}
        <View style={st.hero}>
          <Text style={st.heroLabel}>ON THE LAST {totals.count} JOBS</Text>
          <Text style={st.heroValue}>{money(totals.earned)}</Text>
          <Text style={st.heroSub}>
            out of {money(totals.invoiced)} invoiced · your share {totals.sharePercent}%
          </Text>
        </View>

        <Text style={st.blurb}>
          Real jobs done through Mr Sparky, with the customers taken out. This is
          what the electrician on each one was paid.
        </Text>

        {jobs.map((j, i) => (
          <View key={`${j.date}-${i}`} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.rowSuburb}>{j.suburb}</Text>
              <Text style={st.rowMeta}>
                {shortDate(j.date)} · {money(j.invoice)} invoiced
                {j.materials > 0 ? ` · ${money(j.materials)} materials` : ""}
              </Text>
            </View>
            <Text style={st.rowPay}>{money(j.yours)}</Text>
          </View>
        ))}

        <Text style={st.foot}>
          Jobs come to you already quoted and paid for — no lead fees, no chasing
          the customer for money.
        </Text>

        <Cta label="Sounds good — what's next?" onPress={onBack} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.screen, paddingBottom: 56 },
  hero: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 20,
    alignItems: "center",
    marginBottom: 18,
  },
  heroLabel: { ...T.label, marginBottom: 8 },
  heroValue: { fontSize: 40, fontWeight: "800", color: C.earth, fontVariant: ["tabular-nums"] },
  heroSub: { ...T.small, marginTop: 8, textAlign: "center" },
  blurb: { ...T.small, marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomColor: C.line,
    borderBottomWidth: 1,
  },
  rowSuburb: { ...T.body, fontSize: 15, fontWeight: "600" },
  rowMeta: { ...T.small, fontSize: 11.5, marginTop: 2 },
  rowPay: { ...T.body, fontSize: 16, fontWeight: "700", color: C.earth, fontVariant: ["tabular-nums"] },
  foot: { ...T.small, marginTop: 20, marginBottom: 18, textAlign: "center" },
});
