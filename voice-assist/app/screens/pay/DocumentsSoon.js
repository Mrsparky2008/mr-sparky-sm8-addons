// My documents — the honest placeholder.
//
// The tile exists because the module is approved and designed (insurance,
// licences, expiry warnings, office verification). The portal side — tables,
// bucket, warning ladder — isn't built yet, and the house rule is "never a
// dead control": a button that does nothing reads as broken, a screen that
// says what's coming reads as a plan.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T } from "../../lib/theme";

export default function DocumentsSoon({ onBack }) {
  return (
    <View style={{ flex: 1 }}>
      <Header title="My documents" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <Text style={T.body}>
            Insurance and licences are moving into the app — photograph a certificate, the office
            verifies it, and expiry warnings arrive before anything lapses.
          </Text>
        </Card>

        <View>
          <SectionLabel>What it will track</SectionLabel>
          <Card>
            <Row label="Public liability insurance" value="expiry warnings" dim />
            <Row label="Electrical licence" value="expiry warnings" dim />
            <Row label="Tickets & cards" value="as required" dim last />
          </Card>
        </View>

        <Text style={s.note}>
          Until then, documents go to the office the usual way. Once this is live, an expired
          document blocks claiming until a current one is verified — with warnings at 30 and 14
          days so it never comes as a surprise.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16 },
});
