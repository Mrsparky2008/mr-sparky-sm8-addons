// AI Assist Voice — the brain. Ported from the job-card add-on's handlers/assist.mjs,
// adapted for the STANDALONE app: auth is the stored ServiceM8 API key (env SM8_API_KEY,
// tech account), a job is anchored conversationally via find_job (no job-card context),
// and replies are written to be SPOKEN (short, one thought at a time).
//
// Streaming: callers pass onDelta(text) — final-answer text streams out as it's generated
// so TTS can start speaking the first sentence while the rest composes.

import { readFileSync } from "node:fs";

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
    name: "remember",
    description:
      "Save something worth knowing next time — you forget everything else when the call ends. " +
      "Use it WITHOUT being asked whenever Steven states how he wants things done ('always word " +
      "it like this'), corrects you, changes a price, or decides something about a job that " +
      "matters later ('customer wants Friday', 'Marites is ordering the parts'). Keep each one " +
      "short and factual. Don't announce that you saved it.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The thing to remember, in one sentence" },
        job_number: {
          type: "string",
          description: "Job number if it only matters for that job; leave out for a general preference",
        },
      },
      required: ["fact"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_standard",
    description:
      "Look up what an Australian electrical standard actually says. Use this for ANY question " +
      "about the Wiring Rules, cable selection, testing, service rules or compliance — never " +
      "answer such a question from your own knowledge. Search by plain description " +
      "('minimum depth for underground cable', 'RCD requirements for socket outlets') or fetch a " +
      "clause by number. Returns clauses verbatim with their number, edition and whether that " +
      "edition is still current.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What they want to know, in plain words" },
        clause: { type: "string", description: "A specific clause number, e.g. 2.6.2 or 3.11.4.4" },
        standard: { type: "string", description: "Optional: narrow to one standard, e.g. '3000' or 'NSW'" },
      },
    },
  },
  {
    name: "search_jobs",
    description:
      "Find a job WITHOUT its number — by address, suburb, customer name, or what the work is. " +
      "Use this whenever they describe a job instead of naming a number ('the Haymarket one', " +
      "'Taku's job', 'that switchboard job in Earlwood'). Returns the best matches, newest first.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Address, suburb, customer name, or keywords about the work" },
        status: {
          type: "string",
          description: "Optional filter: Quote, Work Order, Completed, Unsuccessful",
        },
      },
      required: ["query"],
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

// ---- memory: things worth carrying between conversations. Two kinds:
//   pref#          — how Steven likes things done, prices that have changed, people
//   job#<number>   — what was decided on a specific job
// Preferences ride in every system prompt; job memories load with the job.
const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = await import("@aws-sdk/lib-dynamodb");
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const MEM_TABLE = "mr-sparky-ai-memory";

async function memWrite(pk, text, extra = {}) {
  const sk = new Date().toISOString();
  await ddb.send(new PutCommand({ TableName: MEM_TABLE, Item: { pk, sk, text, ...extra } }));
  return sk;
}
async function memRead(pk, limit = 25) {
  try {
    const r = await ddb.send(new QueryCommand({
      TableName: MEM_TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": pk },
      ScanIndexForward: false,
      Limit: limit,
    }));
    return (r.Items || []).map((i) => ({ when: String(i.sk).slice(0, 10), text: i.text }));
  } catch (err) {
    console.error("memory read failed:", err.message);
    return [];
  }
}
let prefCache = { at: 0, items: [] };
async function preferences() {
  if (Date.now() - prefCache.at < 60 * 1000) return prefCache.items;
  prefCache = { at: Date.now(), items: await memRead("pref#", 30) };
  return prefCache.items;
}

// ---- job index: address / customer / work keywords -> job, so a job can be
// found the way people actually refer to it, not just by number.
// Voice mangles proper nouns badly ("Mortlake" -> "Morelake" / "Moj Lake" /
// "Mote like"), so matching has to be fuzzy or the assistant looks like an idiot
// asking people to spell their own suburbs.
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}
// How well a heard word matches a known one: 1 exact, less as it drifts.
function fuzzyScore(heard, known) {
  if (heard === known) return 1;
  if (known.startsWith(heard) || heard.startsWith(known)) return 0.8;
  const d = editDistance(heard, known);
  const tolerance = heard.length >= 7 ? 3 : heard.length >= 5 ? 2 : 1;
  return d <= tolerance ? 0.9 - d * 0.2 : 0;
}


// The standards library ships INSIDE the deployment zip rather than sitting in
// S3: it is 1.5 MB, it changes only when a standard is replaced, and reading it
// from S3 would put a network round trip on the critical path of a question
// that is already the slowest thing Charlie does. Parsed once per container.
let standardsCache = null;
function standardsLibrary() {
  if (standardsCache) return standardsCache;
  try {
    const raw = readFileSync(new URL("./standards.json", import.meta.url), "utf8");
    const doc = JSON.parse(raw);
    standardsCache = { documents: doc.documents || {}, clauses: doc.clauses || [] };
    console.log(`voice: standards library loaded — ${standardsCache.clauses.length} clauses`);
  } catch (err) {
    console.error("standards library failed to load:", err.message);
    standardsCache = { documents: {}, clauses: [] };
  }
  return standardsCache;
}

let jobCache = { at: 0, jobs: [] };
let indexInflight = null;

