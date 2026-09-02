// Making a claim.
//
// The request says WHICH jobs and nothing about what they are worth — the
// portal re-derives every figure from your own statement, so a tampered payload
// cannot inflate a claim.
//
// Note what is deliberately missing: a running total as you tick jobs on and
// off. Adding one would mean this screen doing arithmetic, and a figure worked
// out here could disagree with the claim the portal actually builds. With
// everything selected the served `claimable` total is exact and is shown. Tick
// something off and the app says the portal will confirm the figure, because
// that is the truth.
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Header, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";

// ISO stamp -> "1:47 pm today" / "1:47 pm, 31 Aug" in the phone's local time.
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  const t = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `${t} today` : `${t}, ${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
}

export default function SubmitClaim({ data, onBack, onSubmitted }) {
  const claimable = data?.claimable;
  const meta = data?.meta || {};
  const jobsById = Object.fromEntries((data?.statement?.jobs || []).map((j) => [j.jobNumber, j]));
  const all = claimable?.jobNumbers || [];

  const [chosen, setChosen] = useState(() => new Set(all));
  const [helping, setHelping] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const helperCount = (claimable?.helperJobNumbers || []).length;
  const everything = chosen.size === all.length && (!helperCount || helping);

  function toggle(n) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  // With 44 claimable jobs on screen the day this shipped, per-row ticking is
  // for excluding the odd job, not for building the selection.
  function toggleAll() {
    if (everything) {
      setChosen(new Set());
      setHelping(false);
    } else {
      setChosen(new Set(all));
      setHelping(helperCount > 0);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await portal.submitClaim({
        jobNumbers: [...chosen],
        includeHelpingHand: helperCount ? helping : false,
        acceptDeclaration: true,
      });
      onSubmitted(res?.claim || null);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="Make a claim" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <SectionLabel>{everything ? "Claim total" : "Claim total"}</SectionLabel>
          {everything ? (
            <>
              <Text style={[s.hero, mono]}>{money(claimable.totalIncGst)}</Text>
              <Text style={T.small}>
                {claimable.jobCount} job{claimable.jobCount === 1 ? "" : "s"} · inc GST
              </Text>
            </>
          ) : (
            <Text style={T.small}>
              {chosen.size} job{chosen.size === 1 ? "" : "s"} selected. The portal works out the
              figure when the claim is built — you will see it on the next screen before it goes
              anywhere.
            </Text>
          )}
        </Card>

        <View>
          <View style={s.jobsHead}>
            <SectionLabel>Jobs</SectionLabel>
            <Pressable onPress={toggleAll} hitSlop={10}>
              <Text style={s.selectAll}>{everything ? "Deselect all" : "Select all"}</Text>
            </Pressable>
          </View>
          <Card>
            {all.map((n) => (
              <Tick
                key={n}
                on={chosen.has(n)}
                onPress={() => toggle(n)}
                label={`#${n}  ${meta[n]?.suburb || ""}`.trim()}
                value={money(jobsById[n]?.payableIncGst)}
              />
            ))}
            {helperCount ? (
              <Tick
                on={helping}
                onPress={() => setHelping((v) => !v)}
                label={`Helping-hand lines (${helperCount})`}
                value={money(claimable.helpingIncGst)}
              />
            ) : null}
          </Card>
        </View>

        {data?.declaration ? (
          <View>
            <SectionLabel>Declaration</SectionLabel>
            <Card>
              {/* The portal sends the declaration as {text, version, _note} —
                  the text is the part a human signs. Rendering the object
                  itself is a crash, and it did crash, on this exact screen. */}
              <Text style={[T.small, { color: C.ink }]}>
                {typeof data.declaration === "string" ? data.declaration : data.declaration.text || ""}
              </Text>
            </Card>
            <Pressable onPress={() => setAccepted((v) => !v)} style={s.accept}>
              <View style={[s.box, accepted && s.boxOn]}>
                {accepted ? <Text style={s.boxTick}>✓</Text> : null}
              </View>
              <Text style={[T.body, { flex: 1 }]}>I accept this declaration</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.body, { color: C.warnChipInk }]}>{error.message}</Text>
          </Card>
        ) : null}

        <Cta
          label={busy ? "Sending…" : "Submit claim"}
          tone="earth"
          disabled={busy || !accepted || chosen.size + (helping && helperCount ? 1 : 0) === 0}
          onPress={submit}
          sub={
            // Steven, 1 Sep 2026: say when the last check happened, so a
            // figure that moves between looking and submitting reads as
            // timing, never as being ripped off.
            (data?.dataAsOf ? `Figures last checked against ServiceM8 and the expense sheet at ${when(data.dataAsOf)}. `
              + "Anything entered since may shift the final amount. " : "")
            + "Once submitted the figures are frozen. Later changes are corrected on a following claim, never backwards."
          }
        />
      </ScrollView>
    </View>
  );
}

function Tick({ on, onPress, label, value }) {
  return (
    <Pressable onPress={onPress} style={s.tick}>
      <View style={[s.box, on && s.boxOn]}>{on ? <Text style={s.boxTick}>✓</Text> : null}</View>
      <Text style={[s.tickLabel, !on && { color: C.muted }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.tickValue, mono, !on && { color: C.muted }]}>{value}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },
  jobsHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  selectAll: { color: C.infoChipInk, fontSize: 12.5, fontWeight: "800" },
  tick: {
    flexDirection: "row", alignItems: "center", gap: 11, minHeight: S.touch,
    paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  tickLabel: { flex: 1, color: C.ink, fontSize: 14.5 },
  tickValue: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
  accept: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: S.touch, marginTop: 4 },
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5,
    borderColor: C.line, alignItems: "center", justifyContent: "center",
  },
  boxOn: { backgroundColor: C.earth, borderColor: C.earth },
  boxTick: { color: "#fff", fontSize: 15, fontWeight: "800", lineHeight: 18 },
});
