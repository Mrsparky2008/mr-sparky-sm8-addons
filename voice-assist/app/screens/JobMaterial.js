// What material is on this job, at a glance — the receipts you've filed and
// the own-material declaration, straight off the portal. Tap a receipt line
// and the photo you submitted opens full screen: the docket is the evidence,
// so the docket is one tap away.
//
// Reads the statement payload rather than a dedicated route — myReceipts
// carries EVERY receipt this contractor filed (a docket lands on a Work Order
// weeks before the job reaches the statement), and ownMaterial carries the
// declaration. Nothing here writes anything.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Card, Empty, Header, SectionLabel } from "../components/ui";
import { C, S, T, mono, money } from "../lib/theme";
import * as portal from "../lib/portal";
import { postJobNote } from "../lib/api";

export default function JobMaterial({ jobNumber, onBack, onAddReceipt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState(null);   // { uri } while a docket photo is open
  const [imgLoading, setImgLoading] = useState(false);
  const [opening, setOpening] = useState(null); // imageKey being fetched

  const load = useCallback(() => {
    portal.statement()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e?.message || "Couldn't load"));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Wrong docket, wrong job, fat finger — the uploader can remove their own
  // mistake while the job is unclaimed. It VOIDS (row and photo stay on file,
  // marked, counted towards nothing); once the job is on a claim the server
  // says "ask the office", which is the point at which it should.
  function confirmRemove(r) {
    Alert.alert(
      "Remove this receipt?",
      `${r.supplier || "Receipt"} — $${Number(r.amountIncGst).toFixed(2)}. It stays on file marked removed, and counts towards nothing.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await portal.voidReceipt({
                jobNumber: r.jobNumber, receiptId: r.id,
                reason: "Wrong receipt — removed by the uploader in the app.",
              });
              load();
            } catch (e) {
              Alert.alert("Couldn't remove it", e?.message || "Try again, or ask the office.");
            }
          },
        },
      ],
    );
  }

  // Edit the declaration in place. Re-declaring overwrites server-side and
  // zero clears it; the cap is enforced at the server, whose message names
  // the real figure for this account. iOS-native prompt — the dev fleet.
  function editDeclared() {
    const current = data?.ownMaterial?.[String(jobNumber)];
    Alert.prompt(
      "Own material, no receipt",
      "New amount inc GST — zero clears it. Over your cap needs a receipt instead.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async (text) => {
            const amount = Number(text);
            if (!Number.isFinite(amount) || amount < 0) return;
            try {
              await portal.declareOwnMaterial({ jobNumber, amountIncGst: amount });
              await postJobNote(String(jobNumber),
                `Own material (van stock, no receipt): updated to $${amount.toFixed(2)} (was $${Number(current?.amountIncGst || 0).toFixed(2)}) via Mr Sparky app.`,
              ).catch(() => {});
              load();
            } catch (e) {
              Alert.alert("Couldn't save it", e?.message || "Try again.");
            }
          },
        },
      ],
      "plain-text",
      String(current?.amountIncGst ?? ""),
      "decimal-pad",
    );
  }

  async function openImage(imageKey) {
    setOpening(imageKey);
    try {
      const r = await portal.receiptViewUrl(imageKey);
      if (r?.url) { setImgLoading(true); setViewer({ uri: r.url }); }
    } catch { /* the row simply stays closed */ }
    finally { setOpening(null); }
  }

  const rows = (data?.myReceipts || []).filter(
    (r) => String(r.jobNumber) === String(jobNumber) && !r.voided,
  );
  const declared = data?.ownMaterial?.[String(jobNumber)];
  const total = rows.reduce((s2, r) => s2 + (Number(r.amountIncGst) || 0), 0)
    + (Number(declared?.amountIncGst) || 0);

  return (
    <View style={{ flex: 1 }}>
      <Header title={`Materials · #${jobNumber}`} onBack={onBack} />
      {!data && !error ? (
        <View style={s.center}><ActivityIndicator color={C.brand} /></View>
      ) : error ? (
        <View style={s.center}><Text style={s.warn}>{error}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          {rows.length ? (
            <View>
              <SectionLabel>Receipts</SectionLabel>
              <Card>
                {rows.map((r, i) => (
                  <Pressable
                    key={`${r.id || r.invoiceNumber || i}`}
                    onPress={r.imageKey ? () => openImage(r.imageKey) : undefined}
                    onLongPress={r.id ? () => confirmRemove(r) : undefined}
                    delayLongPress={450}
                    style={[s.row, i === rows.length - 1 && s.rowLast]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.supplier} numberOfLines={1}>
                        {r.supplier || "Receipt"}{r.disputed ? "  · queried" : ""}
                      </Text>
                      <Text style={s.sub}>
                        {[r.date, r.invoiceNumber].filter(Boolean).join(" · ")}
                        {r.imageKey ? "  ·  tap for the docket" : ""}
                        {"  ·  hold to remove"}
                      </Text>
                    </View>
                    {opening === r.imageKey
                      ? <ActivityIndicator size="small" color={C.brand} />
                      : <Text style={[s.amount, mono]}>{money(r.amountIncGst)}</Text>}
                  </Pressable>
                ))}
              </Card>
            </View>
          ) : null}

          {declared ? (
            <View>
              <SectionLabel>Own material — no receipt</SectionLabel>
              <Card>
                <Pressable onPress={editDeclared} style={[s.row, s.rowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.supplier}>Van stock, declared</Text>
                    <Text style={s.sub}>off your van — no docket exists  ·  tap to edit</Text>
                  </View>
                  <Text style={[s.amount, mono]}>{money(declared.amountIncGst)}</Text>
                </Pressable>
              </Card>
            </View>
          ) : null}

          {!rows.length && !declared ? (
            <Empty>Nothing filed on this job yet.</Empty>
          ) : (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total material inc GST</Text>
              <Text style={[s.totalValue, mono]}>{money(total)}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* The docket, full screen. Pinch to zoom (the whole point of opening
          it is reading the small print), spinner while the image comes down
          from S3, and closing is the ✕ ONLY — a stray tap mid-zoom must
          never throw the docket away. */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={s.viewer}>
          <ScrollView
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={s.viewerScroll}
            maximumZoomScale={5}
            minimumZoomScale={1}
            centerContent
          >
            {viewer ? (
              <Image
                source={{ uri: viewer.uri }}
                style={s.viewerImg}
                resizeMode="contain"
                onLoadEnd={() => setImgLoading(false)}
              />
            ) : null}
          </ScrollView>
          {imgLoading ? (
            <View style={s.viewerLoading} pointerEvents="none">
              <ActivityIndicator size="large" color={C.brand} />
              <Text style={s.viewerHint}>Fetching the docket…</Text>
            </View>
          ) : null}
          <Pressable onPress={() => setViewer(null)} style={s.viewerClose} hitSlop={12}>
            <Text style={s.viewerCloseText}>✕</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  warn: { color: C.warnChipInk, fontSize: 13 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  rowLast: { borderBottomWidth: 0 },
  supplier: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 11.5, marginTop: 2 },
  amount: { color: C.ink, fontSize: 15, fontWeight: "800" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 2 },
  totalLabel: { ...T.small },
  totalValue: { color: C.ink, fontSize: 14.5, fontWeight: "800" },
  viewer: { flex: 1, backgroundColor: "rgba(6,10,18,.97)" },
  viewerScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  viewerImg: { width: Dimensions.get("window").width, height: Dimensions.get("window").height * 0.88 },
  viewerLoading: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center", gap: 10 },
  viewerHint: { color: C.muted, fontSize: 12 },
  viewerClose: {
    position: "absolute", top: 54, right: 20, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(22,35,58,.9)", borderWidth: 1, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  viewerCloseText: { color: C.ink, fontSize: 17, fontWeight: "700" },
});
