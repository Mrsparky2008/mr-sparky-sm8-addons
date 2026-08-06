// Screen 6 — Job card, laid out the way ServiceM8 lays one out: who and where
// at the top with the phone right there, then value rows you can drill into,
// then labelled sections. Steven moves between the two apps all day; they
// should read the same way even though this one is dark.
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel, StatusChip } from "../components/ui";
import Icon from "../components/icons";
import { C, R, S, T, money, mono, oneLine } from "../lib/theme";
import { fetchJob } from "../lib/api";

const GST = 0.1;

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
    // The same person is usually both the JOB and the BILLING contact.
    .filter((c, i, all) => all.findIndex((o) => o.name === c.name && o.phone === c.phone) === i);
}

export default function JobCard({ jobNumber, onBack, onTalk, onJobDiary, onAddReceipt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showBilling, setShowBilling] = useState(false);

  useEffect(() => {
    let dead = false;
    fetchJob(jobNumber)
      .then((d) => { if (!dead) setData(d); })
      .catch((e) => { if (!dead) setError(e.message || "Couldn't load this job"); });
    return () => { dead = true; };
  }, [jobNumber]);

  const lines = data?.billing || [];
  const exGst = lines.reduce((t, l) => t + (Number(l.qty) > 0 ? Number(l.qty) : 1) * (Number(l.price) || 0), 0);
  const incGst = exGst * (1 + GST);
  const contacts = parseContacts(data?.contacts);
  const primary = contacts.find((c) => c.phone) || contacts[0];
  const latestNote = (data?.notes || []).filter(Boolean).slice(-1)[0];
  const bookings = data?.bookings || [];

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
            {/* Who and where — the block you look at before knocking. */}
            <Card style={s.card}>
              <View style={s.topRow}>
                <Text style={s.name}>{primary?.name || "—"}</Text>
                <StatusChip status={data.status} />
              </View>
              <Text style={s.address}>{oneLine(data.job?.address) || "—"}</Text>
              {!!primary?.phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${primary.phone}`)} hitSlop={6}>
                  <Text style={[s.phone, mono]}>{primary.phone}</Text>
                </Pressable>
              )}
              {contacts.filter((c) => c !== primary && c.phone).map((c, i) => (
                <Pressable key={i} onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={6}>
                  <Text style={s.otherContact}>{c.name} · <Text style={[s.phone, mono]}>{c.phone}</Text></Text>
                </Pressable>
              ))}
            </Card>

            {/* Value rows, ServiceM8's own shape. Billing shows INC GST here
                because that is the number ServiceM8's job card shows — the
                ex-GST split is one tap away rather than a figure that looks
                $89 wrong next to the other app. */}
            <Card style={[s.card, { paddingVertical: 2 }]}>
              <Row
                icon={<Icon name="dollar" size={18} color={C.ink} />}
                label="Billing"
                value={lines.length ? money(incGst) : "None"}
                onPress={lines.length ? () => setShowBilling((v) => !v) : undefined}
              />
              {showBilling && (
                <View style={s.billing}>
                  {lines.map((l, i) => (
                    <View key={i} style={s.billRow}>
                      <Text style={s.billName} numberOfLines={2}>{l.name}</Text>
                      <Text style={[s.billPrice, mono]}>
                        {money((Number(l.qty) > 0 ? Number(l.qty) : 1) * (Number(l.price) || 0))}
                      </Text>
                    </View>
                  ))}
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Subtotal ex GST</Text>
                    <Text style={[s.totalValue, mono]}>{money(exGst)}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>GST</Text>
                    <Text style={[s.totalValue, mono]}>{money(incGst - exGst)}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text style={s.totalStrong}>Total inc GST</Text>
                    <Text style={[s.totalStrongValue, mono]}>{money(incGst)}</Text>
                  </View>
                </View>
              )}
              {/* The job's OWN diary — not the day schedule. Steven's call:
                  a job card's diary answers "what happened on this job". */}
              <Row
                icon={<Icon name="board" size={18} color={C.ink} />}
                label="Diary"
                value={bookings.length ? `${bookings.length} booked` : "Open"}
                onPress={() => onJobDiary({ bookings: data?.bookings || [], notes: data?.notes || [] })}
              />
              <Row
                icon={<Icon name="receipt" size={18} color={C.ink} />}
                label="Receipts"
                value="Add"
                onPress={() => onAddReceipt(jobNumber)}
                last
              />
            </Card>

            {!!oneLine(data.description) && (
              <Card style={s.card}>
                <SectionLabel>Job description</SectionLabel>
                <Text style={T.body}>{oneLine(data.description)}</Text>
              </Card>
            )}

            {!!latestNote && (
              <Card style={s.card}>
                <SectionLabel>Latest note</SectionLabel>
                <Text style={T.body}>{oneLine(latestNote)}</Text>
              </Card>
            )}

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
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  name: { color: C.ink, fontSize: 17, fontWeight: "800", flex: 1 },
  address: { ...T.body, fontSize: 14, marginTop: 4 },
  phone: { color: C.earth, fontSize: 15, fontWeight: "700", marginTop: 8 },
  otherContact: { ...T.small, marginTop: 8 },

  billing: { paddingBottom: 12, paddingTop: 2 },
  billRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    gap: 12, paddingVertical: 6,
  },
  billName: { ...T.body, fontSize: 13, flex: 1 },
  billPrice: { color: C.ink, fontSize: 13, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6 },
  totalLabel: { ...T.small, fontSize: 12.5 },
  totalValue: { color: C.muted, fontSize: 12.5 },
  totalStrong: { color: C.ink, fontSize: 14, fontWeight: "800" },
  totalStrongValue: { color: C.ink, fontSize: 14, fontWeight: "800" },

  dock: {
    paddingHorizontal: S.screen, paddingTop: 12, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1,
  },
});
