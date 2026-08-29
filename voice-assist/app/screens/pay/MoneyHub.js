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

  const { statement: st, claimable, claims = [], profile, retention, receipts = {}, ladder, conversion } = data;

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

        {attention.length ? (
          <View style={s.attn}>
            <View style={s.attnDot} />
            <Text style={s.attnText}>{attention.join(" · ")}</Text>
          </View>
        ) : null}

        <View style={s.grid}>
          <HubTile
            icon="claims" label="Claims"
            sub={overdue ? `${overdue} overdue payment${overdue === 1 ? "" : "s"}` : `${claims.length} on record`}
            badge={awaiting || undefined}
            onPress={() => onOpen("claims", data)}
          />
          <HubTile
            icon="receipt" label="Receipts"
            sub={receiptCount ? `${receiptCount} lodged` : "camera-first"}
            onPress={() => onOpen("receipt", data)}
          />
          <HubTile
            icon="chart" label="Statement"
            sub={heldCount ? `${heldCount} job${heldCount === 1 ? "" : "s"} held` : "all jobs payable"}
            onPress={() => onOpen("statement", data)}
          />
          <HubTile
            icon="bank" label="Retention"
            sub={retention ? `${money(retention.balance)} held` : "nothing held"}
            onPress={() => onOpen("retention", data)}
          />
          <HubTile
            icon="trend" label="My rate"
            sub={rateSub}
            onPress={() => onOpen("rate", data)}
          />
          {/* The document shelf lives on the portal - insurance capture
              today (camera, OCR, history); the signed contract and licence
              join it there. One tap, same login as the app. */}
          <HubTile
            icon="idcard" label="My documents"
            sub="insurance & certificates"
            onPress={() => Linking.openURL("https://portal.mrsparky.com.au")}
          />
        </View>

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

function HubTile({ icon, label, sub, badge, onPress }) {
  return (
    <Pressable onPress={onPress} style={s.tile}>
      {badge ? (
        <View style={s.badge}>
          <Text style={[s.badgeText, mono]}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
      <Icon name={icon} size={22} color={C.ink} />
      <View>
        <Text style={s.tileLabel}>{label}</Text>
        <Text style={[s.tileSub, mono]} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
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

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tile: {
    flexGrow: 1, flexBasis: "47%", minHeight: 84,
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: R.card,
    padding: 12, justifyContent: "space-between",
  },
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
