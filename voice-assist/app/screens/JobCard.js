// Screen 6 — Job card, laid out the way ServiceM8 lays one out: who and where
// at the top with the phone right there, then value rows you can drill into,
// then labelled sections. Steven moves between the two apps all day; they
// should read the same way even though this one is dark.
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Empty, Header, Row, SectionLabel, StatusChip } from "../components/ui";
import Icon from "../components/icons";
import { C, R, S, T, money, mono, oneLine } from "../lib/theme";
import { fetchJob } from "../lib/api";
import * as portal from "../lib/portal";
import { loadSettings, saveSettings } from "../lib/settings";

const GST = 0.1;

/*
 * Navigate, the way ServiceM8 does it: ask once, then remember.
 *
 * Steven, 13 Oct 2026: "once you set the app to use that particular map, it
 * will always open when you select it... that's what I'm used to." Right, and
 * the first cut asked every single time, which is a tax on every job for a
 * decision made once.
 *
 * iOS has NO system default for a maps app, so nothing remembers this for
 * him. The app has to.
 *
 * It only offers what is installed. canOpenURL answers truthfully only for
 * schemes declared in LSApplicationQueriesSchemes (app.json) - undeclared,
 * iOS says no to everything, which is why this needed a build and not a
 * publish. Apple Maps is never checked: it cannot be removed.
 */
const MAPS = {
  apple: {
    label: "Apple Maps",
    scheme: null,
    url: (w) => `http://maps.apple.com/?daddr=${w}&dirflg=d`,
  },
  google: {
    label: "Google Maps",
    scheme: "comgooglemaps://",
    url: (w) => `comgooglemaps://?daddr=${w}&directionsmode=driving`,
  },
  waze: {
    label: "Waze",
    scheme: "waze://",
    url: (w) => `waze://?q=${w}&navigate=yes`,
  },
};

async function installedMaps() {
  const out = ["apple"];
  for (const key of ["google", "waze"]) {
    try {
      if (await Linking.canOpenURL(MAPS[key].scheme)) out.push(key);
    } catch { /* an older build: iOS refuses to answer, so it is not offered */ }
  }
  return out;
}

/**
 * `ask` forces the chooser even when one is remembered - that is the long
 * press, and it is the only way back once a choice is made.
 */
async function navigateTo(address, { ask = false } = {}) {
  const where = encodeURIComponent(oneLine(address || "").trim());
  if (!where) {
    Alert.alert("No address", "ServiceM8 has no address on this job.");
    return;
  }
  const open = (key) => Linking.openURL(MAPS[key].url(where)).catch(() => {
    Alert.alert("Couldn't open it", `${MAPS[key].label} wouldn't open. Hold Navigate to pick another.`);
  });

  const available = await installedMaps();
  const { mapsApp } = await loadSettings();

  // Remembered, still installed, and he has not asked to change it.
  if (!ask && mapsApp && available.includes(mapsApp)) {
    open(mapsApp);
    return;
  }
  // Only one on the phone: there is nothing to ask about.
  if (!ask && available.length === 1) {
    open(available[0]);
    return;
  }

  Alert.alert(
    "Navigate with",
    oneLine(address),
    [
      ...available.map((key) => ({
        text: MAPS[key].label,
        onPress: () => { saveSettings({ mapsApp: key }); open(key); },
      })),
      { text: "Cancel", style: "cancel" },
    ],
  );
}

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

