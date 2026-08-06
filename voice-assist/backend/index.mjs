// AI Assist Voice — standalone conversational quoting app.
// Lambda with a streaming Function URL. Routes:
//   GET  /                    the app (installable PWA page)
//   GET  /manifest.webmanifest PWA manifest
//   POST /chat                one conversation turn — SSE stream of text deltas
//                             and per-sentence Polly audio (neural en-AU Olivia)
//   POST /stt                 speech-to-text for the native app's Expo Go path:
//                             body {wav: base64 16-bit PCM WAV} -> {ok, text}
//                             (Amazon Transcribe streaming, en-AU)
//   POST /llm/chat/completions  Vapi custom-LLM bridge: OpenAI-compatible SSE
//                             wrapper around the same brain. Auth: Bearer
//                             env LLM_TOKEN (configured as Vapi credential).
// Auth (chat/stt): x-app-pin header must match env APP_PIN.

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";
import { runTurn, jobIndex, buildDossier, executeTool, attachFileToJob } from "./brain.mjs";
import { verifyIdToken, bearer } from "./auth.mjs";

const polly = new PollyClient({});
const transcribe = new TranscribeStreamingClient({});
const PIN = process.env.APP_PIN || "";
const LLM_TOKEN = process.env.LLM_TOKEN || "";

// Per-call job anchor so the brain doesn't re-find the job every turn.
// Container-lifetime memory: lost on cold start, which just costs one re-find.
const callAnchors = new Map();
function rememberAnchor(callId, anchor) {
  if (!callId || !anchor) return;
  callAnchors.set(callId, anchor);
  if (callAnchors.size > 200) callAnchors.delete(callAnchors.keys().next().value);
}

function parseWav(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === "data") data = buf.subarray(body, Math.min(body + size, buf.length));
    pos = body + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) return null;
  if (fmt.channels === 2) {
    const mono = Buffer.alloc(Math.floor(data.length / 4) * 2);
    for (let i = 0; i < mono.length / 2; i++) mono.writeInt16LE(data.readInt16LE(i * 4), i * 2);
    data = mono;
  } else if (fmt.channels !== 1) return null;
  return { sampleRate: fmt.sampleRate, pcm: data };
}

async function sttFromWav(wavBuf) {
  const wav = parseWav(wavBuf);
  if (!wav) throw new Error("expected 16-bit PCM WAV (mono or stereo)");
  const CHUNK = 16 * 1024;
  async function* audio() {
    for (let i = 0; i < wav.pcm.length; i += CHUNK) {
      yield { AudioEvent: { AudioChunk: wav.pcm.subarray(i, i + CHUNK) } };
    }
  }
  const out = await transcribe.send(new StartStreamTranscriptionCommand({
    LanguageCode: "en-AU", MediaEncoding: "pcm",
    MediaSampleRateHertz: Math.min(Math.max(wav.sampleRate, 8000), 48000),
    AudioStream: audio(),
  }));
  let text = "";
  for await (const ev of out.TranscriptResultStream) {
    const results = ev.TranscriptEvent?.Transcript?.Results || [];
    for (const r of results) if (!r.IsPartial && r.Alternatives?.[0]?.Transcript) text += (text ? " " : "") + r.Alternatives[0].Transcript;
  }
  return text.trim();
}

async function tts(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const out = await polly.send(new SynthesizeSpeechCommand({
    Engine: "neural", VoiceId: "Olivia", LanguageCode: "en-AU",
    OutputFormat: "mp3", Text: clean.slice(0, 2900),
  }));
  const bytes = await out.AudioStream.transformToByteArray();
  return Buffer.from(bytes).toString("base64");
}

