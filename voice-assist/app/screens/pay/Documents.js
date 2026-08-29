// My documents — the Certificate of Currency, photographed where it arrives.
//
// Steven, 30 Aug 2026: "can't we just upload from the phone like receipts?"
// Same rails exactly: camera or photo roll, straight into the private bucket
// by presigned URL, read by Claude so the fields land pre-filled, and NOTHING
// saved until a human checks every line and presses the button. History is
// append-only — a renewal adds a row; a 2029 claim about a 2026 job finds the
// 2026 policy underneath.
import { useRef, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Card, Cta, Header, SectionLabel } from "../../components/ui";
import { C, R, S, T, mono } from "../../lib/theme";
import * as portal from "../../lib/portal";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "application/pdf": "pdf" };
const TYPES = [
  { key: "public_liability", label: "Public liability" },
  { key: "workers_comp", label: "Workers comp" },
];

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function Documents({ data, onBack, onSaved }) {
  const ins = data?.insurance || {};
  const policies = (ins.policies || []).filter((p) => !p.voided);
  const today = todayLocal();

  const [photo, setPhoto] = useState(null);
  const [imageKey, setImageKey] = useState(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState("");

  const [type, setType] = useState("public_liability");
  const [insurer, setInsurer] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [coverAmount, setCoverAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [interestedParty, setInterestedParty] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const touched = useRef({});
  const mark = (k) => { touched.current[k] = true; };

  async function take(fromLibrary) {
    setError("");
    const perm = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError(fromLibrary
        ? "AI Assist needs access to your photos to attach the certificate."
        : "AI Assist needs the camera to photograph the certificate.");
      return;
    }
    const opts = { mediaTypes: ["images"], quality: 0.7, exif: false };
    const res = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync(opts)
      : await ImagePicker.launchCameraAsync(opts);
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    const shot = { uri: asset.uri, mimeType: asset.mimeType || "image/jpeg" };
    setPhoto(shot);
    setSaved(false);
    upload(shot);
  }

  // The Files app - where an emailed PDF certificate actually lives.
  // (This is what earned build 28: the picker is a native module.)
  async function pickFile() {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    const shot = {
      uri: asset.uri,
      mimeType: asset.mimeType || (asset.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      name: asset.name || "certificate",
    };
    setPhoto(shot);
    setSaved(false);
    upload(shot);
  }

  // Certificate goes to the bucket first, then Claude reads it off the
  // bucket copy — one photo, one upload, whatever happens after.
  async function upload(shot) {
    setReading(true);
    setReadNote("");
    setImageKey(null);
    try {
      const contentType = shot.mimeType || "image/jpeg";
      const { uploadUrl, imageKey: key } = await portal.insuranceUploadUrl({
        contentType, extension: EXT[contentType] || "jpg",
      });
      const up = await FileSystem.uploadAsync(uploadUrl, shot.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType },
      });
      if (up.status < 200 || up.status >= 300) throw new Error(`The photo did not upload (${up.status}).`);
      setImageKey(key);

      const r = await portal.insuranceRead(key);
      const f = r?.fields;
      if (f) {
        if (f.type && !touched.current.type) setType(f.type);
        if (f.insurer && !touched.current.insurer) setInsurer(f.insurer);
        if (f.policyNumber && !touched.current.policyNumber) setPolicyNumber(f.policyNumber);
        if (f.coverAmount && !touched.current.coverAmount) setCoverAmount(String(f.coverAmount));
        if (f.from && !touched.current.from) setFrom(f.from);
        if (f.to && !touched.current.to) setTo(f.to);
        if (f.interestedParty) setInterestedParty(true);
      }
      setReadNote(r?.note || "Check every field against the certificate before saving.");
    } catch (err) {
      setReadNote("");
      setError(err?.message || "Couldn't read the certificate — type the details in.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await portal.saveInsurance({
        imageKey, type,
        insurer: insurer.trim(),
        policyNumber: policyNumber.trim(),
        coverAmount: coverAmount.trim(),
        from: from.trim(),
        to: to.trim(),
        interestedParty,
      });
      setSaved(true);
      setPhoto(null); setImageKey(null);
      setInsurer(""); setPolicyNumber(""); setCoverAmount(""); setFrom(""); setTo("");
      setInterestedParty(false);
      touched.current = {};
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Couldn't save the certificate.");
    } finally {
      setBusy(false);
    }
  }

  const needsAmount = type === "public_liability";
  const ready = photo && imageKey && insurer.trim() && policyNumber.trim()
    && from.trim() && to.trim() && (!needsAmount || coverAmount.trim()) && !reading;

  return (
    <View style={{ flex: 1 }}>
      <Header title="My documents" onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        {/* ---- What's on file ------------------------------------------- */}
        <View>
          <SectionLabel>Insurance on file</SectionLabel>
          {policies.length ? policies.map((p, i) => {
            const expired = p.to < today;
            return (
              <Card key={i} style={s.polCard}>
                <View style={s.polTop}>
                  <Text style={s.polType}>
                    {p.type === "workers_comp" ? "Workers comp" : "Public liability"}
                  </Text>
                  <Text style={[s.badge, expired ? s.badgeBad : s.badgeOk]}>
                    {expired ? "EXPIRED" : "current"}
                  </Text>
                </View>
                <Text style={T.small}>
                  {p.insurer} · {p.policyNumber}
                  {p.coverAmount != null ? ` · $${Number(p.coverAmount).toLocaleString()}` : " · statutory cover"}
                </Text>
                <Text style={[T.small, mono]}>{p.from} → {p.to}</Text>
              </Card>
            );
          }) : (
            <Text style={s.note}>Nothing on file yet — the contract needs a current public liability certificate.</Text>
          )}
        </View>

        {/* ---- Add a certificate ---------------------------------------- */}
        <View>
          <SectionLabel>Add a certificate</SectionLabel>
          {photo ? (
            <>
              {photo.mimeType === "application/pdf" ? (
                <View style={s.pdfCard}>
                  <Text style={s.pdfIcon}>📄</Text>
                  <Text style={T.small} numberOfLines={1}>{photo.name || "certificate.pdf"}</Text>
                </View>
              ) : (
                <Pressable onPress={() => take(false)} disabled={reading}>
                  <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="cover" />
                </Pressable>
              )}
              {reading ? (
                <View style={s.readingRow}>
                  <ActivityIndicator color={C.brand} size="small" />
                  <Text style={s.readingText}>Reading the certificate…</Text>
                </View>
              ) : (
                <Text style={s.note}>{readNote || "Tap the photo to retake."}</Text>
              )}
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Cta label="📷 Photograph the certificate" onPress={() => take(false)} />
              <Cta label="Upload a file" tone="ghost" onPress={pickFile} />
              <Cta label="Choose from photos" tone="ghost" onPress={() => take(true)} />
              <Text style={s.note}>
                A renewal adds a new certificate; nothing is ever overwritten. It's read for
                you the moment it's taken — you check it before it's filed.
              </Text>
            </View>
          )}
        </View>

        {photo ? (
          <>
            <View>
              <SectionLabel>Policy type</SectionLabel>
              <View style={s.chips}>
                {TYPES.map((t) => (
                  <Pressable key={t.key}
                    onPress={() => { mark("type"); setType(t.key); }}
                    style={[s.chip, type === t.key && s.chipOn]}>
                    <Text style={[s.chipText, type === t.key && { color: C.ink }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Field label="Insurer" value={insurer}
              onChangeText={(v) => { mark("insurer"); setInsurer(v); }} placeholder="QBE, Allianz, icare…" />
            <Field label="Policy number" value={policyNumber} monoFont
              onChangeText={(v) => { mark("policyNumber"); setPolicyNumber(v); }} placeholder="As printed" />
            <Field label={needsAmount ? "Cover amount ($)" : "Cover amount — leave blank for workers comp"}
              value={coverAmount} keyboardType="number-pad" monoFont
              onChangeText={(v) => { mark("coverAmount"); setCoverAmount(v); }} placeholder={needsAmount ? "20000000" : "statutory"} />
            <Field label="Cover from" value={from} monoFont
              onChangeText={(v) => { mark("from"); setFrom(v); }} placeholder="YYYY-MM-DD" />
            <Field label="Cover to (expiry)" value={to} monoFont
              onChangeText={(v) => { mark("to"); setTo(v); }} placeholder="YYYY-MM-DD" />

            <Pressable onPress={() => setInterestedParty((v) => !v)} style={s.tickRow} hitSlop={6}>
              <View style={[s.tick, interestedParty && s.tickOn]}>
                {interestedParty ? <Text style={s.tickMark}>✓</Text> : null}
              </View>
              <Text style={[T.small, { flex: 1 }]}>
                Mr Sparky is noted on the certificate as an interested party
              </Text>
            </Pressable>

            {error ? <Text style={s.warn}>{error}</Text> : null}

            <Cta
              label={busy ? "Saving…" : "Save certificate"}
              tone="earth"
              disabled={busy || !ready}
              onPress={save}
              sub="Read off the photo — check every line; this goes on your contract record."
            />
          </>
        ) : null}

        {saved ? <Text style={s.savedNote}>Saved to your record.</Text> : null}
        {error && !photo ? <Text style={s.warn}>{error}</Text> : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, monoFont, ...props }) {
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      <TextInput
        {...props}
        placeholderTextColor={C.muted}
        autoCapitalize="none"
        style={[s.input, monoFont && { fontVariant: ["tabular-nums"] }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap, paddingBottom: 40 },
  polCard: { marginBottom: 8, gap: 3 },
  polTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  polType: { color: C.ink, fontSize: 14.5, fontWeight: "800" },
  badge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  badgeOk: { color: "#6FD096" },
  badgeBad: { color: C.warnChipInk },
  preview: { width: "100%", height: 220, borderRadius: R.card, backgroundColor: C.panel },
  pdfCard: {
    borderRadius: R.card, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    padding: 18, flexDirection: "row", alignItems: "center", gap: 12,
  },
  pdfIcon: { fontSize: 26 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
  warn: { color: C.warnChipInk, fontSize: 12, lineHeight: 17, marginTop: 7 },
  savedNote: { color: "#6FD096", fontSize: 13, fontWeight: "700", textAlign: "center" },
  readingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
  readingText: { color: C.muted, fontSize: 12.5, flex: 1 },
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
  tickRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  tick: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.line,
    alignItems: "center", justifyContent: "center", backgroundColor: C.panel,
  },
  tickOn: { borderColor: C.brand, backgroundColor: C.charlieBg },
  tickMark: { color: C.ink, fontSize: 15, fontWeight: "800" },
});
