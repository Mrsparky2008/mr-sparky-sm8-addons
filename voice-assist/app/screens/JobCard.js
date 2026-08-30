// Screen 6 — Job card, laid out the way ServiceM8 lays one out: who and where
// at the top with the phone right there, then value rows you can drill into,
// then labelled sections. Steven moves between the two apps all day; they
// should read the same way even though this one is dark.
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

export default function JobCard({ jobNumber, siblings, onSibling, onBack, onTalk, onJobDiary, onAddReceipt, onMaterials }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showBilling, setShowBilling] = useState(false);

  // Swipe left/right through the category you came from, so working a list
  // of quotes doesn't mean Back-tap-Back-tap (Steven, 30 Aug 2026). Arrows
  // sit in the header too - a gesture nobody can see is a feature nobody uses.
  const list = Array.isArray(siblings) ? siblings : [];
  const at = list.findIndex((j) => String(j?.job_number) === String(jobNumber));
  const prev = at > 0 ? list[at - 1] : null;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
  // The handlers are read through a ref so the responder, created once,
  // never goes stale on the job it was born with.
  const nav = useRef({ prev, next, onSibling });
  nav.current = { prev, next, onSibling };
  const pan = useMemo(() => PanResponder.create({
    // CAPTURE, not bubble: the ScrollView claims the gesture first otherwise
    // and the swipe never reaches us - which is exactly what happened on the
    // first cut ("can swipe instead of clicking next"). Horizontal drags
    // only; anything vertical stays with the ScrollView, and taps are never
    // intercepted at all.
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_e, g) =>
      Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_e, g) => {
      const { prev: p, next: n, onSibling: go } = nav.current;
      if (!go) return;
      if (g.dx < -60 && n) go(n);
      else if (g.dx > 60 && p) go(p);
    },
  }), []);

  useEffect(() => {
    let dead = false;
    // Swiping does NOT remount this screen, so last job's data would sit on
    // screen under the new job's number until the fetch came back - reading
    // as the wrong money against the wrong address (Steven, 30 Aug 2026:
    // "when I swipe it keeps the previous data"). Clear first, always.
    setData(null);
    setError("");
    setShowBilling(false);
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
    <View style={s.screen} {...pan.panHandlers}>
      <Header title={`Job #${jobNumber}`} onBack={onBack} />
      {list.length > 1 ? (
        <View style={s.pager}>
          <Pressable onPress={prev ? () => onSibling(prev) : undefined} hitSlop={10} style={s.pagerBtn}>
            <Text style={[s.pagerText, !prev && s.pagerOff]}>‹ Previous</Text>
          </Pressable>
          <Text style={s.pagerCount}>{at + 1} of {list.length}</Text>
          <Pressable onPress={next ? () => onSibling(next) : undefined} hitSlop={10} style={s.pagerBtn}>
            <Text style={[s.pagerText, !next && s.pagerOff]}>Next ›</Text>
          </Pressable>
        </View>
      ) : null}
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
                onPress={() => onJobDiary({ bookings: data?.bookings || [], notes: data?.notes || [], timeOnSite: data?.timeOnSite || null, noteFeed: data?.noteFeed || [], attachments: data?.attachments || [] })}
              />
              <Row
                icon={<Icon name="receipt" size={18} color={C.ink} />}
                label="Receipts"
                value="Add"
                onPress={() => onAddReceipt(jobNumber)}
              />
              <Row
                icon={<Icon name="claims" size={18} color={C.ink} />}
                label="Materials on this job"
                value="View"
                onPress={() => onMaterials(jobNumber)}
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
        {/* Charlie retired 30 Aug 2026; AI Assist is THE button. Opens Claude
            on the tech's OWN seat, already knowing THIS job - fresh chat per
            open, connector does the reading and writing with the seat's
            identity checked on every call. */}
        <Pressable
          style={{
            minHeight: S.touch, borderRadius: R.button, backgroundColor: C.brand,
            alignItems: "center", justifyContent: "center", flexDirection: "row",
            gap: 10, paddingHorizontal: 16, paddingVertical: 14,
          }}
          onPress={() => {
              const parts = [
                // Job number FIRST: Claude titles a chat off its opening
                // words, so the history reads like a job list.
                `Job ${jobNumber} - quote.`,
                "You are the Mr Sparky quote helper, working with a licensed electrician on a "
                  + "Mr Sparky Network job in Sydney.",
                `The job: ${jobNumber}`
                  + (primary?.name ? ` for ${primary.name}` : "")
                  + (data?.job?.address ? ` at ${oneLine(data.job.address)}` : "")
                  + (data?.status ? `, currently a ${data.status}` : "") + ".",
                lines.length
                  ? "Billing lines already on the job: "
                    + lines.map((l) => `${l.name} x${Number(l.qty) > 0 ? l.qty : 1}`).join("; ") + "."
                  : "",
                // Stand at ease. The first send is a PRIMER, not a starting
                // gun - Steven: "submit it, do nothing, wait for me to talk."
                `Do NOTHING yet: no tools, no questions, no drafting. Reply with exactly one line - `
                  + `"Job ${jobNumber} - quote. Ready when you are." - and wait for me to speak.`,
                "When I do: work with me to a scope of works, materials, labour hours and a "
                  + "sensible price including GST. Talk like a tradie, not a consultant. When we "
                  + "have landed it and I confirm, save the quote text to the job as a note and "
                  + "put the priced lines and headers into the billing section.",
              ].filter(Boolean);
              Linking.openURL("https://claude.ai/new?q=" + encodeURIComponent(parts.join("\n\n")));
            }}
        >
          <Icon name="claude" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.3 }}>
            AI Assist quote
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { paddingHorizontal: S.screen, paddingBottom: 20 },
  pager: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: S.screen, paddingBottom: 10,
  },
  pagerBtn: { minHeight: 32, justifyContent: "center" },
  pagerText: { color: C.brand, fontSize: 13.5, fontWeight: "700" },
  pagerOff: { color: C.line },
  pagerCount: { color: C.muted, fontSize: 11.5, fontWeight: "600" },
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