// "Today" means today where the van is, not where the Lambda is.
function todayInSydney() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function sse(stream, obj) {
  stream.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const method = event.requestContext?.http?.method || "GET";
  const path = event.rawPath || "/";

  const respond = (status, headers, body) => {
    const s = awslambda.HttpResponseStream.from(responseStream, { statusCode: status, headers });
    s.write(body);
    s.end();
  };

  try {
    if (method === "GET" && (path === "/" || path === "")) {
      return respond(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, APP_HTML);
    }
    if (method === "GET" && path === "/manifest.webmanifest") {
      return respond(200, { "Content-Type": "application/manifest+json" }, JSON.stringify({
        name: "AI Assist", short_name: "AI Assist", start_url: "/", display: "standalone",
        background_color: "#0f1b2d", theme_color: "#1a73e8",
        icons: [{ src: "https://mr-sparky-assets.s3.amazonaws.com/plugin/ai-assist-icon.png", sizes: "512x512", type: "image/png" }],
      }));
    }
    if (method === "OPTIONS") {
      return respond(204, {
        "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-app-pin, Authorization",
      }, "");
    }
    if (method === "POST" && path === "/llm/chat/completions") {
      const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      if (!LLM_TOKEN || headers["authorization"] !== `Bearer ${LLM_TOKEN}`) {
        return respond(401, { "Content-Type": "application/json" }, JSON.stringify({ error: "unauthorized" }));
      }
      let body = {};
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf-8") : event.body || "{}");
      } catch {}

      // Caller gate: this brain can WRITE to ServiceM8, and the phone number is
      // public-facing (Henri's Text-us line). Only allowlisted callers get the
      // assistant; anyone else gets a polite redirect. Calls with no caller
      // number (dashboard/web tests) pass — they're already auth-gated above.
      const caller = String(body.call?.customer?.number || "").replace(/[\s()-]/g, "");
      const allowed = (process.env.ALLOWED_CALLERS || "").split(",").map((n) => n.trim()).filter(Boolean);
      if (caller && allowed.length && !allowed.includes(caller)) {
        console.log(`llm bridge: rejected caller ${caller}`);
        const s2 = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
        const rid = "chatcmpl-" + Date.now().toString(36);
        const rchunk = (delta, finish = null) => sse(s2, {
          id: rid, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000),
          model: "ai-assist-brain", choices: [{ index: 0, delta, finish_reason: finish }],
        });
        rchunk({ role: "assistant" });
        rchunk({ content: "G'day — this line is for text messages only. For service or quotes, please call the office on 1300 770 771, or send us a text right here and the team will get back to you. Cheers!" });
        rchunk({}, "stop");
        s2.write("data: [DONE]\n\n");
        s2.end();
        return;
      }

      const rawMessages = Array.isArray(body.messages) ? body.messages : [];

      // The app pre-anchors: when Charlie is opened from a job card it injects
      // a system line naming the job, so the conversation starts where the user
      // already is instead of asking which job we're on.
      const appJob = rawMessages
        .filter((m) => m.role === "system" && typeof m.content === "string" && m.content.startsWith("APP_CONTEXT:"))
        .map((m) => /job\s+(\d+)/i.exec(m.content)?.[1])
        .filter(Boolean)
        .pop();

      // Vapi speaks OpenAI chat format; the brain wants {role, text} pairs and
      // supplies its own system prompt, so system messages are dropped.
      const messages = rawMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role,
          text: typeof m.content === "string" ? m.content
            : Array.isArray(m.content) ? m.content.map((p) => p?.text || "").join(" ") : "",
        }))
        .filter((m) => m.text.trim());

      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      });
      const id = "chatcmpl-" + Date.now().toString(36);
      const created = Math.floor(Date.now() / 1000);
      const chunk = (delta, finish = null) => sse(stream, {
        id, object: "chat.completion.chunk", created, model: "ai-assist-brain",
        choices: [{ index: 0, delta, finish_reason: finish }],
      });
      const callId = body.call?.id || null;
      try {
        chunk({ role: "assistant" });
        let anchorIn = callAnchors.get(callId) || null;
        // Anchor from the app's context line once per call — after that the
        // per-call anchor carries it, and a re-find would just cost latency.
        if (!anchorIn && appJob) {
          try {
            const found = await executeTool("find_job", { job_number: appJob });
            // runTurn fills in the dossier itself for any anchor with a uuid.
            if (found?.job?.uuid) anchorIn = { ...found.job };
          } catch (err) { console.error("app pre-anchor failed:", err); }
        }
        const { anchor } = await runTurn(messages, async (delta) => chunk({ content: delta }), { anchor: anchorIn });
        rememberAnchor(callId, anchor);
        chunk({}, "stop");
      } catch (err) {
        console.error("llm bridge turn failed:", err);
        try { chunk({ content: "Sorry, something went wrong on my end. Give me that again?" }); chunk({}, "stop"); } catch {}
      }
      stream.write("data: [DONE]\n\n");
      stream.end();
      return;
    }
    if (method === "POST" && path === "/stt") {
      const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      if (!PIN || headers["x-app-pin"] !== PIN) {
        return respond(401, { "Content-Type": "application/json" }, JSON.stringify({ ok: false, error: "bad pin" }));
      }
      let body = {};
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf-8") : event.body || "{}");
      } catch {}
      if (typeof body.wav !== "string" || !body.wav) {
        return respond(400, { "Content-Type": "application/json" }, JSON.stringify({ ok: false, error: "missing wav" }));
      }
      try {
        const text = await sttFromWav(Buffer.from(body.wav, "base64"));
        return respond(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, JSON.stringify({ ok: true, text }));
      } catch (err) {
        console.error("stt failed:", err);
        return respond(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, JSON.stringify({ ok: false, error: String(err.message || err).slice(0, 200) }));
      }
    }
    if (method === "POST" && path === "/chat") {
      const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      // Two ways in: the web page's PIN, or a signed-in app's Cognito token.
      // The app stopped carrying a PIN once it grew a real sign-in screen.
      let authed = Boolean(PIN) && headers["x-app-pin"] === PIN;
      if (!authed && bearer(headers)) {
        try { await verifyIdToken(bearer(headers)); authed = true; } catch {}
      }
      if (!authed) {
        return respond(401, { "Content-Type": "application/json" }, JSON.stringify({ ok: false, error: "bad pin" }));
      }
      let body = {};
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf-8") : event.body || "{}");
      } catch {}
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const wantAudio = body.audio !== false;

      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
      });

      // Sentence-chunked TTS while the reply streams: flush a sentence to Polly
      // as soon as it completes so speech starts within the first second.
      let sentenceBuf = "";
      let seq = 0;
      let audioChain = Promise.resolve();
      const flush = (force) => {
        const text = sentenceBuf;
        if (!text.trim()) return;
        if (!force && text.length < 12) return;
        sentenceBuf = "";
        if (!wantAudio) return;
        const mySeq = seq++;
        audioChain = audioChain.then(async () => {
          try {
            const b64 = await tts(text);
            if (b64) sse(stream, { t: "a", seq: mySeq, b64 });
          } catch (err) { console.error("polly failed:", err); }
        });
      };

      try {
        const { reply } = await runTurn(messages, async (delta) => {
          sse(stream, { t: "d", x: delta });
          sentenceBuf += delta;
          // Flush on sentence end (or long clause) — keeps latency low.
          if (/[.!?]["')\]]?\s$/.test(sentenceBuf) || /\n/.test(sentenceBuf) || sentenceBuf.length > 180) flush(true);
        });
        flush(true);
        await audioChain;
        sse(stream, { t: "done", reply });
      } catch (err) {
        console.error("chat turn failed:", err);
        sse(stream, { t: "err", x: String(err.message || err).slice(0, 200) });
      }
      stream.end();
      return;
    }
    // ---- Native app writes ------------------------------------------------
    // Two, and deliberately only two — Steven's scope line (2026-08-06): the
    // app is Charlie's cockpit plus the money loop, not an SM8 replacement.
    // Both write INTO ServiceM8 itself; the app never keeps its own truth.
    if (method === "POST" && path.startsWith("/api/job/")) {
      const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      const jsonOut = (status, body) => respond(status, {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      }, JSON.stringify(body));

      let who;
      try {
        who = await verifyIdToken(bearer(headers));
      } catch {
        return jsonOut(401, { ok: false, error: "not signed in" });
      }

      // Everything the backend writes rides the one SM8 API key, so SM8
      // attributes it all to the bot account. The stamp puts the real author
      // on the record — from the VERIFIED token, not from anything the app
      // sends, so it can't be forged by a client.
      const stamp = `Mr Sparky App (${who.name || who.email.split("@")[0]})`;

      const m = /^\/api\/job\/(\d+)\/(note|receipt-copy)$/.exec(path);
      if (!m) return jsonOut(404, { ok: false, error: "no such route" });

      const index = await jobIndex();
      const job = index.find((j) => String(j.number) === m[1]);
      if (!job) return jsonOut(404, { ok: false, error: "no such job" });

      let payload = {};
      try {
        payload = JSON.parse(event.isBase64Encoded
          ? Buffer.from(event.body || "", "base64").toString("utf8")
          : event.body || "{}");
      } catch {
        return jsonOut(400, { ok: false, error: "bad request body" });
      }

      if (m[2] === "note") {
        const note = String(payload.note || "").trim();
        if (!note) return jsonOut(400, { ok: false, error: "The note is empty." });
        const r = await executeTool("add_note", { job_uuid: job.uuid, note: `${stamp}: ${note}` });
        if (r?.error) return jsonOut(502, { ok: false, error: r.error });
        return jsonOut(200, { ok: true });
      }

      // Receipt record-copy: the portal keeps the working copy that gets
      // reimbursed; this puts the same photo on the SM8 job card as the
      // paper trail. Caption becomes the attachment name.
      const bytes = Buffer.from(String(payload.imageB64 || ""), "base64");
      if (!bytes.length) return jsonOut(400, { ok: false, error: "No image supplied." });
      if (bytes.length > 5 * 1024 * 1024) return jsonOut(413, { ok: false, error: "Photo too large." });
      const r = await attachFileToJob({
        job_uuid: job.uuid,
        name: `${String(payload.caption || "Receipt")} — ${stamp}`.slice(0, 120),
        fileType: payload.fileType === ".png" ? ".png" : ".jpg",
        contentType: payload.fileType === ".png" ? "image/png" : "image/jpeg",
        bytes,
      });
      if (r?.error) return jsonOut(502, { ok: false, error: r.error });
      return jsonOut(200, { ok: true, attachment_uuid: r.attachment_uuid });
    }

    // ---- Native app data routes -------------------------------------------
    // The voice loop is Charlie's; these are for the screens around him — the
    // jobs list, the day diary, a job card. Signed in with the SAME Cognito
    // identity as the subcontractor portal, so there is one login per person.
    if (method === "GET" && path.startsWith("/api/")) {
      const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      const jsonOut = (status, body) => respond(status, {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      }, JSON.stringify(body));

      let who;
      try {
        who = await verifyIdToken(bearer(headers));
      } catch (err) {
        // The app treats 401 as "sign in again", which is the right move for
        // every failure here — expired, forged or misconfigured all end the
        // same way from the phone's point of view.
        return jsonOut(401, { ok: false, error: "not signed in" });
      }

      const q = event.queryStringParameters || {};

      if (path === "/api/me") return jsonOut(200, { ok: true, ...who });

      if (path === "/api/jobs") {
        const query = String(q.q || "").trim();
        if (!query) {
          // No search yet: the most recent jobs, which is what "recents" means
          // on a phone that has just been opened. Job numbers climb over time.
          const index = await jobIndex();
          const recent = [...index]
            .sort((a, b) => Number(b.number) - Number(a.number))
            .slice(0, 12)
            .map((j) => ({ job_uuid: j.uuid, job_number: j.number, status: j.status, address: j.address, contact: j.contact || undefined, work: j.description ? j.description.slice(0, 90) : undefined }));
          return jsonOut(200, { ok: true, matches: recent });
        }
        const result = await executeTool("search_jobs", { query });
        return jsonOut(200, { ok: true, ...result });
      }

      const jobMatch = /^\/api\/job\/(\d+)$/.exec(path);
      if (jobMatch) {
        const index = await jobIndex();
        const job = index.find((j) => String(j.number) === jobMatch[1]);
        if (!job) return jsonOut(404, { ok: false, error: "no such job" });
        const dossier = await buildDossier(job.uuid);
        return jsonOut(200, {
          ok: true,
          job: { job_uuid: job.uuid, job_number: job.number, address: job.address, contact: job.contact || "" },
          ...dossier,
        });
      }

      if (path === "/api/diary") {
        // A day in Sydney time. get_schedule wants "YYYY-MM-DD HH:MM:SS".
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || "")) ? q.date : todayInSydney();
        const result = await executeTool("get_schedule", { from: `${date} 00:00:00`, to: `${date} 23:59:59` });
        return jsonOut(200, { ok: true, date, ...result });
      }

      return jsonOut(404, { ok: false, error: "no such route" });
    }

    return respond(404, { "Content-Type": "text/plain" }, "Not found");
  } catch (err) {
    console.error("handler error:", err);
    try { respond(500, { "Content-Type": "text/plain" }, "Internal error"); } catch {}
  }
});

