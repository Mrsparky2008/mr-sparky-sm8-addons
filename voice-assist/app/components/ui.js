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
        <View style={s.brandTile}>
          <Text style={s.brandTileText}>AI</Text>
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

/**
 * ServiceM8's job-card row: icon, label, right-aligned value, chevron. Reading
 * the same way in both apps is the point — Steven moves between them all day.
 */
export function Row({ icon, label, value, onPress, dim, last }) {
  const body = (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      {!!icon && <Text style={s.rowIcon}>{icon}</Text>}
      <Text style={[s.rowLabel, dim && { color: C.muted }]}>{label}</Text>
      {!!value && <Text style={[s.rowValue, mono]}>{value}</Text>}
      {!!onPress && <Text style={s.chevron}>›</Text>}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

/** A Job-Actions style tile. Two per row, glove-sized. */
export function Tile({ icon, label, onPress, tone }) {
  return (
    <Pressable onPress={onPress} style={[s.tile, tone === "brand" && { borderColor: C.brand }]}>
      <Text style={s.tileIcon}>{icon}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </Pressable>
  );
}

export function TileGrid({ children }) {
  return <View style={s.grid}>{children}</View>;
}

/** Two or three peers of one screen — Jobs/Today, not navigation. */
export function Segment({ options, value, onChange }) {
  return (
    <View style={s.segment}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[s.segmentItem, on && s.segmentItemOn]}
          >
            <Text style={[s.segmentText, on && { color: C.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A strip that states something about the whole screen. tone "active" is the
 * drafting warning; "warn" is the test-build stripe, which exists so nobody
 * ever approves a real claim believing they are in a sandbox.
 */
export function Banner({ children, tone = "active" }) {
  const ink = tone === "warn" ? C.yellow : C.active;
  const bg = tone === "warn" ? "rgba(254,218,0,.12)" : C.warnChipBg;
  return (
    <View style={[s.banner, { backgroundColor: bg }]}>
      <Text style={[s.bannerText, { color: ink }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: S.screen, paddingTop: 6, paddingBottom: 12,
  },
  // Named apart from the grid `tile` below on purpose: both used to be called
  // `tile` in this one object, so the grid style silently won and the header's
  // 30px brand badge was rendering as a full-width 84px panel on every screen.
  brandTile: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: C.brand,
    alignItems: "center", justifyContent: "center",
  },
  brandTileText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
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

  row: {
    flexDirection: "row", alignItems: "center", gap: 12, minHeight: S.touch,
    paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: 1,
  },
  rowIcon: { fontSize: 16, width: 22, textAlign: "center" },
  rowLabel: { flex: 1, color: C.ink, fontSize: 15 },
  rowValue: { color: C.muted, fontSize: 15 },
  chevron: { color: C.muted, fontSize: 22, lineHeight: 24, marginLeft: 2 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexGrow: 1, flexBasis: "47%", minHeight: 84, backgroundColor: C.panel,
    borderColor: C.line, borderWidth: 1, borderRadius: R.card,
    padding: 14, justifyContent: "space-between",
  },
  tileIcon: { fontSize: 22 },
  tileLabel: { color: C.ink, fontSize: 14.5, fontWeight: "700" },

  segment: {
    flexDirection: "row", gap: 2, backgroundColor: C.panel,
    borderColor: C.line, borderWidth: 1, borderRadius: R.button, padding: 3,
  },
  segmentItem: {
    flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center",
    borderRadius: R.button - 4,
  },
  segmentItemOn: { backgroundColor: C.line },
  segmentText: { color: C.muted, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },

  banner: { borderRadius: R.card, paddingHorizontal: 12, paddingVertical: 8 },
  bannerText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
});
