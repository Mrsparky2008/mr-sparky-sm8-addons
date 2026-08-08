// The crew — pick a person, see their Money exactly as they see it.
// The phone-sized version of the web portal's "viewing as" picker.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Header, StatusChip } from "../../components/ui";
import { C, S } from "../../lib/theme";

export default function CrewList({ people = [], onOpenPerson, onBack }) {
  const rank = (p) => (p.role === "Subbie" ? 0 : p.role === "Owner" ? 1 : 2);
  const ordered = [...people].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return (
    <View style={{ flex: 1 }}>
      <Header title="The crew" meta={`${people.length}`} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {ordered.length === 0 ? (
          <Empty>The portal returned nobody — that would be a first.</Empty>
        ) : (
          <Card>
            {ordered.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => onOpenPerson(p)}
                style={[s.row, i === ordered.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle}>{p.name}</Text>
                  <Text style={s.rowSub}>{p.role}</Text>
                </View>
                {p.status && p.status !== "Active" ? <StatusChip status={p.status} /> : null}
                <Text style={s.chev}>›</Text>
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  row: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: S.touch,
    paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  rowTitle: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
  rowSub: { color: C.muted, fontSize: 11.5, marginTop: 1 },
  chev: { color: C.muted, fontSize: 20 },
});