// ServiceM8 cannot search jobs by description, so we download every job and
// every contact and search them ourselves. That download is expensive — ~1,800
// jobs plus contacts — and it used to sit ON THE CRITICAL PATH: the cache
// expired after 10 minutes and whoever asked the next question paid for the
// rebuild while standing there waiting. Steven wore it mid-conversation on
// 14 Aug; the log line "job index built — 1671 jobs" is stamped between his
// question and the answer.
//
// Now: serve what we have and refresh behind it. FRESH is served outright,
// USABLE is served immediately with a rebuild kicked off in the background,
// and only a genuinely cold or ancient index makes anyone wait.
const INDEX_FRESH_MS = 10 * 60 * 1000;      // serve, don't even think about it
const INDEX_USABLE_MS = 6 * 60 * 60 * 1000; // serve stale, refresh behind it

// Honest caveat: Lambda freezes the container once a response is returned, so
// a background rebuild may not finish on this invocation. It resumes when the
// container is next used, which is exactly when it is wanted. Worst case the
// index stays stale a little longer — and searchJobs forces a rebuild when a
// search comes back empty, so a brand-new job is never permanently invisible.
async function buildJobIndex() {
  const [jobsRes, contactsRes] = await Promise.all([
    sm8("GET", "/job.json"),
    sm8("GET", "/jobcontact.json"),
  ]);
  if (jobsRes.status !== 200) return jobCache.jobs;
  const contactByJob = new Map();
  for (const c of toArray(contactsRes.body)) {
    if (String(c.active) !== "1" && c.active !== 1) continue;
    const nm = `${c.first || ""} ${c.last || ""}`.trim();
    if (!nm || contactByJob.has(c.job_uuid)) continue;
    contactByJob.set(c.job_uuid, nm);
  }
  const jobs = [];
  for (const j of toArray(jobsRes.body)) {
    if (String(j.active) !== "1" && j.active !== 1) continue;
    const address = String(j.job_address || "").replace(/\s+/g, " ").trim();
    const description = String(j.job_description || "").replace(/\s+/g, " ").trim();
    const contact = contactByJob.get(j.uuid) || "";
    // The job NUMBER belongs in the searchable text. It was left out, so typing
    // a job number into the app's search fuzzy-matched those digits against
    // street names and work descriptions, scored nothing, and answered "did you
    // mean Mortlake?" — for a job that was sitting right there. Found on 167590.
    const num = String(j.generated_job_id || "");
    const haystack = `${num} ${address} ${contact} ${description}`.toLowerCase();
    jobs.push({
      uuid: j.uuid,
      number: j.generated_job_id,
      status: j.status,
      address, contact, description, haystack,
      tokens: new Set(tokens(`${num} ${address} ${contact} ${description}`)),
    });
  }
  jobCache = { at: Date.now(), jobs };
  console.log(`voice: job index built — ${jobs.length} jobs`);
  return jobs;
}

/** Kick a rebuild, at most one at a time. Callers may or may not await it. */
function refreshIndex() {
  if (!indexInflight) {
    indexInflight = buildJobIndex()
      .catch((err) => { console.error("job index refresh failed:", err.message); return jobCache.jobs; })
      .finally(() => { indexInflight = null; });
  }
  return indexInflight;
}

export async function jobIndex() {
  const age = Date.now() - jobCache.at;
  const have = jobCache.jobs.length > 0;
  if (have && age < INDEX_FRESH_MS) return jobCache.jobs;
  if (have && age < INDEX_USABLE_MS) {
    refreshIndex();          // deliberately not awaited — nobody waits for this
    return jobCache.jobs;
  }
  return refreshIndex();     // cold or ancient: this one has to be waited for
}

/** Force a rebuild and wait. Used when a search finds nothing on a stale index. */
export function rebuildJobIndex() {
  jobCache = { at: 0, jobs: jobCache.jobs };
  return refreshIndex();
}

const WRITE_TOOLS = new Set([
  "book_job", "reschedule_booking", "cancel_booking", "add_note",
  "update_job_description", "update_job_status", "add_billing_item", "clone_job",
]);

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

