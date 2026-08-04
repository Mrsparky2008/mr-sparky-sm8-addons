// Shared furniture for every screen. Kept deliberately small — these are the
// pieces DESIGN.md names, nothing more.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, R, S, T, mono, oneLine, statusChip } from "../lib/theme";

export { Logo } from "./Logo";

export function Header({ title, meta, onBack }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={s.back}>
          <Text style={s.backText}>‹</Text>
        </Pressable>
      ) : (
        <View style={s.tile}>
          <Text style={s.tileText}>AI</Text>
        </View>
      )}
      <Text style={[T.title, { flex: 1 }]} numberOfLines={1}>{title}</Text>
      {meta ? <Text style={[s.meta, mono]}>{meta}</Text> : null}
    </View>
  );
}

/** "Job #167430 · Haymarket" — the number is the thing you scan for. */
export function JobChip({ job, onPress }) {
  if (!job) return null;
  const body = (
    <View style={s.jobChip}>
      <Text style={s.jobChipMuted}>Job </Text>
      <Text style={[s.jobChipNum, mono]}>#{job.job_number}</Text>
      <Text style={s.jobChipMuted}> · {job.suburb || oneLine(job.address)}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function StatusChip({ status }) {
  if (!status) return null;
  const { bg, ink } = statusChip(status);
  return (
    <View style={[s.status, { backgroundColor: bg }]}>
      <Text style={[s.statusText, { color: ink }]}>{status}</Text>
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionLabel({ children }) {
  return <Text style={[T.label, { marginBottom: 6 }]}>{children}</Text>;
}

/**
 * tone: "brand" (default action) | "earth" (commits to ServiceM8 — and nothing
 * else may ever be green) | "ghost" (the way back out).
 */
export function Cta({ label, onPress, tone = "brand", disabled, sub }) {
  const bg = disabled ? C.panel : tone === "earth" ? C.earth : tone === "ghost" ? "transparent" : C.brand;
  const ink = disabled ? C.muted : tone === "ghost" ? C.muted : "#fff";
  return (
    <View>
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={[s.cta, { backgroundColor: bg }, tone === "ghost" && s.ctaGhost]}
      >
        <Text style={[s.ctaText, { color: ink }]}>{label}</Text>
      </Pressable>
      {sub ? <Text style={s.ctaSub}>{sub}</Text> : null}
    </View>
  );
}

export function Empty({ children }) {
  return <Text style={s.empty}>{children}</Text>;
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: S.screen, paddingTop: 6, paddingBottom: 12,
  },
  tile: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: C.brand,
    alignItems: "center", justifyContent: "center",
  },
  tileText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  back: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  backText: { color: C.ink, fontSize: 30, lineHeight: 32, fontWeight: "600" },
  meta: { color: C.muted, fontSize: 12.5 },

  jobChip: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.chip, paddingHorizontal: 13, paddingVertical: 7,
  },
  jobChipMuted: { color: C.muted, fontSize: 13 },
  jobChipNum: { color: C.ink, fontSize: 13, fontWeight: "700" },

  status: { borderRadius: R.chip, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },

  card: {
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, padding: S.card,
  },

  cta: {
    minHeight: S.touch, borderRadius: R.button, alignItems: "center",
    justifyContent: "center", paddingHorizontal: 16, paddingVertical: 14,
  },
  ctaGhost: { borderWidth: 1, borderColor: C.line },
  ctaText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.3 },
  ctaSub: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 7 },

  empty: { color: C.muted, fontSize: 13.5, textAlign: "center", paddingVertical: 26, lineHeight: 19 },
});
