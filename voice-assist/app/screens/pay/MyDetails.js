// My details — what the RCTIs are issued under. Read-only on purpose: company
// details change rarely and matter legally, so changes go through the office.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Header, Row, SectionLabel } from "../../components/ui";
import { C, S, T } from "../../lib/theme";

export default function MyDetails({ data, onBack }) {
  const p = data?.profile || {};
  const co = p.company || {};

  return (
    <View style={{ flex: 1 }}>
      <Header title="My details" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <SectionLabel>You</SectionLabel>
          <Row label="Name" value={p.name || "—"} />
          <Row label="Role" value={p.canClaim ? "Subcontractor" : "Office"} last />
        </Card>

        <Card>
          <SectionLabel>Invoiced as</SectionLabel>
          <Row label="Company" value={co.name || "—"} />
          <Row label="ABN" value={co.abn || "—"} />
          <Row label="GST registered" value={co.gstRegistered ? "Yes" : co.gstRegistered === false ? "No" : "—"} />
          <Row
            label="RCTI"
            value={p.rcti?.ok ? "Can be issued" : "Details incomplete"}
            last
          />
        </Card>

        {!p.rcti?.ok && p.rcti?.why ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.small, { color: C.warnChipInk }]}>{p.rcti.why}</Text>
          </Card>
        ) : null}

        <Text style={s.note}>
          These details sit under every invoice, so changing them goes through the office — ring or
          message Steven and it's done in the portal, then shows here.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16 },
});
