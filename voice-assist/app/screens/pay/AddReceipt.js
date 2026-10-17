// A receipt, photographed where it was handed over.
//
// This is the screen that earns the native build. The portal refuses a receipt
// with no photo — `validateReceipt` in lib/receipts.mjs — so the camera is not
// a convenience here, it is the whole transaction. A browser file picker with
// gloves on, in a switchboard room, is the thing this replaces.
//
// The photo does two journeys. It goes to Claude to be READ — supplier, total,
// date, invoice number land in the fields already filled in — and it goes
// straight into the portal's private bucket by presigned URL, never through
// the Lambda.
//
// Two rules the reading half obeys, both Steven's (2026-08-06):
//   · It fills in, it does not file. Every value is editable and nothing is
//     saved until a human presses the button.
//   · The supplier is a plain field showing exactly what is printed. The ABN
//     identifies a supplier better than a name ever will — no spelling
//     variance, and the register confirms it — so the reader still lifts it
//     off every photo. It is NOT asked for any more. Steven, 13 Oct 2026:
//     "I don't need a supplier ABN, they're not going to type it in." It is
//     folded away at the bottom for the one case it was really for: a docket
//     too poor to read, where eleven checksummed digits cannot be fumbled
//     into a plausible-but-wrong supplier the way a name can.
//
//     What took its place is the INVOICE NUMBER, which had been sitting at
//     the bottom of the page marked optional where nobody saw it. Supplier
//     plus invoice number is the key that stops one docket being filed
//     twice (lib/receipt-dupes.mjs), so asking for it makes the duplicate
//     check stronger, not weaker.
//   · The job comes from where you opened the screen, not from the paper. If
//     the docket quotes a different job number it is FLAGGED, with what
//     ServiceM8 says that job is, and the choice is yours. If nothing anchors
//     the receipt to a job, it asks — a receipt on the wrong job is worse than
//     a receipt typed in by hand.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Card, Cta, Header, SectionLabel } from "../../components/ui";
import KeyboardToggle from "../../components/KeyboardToggle";
import { C, R, S, T, mono } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { postJobTask, postReceiptCopy, readReceipt } from "../../lib/api";

