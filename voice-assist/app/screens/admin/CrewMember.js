// One person's Money, seen from the office.
//
// Loads their statement by name — the admin form of the same call their own
// phone makes — and renders the served figures: what they can claim, what's
// held, their claims, their rung. Nothing is recomputed; this is their view,
// borrowed.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { ClaimStatus } from "../pay/shared";

export default function CrewMember({ person, onOpenClaim, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);

  // Setting an agreed rate. Closed by default: it is an occasional act, and a
  // rate box sitting open on a money screen invites an accidental edit.
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState("");
  const [reviewOn, setReviewOn] = useState("");
  const [rateNote, setRateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [rateErr, setRateErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await portal.statement(person.name));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [person?.name]);

  const saveRate = async (clear = false) => {
    setRateErr("");
    const percent = Number(pct);
    if (!clear && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      setRateErr("Enter a percentage between 0 and 100.");
      return;
    }
    if (!clear && reviewOn && !/^\d{4}-\d{2}-\d{2}$/.test(reviewOn.trim())) {
      setRateErr("A review date looks like 2026-11-27.");
      return;
    }
    setSaving(true);
    try {
      await portal.setAgreedRate({
        personId: person.id, percent, clear,
        reviewOn: reviewOn.trim() || undefined,
        note: rateNote.trim() || undefined,
      });
      setEditing(false);
      setPct(""); setReviewOn(""); setRateNote("");
      await load();
    } catch (err) {
      setRateErr(err?.message || "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <Header title={person?.name || "Crew"} onBack={onBack} />
        {error ? (
          <View style={s.body}>
            <Card><Text style={T.body}>{error.message}</Text></Card>
            <Cta label="Try again" onPress={load} />
          </View>
        ) : (
          <Empty>{busy ? "Loading their statement…" : "Nothing to show."}</Empty>
        )}
      </View>
    );
  }

  const { statement: st, claimable, claims = [], retention, conversion, rate, readiness } = data;
  const held = (st.jobs || []).filter((j) => j.outcome !== "OK").length;

  return (
    <View style={{ flex: 1 }}>
      <Header title={person?.name || "Crew"} meta={person?.role} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <SectionLabel>Ready to claim</SectionLabel>
          <Text style={[s.hero, mono]}>{money(claimable?.totalIncGst)}</Text>
          <Text style={T.small}>
            {claimable?.jobCount || 0} job{(claimable?.jobCount || 0) === 1 ? "" : "s"}
            {held ? ` · ${held} held` : ""}
            {retention ? ` · ${money(retention.balance)} retained` : ""}
          </Text>
        </Card>

        {/* What is still missing, and whether it stops them being paid. The
            list has room for a mark and one line; this is the chase-list. */}
        {readiness && readiness.state !== "ready" ? (
          <Card>
            <SectionLabel>
              {readiness.state === "blocked" ? "Cannot be paid yet" : "Still to enter"}
            </SectionLabel>
            {readiness.blocking.map((b) => (
              <View key={b.field} style={s.gapRow}>
                <Text style={s.gapBad}>!</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.gapLabel}>{b.label}</Text>
                  <Text style={T.small}>{b.why}</Text>
                </View>
              </View>
            ))}
            {readiness.needed.map((n) => (
              <View key={n.field} style={s.gapRow}>
                <Text style={s.gapWarn}>!</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.gapLabel}>{n.label}</Text>
                  <Text style={T.small}>{n.why}</Text>
                </View>
              </View>
            ))}
            <Text style={[T.small, { marginTop: 10 }]}>
              Enter these in the portal, under their business record.
            </Text>
          </Card>
        ) : readiness ? (
          <Card>
            <Text style={T.small}>
              <Text style={s.tickInline}>✓ </Text>
              Everything on file — nothing to chase.
            </Text>
          </Card>
        ) : null}

        {/* The rate that ACTUALLY applies, from the portal - an agreed deal
            or what performance earned, whichever is higher. The old card read
            the ladder rung directly and so showed 50% for a sparky on an
            agreed 60%, which is the kind of wrong that costs trust. */}
        {rate?.summary ? (
          <Card>
            <SectionLabel>Their rate</SectionLabel>
            <Text style={T.small}>{rate.summary}</Text>
            {conversion?.measurable ? (
              <Text style={[T.small, { marginTop: 4 }]}>
                Converting {conversion.conversion}% of {conversion.claimed} leads in the window.
              </Text>
            ) : null}
            {rate.review?.due ? (
              <Text style={[T.small, { marginTop: 6, color: C.active }]}>
                Their agreed rate is due for review - have the conversation.
              </Text>
            ) : null}

            {editing ? (
              <View style={{ marginTop: 14 }}>
                <Text style={T.label}>FLAT RATE %</Text>
                <TextInput
                  value={pct}
                  onChangeText={(t) => { setPct(t.replace(/[^0-9]/g, "")); setRateErr(""); }}
                  placeholder="60"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  style={s.input}
                />
                <Text style={[T.small, { marginTop: 4 }]}>
                  Paid on completion. Quoting a job someone else finishes earns nothing.
                </Text>

                <Text style={[T.label, { marginTop: 12 }]}>REVIEW ON (OPTIONAL)</Text>
                <TextInput
                  value={reviewOn}
                  onChangeText={(t) => { setReviewOn(t); setRateErr(""); }}
                  placeholder="2026-11-27"
                  placeholderTextColor={C.muted}
                  autoCapitalize="none"
                  style={s.input}
                />
                <Text style={[T.small, { marginTop: 4 }]}>
                  A reminder to talk, not an expiry. The rate never drops on its own.
                </Text>

                <Text style={[T.label, { marginTop: 12 }]}>NOTE (OPTIONAL)</Text>
                <TextInput
                  value={rateNote}
                  onChangeText={setRateNote}
                  placeholder="intro rate, 10 jobs"
                  placeholderTextColor={C.muted}
                  style={s.input}
                />

                {rateErr ? <Text style={s.err}>{rateErr}</Text> : null}

                {saving ? (
                  <ActivityIndicator color={C.brand} style={{ marginTop: 16 }} />
                ) : (
                  <View style={{ marginTop: 14 }}>
                    <Cta label="Save agreed rate" onPress={() => saveRate(false)} />
                    <Pressable onPress={() => { setEditing(false); setRateErr(""); }}>
                      <Text style={[T.small, { textAlign: "center", marginTop: 12 }]}>Cancel</Text>
                    </Pressable>
                    {rate.agreed ? (
                      <Pressable onPress={() => saveRate(true)}>
                        <Text style={[T.small, { textAlign: "center", marginTop: 14, color: C.muted }]}>
                          Remove the deal and use the ladder
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            ) : (
              <Pressable onPress={() => { setEditing(true); setPct(""); }}>
                <Text style={[T.small, { marginTop: 12, color: C.brand, fontWeight: "700" }]}>
                  {rate.agreed ? "Change their agreed rate" : "Set an agreed rate"}
                </Text>
              </Pressable>
            )}
          </Card>
        ) : null}

        {claims.length ? (
          <View>
            <SectionLabel>Their claims</SectionLabel>
            <Card>
              {[...claims]
                .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
                .map((c, i) => (
                  <Row
                    key={c.claimId}
                    label={`${c.claimId} · ${(c.submittedAt || "").slice(0, 10)}`}
                    value={money(c.settlement?.payableIncGst)}
                    onPress={() => onOpenClaim({ ...c, contractorName: person.name })}
                    last={i === claims.length - 1}
                  />
                ))}
            </Card>
          </View>
        ) : (
          <Empty>No claims yet.</Empty>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: C.ink, fontSize: 16, marginTop: 6,
  },
  err: { ...T.small, color: C.active, marginTop: 10 },
  gapRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 },
  gapLabel: { color: C.ink, fontSize: 13.5, fontWeight: "700" },
  tickInline: { color: "#3ddc84", fontWeight: "800" },
  gapBad: {
    color: "#ffffff", backgroundColor: "#c4483a", width: 18, height: 18,
    lineHeight: 18, textAlign: "center", borderRadius: 9,
    fontSize: 13, fontWeight: "800", overflow: "hidden",
  },
  gapWarn: {
    color: "#412402", backgroundColor: "#feda00", width: 18, height: 18,
    lineHeight: 18, textAlign: "center", borderRadius: 9,
    fontSize: 13, fontWeight: "800", overflow: "hidden",
  },
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },
});