export async function executeTool(name, input) {
  const jobU = String(input.job_uuid || "").trim();

  if (name === "find_job") {
    const num = String(input.job_number || "").replace(/\D/g, "");
    if (!num) return { error: "No job number given" };
    const r = await sm8("GET", `/job.json?%24filter=generated_job_id%20eq%20'${num}'`);
    const hits = toArray(r.body).filter((j) => String(j.active) === "1" || j.active === 1);
    if (!hits.length) return { error: `No job found with number ${num}` };
    const j = hits[0];
    const remembered = await memRead(`job#${num}`, 8);
    return {
      job: {
        uuid: j.uuid, job_number: j.generated_job_id, status: j.status,
        address: j.job_address, description: String(j.job_description || "").slice(0, 800),
      },
      ...(remembered.length ? { remembered } : {}),
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
      // No length cap, matching the portal's writer: truncating silently
      // cost real quote wording, and ServiceM8 has no limit to respect.
      job_uuid: jobU, name: String(input.name || ""),
      quantity: qty.toFixed(2), price: price.toFixed(2), displayed_amount: price.toFixed(2), active: 1,
    });
    if (r.status < 200 || r.status >= 300) {
      console.log(`voice: add_billing_item REJECTED ${r.status}: ${r.raw?.slice(0, 300)}`);
      return { error: `Add line failed: ${r.status} ${r.raw?.slice(0, 150)}` };
    }
    return { ok: true };
  }

  if (name === "remember") {
    const fact = String(input.fact || "").trim().slice(0, 500);
    if (!fact) return { error: "Nothing to remember" };
    const num = String(input.job_number || "").replace(/\D/g, "");
    try {
      await memWrite(num ? `job#${num}` : "pref#", fact);
      if (!num) prefCache = { at: 0, items: [] };
      return { ok: true };
    } catch (err) {
      console.error("memory write failed:", err.message);
      return { error: "Couldn't save that" };
    }
  }

  // ---------------------------------------------------------------------
  // STANDARDS
  //
  // The whole point of this tool is that Charlie QUOTES rather than
  // paraphrases. A wrong job number is annoying; a wrong cable size is a
  // fire. So it returns the clause verbatim with its number, edition and
  // currency, and the prompt forbids answering without one.
  //
  // Two-stage on purpose: a keyword pass narrows ~1,900 clauses to a
  // shortlist, then the model reads the shortlist and picks. Scoring the
  // TITLE harder than the body matters — "underground depth" should surface
  // "Minimum depth of cover", not every clause that mentions underground.
  // ---------------------------------------------------------------------
  if (name === "lookup_standard") {
    const lib = standardsLibrary();
    if (!lib.clauses.length) return { error: "The standards library isn't loaded." };

    const wantClause = String(input.clause || "").trim();
    const wantStd = String(input.standard || "").toLowerCase().trim();
    const pool = wantStd
      ? lib.clauses.filter((c) => c.std.toLowerCase().includes(wantStd))
      : lib.clauses;

    const dress = (c) => ({
      standard: c.std, edition: c.ed, clause: c.cl, title: c.t, page: c.p,
      currency: c.st, text: c.x,
      currency_note: (lib.documents[c.std] || {}).detail || "",
    });

    // Asked for a clause by number: give that clause AND its children, which
    // is what "what does 2.6.2 say" actually means when 2.6.2 is a parent
    // whose whole body is its sub-clauses.
    if (wantClause) {
      const exact = pool.filter((c) => c.cl === wantClause);
      const kids = pool.filter((c) => c.cl.startsWith(wantClause + "."));
      const hits = [...exact, ...kids].slice(0, 12);
      if (hits.length) return { results: hits.map(dress) };
      return { error: `No clause ${wantClause} in the library.` };
    }

    const terms = tokens(input.query || "").filter((t) => t.length > 2);
    if (!terms.length) return { error: "Nothing to look up" };
    const scored = [];
    for (const c of pool) {
      const title = c.t.toLowerCase();
      const body = c.x.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        if (body.includes(t)) score += 1;
      }
      if (score > 0) scored.push({ c, score });
    }
    scored.sort((a, b) => b.score - a.score || a.c.cl.localeCompare(b.c.cl));
    const results = scored.slice(0, 12).map((h) => dress(h.c));
    if (!results.length) {
      return { results: [], nothing_found: true,
               have: Object.entries(lib.documents).map(([k, v]) => k + " (" + v.status + ")") };
    }
    return { results };
  }

  if (name === "search_jobs") {
    const index = await jobIndex();
    const q = tokens(input.query);
    const rawQ = String(input.query || "").toLowerCase();
    if (!q.length) return { error: "Nothing to search for" };

    // A number typed on its own is a job number, not a word to fuzzy-match.
    // Exact first, then the tail ("ending 590"), because that is how everyone
    // actually says them. Fuzzy scoring on digits is meaningless — every job
    // number in the account is six digits and within an edit or two of the next.
    const digits = rawQ.replace(/\D/g, "");
    if (digits && /^\d+$/.test(rawQ.trim())) {
      const exact = index.filter((j) => String(j.number) === digits);
      const tail = exact.length ? [] : index.filter((j) => String(j.number).endsWith(digits));
      const hits = (exact.length ? exact : tail)
        .sort((a, b) => Number(b.number) - Number(a.number))
        .slice(0, 6);
      if (hits.length) {
        return {
          matches: hits.map((j) => ({
            job_uuid: j.uuid, job_number: j.number, status: j.status,
            address: j.address, contact: j.contact || undefined,
            work: j.description ? j.description.slice(0, 90) : undefined,
          })),
        };
      }
    }
    // Also try adjacent words glued together — "Moj Lake" is one word misheard.
    const terms = [...q];
    for (let i = 0; i < q.length - 1; i++) terms.push(q[i] + q[i + 1]);
    const wantStatus = String(input.status || "").toLowerCase();
    const scored = [];
    for (const j of index) {
      if (wantStatus && (j.status || "").toLowerCase() !== wantStatus) continue;
      // Each query word scores its best fuzzy match anywhere in this job.
      let score = 0;
      for (const t of terms) {
        let best = 0;
        for (const w of j.tokens) {
          const s = fuzzyScore(t, w);
          if (s > best) best = s;
          if (best === 1) break;
        }
        score += best;
      }
      score /= q.length;
      if (j.haystack.includes(rawQ)) score += 0.5; // whole phrase, e.g. a street name
      if (score < 0.45) continue; // one solid fuzzy hit is enough to surface it
      scored.push({ j, score });
    }
    // Best match first; newer jobs win ties (job numbers climb over time).
    scored.sort((a, b) => b.score - a.score || Number(b.j.number) - Number(a.j.number));
    const matches = scored.slice(0, 6).map(({ j }) => ({
      job_uuid: j.uuid,
      job_number: j.number,
      status: j.status,
      address: j.address,
      contact: j.contact || undefined,
      work: j.description ? j.description.slice(0, 90) : undefined,
    }));
    // Before telling him it isn't there, make sure we didn't just search a
    // stale copy. A job booked this morning would be missing from an index
    // built before it existed, and a wrong "can't find it" sends him hunting
    // for a job number — the exact dead end this tool exists to avoid.
    if (!matches.length && !input._retried && Date.now() - jobCache.at > INDEX_FRESH_MS) {
      await rebuildJobIndex();
      return executeTool("search_jobs", { ...input, _retried: true });
    }
    if (!matches.length) {
      // Nothing matched: offer the closest real suburbs/streets we do have, so
      // the reply is "did you mean Mortlake?" instead of "spell it for me".
      const places = new Map();
      for (const j of index) {
        const m = /,?\s*([A-Za-z\s]+?)\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/.exec(j.address || "");
        const suburb = (m ? m[1] : "").trim().toLowerCase();
        if (suburb.length > 2) places.set(suburb, (places.get(suburb) || 0) + 1);
      }
      const near = [];
      for (const t of terms) {
        for (const [place] of places) {
          const s = fuzzyScore(t, place.replace(/\s+/g, ""));
          if (s >= 0.5) near.push({ place, s });
        }
      }
      near.sort((a, b) => b.s - a.s);
      const suggestions = [...new Set(near.map((n) => n.place))].slice(0, 3);
      return {
        matches: [],
        sounds_like: suggestions,
        note: suggestions.length
          ? "No exact match, but these real suburbs sound like what was heard. Offer the closest ONE as a question ('Mortlake?') — voice mangles place names, so assume mishearing rather than asking them to spell it."
          : "No match. Ask for the job number, or a street name.",
      };
    }
    return {
      matches,
      note: "If one is clearly the job they mean, just use it and name it once. Ask only when two are genuinely equal.",
    };
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

// Everything about the anchored job, fetched ONCE and carried in the prompt so
// the assistant answers from what it already knows instead of narrating lookups.
/**
 * Attach a file to a job so it shows in ServiceM8's own job diary.
 *
 * Two-step per SM8's docs: create the Attachment record (uuid comes back in
 * x-record-uuid), then POST the bytes as multipart to Attachment/{uuid}.file.
 * Used for receipt record-copies — the portal keeps the working copy that gets
 * reimbursed; this is the paper trail on the job card.
 */
export async function attachFileToJob({ job_uuid, name, fileType, bytes, contentType }) {
  const rec = await sm8("POST", "/attachment.json", {
    related_object: "job",
    related_object_uuid: job_uuid,
    attachment_name: String(name || "attachment").slice(0, 120),
    file_type: fileType || ".jpg",
    active: true,
  });
  if (rec.status < 200 || rec.status >= 300) {
    return { error: `Attachment record failed: ${rec.status}` };
  }
  const uuid = rec.headers.get("x-record-uuid");
  if (!uuid) return { error: "Attachment record came back without a uuid" };

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType || "image/jpeg" }), `upload${fileType || ".jpg"}`);
  const up = await fetch(`${SM8_BASE}/Attachment/${encodeURIComponent(uuid)}.file`, {
    method: "POST",
    headers: { "X-Api-Key": API_KEY, Accept: "application/json" },
    body: form,
  });
  if (!up.ok) return { error: `File upload failed: ${up.status}` };
  return { ok: true, attachment_uuid: uuid };
}

