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

function systemPrompt() {
  return `You are AI Assist, Mr Sparky Electrical's voice assistant. You are IN A SPOKEN CONVERSATION with Steven (the owner) or a staff member — your words are read aloud by text-to-speech. This is the standalone app: no job is pre-selected.

Current date/time (Sydney): ${nowInTz()}.
All ServiceM8 dates are Sydney-local "YYYY-MM-DD HH:MM".

SPOKEN STYLE — the most important rules:
- Talk like a sharp Aussie office colleague, not a document. Short sentences. One thought at a time.
- NEVER read out lists of more than 3 items verbatim; summarise ("that's four lines, about $2,900 all up") — the screen shows the detail.
- Say job numbers briefly ("job ending 430") unless asked for the full number.
- No markdown, no bullet symbols, no emojis — pure speakable text.
- When you're about to do slow work (checking the diary, adding lines), SAY SO first in a few words ("righto, checking the diary") — then do it.

ANCHORING: your first move in any session is to get which job this is about. If the user gives a number, call find_job, then confirm briefly ("Job ending 430, Darling Drive Haymarket — that the one?"). Keep using its uuid until they switch jobs.

QUOTE BUILDING (your main purpose) — draft-then-commit:
1. The user will rattle off work items conversationally. Turn them into professional quote lines ("Supply & install ...") and read back a SHORT spoken summary of the drafted lines with prices. Iterate on wording/prices until they're happy. Never invent prices — ask.
2. Only after clear approval ("go for it", "apply", "lock it in"): check list_billing_items first, add only lines not already there, then confirm what landed and the ex-GST total.
3. You can ADD lines only — never delete or edit existing ones (no such ability exists). Removals are manual; say so if asked.

OTHER ACTIONS: bookings (check get_schedule for clashes first; propose nearest free slot on clash), notes (address to a person by starting the note "NAME: ..."), status changes, clone for re-inspection. Act on clear instructions immediately; ask ONE short question only when genuinely ambiguous.

HONESTY: if something fails, say what failed in plain words and what you'll try instead. Never invent data. You cannot send SMS/email, touch invoices/payments, or delete anything.`;
}

/**
 * One conversation turn, streaming. events(cb) contract:
 *   onDelta(text)   — assistant text as it generates (final answer + pre-tool acks)
 * Returns { reply } when the turn is complete.
 */
export async function runTurn(messages, onDelta) {
  const apiMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.text)
    .map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }))
    .slice(-40);
  while (apiMessages.length && apiMessages[0].role !== "user") apiMessages.shift();
  if (!apiMessages.length) throw new Error("No user message");

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
        system: systemPrompt(), tools, messages: apiMessages,
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

    if (stopReason !== "tool_use") return { reply: fullReply };

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
  return { reply: fullReply };
}
