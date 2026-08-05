// What I've earned, and what's ready to claim.
//
// Every number on this screen arrives worked out. The headline comes from
// `claimable` on the statement, which the portal computes beside the rules —
// deliberately not from adding up the list underneath it, because that is
// exactly how the web version once had a tile and its own list disagreeing by
// tens of thousands of dollars.
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel, StatusChip } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";

// Why a job is not payable yet, in the words the office uses for it.
const HELD = {
  AWAITING_FORM: "Waiting on Form 001",
  AMBIGUOUS_FORM: "More than one Form 001 — needs a human",
  NOT_THEIR_JOB: "Not attributed to you",
  NO_RULE: "No rate in force on that date",
};

const CLAIM_LABEL = {
  submitted: "awaiting approval",
  approved: "approved",
  invoiced: "approved",
  paid: "paid",
  rejected: "rejected",
};

export default function Earnings({ onOpenClaim, onMakeClaim, onAddReceipt, onSignOut }) {
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
        <Header title="Pay" />
        <Empty>{busy ? "Loading your statement…" : "Nothing to show."}</Empty>
      </View>
    );
  }

  const { statement: st, claimable, claims = [], profile, retention, meta = {} } = data;
  const held = (st.jobs || []).filter((j) => j.outcome !== "OK");
  const ready = (st.jobs || []).filter(
    (j) => j.outcome === "OK" && (claimable?.jobNumbers || []).includes(j.jobNumber),
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title="Pay" meta={profile?.name} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        {claimable ? (
          <Card>
            <SectionLabel>Ready to claim</SectionLabel>
            <Text style={[s.hero, mono]}>{money(claimable.totalIncGst)}</Text>
            <Text style={T.small}>
              {claimable.jobCount} job{claimable.jobCount === 1 ? "" : "s"} · inc GST
            </Text>
          </Card>
        ) : (
          // The figure is served, never derived. If the portal has not been
          // updated yet, this says so rather than quietly adding it up here.
          <Card>
            <SectionLabel>Ready to claim</SectionLabel>
            <Text style={T.small}>
              The portal has not been updated with the claimable figure yet — see
              docs/PORTAL-CHANGES.md. Your jobs are listed below.
            </Text>
          </Card>
        )}

        {profile?.canClaim && claimable?.jobCount > 0 ? (
          <Cta
            label="Make a claim"
            onPress={() => onMakeClaim(data)}
            sub="You choose which jobs, and confirm before anything is sent."
          />
        ) : null}

        {onAddReceipt && (st.jobs || []).length ? (
          <Cta
            label="📷 Add a receipt"
            tone="ghost"
            onPress={() => onAddReceipt(data)}
            sub="Photograph it on the job — a receipt with no photo is not reimbursed."
          />
        ) : null}

        {ready.length ? (
          <View>
            <SectionLabel>Ready</SectionLabel>
            <Card>
              {ready.map((j, i) => (
                <Row
                  key={j.jobNumber}
                  label={`#${j.jobNumber}  ${meta[j.jobNumber]?.suburb || ""}`}
                  value={money(j.payableIncGst)}
                  last={i === ready.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {held.length ? (
          <View>
            <SectionLabel>Held — {held.length}</SectionLabel>
            <Card>
              {held.map((j, i) => (
                <Row
                  key={j.jobNumber}
                  label={`#${j.jobNumber}`}
                  value={HELD[j.outcome] || j.outcome}
                  dim
                  last={i === held.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {claims.length ? (
          <View>
            <SectionLabel>Claims</SectionLabel>
            <Card>
              {claims.map((c, i) => (
                <Row
                  key={c.claimId}
                  label={c.claimId}
                  value={money(c.settlement?.payableIncGst)}
                  onPress={() => onOpenClaim(c)}
                  last={i === claims.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {retention ? (
          <Card>
            <SectionLabel>Retention held</SectionLabel>
            <Text style={[s.figure, mono]}>{money(retention.balance)}</Text>
            <Text style={T.small}>Security against back charges. Released per the agreement.</Text>
          </Card>
        ) : null}

        {onSignOut ? <Cta label="Sign out" tone="ghost" onPress={onSignOut} /> : null}
      </ScrollView>
    </View>
  );
}

/** Claim status as a chip, using ServiceM8's own status palette. */
export function ClaimStatus({ status }) {
  return <StatusChip status={CLAIM_LABEL[status] || status} />;
}

/**
 * Portal errors that need different endings. "Not set up" means signed in but
 * unknown to the portal — signing in again will never fix that, so this must
 * not offer it as the way out.
 */
export function PayError({ error, onRetry, onSignOut }) {
  const notSetUp = portal.isNotSetUp(error);
  const noUrl = error?.code === "noPortalUrl";
  return (
    <View style={{ flex: 1 }}>
      <Header title="Pay" />
      <View style={s.body}>
        <Card>
          <Text style={T.body}>{error?.message || "Could not reach the portal."}</Text>
        </Card>
        {notSetUp || noUrl ? null : <Cta label="Try again" onPress={onRetry} />}
        {notSetUp && onSignOut ? <Cta label="Sign out" tone="ghost" onPress={onSignOut} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 32, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },
  figure: { color: C.ink, fontSize: 20, fontWeight: "800", marginVertical: 3 },
});
