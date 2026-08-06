// The job's diary — the skin, running on the real data already served.
//
// The dossier carries bookings (dated, with staff) and recent notes today, so
// those render live. Photos, forms, receipt copies, Add note and Add photo all
// arrive with the next backend deploy — and the screen says so plainly rather
// than showing sample entries that could be mistaken for the job's truth, or
// buttons that do nothing. House rule: never a dead control, never fake data
// on a screen that touches real work.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, SectionLabel } from "../components/ui";
import Icon from "../components/icons";
import { C, R, S, T, mono, oneLine } from "../lib/theme";

// "2026-08-04 08:30:00" -> "Mon 4 Aug · 8:30am", Sydney wall-clock, no Date
// timezone games on the date part.
function when(stamp) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(stamp || ""));
  if (!m) return "";
  const label = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const h = Number(m[4]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${label} · ${h12}:${m[5]}${h >= 12 ? "pm" : "am"}`;
}

export default function JobDiary({ jobNumber, bookings = [], notes = [], onTalk, onBack }) {
  const ordered = [...bookings].sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  const noteList = (notes || []).filter(Boolean).slice().reverse();

  return (
    <View style={s.screen}>
      <Header title="Job diary" meta={`#${jobNumber}`} onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list}>
        {ordered.length ? (
          <View style={s.section}>
            <SectionLabel>Bookings</SectionLabel>
            <Card style={{ paddingVertical: 4 }}>
              {ordered.map((b, i) => (
                <View key={b.activity_uuid || i} style={[s.entry, i === ordered.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.entryIcon}><Icon name="board" size={18} color={C.ink} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.entryTitle}>{b.staff || "Booked"}</Text>
                    <Text style={s.entrySub}>
                      {when(b.start)}{b.end ? `–${when(b.end).split("· ")[1] || ""}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {noteList.length ? (
          <View style={s.section}>
            <SectionLabel>Notes — latest first</SectionLabel>
            <Card style={{ paddingVertical: 4 }}>
              {noteList.map((n, i) => (
                <View key={i} style={[s.entry, i === noteList.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.entryIcon}><Icon name="claims" size={18} color={C.ink} /></View>
                  <Text style={[s.entryTitle, { flex: 1, fontWeight: "400" }]}>{oneLine(n)}</Text>
                </View>
              ))}
            </Card>
            <Text style={s.note}>
              ServiceM8 serves the last few notes today; the full history joins with the feed below.
            </Text>
          </View>
        ) : null}

        {!ordered.length && !noteList.length ? (
          <Empty>Nothing in the diary yet.</Empty>
        ) : null}

        <View style={s.section}>
          <SectionLabel>Coming to this feed</SectionLabel>
          <Card>
            <Text style={T.small}>
              Photos with thumbnails, Form 001s, receipt record-copies, full note history with
              who-and-when, and the Add note / Add photo buttons — everything writing straight
              into ServiceM8, one deploy away. The screen is real today as far as the data
              underneath it goes; nothing here is sample.
            </Text>
          </Card>
        </View>
      </ScrollView>

      <View style={s.dock}>
        <Cta label="🎙  Talk about this job" onPress={onTalk} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },
  section: { marginBottom: S.gap },
  entry: {
    flexDirection: "row", alignItems: "flex-start", gap: 11,
    paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  entryIcon: { width: 22, alignItems: "center", paddingTop: 1 },
  entryTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  entrySub: { ...T.small, marginTop: 2 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1,
  },
});
