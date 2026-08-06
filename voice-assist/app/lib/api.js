// Backend calls. /chat is an SSE stream — React Native's built-in fetch can't
// read a streaming body, so we use expo/fetch (WinterCG, streaming-capable).
import { fetch as expoFetch } from "expo/fetch";
import { BACKEND } from "./config";
import { getIdToken } from "./auth";

// Hermes may lack TextDecoder; decode UTF-8 ourselves if needed. We only ever
// decode complete SSE lines, so multi-byte chars never split across calls.
function utf8(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) { s += String.fromCharCode(b); i += 1; }
    else if (b < 0xe0) { s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
    else if (b < 0xf0) { s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3; }
    else {
      const cp = (((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)) - 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    }
  }
  return s;
}

function httpError(status) {
  const e = new Error(status === 401 ? "signed out" : "backend error " + status);
  e.status = status;
  return e;
}

/**
 * A signed-in GET against the app's data routes. 401 means the session is
 * genuinely gone (the token is refreshed underneath us before it expires), so
 * callers should send the user back to the sign-in screen rather than retry.
 */
async function apiGet(path) {
  const token = await getIdToken();
  const res = await fetch(BACKEND + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw httpError(401);
  let j = null;
  try { j = await res.json(); } catch {}
  if (!res.ok || !j?.ok) throw new Error(j?.error || `backend error ${res.status}`);
  return j;
}

/**
 * Recent jobs when q is empty, fuzzy search when it isn't. With no query the
 * backend sends the newest of EACH bucket plus the real totals, so the bucket
 * headers can say how many there are rather than how many were sent.
 */
export async function fetchJobs(q) {
  const j = await apiGet(`/api/jobs${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const matches = j.matches || [];
  matches.counts = j.counts || null;
  return matches;
}

/** Everything the job card shows: status, description, contacts, billing, notes. */
export function fetchJob(jobNumber) {
  return apiGet(`/api/job/${encodeURIComponent(jobNumber)}`);
}

/** One day's bookings, Sydney time. Omit date for today. */
export function fetchDiary(date) {
  return apiGet(`/api/diary${date ? `?date=${encodeURIComponent(date)}` : ""}`);
}

async function apiPost(path, body) {
  const token = await getIdToken();
  const res = await fetch(BACKEND + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw httpError(401);
  let j = null;
  try { j = await res.json(); } catch {}
  if (!res.ok || !j?.ok) throw new Error(j?.error || `backend error ${res.status}`);
  return j;
}

/** Add a note to the job — an SM8 note, on the SM8 job card, immediately. */
export const postJobNote = (jobNumber, note) =>
  apiPost(`/api/job/${encodeURIComponent(jobNumber)}/note`, { note });

/**
 * File a record copy of a receipt photo into SM8's job diary. Best-effort
 * paper trail — the portal holds the working copy that gets reimbursed.
 */
export const postReceiptCopy = (jobNumber, { imageB64, fileType, caption }) =>
  apiPost(`/api/job/${encodeURIComponent(jobNumber)}/receipt-copy`, { imageB64, fileType, caption });

// One conversation turn. Resolves { reply } after the stream ends.
// onDelta(text) per text fragment; onAudio(seq, b64mp3) per Polly chunk.
export async function chatTurn({ messages, onDelta, onAudio }) {
  const token = await getIdToken();
  const res = await expoFetch(BACKEND + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages }),
  });
  if (res.status === 401) throw httpError(401);
  if (!res.ok || !res.body) throw httpError(res.status);

  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  let reply = null;
  let streamErr = null;

  const handleLine = (line) => {
    if (!line.startsWith("data: ")) return;
    let ev;
    try { ev = JSON.parse(line.slice(6)); } catch { return; }
    if (ev.t === "d" && onDelta) onDelta(ev.x);
    else if (ev.t === "a" && onAudio) onAudio(ev.seq, ev.b64);
    else if (ev.t === "done") reply = ev.reply;
    else if (ev.t === "err") streamErr = new Error(ev.x || "backend error");
  };

  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    const merged = new Uint8Array(buf.length + r.value.length);
    merged.set(buf); merged.set(r.value, buf.length);
    buf = merged;
    for (;;) {
      const nl = buf.indexOf(0x0a);
      if (nl < 0) break;
      let end = nl;
      if (end > 0 && buf[end - 1] === 0x0d) end--;
      handleLine(utf8(buf.subarray(0, end)));
      buf = buf.subarray(nl + 1);
    }
  }
  if (streamErr) throw streamErr;
  return { reply };
}

// Expo Go speech path: send a 16-bit PCM WAV (base64) to /stt, get text back.
export async function sttTranscribe({ wavB64, pin }) {
  // Legacy Expo Go path — still PIN-authed; it predates the sign-in screen.
  const res = await fetch(BACKEND + "/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-pin": pin || "" },
    body: JSON.stringify({ wav: wavB64 }),
  });
  if (res.status === 401) throw httpError(401);
  let j = null;
  try { j = await res.json(); } catch {}
  if (!res.ok || !j || !j.ok) {
    const e = new Error((j && j.error) || "transcription failed");
    e.status = res.status;
    throw e;
  }
  return j.text || "";
}
