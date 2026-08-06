// Screen 2 — Jobs. Search, or pick up where the day left off.
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { Card, Empty, Header, StatusChip, Tile, TileGrid } from "../components/ui";
import { C, R, S, T, mono, oneLine, suburb } from "../lib/theme";
import { fetchJobs } from "../lib/api";

export default function Jobs({ onOpenJob, onTalk, onDiary, onSignOut, onAccount, email }) {
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  async function load(query) {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const list = await fetchJobs(query);
      // A slow search for an earlier keystroke must never overwrite a newer one.
      if (mine === seq.current) setJobs(list);
    } catch (err) {
      if (mine === seq.current) setError(err.message || "Couldn't load jobs");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  // Also covers the first load (q starts empty, so this fires immediately).
  // Typing a job number should not fire a search per character.
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q.trim() ? 320 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={s.screen}>
      <Header title="Jobs" meta={email ? email.split("@")[0] : undefined} onMeta={onAccount} />

      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          value={q}
          onChangeText={setQ}
          placeholder="Job number or address…"
          placeholderTextColor={C.muted}
          selectionColor={C.brand}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading && jobs.length > 0} onRefresh={() => load(q.trim())} tintColor={C.muted} />
        }
      >
        <Text style={[T.label, { marginBottom: 10 }]}>{q.trim() ? "Matches" : "Recent"}</Text>

        {loading && jobs.length === 0 ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 30 }} />
        ) : error ? (
          <Empty>{error}</Empty>
        ) : jobs.length === 0 ? (
          <Empty>{q.trim() ? `Nothing matching “${q.trim()}”.` : "No jobs yet."}</Empty>
        ) : (
          jobs.map((j) => <JobRow key={j.job_uuid || j.job_number} job={j} onPress={() => onOpenJob(j)} />)
        )}
      </ScrollView>

      {/* Job-Actions style tiles: the rest of the app has to be VISIBLE, not
          hidden behind two grey words. */}
      <View style={s.dock}>
        <TileGrid>
          <Tile icon="🎙" label="Talk to Charlie" tone="brand" onPress={() => onTalk(null)} />
          <Tile icon="📖" label="My day" onPress={onDiary} />
        </TileGrid>
        <Pressable onPress={onSignOut} hitSlop={8} style={s.signOutWrap}>
          <Text style={s.link}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function JobRow({ job, onPress }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 10 }}>
        <View style={s.rowTop}>
          <Text style={[s.number, mono]}>#{job.job_number}</Text>
          <StatusChip status={job.status} />
        </View>
        <Text style={s.address} numberOfLines={1}>{oneLine(job.address) || suburb(job.address) || "—"}</Text>
        {!!(job.contact || job.work) && (
          <Text style={s.sub} numberOfLines={1}>
            {[job.contact, job.work].filter(Boolean).join(" · ")}
          </Text>
        )}
      </Card>
    </Pressable>
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
  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 8,
    borderTopColor: C.line, borderTopWidth: 1, backgroundColor: C.bg,
  },
  signOutWrap: { alignItems: "center", paddingTop: 12, paddingBottom: 2 },
  link: { color: C.muted, fontSize: 13, fontWeight: "600" },
});