/**
 * Read a photographed supplier docket.
 *
 * Steven's spec (2026-08-06): "AI can read the receipt, fill in all the
 * details. If it doesn't have a job number, ask for it. If it has the wrong
 * job number, flag it."
 *
 * So this READS and it does not decide. It returns only what is legibly on the
 * paper, leaves anything it can't read out entirely rather than guessing, and
 * says which words a job number came from so the app can show its working. The
 * phone puts the values in editable fields and the human presses save — the
 * model never files anything by itself.
 *
 * Forced tool call rather than free prose: the shape comes back schema-clean,
 * so a chatty model can't turn "$182.60" into a sentence the app has to parse.
 */
const RECEIPT_TOOL = {
  name: "receipt",
  description: "Record what is legibly printed on this supplier receipt.",
  input_schema: {
    type: "object",
    properties: {
      supplier: { type: "string", description: "Trading name of the supplier, as printed. e.g. Middy's, Lawrence & Hanson, Bunnings." },
      amountIncGst: { type: "number", description: "The TOTAL amount payable including GST — the final total, not a subtotal, not the GST line." },
      date: { type: "string", description: "Date of the receipt as YYYY-MM-DD. Australian dockets are DAY first: 04/08/2026 is 4 August 2026." },
      invoiceNumber: { type: "string", description: "Invoice, docket or tax invoice number as printed." },
      abn: { type: "string", description: "The SUPPLIER's ABN — 11 digits, usually near their trading name at the top. NOT the customer's ABN: an account invoice made out to the buyer prints theirs too, and taking the wrong one is worse than taking none." },
      jobNumber: { type: "string", description: "A job/order/site reference ONLY if the docket explicitly labels one (Job, Order, PO, Ref, Site). Never infer it from an invoice or account number." },
      jobNumberLabel: { type: "string", description: "The exact printed words the job number was taken from, e.g. 'Order No: 4821'." },
      unreadable: { type: "boolean", description: "True if the photo is too blurred, cropped or dark to read the totals." },
    },
    required: [],
  },
};

