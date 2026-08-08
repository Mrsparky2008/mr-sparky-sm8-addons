// One person's Money, seen from the office.
//
// Loads their statement by name — the admin form of the same call their own
// phone makes — and renders the served figures: what they can claim, what's
// held, their claims, their rung. Nothing is recomputed; this is their view,
// borrowed.
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { ClaimStatus } from "../pay/shared";

export default function CrewMember({ person, onOpenClaim, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);

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

  const { statement: st, claimable, claims = [], retention, ladder, conversion } = data;
  const held = (st.jobs || []).filter((j) => j.outcome !== "OK").length;
  const rate = ladder?.rungs?.find((r) => r.current);

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

        {conversion?.measurable && rate ? (
          <Card>
            <SectionLabel>Their rate</SectionLabel>
            <Text style={T.small}>
              On {rate.rate}% · converting {conversion.conversion}% of {conversion.claimed} leads
              in the window.
            </Text>
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
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },
});
