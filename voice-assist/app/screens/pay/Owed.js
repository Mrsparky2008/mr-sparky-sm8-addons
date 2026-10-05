// What they owe US — material on our account that was for them, not a job.
//
// Steven, 30 September 2026: "a button there that shows how much they owe us,
// and if they click on it, it shows them all the invoices, and if they click
// each invoice, it tells them which material" — and, on what "which material"
// means: "just the PDF from supplier or whatever was used as evidence, a
// picture in Telegram paid on my card."
//
// So this shows the paper, not a re-typed list. The reader stores the header
// of an invoice, never its lines, and the document itself is the only honest
// answer to "what was this?" — it is also the thing that was actually paid on.
//
// The balance already existed on the server and in the browser portal. The
// phone was the gap, which is the wrong way round: the man being charged is
// the one carrying the phone.
//
// Coded against their own material job number (people[].recoverJobNumber in
// portal settings — Jason's is 165925). Allocating a bill to that number IS
// allocating it to them to recover, which is why nobody has to remember a
// second process.
import { useState } from "react";
import {
  ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Card, Empty, Header, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";

export default function Owed({ data, onBack }) {
  const owed = data?.owedBack || {};
  const items = owed.items || [];
  const [opening, setOpening] = useState("");
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState("");

  async function openPaper(item) {
    if (!item.ref || opening) return;
    const [emailId, docIndex] = String(item.ref).split("|");
    setOpening(item.ref); setError("");
    try {
      const { url, filename } = await portal.purchaseDoc({ emailId, docIndex });
      // A PDF wants a reader and the phone already has a good one. A
      // photograph — most of these are a picture of a docket — opens here,
      // where the figure it explains is.
      if (String(filename || url).toLowerCase().includes(".pdf")) await Linking.openURL(url);
      else setViewing({ uri: url });
    } catch (e) {
      setError(e?.message || "That document wouldn't open.");
    } finally { setOpening(""); }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="What I owe" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <SectionLabel>Owing on the account</SectionLabel>
          <Text style={[s.hero, mono]}>{money(owed.totalIncGst || 0)}</Text>
          <Text style={T.small}>
            Material bought on the Mr Sparky account that was for you, not for a job.
          </Text>
          {owed.recoveredIncGst ? (
            <Text style={[T.small, { marginTop: 6 }]}>
              {money(owed.chargedIncGst)} charged · {money(owed.recoveredIncGst)} already taken back
            </Text>
          ) : null}
          {owed.queuedIncGst ? (
            <Text style={[T.small, { marginTop: 4 }]}>
              {money(owed.queuedIncGst)} is queued to come off your next claim or invoice.
            </Text>
          ) : null}
        </Card>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {items.length ? (
          <Card>
            <SectionLabel>The invoices behind it</SectionLabel>
            <Text style={[T.small, { marginBottom: 4 }]}>
              Tap one to see the supplier's own paperwork.
            </Text>
            {items.map((it) => (
              <Pressable key={it.id} onPress={() => openPaper(it)} disabled={!it.ref}
                style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.supplier} numberOfLines={1}>{it.supplier || "Supplier"}</Text>
                  <Text style={T.small}>
                    {it.date}{it.invoiceNumber ? ` · ${it.invoiceNumber}` : ""}
                    {it.amountIncGst < 0 ? " · credit" : ""}
                  </Text>
                </View>
                {opening === it.ref
                  ? <ActivityIndicator color={C.muted} />
                  : <Text style={[s.amt, mono, it.amountIncGst < 0 && { color: C.earth }]}>
                      {money(it.amountIncGst)}
                    </Text>}
                {it.ref ? <Text style={s.chev}>›</Text> : null}
              </Pressable>
            ))}
          </Card>
        ) : (
          <Empty>Nothing owing on the account.</Empty>
        )}

        <Card>
          <SectionLabel>How it gets paid back</SectionLabel>
          <Text style={T.small}>
            Whatever is owing comes off whichever moves first — your next claim or
            your next invoice to us — and is marked once it has, so it can never be
            taken twice. An amount bigger than that payment waits for a bigger one
            rather than being taken in pieces.
          </Text>
        </Card>
      </ScrollView>

      {/* The docket, full screen. Tapping anywhere closes it. */}
      <Modal visible={!!viewing} transparent animationType="fade"
        onRequestClose={() => setViewing(null)}>
        <Pressable style={s.viewer} onPress={() => setViewing(null)}>
          {viewing ? (
            <Image source={{ uri: viewing.uri }} style={s.viewerImage} resizeMode="contain" />
          ) : null}
          <Text style={s.viewerHint}>Tap to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, gap: S.gap, paddingBottom: 60 },
  hero: { color: C.ink, fontSize: 34, fontWeight: "700", marginVertical: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12, minHeight: S.touch,
  },
  supplier: { color: C.ink, fontWeight: "600" },
  amt: { color: C.ink, fontWeight: "700" },
  chev: { color: C.muted, fontSize: 20 },
  error: { color: C.active, fontSize: 13 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,.92)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "85%" },
  viewerHint: { color: C.muted, fontSize: 13, paddingTop: 10 },
});
