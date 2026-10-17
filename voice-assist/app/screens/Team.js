// The crew's work, in one list.
//
// Steven, 13 Oct 2026: "make a tab that's available for the whole team... in
// Multiskill it will show the jobs that belong to Jason, Andrew and John in one
// tab... they can grab jobs from others because they all work together." And:
// "It's a good feature. We can build it later."
//
// Later arrived 14 Oct 2026, when he picked it over the alternatives: "I prefer
// the team tab... the available, the jobs, the day, and the team."
//
// WHY IT EXISTS AT ALL. An employee loses Money - the money on a job Andrew
// finishes is Jason's, not Andrew's - which left him three tabs and a gap. This
// fills it with the thing he actually needs that a subbie does not: what the
// rest of his crew is carrying, so work gets picked up between them instead of
// sitting while one man is flat out and another is free.
//
// THE MONEY RULE, AND IT IS THE WHOLE REASON THIS SCREEN IS SAFE. A job on
// here belongs to whoever accepted it and the commission is his (section 15).
// Andrew taking one of Jason's leaves it Jason's job and Jason's money, with
// Andrew recorded beside it as who tapped. So this screen shows WHERE and WHAT
// and WHOSE - and no figures at all. Not because they are secret, but because
// a value next to another man's name is a league table, and the one thing this
// tab must not do is start an argument about money inside a crew.
//
// WHO THE CREW IS is the portal's answer, never worked out here. The phone asks
// what its crew is doing and renders the reply.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Card, Empty, Header, StatusDot } from "../components/ui";
import { C, R, S, T, mono, oneLine } from "../lib/theme";
import * as portal from "../lib/portal";

/** Group the crew's jobs under the man carrying them, him first. */
function byPerson(jobs, meId) {
  const out = new Map();
  for (const j of jobs) {
    const key = j.personId || j.who || "—";
    if (!out.has(key)) {
      out.set(key, { id: j.personId || null, who: j.who || "Unassigned", jobs: [] });
    }
    out.get(key).jobs.push(j);
  }
  const rows = [...out.values()];
  // His own work first. Everything else by name, so the order does not shuffle
  // between refreshes - a list that reorders itself is a list you cannot scan.
  rows.sort((a, b) => {
    const mine = (r) => (meId && r.id === meId ? 0 : 1);
    return mine(a) - mine(b) || String(a.who).localeCompare(String(b.who));
  });
  return rows;
}

export default function Team({ onOpenJob }) {
  const [jobs, setJobs] = useState(null);
  const [meId, setMeId] = useState(null);
  const [crewSize, setCrewSize] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const load = useCallback(() => {
    setBusy(true);
    setRefused("");
    portal.teamJobs()
      .then((d) => {
        if (!live.current) return;
        setJobs(Array.isArray(d?.jobs) ? d.jobs : []);
        setMeId(d?.meId || null);
        setCrewSize(Number(d?.crewSize) || 0);
      })
      .catch((e) => {
        if (!live.current) return;
        setJobs([]);
        // The rule out of the push failures: a server that ANSWERS and says no
        // must never be silent. A phone that cannot get out stays quiet.
        if (Number(e?.status) >= 400) {
          setRefused(e?.message || "The portal would not answer.");
        }
      })
      .finally(() => { if (live.current) setBusy(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = jobs ? byPerson(jobs, meId) : [];

  return (
    <View style={{ flex: 1 }}>
      <Header title="Team" meta={jobs?.length ? String(jobs.length) : undefined} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        {jobs === null ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : refused ? (
          <Card style={s.refused}>
            <Text style={s.refusedTitle}>This list could not be loaded</Text>
            <Text style={s.refusedWhy}>{refused}</Text>
            <Pressable onPress={load} style={s.again} disabled={busy}>
              <Text style={s.againText}>{busy ? "Trying…" : "Try again"}</Text>
            </Pressable>
          </Card>
        ) : !groups.length ? (
          /*
           * Two different nothings, and telling them apart is the difference
           * between a quiet week and a tab that looks broken. A man with no
           * crew on his record should not be left wondering why the screen he
           * was given is empty.
           */
          <Empty>
            {crewSize > 1
              ? "Nobody on the team has a job on right now."
              : "You are not on a team yet. When you are, everyone's jobs show here."}
          </Empty>
        ) : (
          groups.map((g) => (
            <View key={String(g.id || g.who)} style={s.group}>
              <View style={s.groupHead}>
                <Text style={s.who}>
                  {meId && g.id === meId ? "You" : g.who}
                </Text>
                <Text style={s.count}>
                  {g.jobs.length} {g.jobs.length === 1 ? "job" : "jobs"}
                </Text>
              </View>

              {g.jobs.map((j) => (
                <Pressable
                  key={String(j.jobNumber)}
                  onPress={() => onOpenJob?.({
                    job_number: String(j.jobNumber),
                    address: j.address || "",
                  })}
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                >
                  <Card style={{ marginBottom: 8 }}>
                    <View style={s.top}>
                      <StatusDot status={j.status} />
                      <Text style={[s.number, mono, { flex: 1 }]}>{j.jobNumber}</Text>
                      {j.when ? <Text style={s.when}>{j.when}</Text> : null}
                    </View>
                    <Text style={s.address} numberOfLines={2}>
                      {oneLine(j.address) || j.suburb || "—"}
                    </Text>
                    {j.description ? (
                      <Text style={s.what} numberOfLines={2}>{oneLine(j.description)}</Text>
                    ) : null}
                  </Card>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0 },
  group: { marginBottom: 18 },
  groupHead: {
    flexDirection: "row", alignItems: "baseline", gap: 10,
    marginBottom: 8, paddingHorizontal: 2,
  },
  who: {
    flex: 1, color: C.muted, fontSize: 10.5, fontWeight: "800",
    letterSpacing: 0.7, textTransform: "uppercase",
  },
  count: { color: C.muted, fontSize: 11.5 },
  top: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 6 },
  number: { color: C.ink, fontSize: 15, fontWeight: "800" },
  when: { color: C.muted, fontSize: 12.5 },
  address: { ...T.body, fontSize: 15, fontWeight: "600" },
  what: { ...T.small, marginTop: 3 },
  refused: { marginTop: 10, gap: 7 },
  refusedTitle: { color: C.ink, fontSize: 15.5, fontWeight: "800" },
  refusedWhy: { ...T.small, lineHeight: 19 },
  again: {
    marginTop: 7, alignSelf: "flex-start", minHeight: S.touch - 8,
    paddingHorizontal: 18, justifyContent: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  againText: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
});
