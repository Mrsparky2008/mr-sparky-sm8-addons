// A receipt, photographed where it was handed over.
//
// This is the screen that earns the native build. The portal refuses a receipt
// with no photo — `validateReceipt` in lib/receipts.mjs — so the camera is not
// a convenience here, it is the whole transaction. A browser file picker with
// gloves on, in a switchboard room, is the thing this replaces.
//
// The image never passes through the Lambda: the portal hands back a short-lived
// presigned URL and the phone puts the file straight into a private bucket.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Card, Cta, Header, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono } from "../../lib/theme";
import * as portal from "../../lib/portal";

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
  const [jobNumber, setJobNumber] = useState(initial || jobNumbers[0] || "");
  const [photo, setPhoto] = useState(null);      // { uri, mimeType }
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
    if (asset?.uri) setPhoto({ uri: asset.uri, mimeType: asset.mimeType || "image/jpeg" });
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

      await portal.saveReceipt({
        jobNumber,
        imageKey,
        // Typed in, not worked out. The portal rounds and validates it.
        amountIncGst: Number(amount),
        supplier: supplier.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        date,
        note: note.trim() || undefined,
      });
      onSaved?.();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const ready = photo && supplier.trim() && amount.trim() && date && jobNumber;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Add receipt" onBack={onBack} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View>
          <SectionLabel>Photo</SectionLabel>
          {photo ? (
            <Pressable onPress={() => take(false)}>
              <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="cover" />
              <Text style={s.note}>Tap to retake.</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              <Cta label="📷 Photograph the receipt" onPress={() => take(false)} />
              <Cta label="Choose from photos" tone="ghost" onPress={() => take(true)} />
              <Text style={s.note}>
                A photo is required — a receipt without one is not reimbursed.
              </Text>
            </View>
          )}
        </View>

        {jobNumbers.length > 1 ? (
          <View>
            <SectionLabel>Job</SectionLabel>
            <View style={s.chips}>
              {jobNumbers.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setJobNumber(n)}
                  style={[s.chip, n === jobNumber && s.chipOn]}
                >
                  <Text style={[s.chipText, mono, n === jobNumber && { color: C.ink }]}>#{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <SectionLabel>Supplier</SectionLabel>
          <Field value={supplier} onChangeText={setSupplier} placeholder="Middy's, Lawrence & Hanson…" />
        </View>

        <View>
          <SectionLabel>Amount inc GST</SectionLabel>
          <Field
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            mono
          />
        </View>

        <View>
          <SectionLabel>Date</SectionLabel>
          <Field value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" mono />
        </View>

        <View>
          <SectionLabel>Invoice number (optional)</SectionLabel>
          <Field value={invoiceNumber} onChangeText={setInvoiceNumber} placeholder="Needed for a credit" />
        </View>

        {error ? (
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.body, { color: C.warnChipInk }]}>{error.message}</Text>
          </Card>
        ) : null}

        <Cta
          label={busy ? "Saving…" : "Save receipt"}
          tone="earth"
          disabled={busy || !ready}
          onPress={save}
          sub="Checked against what was declared on Form 001 before it is reimbursed."
        />
      </ScrollView>
    </View>
  );
}

function Field({ mono: isMono, ...props }) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={C.muted}
      style={[s.input, isMono && { fontVariant: ["tabular-nums"] }]}
    />
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap, paddingBottom: 40 },
  preview: { width: "100%", height: 220, borderRadius: R.card, backgroundColor: C.panel },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
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
});
