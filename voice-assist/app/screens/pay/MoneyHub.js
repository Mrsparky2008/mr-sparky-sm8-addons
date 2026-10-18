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
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, SectionLabel } from "../../components/ui";
import Icon from "../../components/icons";
import { C, R, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { PayError } from "./shared";
import { at } from "../../lib/when";

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
  /*
   * FINISHED, AND CLEARING. A completed job waits five working days before it
   * can be claimed, so the material on it is settled by the time he signs
   * (portal #501, 18 Oct 2026).
   *
   * It is said HERE as well as on the claim screen, because this is where he
   * lands. On a day when everything claimable is already claimed there is no
   * Make a claim button at all, so without this line a man with three jobs
   * clearing sees "$0.00, 0 jobs" and nothing else - which is the vanishing
   * he complained about, one screen up.
   */
  const clearing = (st.jobs || []).filter((j) => j.outcome === "SETTLING");
  const clearsFirst = clearing
    .map((j) => j.settling?.claimableFrom)
    .filter(Boolean)
    .sort()[0];
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
        {/*
          * WHAT WAS DECIDED - a notice, not a question.
          *
          * The ASKING moved to the Notifications tab on 17 Oct 2026, along
          * with the job's value and address, because a question that wants an
          * answer belongs where the badge is. This stays because the tab does
          * not carry it: a job HANDED TO HIM is nobody's question any more, so
          * it is off both lists there, and this is the only place he learns
          * his claimable just grew.
          *
          * "I don't accept that" went with the asking. The tab's version takes
          * the reason with it, which this never did - and a freeze with no
          * recorded why is the thing the dispute rules exist to avoid.
          */}
        {(handovers.settled || []).length ? <Decided rows={handovers.settled} /> : null}

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
          {clearing.length ? (
            <Text style={s.clearing}>
              {`${clearing.length} more finished and clearing`}
              {clearsFirst ? `, the first on ${at(clearsFirst)}` : ""}
              {". Each one joins this figure on its own."}
            </Text>
          ) : null}
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
 * WHOSE JOB IS THIS - MOVED OUT, 17 Oct 2026.
 *
 * The card that asked it lived here from 30 Sep. It is now a row on the
 * Notifications tab: same record, same actions, through the same
 * handoverDecision() - plus the job's value and address, which this card had
 * and the first version of that row did not.
 *
 * It is not drawn in two places. One question, one screen, one badge; two
 * screens asking one thing is how the two of them start to disagree about
 * what was answered.
 *
 * WHAT CHECKING IT TURNED UP, worth keeping: walking all five states against
 * this card before deleting it found that a FROZEN job offered the owner
 * nothing on the tab, so only the other man could ever end a freeze. The
 * portal now offers "Give It To Him" there - and the same look found that the
 * server had been accepting "It Stays Mine" on a frozen job since the dispute
 * was built, which would have let the owner break a freeze with the button
 * that caused it. Neither was visible from the happy path.
 */
function Decided({ rows }) {
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
          {/* A refusal is still not the end of it - "I Do Not Accept That"
              is on the Notifications tab, with a box for the reason. */}
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
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 32, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },
  clearing: { color: C.warnChipInk, fontSize: 11.5, lineHeight: 16, marginTop: 7 },

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