export async function readReceipt({ imageB64, contentType = "image/jpeg" }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: "tool", name: "receipt" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: contentType, data: imageB64 } },
          {
            type: "text",
            text: [
              "This is a photo of a supplier receipt for an Australian electrical contractor.",
              "Record only what you can actually READ on the paper.",
              "Omit any field you cannot read — an omitted field is correct, a guessed one is a false record someone signs off on.",
              "The amount is the final total INCLUDING GST.",
              "The ABN is the SUPPLIER's — the business issuing the invoice, printed with their name and logo.",
              "If the docket is an account invoice addressed to a customer, that customer's ABN also appears; do not report that one.",
            ].join(" "),
          },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const call = (body.content || []).find((b) => b.type === "tool_use" && b.name === "receipt");
  const out = call?.input || {};

  // Tidy, never invent. Anything that doesn't survive these checks is dropped
  // so the field arrives empty and the human fills it in.
  const amount = Number(out.amountIncGst);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(out.date || "")) ? out.date : null;
  return {
    supplier: String(out.supplier || "").trim().slice(0, 80) || null,
    amountIncGst: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    date,
    invoiceNumber: String(out.invoiceNumber || "").trim().slice(0, 40) || null,
    // Eleven digits or nothing. The portal re-checks the mod-89 checksum and
    // drops anything that fails it, so a misread never becomes an identity.
    abn: (String(out.abn || "").replace(/[^0-9]/g, "").match(/^\d{11}$/) || [null])[0],
    jobNumber: (String(out.jobNumber || "").match(/\d{3,7}/) || [null])[0],
    jobNumberLabel: String(out.jobNumberLabel || "").trim().slice(0, 60) || null,
    unreadable: out.unreadable === true,
  };
}

/**
 * Put a real task on somebody's list.
 *
 * Steven, on being offered a note: "a note on SM8 is actually useless unless
 * it's addressed to someone... it would just sit there and the office wouldn't
 * notice it." He is right, and checking the data proved it twice over — the
 * three notes ever flagged action_required go back to October 2025 and not one
 * has been completed, and every job queue has an empty subscribed_staff.
 *
 * @mentions are not an option either. A note posted from the ServiceM8 app
 * stores "@marites" as plain characters with no staff uuid anywhere on the
 * record: the app parses the @ as you type and fires the notification itself.
 * Written through the API it would LOOK like a mention and notify nobody,
 * which is worse than saying nothing — it would look handled.
 *
 * A task carries assigned_to_staff_uuid, a due date, and task_complete. It
 * lands on a person and it can be seen to have been dealt with.
 */
export async function createTask({ job_uuid, name, details, assigneeName, dueDate }) {
  const staff = await getStaff().catch(() => []);
  const wanted = String(assigneeName || process.env.TASK_ASSIGNEE || "Marites").toLowerCase().trim();
  const hit = staff.find((x) => x.name.toLowerCase().includes(wanted))
    || staff.find((x) => wanted.includes(x.name.toLowerCase().split(" ")[0]));

  const r = await sm8("POST", "/task.json", {
    related_object: "job",
    related_object_uuid: job_uuid,
    name: String(name || "Task").slice(0, 120),
    task_details: String(details || "").slice(0, 2000),
    // Unassigned rather than assigned to the wrong person: a task on nobody's
    // list is visible on the job; a task on the wrong list is invisible AND
    // looks handled.
    assigned_to_staff_uuid: hit?.uuid || "",
    due_date: dueDate || tomorrowInTz(),
    active: true,
  });
  if (r.status < 200 || r.status >= 300) return { error: `Task failed: ${r.status}` };
  return { ok: true, task_uuid: r.headers.get("x-record-uuid"), assignedTo: hit?.name || null };
}

/** Due tomorrow, Sydney — a query raised on site is a next-morning job. */
function tomorrowInTz() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Active staff, for "who should look at this". */
export async function staffList() {
  return (await getStaff().catch(() => [])).map((s) => ({ uuid: s.uuid, name: s.name }));
}

