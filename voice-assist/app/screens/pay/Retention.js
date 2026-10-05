// Retention — the money held as security, and the rules it follows.
// The bucket that kills the phone calls: balance, target, how it accrues,
// all straight off the statement.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";

export default function Retention({ data, onBack }) {
  const balance = data?.retention?.balance || 0;
  const policy = data?.retention?.policy || {};
  const target = Number(policy.target) || 0;
  const atTarget = target > 0 && balance >= target;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Retention" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <SectionLabel>Held right now</SectionLabel>
          <Text style={[s.hero, mono]}>{money(balance)}</Text>
          {target > 0 ? (
            <Text style={T.small}>
              {atTarget
                ? "At the agreed target — nothing more is withheld while it stays there."
                : `Builds to ${money(target)}, then withholding stops.`}
            </Text>
          ) : null}
        </Card>

        <View>
          <SectionLabel>The rules</SectionLabel>
          <Card>
            {policy.accrualPercent != null ? (
              <Row label="Withheld from each claim" value={`${policy.accrualPercent}%`} />
            ) : null}
            {target > 0 ? <Row label="Target" value={money(target)} /> : null}
            <Row
              label="Back charges"
              value={policy.chargesDrawOnRetention ? "draw on this first" : "billed separately"}
              last
            />
          </Card>
          <Text style={s.note}>
            Held as security against back charges, per the subcontract agreement. It is your money —
            withheld, not spent — and every movement shows on the claim it happened on.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  hero: { color: C.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginVertical: 3 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
});