const APP_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0f1b2d">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="https://mr-sparky-assets.s3.amazonaws.com/plugin/ai-assist-icon.png">
<title>AI Assist</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f1b2d;color:#e8eef7;display:flex;flex-direction:column;height:100dvh}
header{padding:14px 18px;font-weight:700;font-size:17px;display:flex;justify-content:space-between;align-items:center;flex:0 0 auto}
header small{font-weight:400;color:#7d8ba1;font-size:12px}
#endbtn{background:transparent;border:1px solid #27395a;color:#7d8ba1;border-radius:9px;padding:7px 12px;font-size:13px;cursor:pointer}
#log{flex:1 1 auto;overflow-y:auto;padding:0 14px 10px}
.msg{max-width:88%;margin:7px 0;padding:10px 13px;border-radius:14px;font-size:15px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;width:fit-content}
.me{background:#1a73e8;color:#fff;margin-left:auto;border-bottom-right-radius:4px}
.ai{background:#1c2b42;border:1px solid #27395a;border-bottom-left-radius:4px}
.live{opacity:.55}
.sys{color:#61708a;font-size:12px;text-align:center;margin:8px 0}
#dock{flex:0 0 auto;padding:10px 14px calc(14px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center}
#big{width:74px;height:74px;border-radius:50%;border:0;font-size:30px;cursor:pointer;flex:0 0 auto;background:#1a73e8;color:#fff;transition:background .2s}
#big.connecting{background:#f9ab00;animation:pulse 1.1s infinite}
#big.incall{background:#e53935;animation:pulse 1.4s infinite}
#big.talking{background:#34a853}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
#box{flex:1;background:#16233a;border:1px solid #27395a;color:#e8eef7;border-radius:12px;padding:11px 13px;font:inherit;font-size:15px;resize:none;height:48px;outline:none}
#send{background:#1a73e8;color:#fff;border:0;border-radius:12px;padding:0 16px;height:48px;font-size:15px;cursor:pointer}
#state{color:#7d8ba1;font-size:12px;text-align:center;padding-bottom:4px}
#pinveil{position:fixed;inset:0;background:#0f1b2d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:9}
#pinveil input{font-size:22px;text-align:center;letter-spacing:6px;background:#16233a;border:1px solid #27395a;color:#fff;border-radius:10px;padding:12px;width:190px}
#pinveil button{background:#1a73e8;color:#fff;border:0;border-radius:10px;padding:12px 26px;font-size:16px}
#pinveil .err{color:#e57373;font-size:13px;min-height:16px}
</style></head><body>
<div id="pinveil"><div style="font-size:20px;font-weight:700">AI Assist</div><div style="color:#7d8ba1">Enter PIN &#183; v1.2</div><input id="pin" inputmode="numeric" autocomplete="off"><div class="err" id="pinerr"></div><button id="pingo">Unlock</button></div>
<header><span>AI Assist <small id="ver">voice v1.2 &#183; vapi</small></span><button id="endbtn" type="button">End session</button></header>
<div id="log"><div class="msg ai">G'day. Tap the button and we'll get into it.</div></div>
<div id="state">tap the button to start talking</div>
<div id="dock"><button id="big" type="button">&#127908;</button><textarea id="box" placeholder="or type here"></textarea><button id="send" type="button">Send</button></div>
<script>
/* Core UI + PIN gate: plain script, zero dependencies — must never be taken
   down by the voice engine failing to load. Voice wires in via import() below. */
var PUBKEY="13a3a262-9ccf-4fb5-a69e-0c943718dce6";
var ASSISTANT="8ff8436f-b6b3-4c3b-9226-0a70d22f2c63";
var PINKEY="aiassist_pin";
var IDLE_LOCK_MS=15*60*1000;

var log=document.getElementById("log"),box=document.getElementById("box"),send=document.getElementById("send");
var big=document.getElementById("big"),state=document.getElementById("state"),endbtn=document.getElementById("endbtn");
var veil=document.getElementById("pinveil"),pinIn=document.getElementById("pin"),pinErr=document.getElementById("pinerr");

var chat=[];
var A={inCall:false,connecting:false,talking:false,start:null,stop:null};
var typedBusy=false,lastActivity=Date.now(),wakeLock=null;

function add(c,t){var d=document.createElement("div");d.className="msg "+c;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function sys(t){var d=document.createElement("div");d.className="sys";d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function setUI(){
  big.className=A.connecting?"connecting":(A.inCall?(A.talking?"talking":"incall"):"");
  big.innerHTML=A.inCall||A.connecting?"&#9209;&#65039;":"&#127908;";
  if(A.connecting)state.textContent="connecting…";
  else if(A.inCall)state.textContent=A.talking?"talking — speak over it to interrupt":"on the line — just talk";
  else state.textContent="tap the button to start talking";
}
function bump(){lastActivity=Date.now();}

function pin(){return localStorage.getItem(PINKEY)||"";}
function locked(){return veil.style.display!=="none";}
function lock(){if(A.stop)try{A.stop();}catch(e){}veil.style.display="flex";pinIn.value="";pinErr.textContent="";}
if(pin())veil.style.display="none";
document.getElementById("pingo").onclick=function(){
  var v=pinIn.value.trim();if(!v)return;
  var stored=pin();
  if(stored&&v!==stored){pinErr.textContent="Wrong PIN";pinIn.value="";return;}
  if(!stored)localStorage.setItem(PINKEY,v);
  veil.style.display="none";bump();
};
pinIn.addEventListener("keydown",function(e){if(e.key==="Enter")document.getElementById("pingo").onclick();});

var liveUser=null,liveAi=null;
function setLive(role,text){
  if(role==="user"){if(!liveUser)liveUser=add("me live","");liveUser.textContent=text;}
  else{if(!liveAi)liveAi=add("ai live","");liveAi.textContent=text;}
  log.scrollTop=log.scrollHeight;
}
function commitLive(role,text){
  var d=role==="user"?liveUser:liveAi;
  if(!d)d=add(role==="user"?"me":"ai","");
  d.textContent=text;d.className="msg "+(role==="user"?"me":"ai");
  if(role==="user")liveUser=null;else liveAi=null;
  chat.push({role:role==="user"?"user":"assistant",text:text});
  bump();
}
function clearLive(){liveUser=null;liveAi=null;}

big.onclick=function(){
  if(locked())return;
  if(A.inCall||A.connecting){if(A.stop)A.stop();return;}
  if(!A.start){sys("Voice engine still loading — give it a second and tap again.");return;}
  A.start();
};
endbtn.onclick=function(){if(A.stop)try{A.stop();}catch(e){}lock();setTimeout(function(){try{window.close();}catch(e){}},300);};

document.addEventListener("visibilitychange",function(){if(document.hidden&&(A.inCall||A.connecting)&&A.stop)A.stop();});
setInterval(function(){if(!A.inCall&&!locked()&&Date.now()-lastActivity>IDLE_LOCK_MS)lock();},30000);

function goTyped(){
  var text=box.value.trim();if(!text||typedBusy||locked())return;
  if(A.inCall){sys("End the call to type, or just say it.");return;}
  box.value="";add("me",text);chat.push({role:"user",text:text});typedBusy=true;bump();
  var aiDiv=null,got="";
  fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json","x-app-pin":pin()},body:JSON.stringify({messages:chat,audio:false})})
  .then(function(res){
    if(res.status===401){typedBusy=false;localStorage.removeItem(PINKEY);lock();return;}
    var reader=res.body.getReader();var dec=new TextDecoder();var buf="";
    function step(){return reader.read().then(function(r){
      if(r.done){finish();return;}
      buf+=dec.decode(r.value,{stream:true});
      var lines=buf.split("\\n");buf=lines.pop();
      for(var i=0;i<lines.length;i++){var line=lines[i];if(line.indexOf("data: ")!==0)continue;var ev;try{ev=JSON.parse(line.slice(6));}catch(e){continue;}
        if(ev.t==="d"){got+=ev.x;if(!aiDiv)aiDiv=add("ai","");aiDiv.textContent=got;log.scrollTop=log.scrollHeight;}
        else if(ev.t==="err"){sys("Error: "+ev.x);}
      }
      return step();});}
    return step();
    function finish(){typedBusy=false;if(got)chat.push({role:"assistant",text:got});bump();}
  })
  .catch(function(){typedBusy=false;sys("Network error — try again.");chat.pop();});
}
send.onclick=goTyped;
box.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();goTyped();}});
setUI();

/* ---- voice engine: loaded separately so a failure never kills the page.
   Two CDNs tried in turn (content blockers commonly eat the first). ---- */
var VAPI_URLS=["https://cdn.jsdelivr.net/npm/@vapi-ai/web/+esm","https://esm.sh/@vapi-ai/web"];
function loadVapi(i){
  if(i>=VAPI_URLS.length){sys("Voice engine failed to load on both sources — check any ad-blocker/content-blocker on Safari, then reload.");return;}
  import(VAPI_URLS[i]).then(wireVapi).catch(function(e){
    sys("Voice engine source "+(i+1)+" failed ("+((e&&e.message)||e)+") — trying another…");
    loadVapi(i+1);
  });
}
loadVapi(0);
function wireVapi(mod){
  var Vapi=mod.default||mod.Vapi||mod;
  var vapi=new Vapi(PUBKEY);
  sys("voice engine ready");
  vapi.on("call-start",function(){A.connecting=false;A.inCall=true;A.talking=false;setUI();bump();
    try{if(navigator.wakeLock)navigator.wakeLock.request("screen").then(function(w){wakeLock=w;}).catch(function(){});}catch(e){}});
  vapi.on("call-end",function(){A.inCall=false;A.connecting=false;A.talking=false;clearLive();setUI();bump();
    try{if(wakeLock){wakeLock.release();wakeLock=null;}}catch(e){}});
  vapi.on("speech-start",function(){A.talking=true;setUI();});
  vapi.on("speech-end",function(){A.talking=false;setUI();});
  vapi.on("message",function(m){
    if(!m||m.type!=="transcript")return;
    if(m.transcriptType==="final")commitLive(m.role,m.transcript);
    else setLive(m.role,m.transcript);
  });
  vapi.on("error",function(e){
    A.connecting=false;A.inCall=false;setUI();
    var msg=(e&&(e.errorMsg||e.message||(e.error&&e.error.message)))||"call failed";
    sys("Voice error: "+msg);
  });
  A.start=function(){
    if(locked()||A.inCall||A.connecting)return;
    A.connecting=true;setUI();bump();
    try{vapi.start(ASSISTANT);}catch(e){A.connecting=false;setUI();sys("Couldn't start the call — "+(e.message||e));}
  };
  A.stop=function(){try{vapi.stop();}catch(e){}};
}
</script></body></html>
`;
