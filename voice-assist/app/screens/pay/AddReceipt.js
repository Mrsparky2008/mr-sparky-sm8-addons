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
//   · The supplier is a plain field showing exactly what is printed. What
//     IDENTIFIES the supplier is the ABN, not the name — every valid tax
//     invoice carries one, it has no spelling variance, and the register can
//     confirm it. Steven's call, and a better one than matching names.
//     If a docket photographs too badly to read, the ABN is what gets typed
//     and the register supplies the name: eleven checksummed digits cannot be
//     fumbled into a plausible-but-wrong supplier the way a name can.
//   · The job comes from where you opened the screen, not from the paper. If
//     the docket quotes a different job number it is FLAGGED, with what
//     ServiceM8 says that job is, and the choice is yours. If nothing anchors
//     the receipt to a job, it asks — a receipt on the wrong job is worse than
//     a receipt typed in by hand.
import { useEffect, useRef, useState } from "react";
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
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" };

export default function AddReceipt({ jobNumbers = [], jobNumber: initial, onBack, onSaved }) {
  const anchored = initial ? String(initial) : "";
  const chips = jobNumbers.map(String);
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
      const r = await postJobTask(jobNumber, {
        name: `Receipt query — ${invoiceNumber.trim() || supplier.trim() || "docket"}`,
        details: [
          `Tried to file a receipt against job #${jobNumber} and it was refused.`,
          `Supplier: ${supplier.trim() || "(not read)"}${abn ? `, ABN ${abn}` : ""}.`,
          `Invoice: ${invoiceNumber.trim() || "(none on the docket)"}. Amount: $${amount || "?"}.`,
          `Reason given: ${error?.message || "already filed"}`,
          "They say that is not right — please check whether it was filed against the wrong job.",
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
      const trail = mismatch ? `Docket quotes job #${docket.jobNumber}.` : "";
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
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Cta label="📷 Photograph the receipt" onPress={() => take(false)} />
              <Cta label="Choose from photos" tone="ghost" onPress={() => take(true)} />
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
              {docket.label ? `The paper says “${docket.label}”` : `The paper says job #${docket.jobNumber}`}
              {docket.known
                ? ` — #${docket.jobNumber}, ${[docket.address, docket.status].filter(Boolean).join(" · ")}.`
                : ` — and there's no job #${docket.jobNumber} in ServiceM8.`}
              {` You're filing it to #${jobNumber}.`}
            </Text>
            <View style={s.flagRow}>
              {docket.known ? (
                <Pressable onPress={() => setJobNumber(docket.jobNumber)} style={[s.flagBtn, s.flagBtnOn]}>
                  <Text style={s.flagBtnOnText}>File to #{docket.jobNumber}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setAckDocket(true)} style={s.flagBtn}>
                <Text style={s.flagBtnText}>Keep #{jobNumber}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <View>
          <SectionLabel>Job{needsJob && photo ? " — which one?" : ""}</SectionLabel>
          {chips.length > 1 ? (
            <View style={s.chips}>
              {chips.map((n) => (
                <Pressable key={n} onPress={() => setJobNumber(n)} style={[s.chip, n === jobNumber && s.chipOn]}>
                  <Text style={[s.chipText, mono, n === jobNumber && { color: C.ink }]}>#{n}</Text>
                </Pressable>
              ))}
            </View>
          ) : anchored || chips.length === 1 ? (
            <View style={s.jobRow}>
              <Text style={[s.jobNumber, mono]}>#{jobNumber || anchored}</Text>
              {jobNumber === anchored ? <Text style={T.small}>opened from this job</Text> : null}
              {anchored && jobNumber !== anchored ? (
                <Pressable onPress={() => setJobNumber(anchored)} hitSlop={8}>
                  <Text style={s.link}>back to #{anchored}</Text>
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
                ? `The docket says #${docket.jobNumber}, which isn't a job in ServiceM8 — pick the right one.`
                : "Nothing on the docket says which job this is. Choose it before saving."}
            </Text>
          ) : null}
          {mismatch && ackDocket ? (
            <Text style={s.note}>
              Filed to #{jobNumber}; the docket's #{docket.jobNumber} goes on the record with it.
            </Text>
          ) : null}
        </View>

        <View>
          <SectionLabel>Supplier{read?.supplier ? " · read" : ""}</SectionLabel>
          <Field
            onUse={(r) => (lastField.current = r.current)}
            value={supplier}
            onChangeText={(v) => { mark("supplier"); setSupplier(v); setReadAs(""); }}
            placeholder="Middy's, Lawrence & Hanson…"
          />
        </View>

        <View>
          <SectionLabel>Supplier ABN{read?.abn ? " · read" : ""}</SectionLabel>
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
              What actually identifies the supplier — the same docket can never be claimed twice
              under two spellings. If the photo is too poor to read, type this and the register
              fills in the name.
            </Text>
          )}
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
          <Field
            onUse={(r) => (lastField.current = r.current)}
            value={date}
            onChangeText={(v) => { mark("date"); setDate(v); }}
            placeholder="YYYY-MM-DD"
            mono
          />
        </View>

        <View>
          <SectionLabel>Invoice number{read?.invoiceNumber ? " · read" : " (optional)"}</SectionLabel>
          <Field
            onUse={(r) => (lastField.current = r.current)}
            value={invoiceNumber}
            onChangeText={(v) => { mark("invoiceNumber"); setInvoiceNumber(v); }}
            placeholder="Needed for a credit"
          />
        </View>

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
                Job #{jobNumber} isn't on your statement yet — the portal only counts a job once
                it's Completed with your Form 001. The fix is deployed portal-side; if you're
                seeing this, that deploy hasn't landed.
              </Text>
            ) : null}
          </Card>
        ) : null}

        <Cta
          label={busy ? "Saving…" : "Save receipt"}
          tone="earth"
          disabled={busy || !ready}
          onPress={save}
          sub={read
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
  chipOn: { borderColor: C.brand, backgroundColor: C.charlieBg },
  chipText: { color: C.muted, fontSize: 13.5, fontWeight: "700" },
  jobRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobNumber: { color: C.ink, fontSize: 16, fontWeight: "800" },
  flagTitle: { color: C.warnChipInk, fontSize: 14, fontWeight: "800" },
  flagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  flagBtn: {
    borderRadius: R.chip, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel,
    paddingHorizontal: 14, minHeight: 40, justifyContent: "center",
  },
  flagBtnOn: { borderColor: C.brand, backgroundColor: C.charlieBg },
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
