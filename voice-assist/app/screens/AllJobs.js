// All jobs — the archive door.
//
// Opens with the last 10, and the search reaches every job ever by number,
// name, suburb or work keywords. Old jobs cost nothing until summoned: the
// backend keeps a light index of everything and only loads a job's full data
// when one is opened. (Searching by mobile number joins when the phone number
// is added to that index — backend change, queued.)
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Card, Empty, Header, StatusChip } from "../components/ui";
import KeyboardToggle from "../components/KeyboardToggle";
import { C, R, S, T, mono, oneLine } from "../lib/theme";
import { fetchJobs } from "../lib/api";

export default function AllJobs({ onOpenJob, onBack }) {
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const searchRef = useRef(null);

  async function load(query) {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const list = await fetchJobs(query);
      if (mine === seq.current) setJobs(query ? list : list.slice(0, 10));
    } catch (err) {
      if (mine === seq.current) setError(err.message || "Couldn't load jobs");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q.trim() ? 320 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={s.screen}>
      <Header title="All jobs" onBack={onBack} />
      <View style={s.searchWrap}>
        <TextInput
          ref={searchRef}
          style={s.search}
          value={q}
          onChangeText={setQ}
          placeholder="Job number, name, suburb…"
          placeholderTextColor={C.muted}
          selectionColor={C.brand}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoFocus
        />
      </View>
      {/* The search field is pinned above, so the fix isn't to squash the
          layout — it's to let the LIST scroll clear of the keyboard, and to
          let a downward drag put the keyboard away like every other list. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={[T.label, { marginBottom: 10 }]}>{q.trim() ? "Matches" : "Latest"}</Text>
        {loading && jobs.length === 0 ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 30 }} />
        ) : error ? (
          <Empty>{error}</Empty>
        ) : jobs.length === 0 ? (
          <Empty>{q.trim() ? `Nothing matching “${q.trim()}”.` : "No jobs."}</Empty>
        ) : (
          jobs.map((j) => (
            <Pressable key={j.job_uuid || j.job_number} onPress={() => onOpenJob(j)}>
              <Card style={{ marginBottom: 10 }}>
                <View style={s.rowTop}>
                  <Text style={[s.number, mono]}>#{j.job_number}</Text>
                  <StatusChip status={j.status} />
                </View>
                <Text style={s.address} numberOfLines={1}>{oneLine(j.address) || "—"}</Text>
                {!!(j.contact || j.work) && (
                  <Text style={s.sub} numberOfLines={1}>{[j.contact, j.work].filter(Boolean).join(" · ")}</Text>
                )}
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>

      <KeyboardToggle inputRef={searchRef} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  searchWrap: { paddingHorizontal: S.screen, paddingBottom: S.gap },
  search: {
    minHeight: S.touch, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 14, color: C.ink, fontSize: 16,
  },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  number: { color: C.ink, fontSize: 15, fontWeight: "800" },
  address: { ...T.body, fontSize: 14 },
  sub: { ...T.small, marginTop: 3 },
});
