// AI Assist Voice — standalone conversational quoting app.
// Lambda with a streaming Function URL. Routes:
//   GET  /                    the app (installable PWA page)
//   GET  /manifest.webmanifest PWA manifest
//   POST /chat                one conversation turn — SSE stream of text deltas
//                             and per-sentence Polly audio (neural en-AU Olivia)
//   POST /stt                 speech-to-text for the native app's Expo Go path:
//                             body {wav: base64 16-bit PCM WAV} -> {ok, text}
//                             (Amazon Transcribe streaming, en-AU)
// Auth: x-app-pin header must match env APP_PIN.

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";
import { runTurn } from "./brain.mjs";

const polly = new PollyClient({});
const transcribe = new TranscribeStreamingClient({});
const PIN = process.env.APP_PIN || "";

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
        "Access-Control-Allow-Headers": "Content-Type, x-app-pin",
      }, "");
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
      if (!PIN || headers["x-app-pin"] !== PIN) {
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
#log{flex:1 1 auto;overflow-y:auto;padding:0 14px 10px}
.msg{max-width:88%;margin:7px 0;padding:10px 13px;border-radius:14px;font-size:15px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;width:fit-content}
.me{background:#1a73e8;color:#fff;margin-left:auto;border-bottom-right-radius:4px}
.ai{background:#1c2b42;border:1px solid #27395a;border-bottom-left-radius:4px}
.sys{color:#61708a;font-size:12px;text-align:center;margin:8px 0}
#dock{flex:0 0 auto;padding:10px 14px calc(14px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center}
#big{width:74px;height:74px;border-radius:50%;border:0;font-size:30px;cursor:pointer;flex:0 0 auto;background:#1a73e8;color:#fff;transition:background .2s}
#big.listening{background:#e53935;animation:pulse 1.1s infinite}
#big.thinking{background:#f9ab00}
#big.speaking{background:#34a853}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
#box{flex:1;background:#16233a;border:1px solid #27395a;color:#e8eef7;border-radius:12px;padding:11px 13px;font:inherit;font-size:15px;resize:none;height:48px;outline:none}
#send{background:#1a73e8;color:#fff;border:0;border-radius:12px;padding:0 16px;height:48px;font-size:15px;cursor:pointer}
#state{color:#7d8ba1;font-size:12px;text-align:center;padding-bottom:4px}
#pinveil{position:fixed;inset:0;background:#0f1b2d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:9}
#pinveil input{font-size:22px;text-align:center;letter-spacing:6px;background:#16233a;border:1px solid #27395a;color:#fff;border-radius:10px;padding:12px;width:190px}
#pinveil button{background:#1a73e8;color:#fff;border:0;border-radius:10px;padding:12px 26px;font-size:16px}
</style></head><body>
<div id="pinveil"><div style="font-size:20px;font-weight:700">AI Assist</div><div style="color:#7d8ba1">Enter PIN</div><input id="pin" inputmode="numeric" autocomplete="off"><button id="pingo">Unlock</button></div>
<header>AI Assist <small id="ver">voice v0.6</small></header>
<div id="log"><div class="msg ai">G'day. Which job are we working on? Give me a job number and we'll get into it.</div></div>
<div id="state">tap the button and talk</div>
<div id="dock"><button id="big" type="button">&#127908;</button><textarea id="box" placeholder="or type here"></textarea><button id="send" type="button">Send</button></div>
<script>
var PINKEY='aiassist_pin';var chat=[];var busy=false;
var log=document.getElementById('log'),box=document.getElementById('box'),send=document.getElementById('send');
var big=document.getElementById('big'),state=document.getElementById('state');
var veil=document.getElementById('pinveil'),pinIn=document.getElementById('pin');
function pin(){return localStorage.getItem(PINKEY)||''}
if(pin())veil.style.display='none';
document.getElementById('pingo').onclick=function(){localStorage.setItem(PINKEY,pinIn.value.trim());veil.style.display='none';};
function add(c,t){var d=document.createElement('div');d.className='msg '+c;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function sys(t){var d=document.createElement('div');d.className='sys';d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function setState(s,label){big.className=s;state.textContent=label;}

/* ---- audio queue: ONE gesture-unlocked element reused for every chunk
   (phone browsers mute Audio objects created outside a tap) ---- */
var q=[],qNext=0,playing=false,stopFlag=false,audioUnlocked=false;
var audioEl=new Audio();
var SILENT='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function unlockAudio(){if(audioUnlocked)return;audioUnlocked=true;try{audioEl.src=SILENT;var pr=audioEl.play();if(pr&&pr.catch)pr.catch(function(){});}catch(e){}}
audioEl.onended=audioEl.onerror=function(){playing=false;pump();maybeRelisten();};
function enqueue(seq,b64){q[seq]=b64;pump();}
function pump(){if(playing||stopFlag)return;var b64=q[qNext];if(!b64)return;q[qNext]=null;qNext++;playing=true;
audioEl.src='data:audio/mpeg;base64,'+b64;
var pr=audioEl.play();if(pr&&pr.catch)pr.catch(function(){playing=false;sys('Tap the button once to enable sound.');});}
function stopAudio(){stopFlag=true;try{audioEl.pause();}catch(e){}playing=false;q=[];}
function audioDrained(){return !playing&&(qNext>=q.length||!q[qNext]);}
function maybeRelisten(){if(busy||!handsFree||!audioDrained())return;
retries=0;setTimeout(function(){if(!busy&&!listening&&audioDrained())startMic();},300);}

/* ---- speech recognition: tap → talk → pause sends ---- */
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;var rec=null,listening=false,handsFree=true,retries=0,watchdog=null,heard=false;
function killMic(){if(watchdog){clearTimeout(watchdog);watchdog=null;}if(rec){try{rec.onend=null;rec.onerror=null;rec.onresult=null;rec.abort();}catch(e){}rec=null;}listening=false;}
function startMic(){if(!SR||listening||busy)return;stopFlag=false;killMic();
// A FRESH instance every round — reused ones silently refuse to restart on phones.
rec=new SR();rec.lang='en-AU';rec.interimResults=true;rec.continuous=false;heard=false;
rec.onresult=function(e){heard=true;var t='';for(var i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;box.value=t;};
rec.onstart=function(){heard=false;};
rec.onend=function(){if(watchdog){clearTimeout(watchdog);watchdog=null;}listening=false;
if(box.value.trim()){retries=0;setState('','');go();return;}
if(handsFree&&!busy&&retries<4){retries++;setTimeout(function(){startMic();},250);return;}
retries=0;setState('','tap the button and talk');};
rec.onerror=function(e){if(e&&e.error==='not-allowed'){killMic();setState('','');sys('Mic blocked - allow microphone for this site.');}};
try{box.value='';rec.start();listening=true;setState('listening','listening\\u2026 pause to send');}catch(e){killMic();setState('','tap the button and talk');return;}
// Watchdog: if the round never hears anything within 8s, assume it hung
// (phones sometimes fake-start outside a tap) and reset to a clean idle.
watchdog=setTimeout(function(){if(listening&&!heard&&!box.value.trim()){killMic();setState('','tap the button and talk');}},4000);}
function stopMicRound(){if(rec&&listening){try{rec.stop();}catch(e){}}}
big.onclick=function(){
unlockAudio();
if(playing||!audioDrained()){stopAudio();startMic();return;}
if(listening){stopMicRound();return;}
startMic();};

/* ---- one turn: SSE stream in, captions + audio out ---- */
function go(){var text=box.value.trim();if(!text||busy)return;box.value='';add('me',text);chat.push({role:'user',text:text});
busy=true;setState('thinking','thinking\\u2026');stopFlag=false;q=[];qNext=0;
var aiDiv=null;var got='';
fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json','x-app-pin':pin()},body:JSON.stringify({messages:chat})})
.then(function(res){
if(res.status===401){busy=false;setState('','');localStorage.removeItem(PINKEY);veil.style.display='flex';return;}
var reader=res.body.getReader();var dec=new TextDecoder();var buf='';
function step(){return reader.read().then(function(r){
if(r.done){finish();return;}
buf+=dec.decode(r.value,{stream:true});
var lines=buf.split('\\n');buf=lines.pop();
for(var i=0;i<lines.length;i++){var line=lines[i];if(line.indexOf('data: ')!==0)continue;var ev;try{ev=JSON.parse(line.slice(6));}catch(e){continue;}
if(ev.t==='d'){got+=ev.x;if(!aiDiv)aiDiv=add('ai','');aiDiv.textContent=got;log.scrollTop=log.scrollHeight;setState('speaking','');}
else if(ev.t==='a'){enqueue(ev.seq,ev.b64);}
else if(ev.t==='err'){sys('Error: '+ev.x);}
}
return step();});}
return step();
function finish(){busy=false;if(got){chat.push({role:'assistant',text:got});}setState('','');maybeRelisten();}
})
.catch(function(err){busy=false;setState('','');sys('Network error \\u2014 try again.');chat.pop();});}
send.onclick=function(){unlockAudio();go();};
box.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();}});
</script></body></html>`;
