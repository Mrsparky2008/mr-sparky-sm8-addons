// The locked design system (voice-assist/DESIGN.md, "Switchboard dark").
// DESIGN.md wins over anything here; if you change a value, change it there too.
//
// The state colours follow AU wiring code and are SEMANTIC — never reassign
// them: active(brown) = mic live, neutral(blue) = idle/ready, earth(green) =
// written to ServiceM8. Nothing is green unless it is real in ServiceM8.

export const C = {
  bg: "#0f1b2d",
  panel: "#16233A",
  line: "#25375A",
  ink: "#E9EFF8",
  muted: "#8DA0BC",
  brand: "#1A73E8",
  active: "#C96A2B",
  activeLight: "#E08A47",
  activeDark: "#B4571E",
  neutral: "#2E7DD1",
  earth: "#2F9E57",
  thinking: "#F9AB00",
  warnChipBg: "rgba(201,106,43,.18)",
  warnChipInk: "#EFA96A",
  infoChipBg: "rgba(46,125,209,.16)",
  infoChipInk: "#7FB4EE",
  charlieBg: "rgba(26,115,232,.14)",
  charlieLine: "rgba(26,115,232,.35)",
  // Mr Sparky's real brand pair, off the logo.
  navy: "#19488F",
  yellow: "#FEDA00",
};

export const R = { card: 13, button: 15, chip: 999 };

export const S = { screen: 18, card: 13, gap: 12, touch: 48 };

// Prices, job numbers and timers all line up in columns — tabular figures are
// not decoration, they stop digits dancing as they change.
export const mono = { fontVariant: ["tabular-nums"] };

export const T = {
  label: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", color: C.muted },
  title: { fontSize: 15, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", color: C.ink },
  body: { fontSize: 14.5, lineHeight: 20, color: C.ink },
  small: { fontSize: 12.5, lineHeight: 17, color: C.muted },
};

// $23,587.62 — the comma is what makes a five-figure number readable at arm's
// length in a ute. Formatting only; the number itself always arrives computed.
// Deduction lines are negative, and "-$1,550.67" reads right where "$-" doesn't.
export function money(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-$" : "$"}${abs}`;
}

// ServiceM8 addresses arrive with embedded newlines; a job chip is one line.
export const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

// "9/14-16 French St Kogarah NSW 2217" -> "Kogarah". The suburb is what someone
// actually recognises in a list; the full address belongs on the job card.
export function suburb(address) {
  const a = oneLine(address);
  if (!a) return "";
  const m = /,?\s*([A-Za-z' ]+?)\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/.exec(a);
  if (m) return m[1].trim();
  const parts = a.split(/,/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : a;
}

// Status colours borrow the chip palette; only ServiceM8 truth is ever green.
// Quote = ORANGE and Work Order = BLUE, matching ServiceM8 exactly - Steven,
// 30 Aug 2026: "I switch apps and get lost looking for a WO in the blue
// section." Two apps, one colour language.
export function statusChip(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return { bg: "rgba(47,158,87,.16)", ink: "#6FD096" };
  if (s === "work order") return { bg: C.infoChipBg, ink: C.infoChipInk };
  if (s === "quote") return { bg: C.warnChipBg, ink: C.warnChipInk };
  if (s === "unsuccessful") return { bg: "rgba(226,75,74,.16)", ink: "#F09595" };
  return { bg: "rgba(141,160,188,.14)", ink: C.muted };
}
