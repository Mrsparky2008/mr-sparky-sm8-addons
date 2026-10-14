// Jobs that are going, and that nobody has taken yet.
//
// Steven, 13 Oct 2026, having killed an Accept button I had put on the job
// card: "the app will only show you the jobs that belong to you. So what are
// you accepting? You've already accepted the job, otherwise it wouldn't show
// up in the app... we need a tab that says open jobs that haven't been
// claimed. And you get the notification."
//
// He is right twice. The Work tab is his OWN work, so accepting has no meaning
// there; and this list is the other half of the push alert — the same list,
// two doors into it. That pair is what finally lets the Telegram group be
// switched off (decision 10).
//
// FIRST TO TAP TAKES IT. So the only thing that matters on a row is what a man
// decides from, standing at a trade counter with one hand: where, what, how
// long ago, and what it is worth. Everything else is on the job card after he
// has it.
//
// The portal decides, always. This screen never works out whether he may
// claim: an empty list is the honest answer for somebody who cannot, and a
// refusal on tap is the honest answer when somebody beat him to it.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Card, Empty, Header, StatusDot } from "../components/ui";
import { C, R, S, T, money, mono, oneLine } from "../lib/theme";
import * as portal from "../lib/portal";

/** "12 minutes ago" — how fresh it is decides whether it is worth hurrying. */
function ago(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "today" / "yesterday" / "3 days ago", and nothing at all if we cannot tell. */
function daysAgo(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  const d = Number(n);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export default function Available({ onOpenJob, visible = true, onCount }) {
  const [jobs, setJobs] = useState(null);
  const [taken, setTaken] = useState([]);
  const [windowDays, setWindowDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState("");
  const [refused, setRefused] = useState("");

  const load = useCallback(() => {
    setBusy(true);
    setRefused("");
    portal.availableJobs()
      .then((d) => {
        const open = Array.isArray(d?.jobs) ? d.jobs : [];
        setJobs(open);
        setTaken(Array.isArray(d?.taken) ? d.taken : []);
        setWindowDays(Number(d?.windowDays) || 0);
        /*
         * The red dot on the tab. The portal returns `badge` alongside the
         * list so the two can never disagree - it is not a second opinion, so
         * this does not add up the rows itself.
         *
         * Reported on EVERY read, including when it is zero. A dot that only
         * ever goes up sticks forever advertising work somebody else took
         * twenty minutes ago, and the first time a man taps a 3 and finds an
         * empty screen is the last time he believes the dot.
         */
        if (onCount) onCount(Number.isFinite(Number(d?.badge)) ? Number(d.badge) : open.length);
      })
      .catch((e) => {
        setJobs([]);
        // THE RULE OUT OF THE PUSH FAILURES (CLAUDE.md section 29): a failure to
        // REACH the server stays silent, because a man in a basement should
        // still have a working app — but a server that ANSWERS and says no must
        // never be silent.
        //
        // This screen was breaking that rule, and its own comment admitted it:
        // "a man who cannot claim, a portal that has not got the route yet, and
        // a quiet morning all look the same from here." They did. Only one of
        // the three means "nothing for you right now"; the other two are a man
        // staring at an empty tab believing there is no work going.
        //
        // fetch throws with no status when the phone cannot get out of the
        // basement. A PortalError carries the status the portal actually sent,
        // so the two are trivially distinguishable — they were just being
        // treated identically, which is exactly how push stayed broken for
        // hours.
        if (Number(e?.status) >= 400) {
          setRefused(e?.message || "The portal would not answer.");
        }
        // A list we could not read is not a list of none. Leave the dot alone
        // rather than clearing it on a flat signal.
      })
      .finally(() => setBusy(false));
  }, [onCount]);

  /*
   * ON MOUNT, not on first view. This screen is mounted hidden behind the
   * other tabs from the moment he signs in, and the dot has to be on the bar
   * BEFORE he thinks to look here - a badge you only get by visiting the tab
   * it is on is telling you something you already know.
   *
   * Then again each time he comes back to it. Between those it is a snapshot,
   * which is true of every badge on his home screen.
   */
  useEffect(() => { load(); }, [load]);
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) load();
    wasVisible.current = visible;
  }, [visible, load]);

  async function take(job) {
    setTaking(String(job.jobNumber));
    try {
      await portal.acceptJob({ jobNumber: job.jobNumber });
      Alert.alert("Yours", `${job.jobNumber} is allocated to you in ServiceM8.`);
      load();
      if (onOpenJob) onOpenJob({ job_number: String(job.jobNumber), address: job.address || "" });
    } catch (e) {
      // 409 is not an error. Somebody tapped a second earlier and the portal
      // says who, so it reads as a race lost rather than as a failure.
      Alert.alert(
        e?.status === 409 ? "Too late" : "It would not go through",
        e?.message || "Try again in a minute.",
      );
      if (e?.status === 409) load();
    } finally {
      setTaking("");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="Available" meta={jobs?.length ? String(jobs.length) : undefined} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        {jobs === null ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : refused ? (
          // The portal answered and said no. Say which, and offer the only
          // thing that ever helps — asking again — rather than an empty list
          // that reads as a quiet morning.
          <Card style={s.refused}>
            <Text style={s.refusedTitle}>This list could not be loaded</Text>
            <Text style={s.refusedWhy}>{refused}</Text>
            <Pressable onPress={load} style={s.again} disabled={busy}>
              <Text style={s.againText}>{busy ? "Trying…" : "Try again"}</Text>
            </Pressable>
          </Card>
        ) : jobs.length === 0 ? (
          <Empty>Nothing going right now. You will be told the moment there is.</Empty>
        ) : (
          jobs.map((j) => (
            <Card key={String(j.jobNumber)} style={{ marginBottom: 10 }}>
              <View style={s.top}>
                <StatusDot status={j.status} />
                <Text style={[s.number, mono, { flex: 1 }]}>{j.jobNumber}</Text>
                {Number(j.valueIncGst) ? (
                  <Text style={[s.value, mono]}>{money(j.valueIncGst)}</Text>
                ) : null}
              </View>
              <Text style={s.address} numberOfLines={2}>{oneLine(j.address) || j.suburb || "—"}</Text>
              {j.description ? (
                <Text style={s.what} numberOfLines={2}>{oneLine(j.description)}</Text>
              ) : null}
              <View style={s.foot}>
                <Text style={s.ago}>{ago(j.postedAt)}</Text>
                <Pressable
                  onPress={() => take(j)}
                  disabled={!!taking}
                  style={[s.take, !!taking && { opacity: 0.5 }]}
                >
                  <Text style={s.takeText}>
                    {taking === String(j.jobNumber) ? "Taking it…" : "Take it"}
                  </Text>
                </Pressable>
              </View>
            </Card>
          ))
        )}

        {/*
          * WHAT WENT, and it matters most on the screen that has nothing on
          * it. "Nothing going right now" is the truth, but on a tab he has
          * never seen carry a single job it is indistinguishable from broken -
          * and the fastest way to lose him is a screen he does not believe.
          * Ten recent takes say: this works, it is watching, and here is what
          * you were not quick enough for.
          *
          * No value and no address beyond the suburb. That is the portal's
          * decision and it is the right one - Telegram never put a price on an
          * accept either, and "Jason just took $3,118" is a league table
          * rather than news.
          */}
        {!refused && taken.length ? (
          <View style={s.takenWrap}>
            <Text style={s.takenHead}>
              {windowDays ? `TAKEN IN THE LAST ${windowDays} DAYS` : "TAKEN RECENTLY"}
            </Text>
            {taken.map((t) => (
              <View key={`${t.jobNumber}-${t.takenAt}`} style={s.takenRow}>
                <Text style={[s.takenNum, mono]}>{t.jobNumber}</Text>
                <Text style={s.takenWhere} numberOfLines={1}>{t.suburb || "—"}</Text>
                <Text style={s.takenWho} numberOfLines={1}>{t.takenBy}</Text>
                <Text style={s.takenAgo}>{daysAgo(t.agoDays)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0 },
  top: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 6 },
  number: { color: C.ink, fontSize: 15, fontWeight: "800" },
  value: { color: C.ink, fontSize: 15, fontWeight: "800" },
  address: { ...T.body, fontSize: 15, fontWeight: "600" },
  what: { ...T.small, marginTop: 3 },
  foot: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  ago: { flex: 1, color: C.muted, fontSize: 12.5 },
  take: {
    minHeight: S.touch - 6, paddingHorizontal: 20, justifyContent: "center",
    backgroundColor: C.earth, borderRadius: R.button,
  },
  takeText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  refused: { marginTop: 10, gap: 7 },
  refusedTitle: { color: C.ink, fontSize: 15.5, fontWeight: "800" },
  refusedWhy: { ...T.small, lineHeight: 19 },
  again: {
    marginTop: 7, alignSelf: "flex-start", minHeight: S.touch - 8,
    paddingHorizontal: 18, justifyContent: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  againText: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
  // Quieter than the live rows in every way - this is context, not work. It
  // must never compete with a job that is still going.
  takenWrap: { marginTop: 26, borderTopColor: C.line, borderTopWidth: 1, paddingTop: 14 },
  takenHead: {
    color: C.muted, fontSize: 10.5, fontWeight: "800",
    letterSpacing: 0.7, marginBottom: 8,
  },
  takenRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7 },
  takenNum: { color: C.muted, fontSize: 12.5, fontWeight: "700" },
  takenWhere: { flex: 1, color: C.muted, fontSize: 12.5 },
  takenWho: { color: C.ink, fontSize: 12.5, fontWeight: "700", opacity: 0.8 },
  takenAgo: { color: C.muted, fontSize: 11.5, minWidth: 64, textAlign: "right" },
});
