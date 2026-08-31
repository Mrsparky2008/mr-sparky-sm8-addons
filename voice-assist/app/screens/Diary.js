// Day diary — any day, not just today.
//
// An hour rail with the day's bookings against it, and the gaps called out: an
// empty afternoon is the thing worth acting on. Steven's additions (2026-08-06):
// the date steps with ‹ ›, taps open a month grid to jump anywhere, a Today
// chip appears whenever you're elsewhere — and a booking is a door to its job,
// exactly as if it was picked from the Jobs list.
//
// The backend has taken a date parameter since day one; this screen finally
// uses it. "Today" is whatever the SERVER says Sydney's today is — the phone
// never does its own timezone arithmetic.
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

// Date sums on plain YYYY-MM-DD strings. Noon keeps DST shifts from ever
// rolling the date over.
function addDays(iso, delta) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function label(iso, style = { weekday: "short", day: "numeric", month: "short" }) {
  return iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", style) : "";
}

export default function Diary({ onBack, onTalk, onOpenJob }) {
  const [date, setDate] = useState(null);        // null = server's Sydney today
  const [today, setToday] = useState(null);      // learned from the first load
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let dead = false;
    setData(null);
    setError("");
    fetchDiary(date || undefined)
      .then((d) => {
        if (dead) return;
        setData(d);
        if (!date && d?.date) setToday(d.date);
      })
      .catch((e) => { if (!dead) setError(e.message || "Couldn't load the day"); });
    return () => { dead = true; };
  }, [date]);

  const shown = data?.date || date;
  const isToday = !!shown && !!today && shown === today;

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

  const step = (delta) => { if (shown) setDate(addDays(shown, delta)); };

  return (
    <View style={s.screen}>
      <Header title="My day" onBack={onBack} />

      <View style={s.dateBar}>
        <Pressable onPress={() => step(-1)} hitSlop={10} style={s.arrow} disabled={!shown}>
          <Text style={s.arrowText}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setPicking(true)} style={s.dateChip} disabled={!shown}>
          <Text style={s.dateText}>{shown ? label(shown) : "…"}</Text>
        </Pressable>
        <Pressable onPress={() => step(1)} hitSlop={10} style={s.arrow} disabled={!shown}>
          <Text style={s.arrowText}>›</Text>
        </Pressable>
        {!isToday && shown ? (
          <Pressable onPress={() => setDate(today)} style={s.todayChip} hitSlop={6}>
            <Text style={s.todayText}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list}>
        {error ? (
          <Empty>{error}</Empty>
        ) : !data ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <Empty>
            Nothing booked {isToday ? "today" : `on ${label(shown)}`}.{"\n"}Ask Charlie to fill it.
          </Empty>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.rail, mono]}>{clockFromMins(r.from)}</Text>
              {r.kind === "gap" ? (
                <View style={s.gap}>
                  <Text style={s.gapText}>{hoursText(r.mins)} free</Text>
                </View>
              ) : (
                <Pressable
                  style={s.event}
                  onPress={r.job?.number && onOpenJob
                    ? () => onOpenJob({ job_number: String(r.job.number), address: r.job.address || "" })
                    : undefined}
                >
                  <View style={s.eventTop}>
                    <Text style={[s.eventNum, mono]}>#{r.job?.number || "—"}</Text>
                    <Text style={s.eventSuburb} numberOfLines={1}>{suburb(r.job?.address) || oneLine(r.job?.address)}</Text>
                    {r.job?.number ? <Text style={s.chev}>›</Text> : null}
                  </View>
                  <Text style={s.eventMeta} numberOfLines={1}>
                    {clock(r.start)}–{clock(r.end)} · {r.staff}
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Charlie retired 30 Aug 2026 - the dock button went with him. */}

      {picking && shown ? (
        <MonthSheet
          selected={shown}
          today={today}
          onPick={(iso) => { setPicking(false); setDate(iso); }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}

/** A month grid, pure JS — no native date-picker module, so it ships OTA. */
function MonthSheet({ selected, today, onPick, onClose }) {
  const [y0, m0] = selected.split("-").map(Number);
  const [view, setView] = useState({ y: y0, m: m0 });   // m is 1-based

  const first = new Date(view.y, view.m - 1, 1, 12);
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  // AU weeks start Monday.
  const lead = (first.getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const iso = (d) => `${view.y}-${String(view.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthLabel = first.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  const shiftMonth = (delta) => {
    const dt = new Date(view.y, view.m - 1 + delta, 1, 12);
    setView({ y: dt.getFullYear(), m: dt.getMonth() + 1 });
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.veil} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.monthHead}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}><Text style={s.arrowText}>‹</Text></Pressable>
            <Text style={s.monthLabel}>{monthLabel}</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10}><Text style={s.arrowText}>›</Text></Pressable>
          </View>
          <View style={s.week}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <Text key={i} style={s.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={s.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={s.cell} />;
              const value = iso(d);
              const isSel = value === selected;
              const isToday = value === today;
              return (
                <Pressable key={i} style={[s.cell, isSel && s.cellSel]} onPress={() => onPick(value)}>
                  <Text style={[s.cellText, mono, isToday && !isSel && { color: C.yellow }, isSel && { color: "#fff" }]}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },

  dateBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: S.screen, paddingBottom: S.gap,
  },
  arrow: {
    width: 40, height: 40, borderRadius: R.card, alignItems: "center", justifyContent: "center",
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
  },
  arrowText: { color: C.ink, fontSize: 22, lineHeight: 24, fontWeight: "600" },
  dateChip: {
    flex: 1, minHeight: 40, borderRadius: R.card, alignItems: "center", justifyContent: "center",
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
  },
  dateText: { color: C.ink, fontSize: 14.5, fontWeight: "800" },
  todayChip: {
    borderRadius: R.chip, backgroundColor: C.charlieBg, borderColor: C.charlieLine, borderWidth: 1,
    paddingHorizontal: 11, paddingVertical: 8,
  },
  todayText: { color: C.infoChipInk, fontSize: 12, fontWeight: "800" },

  row: { flexDirection: "row", alignItems: "stretch", marginBottom: 10, gap: 10 },
  rail: { width: 52, textAlign: "right", color: C.muted, fontSize: 11, paddingTop: 13 },
  event: {
    flex: 1, backgroundColor: C.infoChipBg, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, padding: 12,
  },
  eventTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventNum: { color: C.ink, fontSize: 14, fontWeight: "800" },
  eventSuburb: { color: C.ink, fontSize: 14, flex: 1 },
  chev: { color: C.muted, fontSize: 18, lineHeight: 20 },
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

  veil: { flex: 1, backgroundColor: "rgba(4,10,18,.72)", justifyContent: "center", padding: S.screen },
  sheet: {
    backgroundColor: C.bg, borderColor: C.line, borderWidth: 1, borderRadius: R.card + 4,
    padding: S.screen,
  },
  monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  monthLabel: { color: C.ink, fontSize: 15, fontWeight: "800" },
  week: { flexDirection: "row", marginBottom: 4 },
  weekDay: { flex: 1, textAlign: "center", color: C.muted, fontSize: 10.5, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cellSel: { backgroundColor: C.brand },
  cellText: { color: C.ink, fontSize: 14 },
});
