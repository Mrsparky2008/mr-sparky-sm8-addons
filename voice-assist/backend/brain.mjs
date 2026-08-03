// AI Assist Voice — the brain. Ported from the job-card add-on's handlers/assist.mjs,
// adapted for the STANDALONE app: auth is the stored ServiceM8 API key (env SM8_API_KEY,
// tech account), a job is anchored conversationally via find_job (no job-card context),
// and replies are written to be SPOKEN (short, one thought at a time).
//
// Streaming: callers pass onDelta(text) — final-answer text streams out as it's generated
// so TTS can start speaking the first sentence while the rest composes.

const SM8_BASE = "https://api.servicem8.com/api_1.0";
const API_KEY = process.env.SM8_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const TZ = "Australia/Sydney";

async function sm8(method, path, body) {
  const res = await fetch(`${SM8_BASE}${path}`, {
    method,
    headers: {
      "X-Api-Key": API_KEY,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
  return { status: res.status, body: parsed, raw, headers: res.headers };
}

function toArray(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (maybe && Array.isArray(maybe.records)) return maybe.records;
  return [];
}

function nowInTz() {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
function normDate(s) {
  const v = String(s || "").trim();
  if (!DATE_RE.test(v)) throw new Error(`Date must be "YYYY-MM-DD HH:MM" (Sydney time), got "${v}"`);
  return v.length === 16 ? `${v}:00` : v;
}

const tools = [
  {
    name: "find_job",
    description:
      "Look up a job by its job number (e.g. 167430). Call this FIRST when the user names a job — " +
      "everything else needs the job_uuid this returns. Returns core details for confirmation.",
    input_schema: {
      type: "object",
      properties: { job_number: { type: "string", description: "The job number, digits only" } },
      required: ["job_number"],
      additionalProperties: false,
    },
  },
  {
    name: "get_job_details",
    description: "Full picture of a job: core fields, contacts, notes, bookings with staff.",
    input_schema: {
      type: "object",
      properties: { job_uuid: { type: "string" } },
      required: ["job_uuid"],
      additionalProperties: false,
    },
  },
  {
    name: "get_schedule",
    description:
      "Read the diary between two dates (Sydney-local) with staff names and job numbers. " +
      "Use before booking/rescheduling to find free slots and clashes.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: '"YYYY-MM-DD HH:MM"' },
        to: { type: "string", description: '"YYYY-MM-DD HH:MM"' },
        staff_uuid: { type: "string" },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "list_staff",
    description: "List active staff (uuid + name).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "book_job",
    description: "Create a booking for a job: staff member + time window.",
    input_schema: {
      type: "object",
      properties: {
        job_uuid: { type: "string" },
        staff_uuid: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["job_uuid", "staff_uuid", "start", "end"],
      additionalProperties: false,
    },
  },
  {
    name: "reschedule_booking",
    description: "Move an existing booking (activity_uuid from get_job_details/get_schedule).",
    input_schema: {
      type: "object",
      properties: {
        activity_uuid: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        staff_uuid: { type: "string" },
      },
      required: ["activity_uuid", "start", "end"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_booking",
    description: "Remove a booking (diary entry only; the job is untouched).",
    input_schema: {
      type: "object",
      properties: { activity_uuid: { type: "string" } },
      required: ["activity_uuid"],
      additionalProperties: false,
    },
  },
  {
    name: "add_note",
    description:
      "Add a note to a job card. For a note addressed to a specific person (e.g. the office or " +
      "Marites), start the note with their name in caps, e.g. 'MARITES: please order the parts'.",
    input_schema: {
      type: "object",
      properties: { job_uuid: { type: "string" }, note: { type: "string" } },
      required: ["job_uuid", "note"],
      additionalProperties: false,
    },
  },
  {
    name: "update_job_description",
    description: "Rewrite (or with append=true, add to) a job's description.",
    input_schema: {
      type: "object",
      properties: {
        job_uuid: { type: "string" },
        description: { type: "string" },
        append: { type: "boolean" },
      },
      required: ["job_uuid", "description"],
      additionalProperties: false,
    },
  },
  {
    name: "update_job_status",
    description: "Change job status.",
    input_schema: {
      type: "object",
      properties: {
        job_uuid: { type: "string" },
        status: { type: "string", enum: ["Quote", "Work Order", "Completed", "Unsuccessful"] },
      },
      required: ["job_uuid", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "list_billing_items",
    description: "List the line items on a job's billing section.",
    input_schema: {
      type: "object",
      properties: { job_uuid: { type: "string" } },
      required: ["job_uuid"],
      additionalProperties: false,
    },
  },
  {
    name: "add_billing_item",
    description:
      "Add ONE approved line item to the job's billing: name, quantity, unit price ex GST. " +
      "Only after the user approves the drafted list. Duplicates are auto-skipped.",
    input_schema: {
      type: "object",
      properties: {
        job_uuid: { type: "string" },
        name: { type: "string" },
        quantity: { type: "number" },
        unit_price: { type: "number" },
      },
      required: ["job_uuid", "name", "unit_price"],
      additionalProperties: false,
    },
  },
  {
    name: "recall_similar_lines",
    description:
      "Search everything Mr Sparky has EVER quoted for lines like this one, so you can reuse " +
      "Steven's own wording and see what he normally charges. Call this while drafting, once " +
      "per distinct item, before you put a price on it. Returns past line names with how often " +
      "they were used and the price range.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What the item is, in plain words — e.g. 'RCBO switchboard upgrade' or 'LED downlights'",
        },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    name: "show_quote_draft",
    description:
      "Put the quote draft ON THE USER'S SCREEN, exactly as it will be written to " +
      "ServiceM8. Call this whenever you have drafted or amended quote lines — the user " +
      "reads it themselves instead of having it read aloud. Then say one short sentence " +
      "asking if they're happy. Line names here MUST be the exact strings you will pass to " +
      "add_billing_item.",
    input_schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          description: "The full current draft — every line, in order.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Exact line name as it will appear on the quote" },
              quantity: { type: "number" },
              unit_price: { type: "number", description: "Unit price ex GST" },
            },
            required: ["name", "unit_price"],
            additionalProperties: false,
          },
        },
      },
      required: ["lines"],
      additionalProperties: false,
    },
  },
  {
    name: "clone_job",
    description: "Duplicate a job for a re-inspection/follow-up (Quote status, contacts copied).",
    input_schema: {
      type: "object",
      properties: { job_uuid: { type: "string" }, prefix: { type: "string" } },
      required: ["job_uuid"],
      additionalProperties: false,
    },
  },
];

// ---- quoting history: every line Mr Sparky has ever billed, cached per container.
// This is the "learning" — Steven's own wording and prices, not a hand-built price book.
const STOP = new Set(["and", "the", "a", "of", "to", "for", "with", "install", "supply", "new", "x", "in", "on", "at", "1", "2"]);
function tokens(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}
let histCache = { at: 0, lines: [] };
async function materialHistory() {
  if (Date.now() - histCache.at < 30 * 60 * 1000 && histCache.lines.length) return histCache.lines;
  const res = await sm8("GET", "/jobmaterial.json");
  if (res.status !== 200) return histCache.lines;
  const byName = new Map();
  for (const m of toArray(res.body)) {
    if (String(m.active) !== "1" && m.active !== 1) continue;
    const name = String(m.name || "").trim();
    const price = Number(m.price);
    if (!name || name.length < 4 || !isFinite(price) || price <= 0) continue;
    const cur = byName.get(name) || { name, prices: [] };
    cur.prices.push(price);
    byName.set(name, cur);
  }
  histCache = {
    at: Date.now(),
    lines: [...byName.values()].map((v) => {
      const s = v.prices.sort((a, b) => a - b);
      return {
        name: v.name,
        tokens: new Set(tokens(v.name)),
        times: s.length,
        median: Number(s[Math.floor(s.length / 2)].toFixed(2)),
        min: Number(s[0].toFixed(2)),
        max: Number(s[s.length - 1].toFixed(2)),
      };
    }),
  };
  console.log(`voice: quoting history indexed — ${histCache.lines.length} distinct lines`);
  return histCache.lines;
}

let staffCache = null;
async function getStaff() {
  if (staffCache) return staffCache;
  const res = await sm8("GET", "/staff.json");
  if (res.status !== 200) throw new Error(`staff.json failed: ${res.status}`);
  staffCache = toArray(res.body)
    .filter((s) => String(s.active) === "1" || s.active === 1)
    .map((s) => ({ uuid: s.uuid, name: `${s.first || ""} ${s.last || ""}`.trim() || s.email || s.uuid }));
  return staffCache;
}
function staffName(staff, uuid) {
  const hit = staff.find((s) => s.uuid === uuid);
  return hit ? hit.name : uuid || "(unassigned)";
}

async function executeTool(name, input) {
  const jobU = String(input.job_uuid || "").trim();

  if (name === "find_job") {
    const num = String(input.job_number || "").replace(/\D/g, "");
    if (!num) return { error: "No job number given" };
    const r = await sm8("GET", `/job.json?%24filter=generated_job_id%20eq%20'${num}'`);
    const hits = toArray(r.body).filter((j) => String(j.active) === "1" || j.active === 1);
    if (!hits.length) return { error: `No job found with number ${num}` };
    const j = hits[0];
    return {
      job: {
        uuid: j.uuid, job_number: j.generated_job_id, status: j.status,
        address: j.job_address, description: String(j.job_description || "").slice(0, 800),
      },
    };
  }

  if (name === "get_job_details") {
    const j = await sm8("GET", `/job/${encodeURIComponent(jobU)}.json`);
    if (j.status !== 200 || !j.body) return { error: `Could not read job (${j.status})` };
    const job = j.body;
    const [contactsRes, notesRes, actsRes] = await Promise.all([
      sm8("GET", "/jobcontact.json"),
      sm8("GET", `/note.json?%24filter=related_object_uuid%20eq%20'${encodeURIComponent(jobU)}'`),
      sm8("GET", "/jobactivity.json?%24filter=active%20eq%20'1'"),
    ]);
    const staff = await getStaff();
    return {
      job: {
        uuid: job.uuid, job_number: job.generated_job_id, status: job.status,
        address: job.job_address, description: String(job.job_description || "").slice(0, 1500),
      },
      contacts: toArray(contactsRes.body).filter((c) => c.job_uuid === jobU)
        .map((c) => ({ type: c.type, name: `${c.first || ""} ${c.last || ""}`.trim(), mobile: c.mobile, phone: c.phone })),
      notes: toArray(notesRes.body).slice(-10).map((n) => ({ date: n.create_date, note: String(n.note || "").slice(0, 400) })),
      bookings: toArray(actsRes.body).filter((a) => a.job_uuid === jobU)
        .map((a) => ({ activity_uuid: a.uuid, staff: staffName(staff, a.staff_uuid), start: a.start_date, end: a.end_date })),
    };
  }

  if (name === "get_schedule") {
    const from = normDate(input.from), to = normDate(input.to);
    const staff = await getStaff();
    const res = await sm8("GET", "/jobactivity.json?%24filter=active%20eq%20'1'");
    const acts = toArray(res.body).filter((a) => {
      if (!a.start_date || a.start_date === "0000-00-00 00:00:00") return false;
      if (input.staff_uuid && a.staff_uuid !== input.staff_uuid) return false;
      return a.start_date < to && (a.end_date || a.start_date) > from;
    });
    const jobUuids = [...new Set(acts.map((a) => a.job_uuid))].slice(0, 25);
    const jobNums = {};
    await Promise.all(jobUuids.map(async (u) => {
      const r = await sm8("GET", `/job/${encodeURIComponent(u)}.json`);
      if (r.status === 200 && r.body) jobNums[u] = { number: r.body.generated_job_id, address: r.body.job_address };
    }));
    return {
      window: { from, to },
      bookings: acts.map((a) => ({
        activity_uuid: a.uuid, staff: staffName(staff, a.staff_uuid), staff_uuid: a.staff_uuid,
        start: a.start_date, end: a.end_date, job: jobNums[a.job_uuid] || { uuid: a.job_uuid },
      })).sort((a, b) => (a.start < b.start ? -1 : 1)),
      staff_list: staff,
    };
  }

  if (name === "list_staff") return { staff: await getStaff() };

  if (name === "book_job") {
    const r = await sm8("POST", "/jobactivity.json", {
      job_uuid: jobU, staff_uuid: input.staff_uuid,
      start_date: normDate(input.start), end_date: normDate(input.end), active: 1,
    });
    if (r.status < 200 || r.status >= 300) return { error: `Booking failed: ${r.status} ${r.raw?.slice(0, 200)}` };
    return { ok: true, activity_uuid: r.headers.get("x-record-uuid") || "" };
  }

  if (name === "reschedule_booking") {
    const payload = { start_date: normDate(input.start), end_date: normDate(input.end) };
    if (input.staff_uuid) payload.staff_uuid = input.staff_uuid;
    const r = await sm8("POST", `/jobactivity/${encodeURIComponent(input.activity_uuid)}.json`, payload);
    if (r.status < 200 || r.status >= 300) return { error: `Reschedule failed: ${r.status}` };
    return { ok: true };
  }

  if (name === "cancel_booking") {
    const r = await sm8("DELETE", `/jobactivity/${encodeURIComponent(input.activity_uuid)}.json`);
    if (r.status < 200 || r.status >= 300) {
      const soft = await sm8("POST", `/jobactivity/${encodeURIComponent(input.activity_uuid)}.json`, { active: 0 });
      if (soft.status < 200 || soft.status >= 300) return { error: `Cancel failed: ${r.status}/${soft.status}` };
    }
    return { ok: true };
  }

  if (name === "add_note") {
    const r = await sm8("POST", "/note.json", {
      related_object: "job", related_object_uuid: jobU, note: String(input.note || "").slice(0, 4000),
    });
    if (r.status < 200 || r.status >= 300) return { error: `Note failed: ${r.status}` };
    return { ok: true };
  }

  if (name === "update_job_description") {
    let newDesc = String(input.description || "");
    if (input.append) {
      const j = await sm8("GET", `/job/${encodeURIComponent(jobU)}.json`);
      if (j.status !== 200 || !j.body) return { error: `Could not read job (${j.status})` };
      const existing = String(j.body.job_description || "");
      newDesc = existing ? `${existing}\n${newDesc}` : newDesc;
    }
    const r = await sm8("POST", `/job/${encodeURIComponent(jobU)}.json`, { job_description: newDesc.slice(0, 8000) });
    if (r.status < 200 || r.status >= 300) return { error: `Description update failed: ${r.status}` };
    return { ok: true };
  }

  if (name === "update_job_status") {
    const r = await sm8("POST", `/job/${encodeURIComponent(jobU)}.json`, { status: input.status });
    if (r.status < 200 || r.status >= 300) return { error: `Status change failed: ${r.status}` };
    return { ok: true };
  }

  if (name === "list_billing_items") {
    const r = await sm8("GET", `/jobmaterial.json?%24filter=job_uuid%20eq%20'${encodeURIComponent(jobU)}'`);
    if (r.status !== 200) return { error: `Billing read failed: ${r.status}` };
    return {
      items: toArray(r.body).filter((m) => String(m.active) === "1" || m.active === 1)
        .map((m) => ({ uuid: m.uuid, name: m.name, quantity: m.quantity, unit_price_ex_gst: m.price })),
    };
  }

  if (name === "add_billing_item") {
    const qty = Number(input.quantity) > 0 ? Number(input.quantity) : 1;
    const price = Number(input.unit_price) || 0;
    const existing = await sm8("GET", `/jobmaterial.json?%24filter=job_uuid%20eq%20'${encodeURIComponent(jobU)}'`);
    const dupe = toArray(existing.body).find(
      (m) => (String(m.active) === "1" || m.active === 1) &&
        String(m.name || "").trim().toLowerCase() === String(input.name || "").trim().toLowerCase() &&
        Math.abs(Number(m.price) - price) < 0.005
    );
    if (dupe) return { ok: true, skipped: "identical line already on the job" };
    const r = await sm8("POST", "/jobmaterial.json", {
      job_uuid: jobU, name: String(input.name || "").slice(0, 500),
      quantity: qty.toFixed(2), price: price.toFixed(2), displayed_amount: price.toFixed(2), active: 1,
    });
    if (r.status < 200 || r.status >= 300) {
      console.log(`voice: add_billing_item REJECTED ${r.status}: ${r.raw?.slice(0, 300)}`);
      return { error: `Add line failed: ${r.status} ${r.raw?.slice(0, 150)}` };
    }
    return { ok: true };
  }

  if (name === "recall_similar_lines") {
    const hist = await materialHistory();
    const q = tokens(input.description);
    if (!q.length || !hist.length) return { matches: [], note: "No history to draw on." };
    const scored = [];
    for (const h of hist) {
      const hit = q.filter((w) => h.tokens.has(w)).length;
      if (!hit) continue;
      // Relevance: how much of the query it covers, lightly favouring shorter,
      // more specific names over sprawling ones.
      scored.push({ ...h, score: hit / q.length + Math.min(h.tokens.size, 12) / 400 });
    }
    scored.sort((a, b) => b.score - a.score || b.times - a.times);
    const matches = scored.slice(0, 8).map((m) => ({
      name: m.name,
      times_quoted: m.times,
      price_typical: m.median,
      price_range: m.min === m.max ? undefined : `${m.min} - ${m.max}`,
    }));
    return {
      matches,
      note: matches.length
        ? "Steven's own past wording and prices. Draft using this wording and the typical price, and say the price so he can adjust it."
        : "Nothing similar quoted before — ask him for the price.",
    };
  }

  if (name === "show_quote_draft") {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    const total = lines.reduce((t, l) => t + (Number(l.quantity) || 1) * (Number(l.unit_price) || 0), 0);
    // The app renders this from the tool call itself; the result just tells the
    // model what to do next.
    return {
      ok: true,
      shown: lines.length,
      total_ex_gst: Number(total.toFixed(2)),
      note: "Draft is on the user's screen. Do NOT read the lines aloud. Say one short sentence asking if they're happy with it, then wait.",
    };
  }

  if (name === "clone_job") {
    const j = await sm8("GET", `/job/${encodeURIComponent(jobU)}.json`);
    if (j.status !== 200 || !j.body) return { error: `Could not read source job (${j.status})` };
    const src = j.body;
    const prefix = String(input.prefix || "Re-inspection (auto)").slice(0, 200);
    const payload = {
      status: "Quote", job_address: src.job_address || "",
      job_description: `${prefix}: ${src.job_address || ""}\n\nOriginal:\n${src.job_description || ""}`,
      company_uuid: src.company_uuid || undefined,
      billing_client_uuid: src.billing_client_uuid || undefined,
      category_uuid: src.category_uuid || undefined,
      purchase_order_number: src.purchase_order_number || undefined,
    };
    for (const k of Object.keys(payload)) if (payload[k] == null || payload[k] === "") delete payload[k];
    const cr = await sm8("POST", "/job.json", payload);
    if (cr.status < 200 || cr.status >= 300) return { error: `Clone failed: ${cr.status}` };
    const newUuid = cr.headers.get("x-record-uuid") || "";
    const contactsRes = await sm8("GET", "/jobcontact.json");
    const mine = toArray(contactsRes.body).filter((c) => c.job_uuid === jobU);
    for (const type of ["JOB", "BILLING"]) {
      const c = mine.find((x) => (x.type || "").toUpperCase() === type);
      if (c && (c.first || c.last || c.mobile || c.phone)) {
        await sm8("POST", "/jobcontact.json", {
          job_uuid: newUuid, first: c.first || "", last: c.last || "", email: c.email || "",
          phone: c.phone || "", mobile: c.mobile || "", type,
          is_primary_contact: type === "JOB" ? "1" : "0", active: 1,
        });
      }
    }
    const nj = await sm8("GET", `/job/${encodeURIComponent(newUuid)}.json`);
    return { ok: true, new_job_number: nj.body?.generated_job_id || "(unknown)" };
  }

  return { error: `Unknown tool: ${name}` };
}

function systemPrompt(anchor) {
  const anchorNote = anchor && anchor.uuid
    ? `\n\nCURRENT ANCHORED JOB (already confirmed earlier in this call — do NOT call find_job again unless the user names a different job): job ${anchor.job_number} at ${anchor.address}, uuid ${anchor.uuid}. Use this uuid directly and don't re-announce the job.`
    : "";
  return `You are AI Assist, Mr Sparky Electrical's voice assistant. You are IN A SPOKEN CONVERSATION with Steven (the owner) or a staff member — your words are read aloud by text-to-speech. This is the standalone app: no job is pre-selected.

Current date/time (Sydney): ${nowInTz()}.
All ServiceM8 dates are Sydney-local "YYYY-MM-DD HH:MM".

SPOKEN STYLE — the most important rules:
- Talk like a sharp Aussie office colleague, not a document. Short sentences. One thought at a time.
- BREVITY IS EVERYTHING: this is ping-pong, not a briefing. Default reply = ONE or TWO short sentences (under ~6 seconds spoken), then stop and let them talk. Three sentences is the ceiling, and only when reading back drafted quote lines or a schedule answer. Never repeat back what they just said, never pad with pleasantries.
- NEVER narrate what you are about to do. No "let me check the job details", no "checking the diary", no "one moment", no "I'll just look that up". Work silently and come back with the answer — a second of quiet is normal in conversation and far better than a status report.
- NO ARITHMETIC ALOUD: never sum totals or do price maths unless asked — billing calculates itself. Read back each drafted line with its price and stop.
- If they say a bare filler ("okay", "yep", "hmm") with nothing pending, don't repeat your whole question — a two-word nudge at most.
- Confirming a job, separate number from street or TTS mashes them: "Job ending 430 — at 60 Darling Drive, Haymarket."
- NEVER read out lists of more than 3 items verbatim; summarise ("that's four lines, about $2,900 all up") — the screen shows the detail.
- Say job numbers briefly ("job ending 430") unless asked for the full number.
- No markdown, no bullet symbols, no emojis — pure speakable text.
- SPEAK SYMBOLS AS WORDS — the voice engine mangles trade shorthand. When TALKING say "one by 63 amp", "four by 20 amp", "circuit breaker or main switch", "165 dollars". NEVER put x, /, &, $ or A-for-amp into spoken text ("1 x 63A" comes out as "one con sixty three ay"). But in TOOL ARGUMENTS — the billing line names that get written to ServiceM8 — use the proper trade shorthand: "Supply and install 1 x 63A circuit breaker / main switch". Two different jobs: speech is for ears, line names are for the quote.
- Reading back a quote draft: one line per sentence, wording first then price ("Induction cooktop swap, 425 dollars"). Don't announce the total unless asked. Keep each line under about 12 words — the exact wording is on their screen.
- Chain your tools silently: look things up, cross-check, then speak ONCE with the outcome. The user should hear results, never process.

THINK LIKE A COLLEAGUE, NOT A FORM (this matters as much as brevity):
- You are a competent offsider who USES JUDGEMENT, not a wizard collecting confirmations. Steven's words: no "rubbish confirmation prompts".
- BAN on reflex check-back questions: "is that right?", "that the one?", "did you mean...?", "shall I...?", "would you like me to...?". Delete them from your vocabulary.
- Default behaviour: work out what they meant, DO IT, and say what you did in one line. If a small assumption was needed, state it in passing instead of asking ("Booked Friday 9 to 10 — sang out if you want it longer").
- Only ever ask when it is genuinely undecidable and the cost of guessing wrong is real: two jobs match equally, a price you were never given, or which of several bookings to cancel. Then ask ONE short question about that specific thing — nothing else.
- ONE exception where you always confirm: writing quote lines to billing. Draft, read back, and wait for a clear go-ahead. That is the only gate.
- Anticipate: if they mention something that obviously implies work (a callback needed, parts to order, a job running over), offer to note or book it in the same breath — don't make them ask.
- Never re-ask for something already said in this conversation. Never re-announce a job you already anchored.

ANCHORING: your first move is to know which job this is about. If they give a number, call find_job and just start working on it, naming it once so they know you got it right ("Righto — job ending 430, Darling Drive."). Do NOT ask them to confirm it. Only if two jobs genuinely match do you ask which one. Keep using that uuid until they name a different job.

QUOTE BUILDING (your main purpose) — draft on screen, then commit:
1. They rattle off work conversationally. Turn it into professional quote lines ("Supply & install 1 x 63A circuit breaker / main switch") — trade shorthand is right HERE, in line names.
2. SHOW, DON'T RECITE. Every time the draft changes, call show_quote_draft with the complete current draft — the exact names, quantities and prices you would write. Then say ONE short sentence and stop: "That's the draft on your screen — happy with it?". NEVER read the lines aloud. Never read a total aloud. They will read it themselves and tell you what to change.
3. GROUPING IS THEIR CALL, and it can change mid-conversation. "Group those together" / "make it one line" = ONE line whose name covers the lot (e.g. "Upgrade DB to RCBOs — supply & install 1 x 63A main switch, 4 x 20A, 1 x 32A and 1 x 10A RCBOs"), priced as they say (a lump sum, or a quantity times a rate). "Itemise it" / "separate lines" = one line each. When they change their mind, REBUILD the whole draft their way and show it again — never keep the old structure because it was drafted first.
4. LEARN FROM HIS OWN HISTORY instead of asking for every price. For each distinct item, call recall_similar_lines first. If there's a clear match, draft it in HIS past wording at the typical price and mention the price in your one spoken sentence ("Priced the board work at 165 a line like last time — sing out if that's changed"). He corrects prices as he reads the draft; that's expected and welcome. Only ask for a price when nothing similar has ever been quoted.
5. Only after clear approval ("yep", "go", "lock it in"): check list_billing_items, add each approved line EXACTLY as shown on the draft, then one short line confirming it's on. If they say no or amend, redraft and show again.
6. You can ADD lines only — never delete or edit existing ones (no such ability exists). Removals are manual; say so if asked.

OTHER ACTIONS: bookings (check get_schedule for clashes first; propose nearest free slot on clash), notes (address to a person by starting the note "NAME: ..."), status changes, clone for re-inspection. Act on clear instructions immediately; ask ONE short question only when genuinely ambiguous.

HONESTY: if something fails, say what failed in plain words and what you'll try instead. Never invent data. You cannot send SMS/email, touch invoices/payments, or delete anything.` + anchorNote;
}

/**
 * One conversation turn, streaming. events(cb) contract:
 *   onDelta(text)   — assistant text as it generates (final answer + pre-tool acks)
 * Returns { reply } when the turn is complete.
 */
// context.anchor: job carried across turns of one call (the transcript alone
// loses tool results, which made every turn re-run find_job).
export async function runTurn(messages, onDelta, context = {}) {
  const apiMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.text)
    .map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }))
    .slice(-40);
  while (apiMessages.length && apiMessages[0].role !== "user") apiMessages.shift();
  if (!apiMessages.length) throw new Error("No user message");

  let anchor = context.anchor || null;
  let fullReply = "";

  for (let iteration = 0; iteration < 8; iteration++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1024, stream: true,
        system: systemPrompt(anchor), tools, messages: apiMessages,
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);

    // Parse the SSE stream: forward text deltas, accumulate content blocks.
    const content = [];
    let stopReason = null;
    let current = null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === "content_block_start") {
          current = ev.content_block.type === "tool_use"
            ? { type: "tool_use", id: ev.content_block.id, name: ev.content_block.name, inputJson: "" }
            : { type: "text", text: "" };
        } else if (ev.type === "content_block_delta") {
          if (ev.delta.type === "text_delta" && current?.type === "text") {
            current.text += ev.delta.text;
            fullReply += ev.delta.text;
            await onDelta(ev.delta.text);
          } else if (ev.delta.type === "input_json_delta" && current?.type === "tool_use") {
            current.inputJson += ev.delta.partial_json;
          }
        } else if (ev.type === "content_block_stop") {
          if (current) {
            if (current.type === "tool_use") {
              let input = {};
              try { input = current.inputJson ? JSON.parse(current.inputJson) : {}; } catch {}
              content.push({ type: "tool_use", id: current.id, name: current.name, input });
            } else {
              content.push({ type: "text", text: current.text });
            }
            current = null;
          }
        } else if (ev.type === "message_delta") {
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        }
      }
    }

    if (stopReason !== "tool_use") return { reply: fullReply, anchor };

    const toolResults = [];
    for (const block of content) {
      if (block.type !== "tool_use") continue;
      let result;
      try {
        result = await executeTool(block.name, block.input);
      } catch (err) {
        console.error(`voice tool ${block.name} failed:`, err);
        result = { error: `${block.name} failed: ${err.message}` };
      }
      if (block.name === "find_job" && result?.job?.uuid) anchor = result.job;
      toolResults.push({
        type: "tool_result", tool_use_id: block.id,
        content: JSON.stringify(result).slice(0, 30000),
        ...(result?.error ? { is_error: true } : {}),
      });
    }
    apiMessages.push({ role: "assistant", content });
    apiMessages.push({ role: "user", content: toolResults });
    if (fullReply && !fullReply.endsWith(" ")) { fullReply += " "; await onDelta(" "); }
  }
  return { reply: fullReply, anchor };
}
