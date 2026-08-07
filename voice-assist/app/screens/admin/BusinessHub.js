// The Business hub — the admin's command post.
//
// Same hub grammar as Money, approved off the same design page: the headline
// is what needs YOU, and the buckets mirror the life of a claim — to approve,
// to pay, settled — with Rejected kept as its own pile because every entry
// carries its reason, and the pile shows who keeps making the same mistake.
//
// Counting is not calculating: the buckets count served rows. The one number
// this screen does NOT show is the dollar total awaiting approval — a sum is
// arithmetic, so it arrives when the portal serves it, not before.
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Header, SectionLabel } from "../../components/ui";
import Icon from "../../components/icons";
import { C, R, S, T, mono } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { PayError } from "../pay/shared";

export default function BusinessHub({ onOpen, onAccount, onCountChange }) {
  const [claims, setClaims] = useState(null);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [c, p] = await Promise.all([portal.allClaims(), portal.contractors()]);
      setClaims(c?.claims || []);
      setPeople(p?.people || []);
      onCountChange?.((c?.claims || []).filter((x) => x.status === "submitted").length);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  if (error) return <PayError error={error} onRetry={load} title="Business" />;
  if (!claims) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Business" />
        <Empty>{busy ? "Loading the board…" : "Nothing to show."}</Empty>
      </View>
    );
  }

  const toApprove = claims.filter((c) => c.status === "submitted");
  const toPay = claims.filter((c) => c.status === "approved" || c.status === "invoiced");
  const rejected = claims.filter((c) => c.status === "rejected");
  const settled = claims.filter((c) => c.status === "paid");
  const oldest = toApprove.length
    ? [...toApprove].sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")))[0]
    : null;
  const activeCrew = people.filter((p) => p.canClaim && p.status !== "Left");
  // A docket queried, or the same one used on another job or by another
  // person. Worked out by the portal and served with the claim — the phone
  // only counts what it was handed.
  const flagged = claims.filter((c) => (c.warnings || []).length && c.status !== "paid" && c.status !== "rejected");

  return (
    <View style={{ flex: 1 }}>
      <Header title="Business" meta={toApprove.length ? `${toApprove.length} waiting` : undefined} onMeta={onAccount} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        <Card>
          <SectionLabel>Needs you</SectionLabel>
          {toApprove.length ? (
            <>
              <Text style={[s.hero, mono]}>{toApprove.length}</Text>
              <Text style={T.small}>
                claim{toApprove.length === 1 ? "" : "s"} to approve
                {oldest?.submittedAt ? ` · oldest from ${oldest.submittedAt.slice(0, 10)}` : ""}
              </Text>
            </>
          ) : (
            <Text style={T.small}>Nothing waiting on a decision. All caught up.</Text>
          )}
        </Card>

        {flagged.length ? (
          <View style={[s.attn, s.attnBad]}>
            <View style={[s.attnDot, { backgroundColor: C.warnChipInk }]} />
            <Text style={[s.attnText, { color: C.warnChipInk }]}>
              {flagged.length} claim{flagged.length === 1 ? "" : "s"} with a docket flag — open to see why
            </Text>
          </View>
        ) : null}

        {toPay.length ? (
          <View style={s.attn}>
            <View style={s.attnDot} />
            <Text style={s.attnText}>
              {toPay.length} approved claim{toPay.length === 1 ? "" : "s"} awaiting payment
            </Text>
          </View>
        ) : null}

        <View style={s.grid}>
          <HubTile
            icon="approve" label="To approve"
            sub={toApprove.length ? `${toApprove.length} waiting` : "all clear"}
            badge={toApprove.length || undefined}
            onPress={() => onOpen("bucket", { title: "To approve", claims: toApprove, act: true })}
          />
          <HubTile
            icon="topay" label="To pay"
            sub={toPay.length ? `${toPay.length} approved` : "nothing owed"}
            onPress={() => onOpen("bucket", { title: "To pay", claims: toPay, act: true })}
          />
          <HubTile
            icon="reject" label="Rejected"
            sub={rejected.length ? `${rejected.length} with reasons` : "none"}
            onPress={() => onOpen("bucket", { title: "Rejected", claims: rejected, act: false })}
          />
          <HubTile
            icon="archive" label="Settled"
            sub={settled.length ? `${settled.length} paid` : "none yet"}
            onPress={() => onOpen("bucket", { title: "Settled", claims: settled, act: false })}
          />
          <HubTile
            icon="people" label="The crew"
            sub={`${activeCrew.length} active`}
            onPress={() => onOpen("crewlist", { people })}
          />
        </View>

        <Text style={s.deskNote}>
          Analytics, settings and the ladder review stay on the web — the phone acts on claims,
          the desk changes the rules.
        </Text>
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
  attnBad: { borderWidth: 1, borderColor: C.warnChipInk },
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
  deskNote: { color: C.muted, fontSize: 11.5, lineHeight: 16, textAlign: "center", paddingHorizontal: 8 },
});
