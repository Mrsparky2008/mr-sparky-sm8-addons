// Screen 5 — Day diary. An hour rail with the day's bookings against it, and
// the gaps called out: an empty afternoon is the thing worth acting on.
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Cta, Empty, Header } from "../components/ui";
import { C, R, S, T, mono, oneLine, suburb } from "../lib/theme";
import { fetchDiary } from "../lib/api";

const DAY_START = 7;
const DAY_END = 18;

// "2026-08-04 08:30:00" -> minutes since midnight. Parsed by hand: this is a
// Sydney wall-clock string, and letting Date touch it would apply the device's
// timezone to a time that is already local.
function minutes(stamp) {
  const m = /\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/.exec(String(stamp || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function clockFromMins(mins) {
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const mm = String(Math.round(mins % 60)).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

const clock = (stamp) => clockFromMins(minutes(stamp));

const hoursText = (mins) => {
  const h = mins / 60;
  return h >= 1.5 ? `${Math.round(h)} hrs` : h >= 1 ? "1 hr" : `${Math.round(mins)} min`;
};

export default function Diary({ onBack, onTalk }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let dead = false;
    fetchDiary()
      .then((d) => { if (!dead) setData(d); })
      .catch((e) => { if (!dead) setError(e.message || "Couldn't load your day"); });
    return () => { dead = true; };
  }, []);

  const bookings = (data?.bookings || [])
    .map((b) => ({ ...b, from: minutes(b.start), to: minutes(b.end) }))
    .filter((b) => b.from != null)
    .sort((a, b) => a.from - b.from);

  // Gaps between one booking ending and the next starting. Under 45 minutes is
  // travel, not a hole in the day.
  const rows = [];
  let cursor = DAY_START * 60;
  for (const b of bookings) {
    const gap = b.from - cursor;
    if (gap >= 45) rows.push({ kind: "gap", from: cursor, to: b.from, mins: gap });
    rows.push({ kind: "job", ...b });
    cursor = Math.max(cursor, b.to || b.from + 60);
  }
  if (bookings.length && DAY_END * 60 - cursor >= 45) {
    rows.push({ kind: "gap", from: cursor, to: DAY_END * 60, mins: DAY_END * 60 - cursor });
  }

  const dateLabel = data?.date
    ? new Date(`${data.date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    : "";

  return (
    <View style={s.screen}>
      <Header title="My day" meta={dateLabel} onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list}>
        {error ? (
          <Empty>{error}</Empty>
        ) : !data ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <Empty>Nothing booked today.{"\n"}Ask Charlie to fill it.</Empty>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.rail, mono]}>{clockFromMins(r.from)}</Text>
              {r.kind === "gap" ? (
                <View style={s.gap}>
                  <Text style={s.gapText}>{hoursText(r.mins)} free — “Charlie, fill this?”</Text>
                </View>
              ) : (
                <View style={s.event}>
                  <View style={s.eventTop}>
                    <Text style={[s.eventNum, mono]}>#{r.job?.number || "—"}</Text>
                    <Text style={s.eventSuburb} numberOfLines={1}>{suburb(r.job?.address) || oneLine(r.job?.address)}</Text>
                  </View>
                  <Text style={s.eventMeta} numberOfLines={1}>
                    {clock(r.start)}–{clock(r.end)} · {r.staff}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
      <View style={s.dock}>
        <Cta label="🎙  Ask Charlie about my day" onPress={() => onTalk(null)} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },
  row: { flexDirection: "row", alignItems: "stretch", marginBottom: 10, gap: 10 },
  rail: { width: 52, textAlign: "right", color: C.muted, fontSize: 11, paddingTop: 13 },
  event: {
    flex: 1, backgroundColor: C.infoChipBg, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, padding: 12,
  },
  eventTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventNum: { color: C.ink, fontSize: 14, fontWeight: "800" },
  eventSuburb: { color: C.ink, fontSize: 14, flex: 1 },
  eventMeta: { ...T.small, marginTop: 3 },
  gap: {
    flex: 1, borderColor: C.line, borderWidth: 1, borderStyle: "dashed",
    borderRadius: R.card, padding: 12, justifyContent: "center",
  },
  gapText: { color: C.muted, fontSize: 13 },
  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1,
  },
});
