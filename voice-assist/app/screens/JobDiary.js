// The job's diary — bookings, time on site, and the FULL note history with
// who-and-when. Notes only, on purpose: photos and documents live in
// ServiceM8 (Steven, 30 Aug 2026: "that's sm8 territory, no need to
// duplicate — just the notes for simplicity").
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Card, Cta, Empty, Header, SectionLabel } from "../components/ui";
import Icon from "../components/icons";
import KeyboardToggle from "../components/KeyboardToggle";
import { C, R, S, T, mono, oneLine } from "../lib/theme";
import { fetchStaff, postJobNote, postJobTask } from "../lib/api";

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

// "3h 44m", or "44m" when it's under the hour. The backend adds the minutes
// up; this only chooses the words.
function hoursLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export default function JobDiary({ jobNumber, bookings = [], notes = [], noteFeed = [], timeOnSite, onAddReceipt, onTalk, onBack }) {
  const ordered = [...bookings].sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  const [added, setAdded] = useState([]);          // notes written this visit
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const noteRef = useRef(null);
  // Who the note is FOR, if anyone. Steven: "a note on SM8 is useless unless
  // it's addressed to someone... it would just sit there." Picking a name turns
  // it into a task with an owner, a due date and a tick box. @mentions cannot
  // do this from the API — ServiceM8 stores "@marites" as plain characters and
  // fires the notification from its own app as you type.
  const [staff, setStaff] = useState([]);
  const [assignee, setAssignee] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchStaff().then((r) => { if (alive) setStaff(r?.staff || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const noteList = [...added, ...(notes || []).filter(Boolean).slice().reverse()];

  async function saveNote() {
    const note = draft.trim();
    if (!note) return;
    setBusy(true);
    setNoteError("");
    try {
      await postJobNote(jobNumber, note);
      // Addressed to someone: the note is the record, the task is what gets it
      // seen. Both, because a task alone would not show in the job's history.
      if (assignee) {
        await postJobTask(jobNumber, {
          name: note.length > 60 ? `${note.slice(0, 57)}…` : note,
          details: note,
          assignee: assignee.name,
        });
      }
      // It is an SM8 note now — show it at the top like the truth it is.
      setAdded((l) => [assignee ? `${note}  → ${assignee.name}` : note, ...l]);
      setAssignee(null);
      setDraft("");
      setWriting(false);
    } catch (err) {
      setNoteError(err?.message || "The note didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.screen}>
      <Header title="Job diary" meta={`#${jobNumber}`} onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
        <View style={[s.section, s.addRow]}>
          <Pressable onPress={() => setWriting((v) => !v)} style={[s.addBtn, { backgroundColor: C.brand }]}>
            <Icon name="claims" size={17} color="#fff" />
            <Text style={s.addBtnText}>Add note</Text>
          </Pressable>
          {onAddReceipt ? (
            <Pressable onPress={onAddReceipt} style={[s.addBtn, s.addBtnGhost]}>
              <Icon name="camera" size={17} color={C.ink} />
              <Text style={[s.addBtnText, { color: C.ink }]}>Add receipt</Text>
            </Pressable>
          ) : null}
        </View>

        {writing ? (
          <View style={s.section}>
            <TextInput
              ref={noteRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Goes straight onto the ServiceM8 job card…"
              placeholderTextColor={C.muted}
              multiline
              autoFocus
              style={s.noteInput}
            />
            {noteError ? <Text style={s.noteError}>{noteError}</Text> : null}
            <View style={{ height: 8 }} />
            {staff.length ? (
              <>
                <Text style={s.assignLabel}>Someone needs to action this?</Text>
                <View style={s.chips}>
                  {staff.map((p) => {
                    const on = assignee?.uuid === p.uuid;
                    return (
                      <Pressable
                        key={p.uuid}
                        onPress={() => setAssignee(on ? null : p)}
                        style={[s.chip, on && s.chipOn]}
                      >
                        <Text style={[s.chipText, on && { color: C.ink }]}>{p.name.split(" ")[0]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={s.note}>
                  {assignee
                    ? `Goes on ${assignee.name.split(" ")[0]}'s task list, due tomorrow — a note on its own sits there unread.`
                    : "Left off, it's a record only."}
                </Text>
              </>
            ) : null}
            <View style={{ height: 8 }} />
            <Cta
              label={busy ? "Saving…" : assignee ? `Save note & task for ${assignee.name.split(" ")[0]}` : "Save note"}
              tone="earth"
              disabled={busy || !draft.trim()}
              onPress={saveNote}
            />
          </View>
        ) : null}
        {/* Clocked time, not appointments. ServiceM8 keeps both in the same
            table and we used to render them together, which is how this job
            grew eight overlapping "bookings", one of them 32 seconds long. */}
        {timeOnSite?.entries ? (
          <View style={s.section}>
            <SectionLabel>Time on site</SectionLabel>
            <Card>
              <View style={s.entry}>
                <View style={s.entryIcon}><Icon name="board" size={18} color={C.ink} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.entryTitle}>{hoursLabel(timeOnSite.minutes)}</Text>
                  <Text style={s.entrySub}>
                    across {timeOnSite.entries} timer run{timeOnSite.entries === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        ) : null}

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

        {(noteFeed.length ? true : noteList.length) ? (
          <View style={s.section}>
            <SectionLabel>Notes — latest first</SectionLabel>
            <Card style={{ paddingVertical: 4 }}>
              {added.map((n, i) => (
                <View key={`new-${i}`} style={s.entry}>
                  <View style={s.entryIcon}><Icon name="claims" size={18} color={C.ink} /></View>
                  <Text style={[s.entryTitle, { flex: 1, fontWeight: "400" }]}>{oneLine(n)}</Text>
                </View>
              ))}
              {noteFeed.length ? (
                noteFeed.map((n, i) => (
                  <View key={i} style={[s.entry, i === noteFeed.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={s.entryIcon}><Icon name="claims" size={18} color={C.ink} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.entryTitle, { fontWeight: "400" }]}>{n.note}</Text>
                      {(n.by || n.when) ? (
                        <Text style={s.entrySub}>{[n.by, when(n.when)].filter(Boolean).join(" · ")}</Text>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                (notes || []).filter(Boolean).slice().reverse().map((n, i, arr) => (
                  <View key={i} style={[s.entry, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={s.entryIcon}><Icon name="claims" size={18} color={C.ink} /></View>
                    <Text style={[s.entryTitle, { flex: 1, fontWeight: "400" }]}>{oneLine(n)}</Text>
                  </View>
                ))
              )}
            </Card>
          </View>
        ) : null}

        {!ordered.length && !noteList.length && !noteFeed.length ? (
          <Empty>Nothing in the diary yet.</Empty>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Charlie retired 30 Aug 2026 - AI Assist lives on the job card. */}

      {writing ? <KeyboardToggle inputRef={noteRef} /> : null}
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
  assignLabel: { color: C.muted, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 12, marginBottom: 7 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    borderRadius: R.chip, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel,
    paddingHorizontal: 12, minHeight: 34, justifyContent: "center",
  },
  chipOn: { borderColor: C.brand, backgroundColor: C.charlieBg },
  chipText: { color: C.muted, fontSize: 13, fontWeight: "700" },
  addRow: { flexDirection: "row", gap: 9 },
  addBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    minHeight: 44, borderRadius: R.button,
  },
  addBtnGhost: { borderWidth: 1, borderColor: C.line },
  addBtnText: { color: "#fff", fontSize: 13.5, fontWeight: "800" },
  noteInput: {
    minHeight: 88, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, padding: 12, color: C.ink, fontSize: 15, textAlignVertical: "top",
  },
  noteError: { color: C.warnChipInk, fontSize: 12.5, marginTop: 7 },
  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1,
  },
});