export async function buildDossier(uuid) {
  const [j, contacts, notes, acts, mats, staff, atts] = await Promise.all([
    sm8("GET", `/job/${encodeURIComponent(uuid)}.json`),
    sm8("GET", "/jobcontact.json"),
    sm8("GET", `/note.json?%24filter=related_object_uuid%20eq%20'${encodeURIComponent(uuid)}'`),
    sm8("GET", "/jobactivity.json?%24filter=active%20eq%20'1'"),
    sm8("GET", `/jobmaterial.json?%24filter=job_uuid%20eq%20'${encodeURIComponent(uuid)}'`),
    getStaff().catch(() => []),
    sm8("GET", `/attachment.json?%24filter=related_object_uuid%20eq%20'${encodeURIComponent(uuid)}'`).catch(() => ({ body: [] })),
  ]);
  const job = j.body || {};
  return {
    status: job.status,
    description: String(job.job_description || "").slice(0, 700),
    contacts: toArray(contacts.body).filter((c) => c.job_uuid === uuid)
      .map((c) => `${c.type}: ${`${c.first || ""} ${c.last || ""}`.trim()}${c.mobile ? ` ${c.mobile}` : ""}`),
    // ServiceM8 keeps two different things in jobactivity, and showing both as
    // "bookings" is what put eight entries on job 167595 — one of them 32
    // seconds long. A SCHEDULED activity is a diary booking somebody made. A
    // RECORDED one is the job timer running while the app had the job open, so
    // they overlap, they stack up through a day, and they are not appointments.
    bookings: toArray(acts.body).filter((a) => a.job_uuid === uuid && Number(a.activity_was_scheduled) === 1)
      .map((a) => ({ activity_uuid: a.uuid, staff: staffName(staff, a.staff_uuid), start: a.start_date, end: a.end_date })),
    // Time actually clocked on the job. Summed here rather than on the phone,
    // and only where both ends exist — a timer still running has no duration
    // yet, and inventing one would overstate labour.
    timeOnSite: (() => {
      const rows = toArray(acts.body).filter((a) => a.job_uuid === uuid
        && Number(a.activity_was_recorded) === 1 && a.start_date && a.end_date);
      const minutes = rows.reduce((sum, a) => {
        const ms = new Date(String(a.end_date).replace(" ", "T")) - new Date(String(a.start_date).replace(" ", "T"));
        return sum + (ms > 0 ? ms / 60000 : 0);
      }, 0);
      return { entries: rows.length, minutes: Math.round(minutes) };
    })(),
    billing: toArray(mats.body).filter((m) => String(m.active) === "1" || m.active === 1)
      .map((m) => ({ name: m.name, qty: Number(m.quantity), price: Number(m.price) })),
    notes: toArray(notes.body).slice(-6).map((n) => String(n.note || "").replace(/\s+/g, " ").slice(0, 160)),
    // The FULL note history with who-and-when, newest first — the app's
    // diary matches ServiceM8's own now (Steven, 30 Aug 2026: "the diaries
    // don't match"). `notes` above stays as-is: it feeds the LLM prompt.
    noteFeed: toArray(notes.body)
      .map((n) => ({
        note: String(n.note || "").slice(0, 1200),
        when: n.create_date || n.edit_date || "",
        by: staffName(staff, n.created_by_staff_uuid || n.create_by_staff_uuid) || "",
      }))
      .sort((a, b) => String(b.when).localeCompare(String(a.when))),
    // Every active attachment: photos render as thumbnails through
    // GET /api/attachment/<uuid>, PDFs (quotes, forms) list by name.
    attachments: toArray(atts.body)
      .filter((a) => String(a.active) === "1" || a.active === 1)
      .map((a) => {
        const type = String(a.file_type || "").toLowerCase();
        return {
          uuid: a.uuid,
          name: a.attachment_name || "",
          type,
          photo: /jpe?g|png|heic|heif|gif|webp/.test(type),
          when: a.timestamp || a.edit_date || "",
          by: staffName(staff, a.created_by_staff_uuid) || "",
        };
      })
      .sort((a, b) => String(b.when).localeCompare(String(a.when))),
  };
}

/** The raw bytes of one SM8 attachment, for the app to render. */
export async function fetchAttachmentFile(uuid) {
  const res = await fetch(`${SM8_BASE}/attachment/${encodeURIComponent(uuid)}.file`, {
    headers: { "X-Api-Key": API_KEY },
  });
  if (!res.ok) return null;
  return {
    buf: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") || "application/octet-stream",
  };
}

