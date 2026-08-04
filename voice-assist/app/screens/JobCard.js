// Screen 6 — Job card. What you need before you knock on the door, and a way
// straight into a conversation about it.
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, SectionLabel, StatusChip } from "../components/ui";
import { C, S, T, money, mono, oneLine } from "../lib/theme";
import { fetchJob } from "../lib/api";

// The dossier returns contacts as "JOB: Name 0400..." strings, and ServiceM8
// hands back empty ones for roles nobody filled in.
function parseContacts(list) {
  return (list || [])
    .map((raw) => {
      const [role, rest] = String(raw).split(/:\s*/, 2);
      const body = oneLine(rest || "");
      if (!body) return null;
      const phone = (/(\+?\d[\d ]{7,})/.exec(body) || [])[1];
      return { role: oneLine(role), name: oneLine(body.replace(phone || "", "")), phone: phone ? phone.replace(/\s+/g, "") : "" };
    })
    .filter(Boolean)
    // The same person often appears as both JOB and BILLING contact.
    .filter((c, i, all) => all.findIndex((o) => o.name === c.name && o.phone === c.phone) === i);
}

export default function JobCard({ jobNumber, onBack, onTalk }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let dead = false;
    fetchJob(jobNumber)
      .then((d) => { if (!dead) setData(d); })
      .catch((e) => { if (!dead) setError(e.message || "Couldn't load this job"); });
    return () => { dead = true; };
  }, [jobNumber]);

  const billed = (data?.billing || []).reduce(
    (t, l) => t + (Number(l.qty) > 0 ? Number(l.qty) : 1) * (Number(l.price) || 0), 0);
  const contacts = parseContacts(data?.contacts);
  const latestNote = (data?.notes || []).filter(Boolean).slice(-1)[0];

  return (
    <View style={s.screen}>
      <Header title={`Job #${jobNumber}`} onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list}>
        {error ? (
          <Empty>{error}</Empty>
        ) : !data ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Card style={s.card}>
              <View style={s.topRow}>
                <Text style={s.address}>{oneLine(data.job?.address) || "—"}</Text>
                <StatusChip status={data.status} />
              </View>
              {contacts.map((c, i) => (
                <Pressable
                  key={i}
                  onPress={c.phone ? () => Linking.openURL(`tel:${c.phone}`) : undefined}
                  style={s.contactRow}
                >
                  <Text style={s.contactName}>{c.name || c.role}</Text>
                  {!!c.phone && <Text style={[s.contactPhone, mono]}>{c.phone}</Text>}
                </Pressable>
              ))}
            </Card>

            {!!oneLine(data.description) && (
              <Card style={s.card}>
                <SectionLabel>Description</SectionLabel>
                <Text style={T.body}>{oneLine(data.description)}</Text>
              </Card>
            )}

            {!!latestNote && (
              <Card style={s.card}>
                <SectionLabel>Latest note</SectionLabel>
                <Text style={T.body}>{oneLine(latestNote)}</Text>
              </Card>
            )}

            <Card style={s.card}>
              <SectionLabel>Billing so far</SectionLabel>
              {(data.billing || []).length === 0 ? (
                <Text style={T.small}>Nothing billed yet.</Text>
              ) : (
                <>
                  {data.billing.map((l, i) => (
                    <View key={i} style={s.billRow}>
                      <Text style={s.billName} numberOfLines={2}>{l.name}</Text>
                      <Text style={[s.billPrice, mono]}>
                        {money((Number(l.qty) > 0 ? Number(l.qty) : 1) * (Number(l.price) || 0))}
                      </Text>
                    </View>
                  ))}
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Total ex GST</Text>
                    <Text style={[s.total, mono]}>{money(billed)}</Text>
                  </View>
                </>
              )}
            </Card>
          </>
        )}
      </ScrollView>
      <View style={s.dock}>
        <Cta
          label="🎙  Talk about this job"
          onPress={() => onTalk({ job_number: jobNumber, address: data?.job?.address || "" })}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },
  card: { marginBottom: S.gap },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  address: { ...T.body, flex: 1, fontWeight: "600" },
  contactRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: 10, minHeight: 34,
  },
  contactName: { ...T.small, color: C.ink, fontSize: 13.5 },
  contactPhone: { color: C.neutral, fontSize: 13.5, fontWeight: "600" },
  billRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    gap: 12, paddingVertical: 7, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  billName: { ...T.body, fontSize: 13, flex: 1 },
  billPrice: { color: C.ink, fontSize: 13, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 11 },
  totalLabel: { ...T.small, fontSize: 13 },
  total: { color: C.ink, fontSize: 15, fontWeight: "800" },
  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1,
  },
});
