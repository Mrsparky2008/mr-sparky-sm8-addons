// Is there anything to approve?
//
// The desk answers this with a dashboard. In a ute it has to be the first thing
// on the screen, so this is the whole Business tab's front door: everything
// waiting on a decision, longest wait first, whose it is and what it comes to.
//
// Everything past this point — settings, the ladder, analytics — stays on the
// web deliberately. The phone acts on claims; the desk changes the rules.
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { PayError } from "../pay/shared";

export default function ClaimsInbox({ onOpenClaim, onCountChange }) {
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await portal.claimsAwaiting();
      const rows = res?.claims || [];
      setClaims(rows);
      onCountChange?.(rows.length);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  if (error) return <PayError error={error} onRetry={load} />;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Business" meta={claims ? `${claims.length} waiting` : undefined} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        <SectionLabel>Awaiting approval</SectionLabel>
        {!claims ? (
          <Empty>Loading…</Empty>
        ) : claims.length === 0 ? (
          <Empty>Nothing waiting. Everything submitted has been dealt with.</Empty>
        ) : (
          <Card>
            {claims.map((c, i) => (
              <Row
                key={`${c.contractorId}:${c.claimId}`}
                label={c.contractorName}
                value={money(c.settlement?.payableIncGst)}
                onPress={() => onOpenClaim(c)}
                last={i === claims.length - 1}
              />
            ))}
          </Card>
        )}

        {claims?.length ? (
          <Text style={s.note}>
            Oldest first. Tap one to see the checks before you decide.
          </Text>
        ) : null}

        <Card>
          <SectionLabel>At the desk</SectionLabel>
          <Text style={T.small}>
            Analytics, settings, the ladder review and the business dashboard stay in the web
            portal. They want a big screen and a keyboard, and the ladder moves people's rates —
            that deserves a dry run, not a thumb.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

/** A dollar figure with its label, for the inbox rows. */
export const inboxAmount = (claim) => money(claim?.settlement?.payableIncGst);

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16 },
});