function systemPrompt(anchor, prefs = []) {
  const prefNote = prefs.length
    ? `\n\nWHAT YOU'VE LEARNED FROM STEVEN (carry these into everything you do — don't recite them back):\n${prefs.map((p) => `- ${p.text}`).join("\n")}`
    : "";
  const d = anchor?.dossier;
  const anchorNote = anchor && anchor.uuid
    ? `\n\nTHE JOB YOU'RE ON — job ${anchor.job_number}, ${anchor.address}, uuid ${anchor.uuid}. Don't re-find it, don't re-announce it.${
        d ? `
YOU ALREADY KNOW ALL OF THIS — answer straight from it. Do NOT call a tool to look up anything listed here, and never say you're checking:
- Status: ${d.status || "unknown"}
- Contacts: ${d.contacts?.length ? d.contacts.join("; ") : "none on the card"}
- Work: ${d.description || "(no description)"}
- Bookings: ${d.bookings?.length ? d.bookings.map((b) => `${b.staff} ${b.start}${b.end ? " to " + b.end : ""} [${b.activity_uuid}]`).join("; ") : "none"}
- Billing already on the job: ${d.billing?.length ? d.billing.map((b) => `${b.qty} x $${b.price} ${b.name}`).join("; ") : "nothing yet"}
- Recent notes: ${d.notes?.length ? d.notes.join(" | ") : "none"}
This snapshot is current as of this moment in the call, and it updates itself after anything you change. Use tools ONLY to CHANGE something, or for things genuinely not listed above (the wider diary, other jobs, quoting history).` : ""
      }`
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
- ASSUME MISHEARING, NOT MYSTERY. Voice transcription mangles names, suburbs and numbers constantly ("Mortlake" arrives as "Morelake", "Moj Lake", "Mote like"). When a search comes back empty, do NOT ask them to spell it or "check the suburb" — that's the dumbest thing you can do. Use the sounds_like suggestions and offer the closest real one as a quick question ("Mortlake?"), or search again with your own best guess at what they actually said. Only after two failed attempts ask for the job number.
- IGNORE NOISE: filler like "mhmm", "uh huh", coughs, or a stream of repeated syllables is the microphone picking up room noise, not an instruction. Say nothing and keep waiting.

ONE THOUGHT IN, ONE ANSWER OUT — half a sentence is not a question:
- The listener sometimes decides he's finished when he has only paused for breath, so a single thought can reach you split across two, three or four turns. Answering the first piece while he's still talking is the single most annoying thing you can do. Don't.
- BEFORE REPLYING, ASK YOURSELF: is this a complete thought? A turn that trails off, ends mid-clause, ends on a joining word ("and", "so", "but", "with", "then", "because"), names a thing without saying what about it ("the switchboard one"), or asks nothing and instructs nothing — that is an unfinished sentence, not a request. Say NOTHING and wait for the rest. The next turn will almost always complete it.
- When the rest arrives, READ THE PIECES AS ONE SENTENCE and answer once. Never answer each fragment separately — that is how you end up holding two half-conversations at the same time.
- THE LATEST WORDS WIN. If something he says contradicts, corrects or narrows what came a moment ago ("no, not that one", "actually make it four", "sorry, Earlwood not Ryde"), the new version replaces the old one completely. Don't point out that he changed his mind, don't ask which he meant, don't average the two, and never act on the version he just replaced. Just carry on with the corrected one.
- If you have ALREADY started acting on a fragment and he keeps talking, treat what you did as a draft, not a commitment. Fold the rest in and answer once at the end.
- The one exception is a genuine emergency of brevity: a bare "stop" or "hang on" is complete, and means stop talking.

ELECTRICAL STANDARDS — QUOTE, NEVER PARAPHRASE:
- You have a library of Australian standards. For ANY question about the Wiring Rules, cable sizing, testing, depths, clearances, RCDs, service rules or compliance, you call lookup_standard. You do NOT answer from your own knowledge, ever, not even when you are sure. A wrong job number is a nuisance; a wrong cable size or depth of cover is a fire or a fatality.
- NEVER state a requirement without the clause number it came from. "Clause 3.11.4.4 says..." — if you cannot name the clause, you do not have the answer.
- NEVER paraphrase a NUMBER. Sizes, ratings, depths, clearances, times, percentages get quoted word for word from the clause text or not given at all. Rewording prose is fine; rewording a measurement is not.
- ALWAYS say which edition, and say it plainly when that edition is superseded: "that's clause 3.11.4.4 of the 2018 base issue — Amendments 1 to 3 aren't in my copy, so check it against a current one." The currency field on every result tells you. Never let a superseded quote pass as current.
- If the lookup finds nothing useful: "Not in what I've got — you'll want to check the book." Never fill the gap with what you think it probably says. Offer to search different words instead.
- CONVERSATION FIRST, THEN THE CLAUSE. Standards questions arrive vague ("what's the go with underground cable?"). Talk it out — depth? mechanical protection? which category? — until you know what they actually need, THEN look it up. One precise clause beats six vaguely related ones.
- Reading a clause aloud in full is usually wrong: say the gist in one sentence, name the clause, and let them read the exact words on screen. Read the exact wording out only if they ask you to.
- You are finding the clause, not interpreting it. If they ask what it means for their situation, give them the clause and say plainly that the call is theirs.

SAY THE JOB ONCE. ONCE.
- The commonest thing you get wrong is announcing a job, asking "that the one?", getting a yes, and then announcing the SAME job all over again before asking what they need. Steven heard it twice in one night and it makes you sound like you weren't listening. Read this transcript and never do it:
    YOU: "Job ending 6 10. Switchboard upgrade at 221 Dennison Street, Newtown. That the 1?"
    HIM: "Yeah."
    YOU: "Job ending 6 10 switchboard upgrade at 221 Dennison Street, Newtown for Troy. What do you need on it?"   <- BANNED. He just said yes.
- When one job clearly matches: name it ONCE, in the same breath as getting on with it. No confirmation question.
- When two or more genuinely match: name only what TELLS THEM APART ("Dennison Street or Sussex Street?"), never the full details of each.
- After ANY yes, nod and move: "Righto — what do you need?". Not one word of the job repeated. They know which job it is; they just told you.
- Same rule for the rest of the call: address, contact and description get said once, when you anchor. After that it is "the job" or "job ending 610".

ANCHORING: your first move is to know which job this is about. If they DESCRIBE it instead of numbering it ("the Haymarket one", "Taku's job", "that switchboard job in Earlwood"), call search_jobs — never make them dig out a number. If they give a number, call find_job and just start working on it, naming it once so they know you got it right ("Righto — job ending 430, Darling Drive."). Do NOT ask them to confirm it. Only if two jobs genuinely match do you ask which one. Keep using that uuid until they name a different job.

QUOTE BUILDING (your main purpose) — draft on screen, then commit:
1. They rattle off work conversationally. Turn it into professional quote lines ("Supply & install 1 x 63A circuit breaker / main switch") — trade shorthand is right HERE, in line names.
2. SHOW, DON'T RECITE. Every time the draft changes, call show_quote_draft with the complete current draft — the exact names, quantities and prices you would write. Then say ONE short sentence and stop: "That's the draft on your screen — happy with it?". NEVER read the lines aloud. Never read a total aloud. They will read it themselves and tell you what to change.
3. GROUPING IS THEIR CALL, and it can change mid-conversation. "Group those together" / "make it one line" = ONE line whose name covers the lot (e.g. "Upgrade DB to RCBOs — supply & install 1 x 63A main switch, 4 x 20A, 1 x 32A and 1 x 10A RCBOs"), priced as they say (a lump sum, or a quantity times a rate). "Itemise it" / "separate lines" = one line each. When they change their mind, REBUILD the whole draft their way and show it again — never keep the old structure because it was drafted first.
4. LEARN FROM HIS OWN HISTORY instead of asking for every price. For each distinct item, call recall_similar_lines first. If there's a clear match, draft it in HIS past wording at the typical price and mention the price in your one spoken sentence ("Priced the board work at 165 a line like last time — sing out if that's changed"). He corrects prices as he reads the draft; that's expected and welcome. Only ask for a price when nothing similar has ever been quoted.
5. Only after clear approval ("yep", "go", "lock it in"): check list_billing_items, add each approved line EXACTLY as shown on the draft, then one short line confirming it's on. If they say no or amend, redraft and show again.
6. You can ADD lines only — never delete or edit existing ones (no such ability exists). Removals are manual; say so if asked.

OTHER ACTIONS: bookings (check get_schedule for clashes first; propose nearest free slot on clash), notes (address to a person by starting the note "NAME: ..."), status changes, clone for re-inspection. Act on clear instructions immediately; ask ONE short question only when genuinely ambiguous.

MEMORY: you keep notes between conversations. Save anything that would help next time with the remember tool — a preference, a price change, a decision about a job — quietly, without saying you did. Anything already remembered about a job comes back with it; use it naturally ("last time you said Taku wants a call Tuesday") rather than reciting it.

HONESTY: if something fails, say what failed in plain words and what you'll try instead. Never invent data. You cannot send SMS/email, touch invoices/payments, or delete anything.` + anchorNote + prefNote;
}