export default function JobCard({ jobNumber, siblings, onSibling, onBack, onJobDiary, onAddReceipt, onMaterials }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showBilling, setShowBilling] = useState(false);
  /*
   * What this job is worth TO HIM. Steven, 13 Oct 2026: "show the job value,
   * show the share, deductions, just show their share or payable to them."
   *
   * Billing was the client's invoice, which is the one number on this screen
   * that is not his business. His share was three taps away on another tab.
   *
   * Every figure comes off the portal already worked out - material, rate,
   * share, payable. Nothing here adds, subtracts or takes a percentage: a
   * second implementation on a phone is how two numbers quietly stop
   * agreeing, and this one would disagree about wages.
   */
  const [mine, setMine] = useState(null);
  /*
   * ACCEPTING A JOB FROM THE APP, instead of from the Telegram group.
   *
   * The endpoint has been deployed since 4 Oct and nothing has ever called
   * it. This is the half of "one app, not three" that lets Telegram be
   * switched off (decision 10) - until a job can be TAKEN here, the group has
   * to stay.
   *
   * Every decision is the portal's: canAccessJobs, whether employees may
   * accept at all, whether somebody already has it. The phone asks and is
   * told. The gate cannot be edited by holding the phone, and the button only
   * appears to somebody the portal says may use it.
   */
  const [canTake, setCanTake] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

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
    setMine(null);
    setAccepted(false);
    setCanTake(false);
    fetchJob(jobNumber)
      .then((d) => { if (!dead) setData(d); })
      .catch((e) => { if (!dead) setError(e.message || "Couldn't load this job"); });
    // His own figures, from the portal. Failing is fine and silent: the job
    // card worked before the portal existed and has to keep working when it
    // is unreachable in a basement.
    portal.statement()
      .then((st) => {
        if (dead) return;
        const row = (st?.statement?.jobs || []).find(
          (j) => String(j.jobNumber) === String(jobNumber));
        setMine(row || null);
        // Whether this man may take work at all. The portal decides; this
        // only decides whether he is shown a button he would be refused.
        setCanTake(!!st?.profile?.canClaim);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [jobNumber]);

  async function accept() {
    setAccepting(true);
    try {
      await portal.acceptJob({ jobNumber });
      setAccepted(true);
      // Re-read, so the screen shows the job as his rather than claiming it.
      portal.statement()
        .then((st) => {
          const row = (st?.statement?.jobs || []).find(
            (j) => String(j.jobNumber) === String(jobNumber));
          if (row) setMine(row);
        })
        .catch(() => {});
    } catch (e) {
      /*
       * 409 is not an error. Somebody tapped a second earlier, and the portal
       * says who. A man who missed a job by a moment deserves to be told
       * that, not shown a red failure.
       */
      Alert.alert(
        e?.status === 409 ? "Too late" : "It would not go through",
        e?.message || "Try again in a minute.",
      );
    } finally {
      setAccepting(false);
    }
  }

  const lines = data?.billing || [];
  const exGst = lines.reduce((t, l) => t + (Number(l.qty) > 0 ? Number(l.qty) : 1) * (Number(l.price) || 0), 0);
  const incGst = exGst * (1 + GST);
  const contacts = parseContacts(data?.contacts);
  const primary = contacts.find((c) => c.phone) || contacts[0];
  const latestNote = (data?.notes || []).filter(Boolean).slice(-1)[0];
  const bookings = data?.bookings || [];

  return (
    <View style={s.screen} {...pan.panHandlers}>
      <Header title={`Job ${jobNumber}`} onBack={onBack} />
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
              {/*
                * The address IS the navigate button, the way ServiceM8 does
                * it. Steven, 13 Oct 2026, with their job card open: "click on
                * address to navigate, number to call."
                *
                * He is right and the two buttons I added an hour ago were the
                * wrong answer: a row of buttons under a line of text he was
                * already looking at, to do the thing that line of text IS.
                * Hold it to change which maps app.
                */}
              {oneLine(data.job?.address) ? (
                <Pressable
                  onPress={() => navigateTo(data.job?.address)}
                  onLongPress={() => navigateTo(data.job?.address, { ask: true })}
                  delayLongPress={450}
                  hitSlop={6}
                >
                  <Text style={s.address}>{oneLine(data.job.address)}</Text>
                  <Text style={s.addressHint}>Tap to navigate · hold to change app</Text>
                </Pressable>
              ) : (
                <Text style={s.address}>—</Text>
              )}
              {!!primary?.phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${primary.phone}`)} hitSlop={6}>
                  <Text style={[s.phone, mono]}>{primary.phone}</Text>
                  <Text style={s.addressHint}>Tap to call</Text>
                </Pressable>
              )}
              {contacts.filter((c) => c !== primary && c.phone).map((c, i) => (
                <Pressable key={i} onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={6}>
                  <Text style={s.otherContact}>{c.name} · <Text style={[s.phone, mono]}>{c.phone}</Text></Text>
                </Pressable>
              ))}
            </Card>

            {/*
              * Take it. Shown only to somebody the portal says may claim, and
              * never on a job already his - but the real decision is the
              * server's every time: canAccessJobs, whether employees may
              * accept, and whether somebody beat him to it.
              *
              * Ships visible rather than behind a switch because it appears
              * for nobody who cannot use it, and the one man it appears for
              * tonight is Steven (section 15).
              */}
            {canTake && !mine && !accepted ? (
              <Cta
                label={accepting ? "Taking it…" : "Accept this job"}
                tone="earth"
                disabled={accepting}
                onPress={accept}
                sub="It is allocated to you in ServiceM8 straight away."
              />
            ) : null}
            {accepted ? (
              <Card style={[s.card, { borderColor: C.earth }]}>
                <Text style={[T.body, { color: C.ink, fontWeight: "700" }]}>
                  Yours. Allocated in ServiceM8.
                </Text>
              </Card>
            ) : null}

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
                      {/* No line clamp. A billing line IS the quote wording -
                          clamping it to two lines cut scope text mid-word at
                          roughly 50 characters and read as ServiceM8 chopping
                          the field (Steven, 31 Aug 2026). Nothing was ever
                          lost: ServiceM8 stores these up to 1,000+ chars. */}
                      <Text style={s.billName}>{l.name}</Text>
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

                  {/*
                    * And then the half that is actually his. Everything below
                    * is read off the portal, never worked out here.
                    */}
                  {mine ? (
                    <View style={s.mine}>
                      <Text style={s.mineLabel}>YOUR SHARE</Text>
                      {Number(mine.expenseIncGst) ? (
                        <View style={s.totalRow}>
                          <Text style={s.totalLabel}>Material on this job</Text>
                          <Text style={[s.totalValue, mono]}>−{money(mine.expenseIncGst)}</Text>
                        </View>
                      ) : null}
                      {Number(mine.grossProfit) ? (
                        <View style={s.totalRow}>
                          <Text style={s.totalLabel}>Gross</Text>
                          <Text style={[s.totalValue, mono]}>{money(mine.grossProfit)}</Text>
                        </View>
                      ) : null}
                      {mine.ratePct ? (
                        <View style={s.totalRow}>
                          <Text style={s.totalLabel}>Your rate</Text>
                          <Text style={[s.totalValue, mono]}>{mine.ratePct}%</Text>
                        </View>
                      ) : null}
                      {Number(mine.materialsReimbursed) ? (
                        <View style={s.totalRow}>
                          <Text style={s.totalLabel}>Your receipts, reimbursed</Text>
                          <Text style={[s.totalValue, mono]}>{money(mine.materialsReimbursed)}</Text>
                        </View>
                      ) : null}
                      <View style={s.totalRow}>
                        <Text style={s.totalStrong}>Payable to you</Text>
                        <Text style={[s.totalStrongValue, mono]}>
                          {mine.outcome === "OK" ? money(mine.payableIncGst) : "not yet"}
                        </Text>
                      </View>
                      {/* A job that cannot be claimed should say so HERE, on
                          the job, not three weeks later on a claim. */}
                      {mine.outcome && mine.outcome !== "OK" ? (
                        <Text style={s.mineWhy}>{mine.why || "This job is not claimable yet."}</Text>
                      ) : null}
                    </View>
                  ) : null}
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
                // Two rules that used to contradict the tools, found 31 Aug
                // 2026 when Steven checked his own quote-session prompt
                // against the app: prices are EX GST (ServiceM8 adds the tax
                // on the template, so an inc-GST line is a 10% overcharge),
                // and no note unless he asks - "just add them to the billing
                // section not the notes".
                "When I do: work with me to a scope of works, materials, labour hours and a "
                  + "sensible price. Every price is EX GST - ServiceM8 adds the GST itself, so "
                  + "never gross a line up. Talk like a tradie, not a consultant. Read the lines "
                  + "back to me before you write anything. When I confirm, put the priced lines "
                  + "and headers into the BILLING section only - no note unless I ask for one.",
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
  // Tinted, because it does something. A line of text that navigates and
  // looks exactly like a line of text that does not is a button nobody finds.
  address: { ...T.body, color: C.infoChipInk, fontSize: 15, fontWeight: "600", marginTop: 4 },
  addressHint: { color: C.muted, fontSize: 11, marginTop: 3 },
  phone: { color: C.earth, fontSize: 15, fontWeight: "700", marginTop: 8 },
  otherContact: { ...T.small, marginTop: 8 },

  billing: { paddingBottom: 12, paddingTop: 2 },
  billRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    gap: 12, paddingVertical: 6,
  },
  mine: { borderTopColor: C.line, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  mineLabel: {
    color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1,
    marginBottom: 4,
  },
  mineWhy: { color: C.warnChipInk, fontSize: 12, lineHeight: 16, marginTop: 6 },
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
