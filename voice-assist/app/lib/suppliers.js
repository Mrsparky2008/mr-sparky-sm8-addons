// Which supplier a docket's printed name is.
//
// The LIST is the portal's — it comes down on /api/me, the office edits it in
// Settings › Suppliers, and it carries the aliases a docket actually prints
// (MIDDENDORP ELECTRIC CO PTY LTD for Middy's). This file only decides which
// chip lights up, and what the supplier field is set to when a photo is read.
//
// That is presentation, not arithmetic: no money moves on the strength of it,
// the answer lands in an editable field, and the photo of the paper is
// attached either way. The rule is deliberately the same conservative one the
// portal uses in lib/suppliers.mjs — a whole name or alias appearing in the
// text, never a fuzzy near-miss — so the chip and the saved name agree.
function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|inc|incorporated|group|australia|au|co|company|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchSupplier(suppliers, text) {
  const hay = normalise(text);
  if (!hay) return null;
  let best = null;
  for (const s of suppliers || []) {
    for (const candidate of [s.name, ...(s.aliases || [])]) {
      const needle = normalise(candidate);
      if (needle.length < 3) continue;
      if (hay.includes(needle) || (hay.length >= 3 && needle.includes(hay))) {
        // Longest wins, so "Lawrence & Hanson" beats a bare "Hanson".
        if (!best || needle.length > best.length) best = { supplier: s, length: needle.length };
      }
    }
  }
  return best ? best.supplier : null;
}