/**
 * One conversation turn, streaming. events(cb) contract:
 *   onDelta(text)   — assistant text as it generates (final answer + pre-tool acks)
 * Returns { reply } when the turn is complete.
 */
// context.anchor: job carried across turns of one call (the transcript alone
// loses tool results, which made every turn re-run find_job).
// Spoken while the tools run. Short, varied so it does not become a tic, and
// deliberately the kind of thing a mate says over his shoulder — not a status
// report. "NEVER narrate what you are about to do" still holds for the model;
// this is different, it is filling a five-second silence he cannot avoid.
const HOLD_LINES = [
  "Hang on, pulling it up.",
  "Righto, gimme a sec.",
  "Two ticks.",
  "Let me have a look.",
  "Onto it.",
];
let holdTurn = 0;

export async function runTurn(messages, onDelta, context = {}) {
  let saidHold = false;
  const apiMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.text)
    .map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }))
    .slice(-40);
  while (apiMessages.length && apiMessages[0].role !== "user") apiMessages.shift();
  if (!apiMessages.length) throw new Error("No user message");

  // One conversation, two mouths: when a voice call starts after a dictation
  // exchange (or vice versa via /chat's full history), the other channel's
  // recent turns arrive as a recap. It rides ahead of the first user message
  // so the model treats it as the same conversation, because it is.
  if (context.recap) {
    apiMessages.unshift(
      { role: "user", content: `(Recap of this same conversation so far, from the other input mode — text/voice. Continue it; do not re-introduce yourself or re-ask what's answered here.)\n${String(context.recap).slice(0, 2000)}` },
      { role: "assistant", content: "Got it — same conversation, continuing." },
    );
  }

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
        system: systemPrompt(anchor, await preferences()), tools, messages: apiMessages,
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
            } else if (current.text.trim()) {
              // Empty text blocks are rejected outright by newer models.
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

    // Say something before disappearing to do the work.
    //
    // A ServiceM8 lookup plus another Claude pass is five to eight seconds, and
    // until now that was pure silence — Steven's "the gap from finishing to
    // Charlie responding is long". We cannot make the lookup fast, but dead air
    // is a different complaint from slow, and this fixes the dead air: the
    // words stream out and get spoken WHILE the tools run underneath.
    //
    // Only on the FIRST round, only when he has not already said something
    // this turn, and never before an instant tool — nobody needs "hang on"
    // before an answer that was already on screen.
    if (!saidHold && !fullReply.trim()) {
      const instant = new Set(["show_quote_draft", "remember"]);
      const slow = content.some((b) => b.type === "tool_use" && !instant.has(b.name));
      if (slow) {
        saidHold = true;
        const line = HOLD_LINES[holdTurn++ % HOLD_LINES.length];
        fullReply += line;
        if (onDelta) onDelta(line);
      }
    }

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
      // The quote draft is RENDERED, not spoken. Vapi carries the tool call
      // to the app itself; the /chat route (dictation) has no such channel,
      // so the caller gets a hook — without it Charlie says "that's on your
      // screen" about a screen that never received anything.
      if (block.name === "show_quote_draft" && context.onDraft) {
        try { await context.onDraft(Array.isArray(block.input?.lines) ? block.input.lines : []); }
        catch (err) { console.error("onDraft hook failed:", err.message); }
      }
      if (block.name === "find_job" && result?.job?.uuid) anchor = { ...result.job };
      // One clear search hit anchors just as well as a number.
      if (block.name === "search_jobs" && result?.matches?.length === 1) {
        const m = result.matches[0];
        anchor = { uuid: m.job_uuid, job_number: m.job_number, address: m.address, status: m.status };
      }
      // Anything that CHANGES the job invalidates what we know about it.
      if (WRITE_TOOLS.has(block.name) && anchor) anchor.dossier = null;
      toolResults.push({
        type: "tool_result", tool_use_id: block.id,
        content: JSON.stringify(result).slice(0, 30000),
        ...(result?.error ? { is_error: true } : {}),
      });
    }
    // Refresh the dossier before the next thinking step, so the assistant sees
    // the consequences of what it just did without asking ServiceM8 again.
    if (anchor?.uuid && !anchor.dossier) {
      try { anchor.dossier = await buildDossier(anchor.uuid); } catch (err) { console.error("dossier failed:", err.message); }
    }
    apiMessages.push({ role: "assistant", content });
    apiMessages.push({ role: "user", content: toolResults });
    if (fullReply && !fullReply.endsWith(" ")) { fullReply += " "; await onDelta(" "); }
  }
  return { reply: fullReply, anchor };
}
