// What material is on this job, at a glance — the receipts you've filed and
// the own-material declaration, straight off the portal. Tap a receipt line
// and the photo you submitted opens full screen: the docket is the evidence,
// so the docket is one tap away.
//
// Reads the statement payload rather than a dedicated route — myReceipts
// carries EVERY receipt this contractor filed (a docket lands on a Work Order
// weeks before the job reaches the statement), and ownMaterial carries the
// declaration. Nothing here writes anything.
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Card, Empty, Header, SectionLabel } from "../components/ui";
import { C, S, T, mono, money } from "../lib/theme";
import * as portal from "../lib/portal";

export default function JobMaterial({ jobNumber, onBack, onAddReceipt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState(null);   // { uri } while a docket photo is open
  const [opening, setOpening] = useState(null); // imageKey being fetched

  useEffect(() => {
    let alive = true;
    portal.statement()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e?.message || "Couldn't load"); });
    return () => { alive = false; };
  }, []);

  async function openImage(imageKey) {
    setOpening(imageKey);
    try {
      const r = await portal.receiptViewUrl(imageKey);
      if (r?.url) setViewer({ uri: r.url });
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
                    key={`${r.invoiceNumber || r.imageKey || i}`}
                    onPress={r.imageKey ? () => openImage(r.imageKey) : undefined}
                    style={[s.row, i === rows.length - 1 && s.rowLast]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.supplier} numberOfLines={1}>
                        {r.supplier || "Receipt"}{r.disputed ? "  · queried" : ""}
                      </Text>
                      <Text style={s.sub}>
                        {[r.date, r.invoiceNumber].filter(Boolean).join(" · ")}
                        {r.imageKey ? "  ·  tap for the docket" : ""}
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
                <View style={[s.row, s.rowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.supplier}>Van stock, declared</Text>
                    <Text style={s.sub}>off your van — no docket exists</Text>
                  </View>
                  <Text style={[s.amount, mono]}>{money(declared.amountIncGst)}</Text>
                </View>
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

      {/* The docket, full screen. Presigned link, so it just renders. */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={s.viewer} onPress={() => setViewer(null)}>
          {viewer ? <Image source={{ uri: viewer.uri }} style={s.viewerImg} resizeMode="contain" /> : null}
          <Text style={s.viewerHint}>Tap anywhere to close</Text>
        </Pressable>
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
  viewer: { flex: 1, backgroundColor: "rgba(6,10,18,.96)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "86%" },
  viewerHint: { color: C.muted, fontSize: 12, marginTop: 8 },
});
