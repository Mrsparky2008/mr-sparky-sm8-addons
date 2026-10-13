// The Money hub — what a subcontractor lands on.
//
// Design approved by Steven 2026-08-06 (artifact b1ca15e1…): one glance answers
// "what am I owed", then buckets take over. The headline is the only big
// number; the attention strip exists only when something needs a human; six
// glove-sized tiles each carry one live fact so the grid reads without opening
// anything.
//
// Every figure arrives worked out — the hub renders one statement payload and
// hands slices of it to the screens behind the tiles.
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, SectionLabel } from "../../components/ui";
import Icon from "../../components/icons";
import { C, R, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { PayError } from "./shared";

export default function MoneyHub({ onOpen, onMakeClaim, onAccount, onSignOut }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await portal.statement());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <PayError error={error} onRetry={load} onSignOut={onSignOut} />;
  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Money" />
        <Empty>{busy ? "Loading your statement…" : "Nothing to show."}</Empty>
      </View>
    );
  }

  const { statement: st, claimable, claims = [], profile, retention, receipts = {}, ladder, conversion,
    handovers = { mine: [], theirs: [] }, owedBack } = data;

  const heldCount = (st.jobs || []).filter((j) => j.outcome !== "OK").length;
  const awaiting = claims.filter((c) => c.status === "submitted").length;
  const overdue = claims.filter((c) => c.payment?.state === "overdue").length;
  const receiptCount = Object.values(receipts).reduce((n, r) => n + (r.rows?.length || 0), 0);

  // The strip only exists when something needs attention — no news, quieter screen.
  const attention = [
    awaiting ? `${awaiting} claim${awaiting === 1 ? "" : "s"} awaiting approval` : null,
    overdue ? `${overdue} payment${overdue === 1 ? "" : "s"} overdue` : null,
  ].filter(Boolean);

  // The portal serves these as whole percentages already (43.6, 40) — the
  // first cut multiplied by 100 and told Steven he was on 5000%.
  const rate = ladder?.rungs?.find((r) => r.current);
  const rateSub = conversion?.measurable && rate
    ? `${conversion.conversion ?? 0}% conv · on ${rate.rate}%`
    : "history builds this";

  return (
    <View style={{ flex: 1 }}>
      <Header title="Money" meta={profile?.name} onMeta={onAccount} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        {(handovers.mine || []).length || (handovers.theirs || []).length ? (
          <WhoseJob rows={handovers} onDone={load} />
        ) : null}

        {(handovers.settled || []).length ? (
          <Decided rows={handovers.settled} onDispute={(r) => {
            Alert.alert(
              "You do not accept that?",
              `Job ${r.jobNumber} is then frozen: neither of you can claim it until you settle it between you.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "I don't accept that",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await portal.handover({ action: "dispute", jobNumber: r.jobNumber });
                      load();
                    } catch (err) {
                      Alert.alert("It would not go through", err?.message || "Try again in a minute.");
                    }
                  },
                },
              ],
            );
          }} />
        ) : null}

        {/*
          * WHAT NEEDS YOU, first and tappable.
          *
          * This was an amber strip that looked like a label and did nothing.
          * Two claims sitting unapproved is work, so it reads as work and it
          * goes somewhere.
          */}
        {attention.length ? (
          <Pressable onPress={() => onOpen("claims", data)} style={s.attn}>
            <View style={s.attnDot} />
            <Text style={s.attnText} numberOfLines={2}>{attention.join(" · ")}</Text>
            <Text style={s.attnChev}>›</Text>
          </Pressable>
        ) : null}

        <Card>
          <SectionLabel>Ready to claim</SectionLabel>
          {claimable ? (
            <>
              <Text style={[s.hero, mono]}>{money(claimable.totalIncGst)}</Text>
              <Text style={T.small}>
                {claimable.jobCount} job{claimable.jobCount === 1 ? "" : "s"} · inc GST
              </Text>
            </>
          ) : (
            <Text style={T.small}>The portal isn't serving the claimable figure yet.</Text>
          )}
        </Card>

        {profile?.canClaim && claimable?.jobCount > 0 ? (
          <Cta label="Make a claim" tone="earth" onPress={() => onMakeClaim(data)} />
        ) : null}

        {/*
          * WHAT YOU LOOK UP, as a list rather than eight identical tiles.
          *
          * Redesigned 13 Oct 2026. The grid gave a tile the same weight
          * whether it held $420.82 or the word "camera-first", so nothing on
          * the screen was more important than anything else and the last two
          * rows were below the fold. A list ranks; a grid cannot.
          *
          * And the figure sits where the figure belongs - on the row, right
          * aligned, in tabular figures - instead of in a sentence underneath
          * the label. That is the portal's own rule from 8 Oct, which this
          * screen had never been held to.
          */}
        <SectionLabel>Your record</SectionLabel>
        <Card style={{ paddingVertical: 2 }}>
          <HubRow
            label="Claims"
            value={claims.length ? String(claims.length) : "none"}
            note={overdue ? `${overdue} overdue` : ""}
            badge={awaiting || undefined}
            onPress={() => onOpen("claims", data)}
          />
          <HubRow
            label="Retention held"
            value={retention ? money(retention.balance) : "nil"}
            onPress={() => onOpen("retention", data)}
          />
          <HubRow
            label="On the trade account"
            value={owedBack?.totalIncGst ? money(owedBack.totalIncGst) : "nil"}
            tone={owedBack?.totalIncGst ? "owed" : ""}
            onPress={() => onOpen("owed", data)}
          />
          <HubRow
            label="My rate"
            value={rate ? `${rate.rate}%` : "—"}
            note={conversion?.measurable ? `${conversion.conversion ?? 0}% conv` : "history builds this"}
            onPress={() => onOpen("rate", data)}
          />
          <HubRow
            label="Statement"
            value={heldCount ? `${heldCount} held` : "all payable"}
            onPress={() => onOpen("statement", data)}
          />
          <HubRow
            label="Receipts"
            value={receiptCount ? String(receiptCount) : "none"}
            onPress={() => onOpen("receipt", data)}
          />
          <HubRow
            label="My documents"
            value="insurance & certificates"
            onPress={() => onOpen("docs", data)}
          />
          <HubRow
            label="Invoice us"
            value="labour on another job"
            onPress={() => onOpen("raise", data)}
            last
          />
        </Card>

        <Pressable onPress={() => onOpen("details", data)} style={s.detailsRow}>
          <Icon name="person" size={15} color={C.muted} />
          <Text style={s.detailsText} numberOfLines={1}>
            My details — {profile?.company?.name || profile?.name || ""}
          </Text>
          <Text style={s.chev}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/*
 * The job somebody else finished.
 *
 * Steven, 30 September 2026, on job 167631: he accepted it off Telegram in
 * August, Jason closed it in ServiceM8 in September, and the money side never
 * noticed - it stayed in Steven's list as though nothing had happened.
 *
 * Ownership does not move on its own, and that is deliberate. The accept
 * record is a promise: he said he would do this job. A job changing hands
 * because of who happened to tap Complete is what turns into an argument
 * about money later. So both men see it, worded from their own side, and one
 * of them has to say.
 *
 * Above the claimable figure on purpose. It is the only thing on this screen
 * that says money may be sitting with the wrong person.
 */
function WhoseJob({ rows, onDone }) {
  const [busy, setBusy] = useState(null);
  const mine = (rows.mine || []).map((d) => ({ d, owner: true }));
  const theirs = (rows.theirs || []).map((d) => ({ d, owner: false }));

  const act = (action, d) => {
    const words = action === "ask"
      ? `Ask for job ${d.jobNumber}?\n\nThe person whose job it is will be asked to hand it over.`
      : action === "handover"
        ? `Hand job ${d.jobNumber} over?\n\nEverything it is worth moves to them. It stops being yours to claim.`
        : action === "dispute"
          ? `Say you do not accept that?\n\nJob ${d.jobNumber} is then frozen: neither of you can claim it until you settle it between you.`
          : action === "withdraw"
            ? `Drop it?\n\nJob ${d.jobNumber} goes back to them and stops being frozen.`
            : `Keep job ${d.jobNumber}?\n\nIt stays yours. If they do not accept that, the job freezes until you settle it.`;
    Alert.alert("Whose job is this?", words, [
      { text: "Cancel", style: "cancel" },
      {
        text: action === "ask" ? "Ask"
          : action === "handover" ? "Hand it over"
            : action === "dispute" ? "I don't accept that"
              : action === "withdraw" ? "Drop it" : "Keep it",
        style: action === "handover" || action === "dispute" ? "destructive" : "default",
        onPress: async () => {
          setBusy(d.jobNumber);
          try {
            await portal.handover({ action, jobNumber: d.jobNumber });
            onDone();
          } catch (err) {
            Alert.alert("It would not go through", err?.message || "Try again in a minute.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "somebody";

  return (
    <Card style={{ borderLeftWidth: 3, borderLeftColor: C.active }}>
      <SectionLabel>Whose job is this?</SectionLabel>
      <Text style={[T.small, { marginBottom: 10 }]}>
        Accepted by one person, completed by another. Nothing moves until somebody says.
      </Text>
      {mine.concat(theirs).map(({ d, owner }) => {
        const asked = d.status === "asked";
        return (
          <View key={d.jobNumber} style={s.whoseRow}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={s.whoseJob}>{d.jobNumber}</Text>
              <Text style={[s.whoseAmt, mono]}>{money(d.valueIncGst)}</Text>
            </View>
            {d.address ? <Text style={T.small}>{d.address}</Text> : null}
            <Text style={[T.small, { marginTop: 2 }]}>
              {owner
                ? `${firstName(d.completedBy?.name)} completed it${asked ? " and has asked for it" : ""}`
                : `You completed it — it is ${firstName(d.acceptedBy?.name)}'s${asked ? ". You have asked for it" : ""}`}
            </Text>
            {d.frozen ? (
              <Text style={[T.small, { marginTop: 4, color: C.active }]}>
                In dispute. Nobody can claim this until you two settle it.
                {d.disputeReason ? ` \u201C${d.disputeReason}\u201D` : ""}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {d.frozen ? (
                owner ? (
                  <Pressable style={[s.whoseBtn, s.whoseGo]} disabled={!!busy}
                    onPress={() => act("handover", d)}>
                    <Text style={s.whoseGoText}>Hand it over</Text>
                  </Pressable>
                ) : (
                  <Pressable style={s.whoseBtn} disabled={!!busy} onPress={() => act("withdraw", d)}>
                    <Text style={s.whoseBtnText}>Drop it</Text>
                  </Pressable>
                )
              ) : owner ? (
                <>
                  <Pressable style={[s.whoseBtn, s.whoseGo]} disabled={!!busy}
                    onPress={() => act("handover", d)}>
                    <Text style={s.whoseGoText}>Hand it over</Text>
                  </Pressable>
                  <Pressable style={s.whoseBtn} disabled={!!busy} onPress={() => act("keep", d)}>
                    <Text style={s.whoseBtnText}>It stays mine</Text>
                  </Pressable>
                </>
              ) : asked ? (
                <Text style={T.small}>Waiting on {firstName(d.acceptedBy?.name)}</Text>
              ) : (
                <Pressable style={[s.whoseBtn, s.whoseGo]} disabled={!!busy}
                  onPress={() => act("ask", d)}>
                  <Text style={s.whoseGoText}>Ask for it</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/*
 * What was decided while you were not looking.
 *
 * Steven, 30 September 2026: "he's using the app only." Jason has no push
 * notification and does not follow this on Telegram, so the only way he
 * learns what happened is by opening the app - and a card that simply
 * vanishes tells him nothing. It says so, in words, for a fortnight.
 */
function Decided({ rows, onDispute }) {
  const firstName = (n) => String(n || "The office").trim().split(/\s+/)[0];
  return (
    <Card>
      <SectionLabel>Decided</SectionLabel>
      {rows.map((r) => (
        <View key={r.jobNumber} style={{ marginTop: 6 }}>
          <Text style={T.small}>
            {r.moved
              ? `${firstName(r.decidedBy || r.fromName)} handed job ${r.jobNumber} to you. It is in your claimable now.`
              : `${firstName(r.decidedBy || r.fromName)} is keeping job ${r.jobNumber}.`}
          </Text>
          {/* A refusal is not the end of it. Saying so freezes the job for
              both of them until they have talked. */}
          {r.moved ? null : (
            <Pressable style={[s.whoseBtn, { marginTop: 8, alignSelf: "flex-start" }]}
              onPress={() => onDispute(r)}>
              <Text style={s.whoseBtnText}>I don't accept that</Text>
            </Pressable>
          )}
        </View>
      ))}
    </Card>
  );
}

/*
 * One line of the record. Label left, figure right, nothing underneath.
 *
 * The tile it replaces put the figure in a sentence under the label, which
 * reads as caption rather than as money, and gave "camera-first" the same
 * weight as $420.82. The portal settled this on 8 Oct: label above, number
 * below, and the explanation goes behind an i, never on the page.
 */
function HubRow({ label, value, note = "", badge, tone = "", onPress, last = false }) {
  return (
    <Pressable onPress={onPress} style={[s.hubRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.hubLabel} numberOfLines={1}>{label}</Text>
      {badge ? (
        <View style={s.badge}>
          <Text style={[s.badgeText, mono]}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
      {note ? <Text style={[s.hubNote, mono]} numberOfLines={1}>{note}</Text> : null}
      <Text
        style={[s.hubValue, mono, tone === "owed" && { color: C.warnChipInk }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  whoseRow: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 10 },
  whoseJob: { color: C.ink, fontWeight: "700", fontSize: 16 },
  whoseAmt: { color: C.ink, fontWeight: "700" },
  whoseBtn: {
    minHeight: 40, paddingHorizontal: 14, justifyContent: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  whoseBtnText: { color: C.muted, fontWeight: "600" },
  whoseGo: { backgroundColor: C.brand, borderColor: C.brand },
  whoseGoText: { color: "#fff", fontWeight: "700" },
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 32, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },

  attn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.warnChipBg, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8,
  },
  attnDot: { width: 7, height: 7, borderRadius: R.chip, backgroundColor: C.active },
  attnText: {
    flex: 1, color: C.warnChipInk, fontSize: 10.5, fontWeight: "800",
    letterSpacing: 0.7, textTransform: "uppercase",
  },
  attnChev: { color: C.warnChipInk, fontSize: 18, fontWeight: "800" },

  hubRow: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: S.touch,
    paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  hubLabel: { flex: 1, color: C.ink, fontSize: 15, fontWeight: "700" },
  hubNote: { color: C.muted, fontSize: 12 },
  hubValue: { color: C.ink, fontSize: 15, fontWeight: "700" },
  tileLabel: { color: C.ink, fontSize: 13.5, fontWeight: "700" },
  tileSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  badge: {
    position: "absolute", top: 9, right: 9, minWidth: 18, height: 18,
    borderRadius: R.chip, paddingHorizontal: 5, backgroundColor: C.active,
    alignItems: "center", justifyContent: "center", zIndex: 1,
  },
  badgeText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },

  detailsRow: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: S.touch,
    paddingHorizontal: 4,
  },
  detailsText: { flex: 1, color: C.muted, fontSize: 13 },
  chev: { color: C.muted, fontSize: 20 },
});
