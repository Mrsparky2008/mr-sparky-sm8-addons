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
import { useCallback, useEffect, useState } from "react";
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

export default function Available({ onOpenJob }) {
  const [jobs, setJobs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState("");

  const load = useCallback(() => {
    setBusy(true);
    portal.availableJobs()
      .then((d) => setJobs(Array.isArray(d?.jobs) ? d.jobs : []))
      // Nothing to show and no alarm. A man who cannot claim, a portal that
      // has not got the route yet, and a quiet morning all look the same from
      // here, and all three mean "nothing for you right now".
      .catch(() => setJobs([]))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(); }, [load]);

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
});