// The phone is in the same timezone as the job. Building the date from the
// device clock avoids toISOString(), which is UTC and would date a receipt
// yesterday for most of a Sydney working day.
function shiftLocal(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const todayLocal = () => shiftLocal(0);

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" };

// "PTY LTD" is on every docket and identifies nobody; an apostrophe is a coin
// toss. The same rule the portal uses to match a docket to a supplier.
const normalise = (text) => String(text || "")
  .toLowerCase()
  .replace(/(pty|ltd|limited|inc|incorporated|group|australia|au|co|company|the)/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const prettyAbn = (abn) => {
  const d = String(abn || "").replace(/[^0-9]/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : d;
};


// How many job chips to show before asking someone to search. Five covers
// "the job I was just on" without turning the screen into a phone book.
const RECENT_JOBS = 5;

export default function AddReceipt({
  jobNumbers = [], jobNumber: initial, onBack, onSaved, onOwnMaterial,
  suppliers = [], pastReceipts = [], jobAddresses = {},
}) {
  const anchored = initial ? String(initial) : "";
  const chips = jobNumbers.map(String);
  // Steven, 12 Sep 2026: "the job numbers pile on". Every job he has ever been
  // paid for was a chip — sixty of them, three screens before the camera button
  // scrolled off. A receipt almost always belongs to work done this week, so
  // the recent handful are the whole answer and the rest need finding, not
  // listing.
  //
  // Most recent means highest: ServiceM8 job numbers run up, and the statement
  // hands us numbers with no dates attached.
  const [jobQuery, setJobQuery] = useState("");
  // Steven, 13 Oct 2026: "people don't remember job numbers but they remember
  // addresses". So the list is picked from, not recalled, and the search box
  // takes either - a street name finds the job as surely as its number does.
  const [jobOpen, setJobOpen] = useState(false);
  const [abnOpen, setAbnOpen] = useState(false);
  /*
   * The supplier list, open rather than guessed at. Steven, 13 Oct 2026: he
   * wanted the WHOLE list - "you still have to type it in". Suggestions only
   * appeared after two characters, which is no use to a man who knows the
   * supplier by sight and not by spelling, standing at a counter.
   *
   * Typing still works, and has to: a docket from somewhere nobody has filed
   * before is an ordinary Tuesday, and the reader fills this field off the
   * photo anyway.
   */
  const [supOpen, setSupOpen] = useState(false);
  const [supQuery, setSupQuery] = useState("");
  // Opened by hand, and stays open. Nothing re-collapses a form somebody is
  // typing in.
  const [editing, setEditing] = useState(false);
  const addressOf = (n) => String(jobAddresses?.[String(n)] || "").trim();
  const recent = useMemo(
    () => [...chips].sort((a, b) => Number(b) - Number(a)).slice(0, RECENT_JOBS),
    [chips.join(",")],
  );
  /*
   * What the reader did NOT get off the photo. Steven, 13 Oct 2026: "they have
   * to take another copy to make sure that the reader understands it so
   * nothing's cropped and missing."
   *
   * A blurred photo already says so, and one that yields nothing at all says
   * so. The gap was the HALF read - a supplier and a total, no invoice number,
   * because the top of the docket was outside the frame. That saved quietly,
   * and the invoice number is the thing that stops the same docket being filed
   * twice. So it is named, and a retake is offered. Never blocking: a docket
   * that genuinely has no number on it is a real docket.
   */
  const query = jobQuery.trim().toLowerCase();
  const matches = useMemo(() => (
    query
      ? chips.filter((n) => n.includes(query) || addressOf(n).toLowerCase().includes(query))
          .sort((a, b) => Number(b) - Number(a)).slice(0, 25)
      : []
  ), [chips.join(","), query, jobAddresses]);
  const [jobNumber, setJobNumber] = useState(
    anchored || (chips.length === 1 ? chips[0] : ""),
  );
  const [photo, setPhoto] = useState(null);      // { uri, mimeType }
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // The reading half.
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [read, setRead] = useState(null);        // what came back, for the badges
  const [docket, setDocket] = useState(null);    // job number printed on the paper
  const [ackDocket, setAckDocket] = useState(false);
  // Fields the human has touched are never overwritten by a re-read.
  const touched = useRef({});
  const mark = (k) => { touched.current[k] = true; };

  // The supplier's ABN — the docket's real identity.
  const [abn, setAbn] = useState("");
  // Whether the supplier came off the list (and so brought an ABN with it) or
  // was typed. Nothing hangs on it now except not claiming an ABN we were not
  // given.
  const [picked, setPicked] = useState(false);
  // Only what the READER missed, never what the person has since typed.
  const thinRead = !read ? [] : [
    !read.supplier && "supplier",
    !read.amountIncGst && "amount",
    !read.invoiceNumber && "invoice number",
  ].filter(Boolean);
  // Everyone on the office list, plus anyone this contractor has filed before.
  const allSuppliers = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (row) => {
      const key = normalise(row.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(row);
    };
    for (const sup of suppliers || []) {
      add({ name: sup.name, abn: sup.abn || "", legalName: sup.legalName || "", from: "list" });
    }
    for (const r of pastReceipts || []) {
      if (r?.supplier) add({ name: r.supplier, abn: r.abn || "", legalName: "", from: "past" });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, pastReceipts]);

  const supMatches = useMemo(() => {
    const q = normalise(supQuery);
    if (!q) return allSuppliers;
    return allSuppliers.filter((r) => normalise(r.name).includes(q) || (r.abn || "").includes(supQuery.trim()));
  }, [allSuppliers, supQuery]);

  /*
   * A docket is only worth showing instead of a form when the reader actually
   * got the two figures that make a receipt: who, and how much. Everything
   * else can be filled in afterwards; those two cannot be guessed.
   */
  const compact = !!photo && !reading && !editing && !!read?.supplier && !!read?.amountIncGst;

  const pickSupplier = (row) => {
    mark("supplier"); setSupplier(row.name); setPicked(true);
    if (row.abn) {
      mark("abn"); setAbn(row.abn); setAbnError("");
      setAbnName(row.legalName || "");
      // Their own past filing carries the ABN but not the register's name;
      // ask it, so the confirmation line reads the same either way.
      if (!row.legalName) lookupAbn(row.abn);
    }
  };
  const [abnName, setAbnName] = useState("");     // what the register calls them
  const [abnBusy, setAbnBusy] = useState(false);
  const [abnError, setAbnError] = useState("");
  // What the PAPER came to, kept apart from what is being claimed against this
  // job. They are the same number until someone splits one docket across two
  // jobs, and that difference is what stops the split claiming it twice. Only
  // ever set from what was READ: a hand-typed figure is the claim, not the
  // docket, and guessing they are the same would cap an honest split.
  const [docketTotal, setDocketTotal] = useState(null);
  // Raising a query when the save is refused. Steven: "maybe his apprentice
  // added it to a job by mistake — call the office if you believe this is an
  // error." A task, not a note: a note with nobody on it is a note nobody
  // reads, which the account's own history proves.
  const [querying, setQuerying] = useState(false);
  const [queried, setQueried] = useState("");

  // Ask the register who holds this ABN. Confirms the reader got it right, and
  // on a docket too poor to read it is the whole point: type eleven digits,
  // get the business back. Never blocks a save — the register can be slow or
  // down, and a receipt still has to be filable at a wholesaler's counter.
  async function lookupAbn(value) {
    const digits = String(value || "").replace(/[^0-9]/g, "");
    setAbnName("");
    setAbnError("");
    if (digits.length !== 11) return;
    setAbnBusy(true);
    try {
      const r = await portal.abnLookup(digits);
      const d = r?.details || {};
      const name = d.name || d.legalName || d.tradingName || "";
      if (name) {
        setAbnName(name);
        // A docket that photographed badly has no readable supplier; the
        // register supplies one so nobody has to spell it.
        if (!supplier.trim()) { mark("supplier"); setSupplier(name); }
      } else {
        setAbnError("The register didn't recognise that ABN.");
      }
    } catch (err) {
      setAbnError(err?.message || "Couldn't reach the register.");
    } finally {
      setAbnBusy(false);
    }
  }

  // Whichever field was last in use — the up arrow returns you to it.
  const lastField = useRef(null);

  async function take(fromLibrary) {
    setError(null);
    const perm = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError(new Error(
        fromLibrary
          ? "AI Assist needs access to your photos to attach one."
          : "AI Assist needs the camera to photograph a receipt.",
      ));
      return;
    }
    const opts = { mediaTypes: ["images"], quality: 0.6, exif: false };
    const res = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync(opts)
      : await ImagePicker.launchCameraAsync(opts);
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    const shot = { uri: asset.uri, mimeType: asset.mimeType || "image/jpeg" };
    setPhoto(shot);
    scan(shot);
  }

  // Read the docket. Never blocks the form: if this fails, or the photo is
  // unreadable, the fields are simply empty and get typed in as before.
  async function scan(shot) {
    setReading(true);
    setReadError("");
    setRead(null);
    setDocket(null);
    setDocketTotal(null);
    setAbnError("");
    setAckDocket(false);
    try {
      const imageB64 = await FileSystem.readAsStringAsync(shot.uri, { encoding: "base64" });
      const r = await readReceipt({ imageB64, contentType: shot.mimeType });
      const got = r.receipt || {};
      setRead(got);
      setDocketTotal(got.amountIncGst ?? null);
      setDocket(r.docket || null);

      // Exactly as printed. No tidying, no matching against a list — the ABN
      // below is what says who this is.
      if (got.supplier && !touched.current.supplier) setSupplier(got.supplier);
      if (got.abn && !touched.current.abn) { setAbn(got.abn); setAbnName(""); setAbnError(""); }
      if (got.amountIncGst && !touched.current.amount) setAmount(String(got.amountIncGst.toFixed(2)));
      if (got.date && !touched.current.date) setDate(got.date);
      if (got.invoiceNumber && !touched.current.invoiceNumber) setInvoiceNumber(got.invoiceNumber);

      // With no job chosen yet, a job number the paper quotes AND ServiceM8
      // recognises is a fair suggestion — shown as a choice, not applied
      // silently, because the flag below is the whole point of reading it.
      if (!jobNumber && r.docket?.known) setJobNumber(r.docket.jobNumber);

      if (r.unreadable) setReadError("That photo's too blurred to read — retake it, or type the details in.");
      else if (!got.supplier && !got.amountIncGst) setReadError("Couldn't pick anything off that one — type it in.");
    } catch (err) {
      setReadError(err?.message === "signed out" ? "Signed out." : "Couldn't read the photo — type the details in.");
    } finally {
      setReading(false);
    }
  }

  // The save was refused and the person says that is wrong. Hand it to
  // somebody rather than leaving them stuck at a counter with a docket.
  async function queryRefusal() {
    setQuerying(true);
    try {
      const otherJob = (String(error?.message || "").match(/#(\d+)/) || [])[1];
      const r = await postJobTask(jobNumber, {
        name: `Receipt query — ${invoiceNumber.trim() || supplier.trim() || "docket"}`,
        details: [
          `A receipt was refused on job ${jobNumber}: ${error?.message || "already filed"}`,
          `Supplier: ${supplier.trim() || "(not read)"}${abn ? `, ABN ${abn}` : ""}.`,
          `Invoice: ${invoiceNumber.trim() || "(none on the docket)"}. Amount: $${amount || "?"}.`,
          "",
          "They say it belongs on this job.",
          otherJob
            ? `To fix: portal > their statement > job ${otherJob} > Receipts > Move, and put it on ${jobNumber}. `
              + "Voiding is only for a row that should never have existed."
            : "To fix: find the receipt in the portal under Receipts and Move it onto this job.",
        ].join("\n"),
      });
      setQueried(r?.assignedTo ? `Sent to ${r.assignedTo}. It's on their list for tomorrow.` : "Sent. It's on the job as a task.");
    } catch (e) {
      setQueried(e?.message ? `Couldn't send it — ${e.message}` : "Couldn't send it.");
    } finally {
      setQuerying(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const contentType = photo.mimeType || "image/jpeg";
      const { uploadUrl, imageKey } = await portal.receiptUploadUrl({
        jobNumber,
        contentType,
        extension: EXT[contentType] || "jpg",
      });

      // Straight into the bucket, binary, with the exact content type the URL
      // was signed for — a mismatch here is rejected by S3, not by us.
      const up = await FileSystem.uploadAsync(uploadUrl, photo.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType },
      });
      if (up.status < 200 || up.status >= 300) {
        throw new Error(`The photo did not upload (${up.status}).`);
      }

      // If the paper named a different job and it's being filed here anyway,
      // that goes on the record too — so nobody has to reconstruct it later.
      const trail = mismatch ? `Docket quotes job ${docket.jobNumber}.` : "";
      const noteOut = [note.trim(), trail].filter(Boolean).join(" ");

      await portal.saveReceipt({
        jobNumber,
        imageKey,
        // Typed in or read off the paper — either way a human confirmed it.
        // The portal rounds and validates it.
        amountIncGst: Number(amount),
        supplier: supplier.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        abn: abn.replace(/[^0-9]/g, "") || undefined,
        docketTotalIncGst: docketTotal ?? undefined,
        date,
        note: noteOut || undefined,
      });

      // Record copy into ServiceM8's own job diary — Steven's paper trail.
      // Best-effort by design: the receipt is already safely in the portal,
      // so a failure here must never fail the save the user watched succeed.
      try {
        const imageB64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: "base64" });
        await postReceiptCopy(jobNumber, {
          imageB64,
          fileType: contentType === "image/png" ? ".png" : ".jpg",
          caption: `Receipt — ${supplier.trim()} — $${Number(amount).toFixed(2)}`,
        });
      } catch { /* the portal copy is the one that matters */ }

      onSaved?.();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const mismatch = !!(docket && jobNumber && docket.jobNumber !== jobNumber);
  const needsJob = !jobNumber;
  const ready = photo && supplier.trim() && amount.trim() && date && jobNumber && !reading;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Add receipt" onBack={onBack} />
      {/* The keyboard was covering the lower fields — the screen now gives
          way so whatever you're typing into stays above it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View>
          <SectionLabel>Photo</SectionLabel>
          {photo ? (
            <>
              <Pressable onPress={() => take(false)} disabled={reading}>
                <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="cover" />
              </Pressable>
              {reading ? (
                <View style={s.readingRow}>
                  <ActivityIndicator color={C.brand} size="small" />
                  <Text style={s.readingText}>Reading the docket…</Text>
                </View>
              ) : (
                <View style={s.readingRow}>
                  <Text style={s.note}>Tap the photo to retake.</Text>
                  <Pressable onPress={() => scan(photo)} hitSlop={8}>
                    <Text style={s.link}>Read again</Text>
                  </Pressable>
                </View>
              )}
              {readError ? <Text style={s.warn}>{readError}</Text> : null}
              {!reading && !readError && read && thinRead.length ? (
                <Text style={s.warn}>
                  {`Couldn't read the ${thinRead.join(" or the ")} off that photo. `}
                  {thinRead.includes("invoice number")
                    ? "That is what stops a docket being filed twice, so it is worth a retake with the whole docket in frame — or type it in."
                    : "Retake it with the whole docket in frame, or type it in."}
                </Text>
              ) : null}
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Cta label="📷 Photograph the receipt" onPress={() => take(false)} />
              <Cta label="Choose from photos" tone="ghost" onPress={() => take(true)} />
              {/* Van stock has no docket and never can — it was bought in bulk
                  weeks ago. The declaration lives HERE, on the job, so the job
                  number rides in from context instead of being typed. */}
              {onOwnMaterial && jobNumber ? (
                <Cta label="Van stock — own material, no receipt" tone="ghost"
                  onPress={() => onOwnMaterial(jobNumber)} />
              ) : null}
              <Text style={s.note}>
                A photo is required — a receipt without one is not reimbursed. It's read
                for you the moment it's taken; you check it before it's filed.
              </Text>
            </View>
          )}
        </View>

        {/* ---- The job ----------------------------------------------------
            Flagged, asked for, or simply shown — never assumed off the paper. */}
        {mismatch && !ackDocket ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={s.flagTitle}>This docket names a different job</Text>
            <Text style={[T.small, { marginTop: 4 }]}>
              {docket.label ? `The paper says “${docket.label}”` : `The paper says job ${docket.jobNumber}`}
              {docket.known
                ? ` — ${docket.jobNumber}, ${[docket.address, docket.status].filter(Boolean).join(" · ")}.`
                : ` — and there's no job ${docket.jobNumber} in ServiceM8.`}
              {` You're filing it to ${jobNumber}.`}
            </Text>
            <View style={s.flagRow}>
              {docket.known ? (
                <Pressable onPress={() => setJobNumber(docket.jobNumber)} style={[s.flagBtn, s.flagBtnOn]}>
                  <Text style={s.flagBtnOnText}>File to {docket.jobNumber}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setAckDocket(true)} style={s.flagBtn}>
                <Text style={s.flagBtnText}>Keep {jobNumber}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <View>
          <SectionLabel>Job{needsJob && photo ? " — which one?" : ""}</SectionLabel>
          {chips.length > 1 ? (
            <>
              {/* Closed, it is one line: the job you are filing against. Open,
                  it is the list, newest first, with the address beside every
                  number. A row is a whole line rather than a chip because an
                  address does not fit in a chip and the address is the half
                  anybody actually recognises. */}
              <Pressable onPress={() => setJobOpen((v) => !v)} style={s.jobSelect}>
                <View style={{ flex: 1 }}>
                  {jobNumber ? (
                    <>
                      <Text style={[s.jobSelectNumber, mono]}>{jobNumber}</Text>
                      {addressOf(jobNumber)
                        ? <Text style={s.jobSelectAddress} numberOfLines={1}>{addressOf(jobNumber)}</Text>
                        : null}
                    </>
                  ) : (
                    <Text style={s.jobSelectEmpty}>Choose the job</Text>
                  )}
                </View>
                <Text style={s.jobChevron}>{jobOpen ? "⌃" : "⌄"}</Text>
              </Pressable>

              {jobOpen ? (
                <View style={s.jobList}>
                  <Field
                    onUse={(r) => (lastField.current = r.current)}
                    value={jobQuery}
                    onChangeText={setJobQuery}
                    placeholder={`Search ${chips.length} jobs — number or address`}
                    returnKeyType="done"
                    autoCorrect={false}
                  />
                  <ScrollView style={s.jobScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {(query
                      ? matches
                      : [...chips].sort((a, b) => Number(b) - Number(a))
                    ).map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => { setJobNumber(n); setJobOpen(false); setJobQuery(""); }}
                        style={[s.jobOption, n === jobNumber && s.jobOptionOn]}
                      >
                        <Text style={[s.jobOptionNumber, mono]}>{n}</Text>
                        <Text style={s.jobOptionAddress} numberOfLines={1}>
                          {addressOf(n) || "—"}
                        </Text>
                      </Pressable>
                    ))}
                    {query && !matches.length ? (
                      <Text style={s.note}>Nothing of yours matches “{jobQuery.trim()}”.</Text>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
            </>
          ) : anchored || chips.length === 1 ? (
            <View style={s.jobRow}>
              <Text style={[s.jobNumber, mono]}>{jobNumber || anchored}</Text>
              {jobNumber === anchored ? <Text style={T.small}>opened from this job</Text> : null}
              {anchored && jobNumber !== anchored ? (
                <Pressable onPress={() => setJobNumber(anchored)} hitSlop={8}>
                  <Text style={s.link}>back to {anchored}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Field
              onUse={(r) => (lastField.current = r.current)}
              value={jobNumber}
              onChangeText={setJobNumber}
              placeholder="Job number"
              keyboardType="number-pad"
              mono
            />
          )}
          {needsJob && photo ? (
            <Text style={s.warn}>
              {docket?.jobNumber
                ? `The docket says ${docket.jobNumber}, which isn't a job in ServiceM8 — pick the right one.`
                // A photo that could not be read cannot be said to have
                // nothing on it (Steven, 9 Sep 2026: "if it's too blurry you
                // couldn't say the job number's not there").
                : readError || !read
                  ? "Choose the job this receipt is for."
                  : "Nothing on the docket says which job this is. Choose it before saving."}
            </Text>
          ) : null}
          {mismatch && ackDocket ? (
            <Text style={s.note}>
              Filed to {jobNumber}; the docket's {docket.jobNumber} goes on the record with it.
            </Text>
          ) : null}
        </View>

        {/*
          * ONCE THERE IS A PHOTO, THE FORM STOPS BEING A FORM.
          *
          * The reader already has the supplier, the invoice number, the amount
          * and the date off the paper. Leaving six empty-looking fields on
          * screen asks him to check his own answers one keyboard at a time,
          * on a screen that was already too long to see the Save button.
          *
          * So: a docket he reads, four lines, one tap each to correct. Tapping
          * a line opens the full form, which is this same markup - nothing is
          * duplicated and nothing can disagree with itself.
          *
          * It only collapses when the reader got BOTH the supplier and the
          * amount. A thin read leaves the form open, because then there is
          * genuinely typing to do.
          */}
        {compact ? (
          <View>
            <SectionLabel>Read off the docket</SectionLabel>
            <Card style={{ paddingVertical: 2 }}>
              <DocketLine label="Supplier" value={supplier} onPress={() => setEditing(true)} />
              <DocketLine
                label="Invoice number"
                value={invoiceNumber}
                missing={!invoiceNumber}
                onPress={() => setEditing(true)}
              />
              <DocketLine label="Amount inc GST" value={amount ? `$${amount}` : ""} onPress={() => setEditing(true)} />
              <DocketLine label="Date" value={date} onPress={() => setEditing(true)} last />
            </Card>
            <Pressable onPress={() => setEditing(true)} hitSlop={8}>
              <Text style={s.link}>Something is wrong — open it all</Text>
            </Pressable>
          </View>
        ) : (
          <>
        <View>
          <SectionLabel>Supplier{read?.supplier ? " · read" : ""}</SectionLabel>
          {allSuppliers.length ? (
            <>
              <Pressable onPress={() => setSupOpen((v) => !v)} style={s.jobSelect}>
                <View style={{ flex: 1 }}>
                  {supplier ? (
                    <>
                      <Text style={s.jobSelectNumber} numberOfLines={1}>{supplier}</Text>
                      {abn ? <Text style={[s.jobSelectAddress, mono]}>ABN {prettyAbn(abn)}</Text> : null}
                    </>
                  ) : (
                    <Text style={s.jobSelectEmpty}>Choose the supplier</Text>
                  )}
                </View>
                <Text style={s.jobChevron}>{supOpen ? "⌃" : "⌄"}</Text>
              </Pressable>

              {supOpen ? (
                <View style={s.jobList}>
                  <Field
                    onUse={(r) => (lastField.current = r.current)}
                    value={supQuery}
                    onChangeText={setSupQuery}
                    placeholder="Search, or type one that is not listed"
                    returnKeyType="done"
                    autoCorrect={false}
                  />
                  <ScrollView style={s.jobScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {/* Somewhere nobody has filed before is an ordinary
                        Tuesday, so what was typed is always offered, first. */}
                    {supQuery.trim() && !supMatches.some((r) => normalise(r.name) === normalise(supQuery)) ? (
                      <Pressable
                        onPress={() => {
                          mark("supplier"); setSupplier(supQuery.trim()); setPicked(false);
                          setSupOpen(false); setSupQuery("");
                        }}
                        style={s.jobOption}
                      >
                        <Text style={s.jobOptionNumber}>Use “{supQuery.trim()}”</Text>
                        <Text style={s.jobOptionAddress}>not on the list</Text>
                      </Pressable>
                    ) : null}
                    {supMatches.map((row) => (
                      <Pressable
                        key={`${row.abn}|${row.name}`}
                        onPress={() => { pickSupplier(row); setSupOpen(false); setSupQuery(""); }}
                        style={[s.jobOption, normalise(row.name) === normalise(supplier) && s.jobOptionOn]}
                      >
                        <Text style={s.jobOptionNumber} numberOfLines={1}>{row.name}</Text>
                        <Text style={[s.jobOptionAddress, mono]}>
                          {row.abn ? prettyAbn(row.abn) : (row.from === "past" ? "you have filed this one before" : "—")}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </>
          ) : (
            <Field
              onUse={(r) => (lastField.current = r.current)}
              value={supplier}
              onChangeText={(v) => { mark("supplier"); setSupplier(v); setPicked(false); }}
              placeholder="Middy's, Lawrence & Hanson…"
            />
          )}
        </View>

        <View>
          <SectionLabel>Invoice number{read?.invoiceNumber ? " · read" : ""}</SectionLabel>
          <Field
            onUse={(r) => (lastField.current = r.current)}
            value={invoiceNumber}
            onChangeText={(v) => { mark("invoiceNumber"); setInvoiceNumber(v); }}
            placeholder="Off the top of the docket"
          />
          <Text style={s.note}>
            What stops the same docket being filed twice.
          </Text>
        </View>

        <View>
          <SectionLabel>Amount inc GST{read?.amountIncGst ? " · read" : ""}</SectionLabel>
          <Field
            onUse={(r) => (lastField.current = r.current)}
            value={amount}
            onChangeText={(v) => { mark("amount"); setAmount(v); }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            mono
          />
        </View>

        <View>
          <SectionLabel>Date{read?.date ? " · read" : ""}</SectionLabel>
          {/*
            * Taps, not a wheel. Steven asked for a date picker; the ones worth
            * having are native modules, and adding one would mean a new build
            * and an App Store trip for a field that has three real answers:
            * today, yesterday, or whatever the docket itself says.
            *
            * It is not a field to delete either, however much it looks like
            * one. The server requires a date, and on a docket with NO invoice
            * number the date and the amount are what stand in for one in the
            * duplicate check - two identical dockets from one supplier would
            * otherwise be indistinguishable.
            */}
          <View style={s.chips}>
            {[
              ["Today", shiftLocal(0)],
              ["Yesterday", shiftLocal(-1)],
              ...(read?.date && read.date !== shiftLocal(0) && read.date !== shiftLocal(-1)
                ? [["On the docket", read.date]] : []),
            ].map(([label, value]) => (
              <Pressable
                key={label}
                onPress={() => { mark("date"); setDate(value); }}
                style={[s.chip, date === value && s.chipOn]}
              >
                <Text style={[s.chipText, date === value && { color: C.ink }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Field
            onUse={(r) => (lastField.current = r.current)}
            value={date}
            onChangeText={(v) => { mark("date"); setDate(v); }}
            placeholder="YYYY-MM-DD"
            mono
          />
        </View>

        {/*
          * The ABN last, and folded away. It identifies a supplier better than
          * a name ever will and the reader still lifts it off every photo - but
          * nobody types eleven digits off a docket, and asking for them where
          * the invoice number belonged was the confusing part of this page
          * (Steven, 13 Oct 2026: "I don't need a supplier ABN, I mean they're
          * not going to type it in").
          */}
        <View>
          <Pressable onPress={() => setAbnOpen((v) => !v)} hitSlop={8}>
            <Text style={s.link}>
              {abnOpen ? "Hide the supplier ABN" : abn ? `Supplier ABN  ${prettyAbn(abn)}` : "Add the supplier ABN"}
            </Text>
          </Pressable>
          {abnOpen ? (
            <>
              <View style={{ height: 8 }} />
              <Field
                onUse={(r) => (lastField.current = r.current)}
                value={abn}
                onChangeText={(v) => { mark("abn"); setAbn(v); setAbnName(""); setAbnError(""); }}
                onEndEditing={() => lookupAbn(abn)}
                placeholder="11 digits, from the top of the docket"
                keyboardType="number-pad"
                mono
              />
              {abnBusy ? (
                <Text style={s.note}>Checking the register…</Text>
              ) : abnName ? (
                <Text style={s.note}>Register says: {abnName}</Text>
              ) : abnError ? (
                <Text style={s.warn}>{abnError}</Text>
              ) : (
                <Text style={s.note}>
                  Filled from the photo when it is legible. Typing it is for a docket too
                  poor to read — eleven checksummed digits cannot be fumbled into a
                  plausible but wrong supplier the way a name can.
                </Text>
              )}
            </>
          ) : null}
        </View>
          </>
        )}

        {error ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.body, { color: C.warnChipInk }]}>{error.message}</Text>
            {/* Most refusals are honest — filed earlier and forgotten, or put on
                the wrong job by somebody else. Give them somewhere to go. */}
            {error.status === 409 ? (
              queried ? (
                <Text style={[T.small, { marginTop: 8 }]}>{queried}</Text>
              ) : (
                <Pressable onPress={queryRefusal} disabled={querying} style={s.queryBtn}>
                  <Text style={s.queryText}>
                    {querying ? "Sending…" : "That's not right — ask the office to check"}
                  </Text>
                </Pressable>
              )
            ) : null}
            {/* The portal's own words are terse and, on this one, misleading:
                it refuses jobs that are not yet Completed with their Form 001,
                which is every job you are standing on. Say what it means. */}
            {/not your job/i.test(error.message || "") ? (
              <Text style={[T.small, { marginTop: 6 }]}>
                Job {jobNumber} isn't on your statement yet — the portal only counts a job once
                it's Completed with your Form 001. The fix is deployed portal-side; if you're
                seeing this, that deploy hasn't landed.
              </Text>
            ) : null}
          </Card>
        ) : null}

        <Cta
          // The figure goes ON the button. Nobody files $181.50 by accident,
          // and it is the last chance to notice the reader misread a total.
          label={busy ? "Saving…" : (Number(amount) ? `File it — $${Number(amount).toFixed(2)}` : "Save receipt")}
          tone="earth"
          disabled={busy || !ready}
          onPress={save}
          // A grey button with no reason is a locked door. Name what is
          // missing, in the order the form asks for it.
          sub={!ready && !busy
            ? `Still needed: ${[
                !photo && "a photo",
                !jobNumber && "the job",
                !supplier.trim() && "the supplier",
                !amount.trim() && "the amount",
                !date && "the date",
              ].filter(Boolean).join(", ")}.`
            : read
              ? "Read off the photo — check every line; you're the one signing for it."
              : "Checked against what was declared on Form 001 before it is reimbursed."}
        />
        {/* A way out that doesn't need the back arrow: nothing here is saved
            until the button above is pressed, so this simply drops it. */}
        <Pressable onPress={() => (busy ? null : onBack?.())} hitSlop={8} style={s.cancelWrap}>
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
      <KeyboardToggle inputRef={lastField} />
    </View>
  );
}

/** One line of the docket: what it says, and a tap to disagree with it. */
function DocketLine({ label, value, missing = false, onPress, last = false }) {
  return (
    <Pressable onPress={onPress} style={[s.docketRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.docketLabel}>{label}</Text>
      <Text
        style={[s.docketValue, mono, missing && { color: C.warnChipInk, fontWeight: "600" }]}
        numberOfLines={1}
      >
        {value || "not read"}
      </Text>
      <Text style={s.docketChev}>›</Text>
    </Pressable>
  );
}

function Field({ mono: isMono, inputRef, onUse, ...props }) {
  const own = useRef(null);
  return (
    <TextInput
      {...props}
      ref={(node) => {
        own.current = node;
        if (inputRef) inputRef.current = node;
      }}
      onFocus={() => { if (onUse) onUse(own); }}
      placeholderTextColor={C.muted}
      style={[s.input, isMono && { fontVariant: ["tabular-nums"] }]}
    />
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap, paddingBottom: 40 },
  preview: { width: "100%", height: 220, borderRadius: R.card, backgroundColor: C.panel },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
  docketRow: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: S.touch,
    paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  docketLabel: { flex: 1, color: C.muted, fontSize: 13.5 },
  docketValue: { color: C.ink, fontSize: 15.5, fontWeight: "700", maxWidth: "58%" },
  docketChev: { color: C.muted, fontSize: 19 },
  warn: { color: C.warnChipInk, fontSize: 12, lineHeight: 17, marginTop: 7 },
  link: { color: C.brand, fontSize: 12.5, fontWeight: "700", marginTop: 7 },
  readingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  readingText: { color: C.muted, fontSize: 12.5, marginTop: 7, flex: 1 },
  input: {
    minHeight: S.touch, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 13, color: C.ink, fontSize: 15.5,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: R.chip, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel,
    paddingHorizontal: 13, minHeight: 38, justifyContent: "center",
  },
  chipOn: { borderColor: C.brand, backgroundColor: C.selectBg },
  chipText: { color: C.muted, fontSize: 13.5, fontWeight: "700" },
  jobSelect: {
    minHeight: S.touch, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.button, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  jobSelectNumber: { color: C.ink, fontSize: 15.5, fontWeight: "800" },
  jobSelectAddress: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  jobSelectEmpty: { color: C.muted, fontSize: 14.5 },
  jobChevron: { color: C.muted, fontSize: 16, fontWeight: "800" },
  jobList: { marginTop: 8, gap: 8 },
  // Tall enough to show that there is a list, short enough that the camera
  // button is never pushed off the screen behind it.
  jobScroll: { maxHeight: 260, borderColor: C.line, borderWidth: 1, borderRadius: R.card },
  jobOption: { paddingHorizontal: 14, paddingVertical: 11, borderBottomColor: C.line, borderBottomWidth: 1 },
  jobOptionOn: { backgroundColor: C.selectBg },
  jobOptionNumber: { color: C.ink, fontSize: 14.5, fontWeight: "800" },
  jobOptionAddress: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  jobRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobNumber: { color: C.ink, fontSize: 16, fontWeight: "800" },
  flagTitle: { color: C.warnChipInk, fontSize: 14, fontWeight: "800" },
  flagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  flagBtn: {
    borderRadius: R.chip, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel,
    paddingHorizontal: 14, minHeight: 40, justifyContent: "center",
  },
  flagBtnOn: { borderColor: C.brand, backgroundColor: C.selectBg },
  flagBtnText: { color: C.muted, fontSize: 13, fontWeight: "700" },
  flagBtnOnText: { color: C.ink, fontSize: 13, fontWeight: "800" },
  queryBtn: {
    marginTop: 11, minHeight: 42, borderRadius: R.button, borderWidth: 1,
    borderColor: C.warnChipInk, alignItems: "center", justifyContent: "center", paddingHorizontal: 12,
  },
  queryText: { color: C.warnChipInk, fontSize: 13.5, fontWeight: "800", textAlign: "center" },
  cancelWrap: { alignItems: "center", paddingTop: 4 },
  cancel: { color: C.muted, fontSize: 13.5, fontWeight: "600" },
});
