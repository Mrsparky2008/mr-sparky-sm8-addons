// Vapi voice session — WebRTC audio with real echo cancellation, Deepgram
// listening, ElevenLabs speaking, and OUR brain behind it (the assistant's
// custom-LLM points at the same Lambda bridge the phone line uses).
//
// This replaces the hand-rolled mic/VAD/TTS stack: turn-taking, barge-in and
// echo are the transport's job here, not ours.
import Vapi from "@vapi-ai/react-native";
import { VAPI_PUBLIC_KEY, VAPI_ASSISTANT_ID } from "./config";
import { recap } from "./thread";

let vapi = null;
let handlers = {};

export function isReady() { return !!vapi; }

/**
 * start({ onEvent }) — opens the voice session.
 * onEvent(kind, payload) kinds:
 *   "status"     : "connecting" | "live" | "ended"
 *   "speech"     : { who: "user"|"assistant", text, final }
 *   "speaking"   : { who: "assistant", on: bool }
 *   "error"      : message
 */
export async function start({ onEvent, job }) {
  handlers = { onEvent: onEvent || (() => {}), job: job || null };
  if (!vapi) {
    vapi = new Vapi(VAPI_PUBLIC_KEY);
    vapi.on("call-start", () => {
      handlers.onEvent("status", "live");
      // iOS hands a WebRTC call to the EARPIECE by default, which is why
      // Charlie sounded faint unless the phone was against your ear. The SDK's
      // own device handling only re-applies whatever is already selected, so
      // nothing ever asks for the loudspeaker. Ask.
      routeToSpeaker();
      // The device list can arrive after the call starts; try once more.
      setTimeout(routeToSpeaker, 800);
    });
    vapi.on("call-end", () => handlers.onEvent("status", "ended"));
    vapi.on("speech-start", () => handlers.onEvent("speaking", { who: "assistant", on: true }));
    vapi.on("speech-end", () => handlers.onEvent("speaking", { who: "assistant", on: false }));
    vapi.on("message", (m) => {
      if (!m) return;
      if (m.type === "transcript") {
        handlers.onEvent("speech", {
          who: m.role === "assistant" ? "assistant" : "user",
          text: m.transcript || "",
          final: m.transcriptType === "final",
        });
        return;
      }
      // Quote drafts arrive as a tool call so they can be RENDERED, not spoken.
      const calls =
        m.toolCalls || m.toolCallList || m.functionCall ||
        (m.type === "tool-calls" ? m.toolCallList || m.toolCalls : null);
      const list = Array.isArray(calls) ? calls : calls ? [calls] : [];
      for (const c of list) {
        const fn = c.function || c;
        const name = fn.name || fn.functionName;
        if (name !== "show_quote_draft") continue;
        let args = fn.arguments ?? fn.parameters ?? {};
        if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
        if (Array.isArray(args.lines)) handlers.onEvent("draft", args.lines);
      }
    });
    // Vapi's error objects rarely carry .message — String() of one is the
    // useless "[object Object]" that reached the screen on 9 Aug. Dig for
    // the real words, whatever shape they arrive in.
    vapi.on("error", (e) => {
      const words = e?.message || e?.error?.message || e?.errorMsg || e?.error?.msg
        || (typeof e === "string" ? e : null)
        || (() => { try { return JSON.stringify(e).slice(0, 300); } catch { return "unknown error"; } })();
      handlers.onEvent("error", words);
    });
  }
  handlers.onEvent("status", "connecting");

  // The job goes in as an OVERRIDE at start, not as a message after call-start.
  //
  // Steven: "it's asking me what job I'm working on. Obviously it's that job,
  // it's started from the job card itself." He was right, and the reason is
  // ordering: a message sent on call-start arrives after the assistant has
  // already decided how to open, so it asked a question we had answered before
  // the call began. An override is in hand before the first word.
  //
  // It also takes a whole round trip out of the first reply: without it the
  // brain has to run find_job before it can say anything, which is a second
  // Claude call plus a ServiceM8 lookup while you stand there waiting.
  // NO `model` key in the overrides — ever. Vapi validates an overridden
  // model object and demands a provider from its own list; sending only
  // model.messages fails the WHOLE CALL with a 400 before it dials, which
  // showed up as "connecting…" forever (found live, 9 Aug — every
  // job-anchored call since the override shipped had been dying this way).
  // The job context travels as variableValues instead: Vapi passes them
  // through to the custom-LLM bridge inside body.call, where OUR code reads
  // them and no Vapi validation applies.
  const j = handlers.job;
  // What dictation already discussed rides along too, so the call continues
  // the conversation instead of meeting a Charlie with amnesia.
  const priorTalk = recap();
  // The greeting matches the moment: a FRESH conversation gets the job named
  // (proof he knows where he is); a call continuing a thread gets a nod, not
  // a recital — hearing the job number re-announced on every reconnect is
  // Charlie introducing himself to someone mid-sentence.
  const overrides = (j?.job_number || priorTalk) ? {
    ...(priorTalk ? {
      firstMessage: "Righto — what do you need now?",
    } : j?.job_number ? {
      firstMessage: `Job ${j.job_number}${j.address ? `, ${String(j.address).split(",")[0]}` : ""}. What do you need?`,
    } : {}),
    variableValues: {
      ...(j?.job_number ? {
        jobNumber: String(j.job_number),
        jobAddress: j.address || "",
        jobContact: j.contact || "",
        jobDescription: j.work || j.description || "",
      } : {}),
      ...(priorTalk ? { recap: priorTalk } : {}),
    },
  } : undefined;

  await vapi.start(VAPI_ASSISTANT_ID, overrides);
}

/**
 * Put Charlie on the loudspeaker.
 *
 * Deliberately picks from what the SDK reports rather than hardcoding a name:
 * the identifiers differ between platforms, and a wrong one thrown blind would
 * fail silently and leave the call on the earpiece with nothing to show for it.
 * "speakerphone" is the documented React Native fallback when the list is empty.
 *
 * Reports what it found either way — a voice fault you cannot see is the thing
 * that made this hard to diagnose in the first place.
 */
function routeToSpeaker() {
  try {
    const devices = (vapi?.getAudioDevices?.() || []).filter(Boolean);
    const named = devices.map((d) => String(d.value ?? d.label ?? d)).filter(Boolean);
    const loud = named.find((n) => /speaker/i.test(n));
    const chosen = loud || "speakerphone";
    vapi.setAudioDevice(chosen);
    handlers.onEvent("audio", { devices: named, chose: chosen });
  } catch (e) {
    handlers.onEvent("audio", { error: String(e?.message || e) });
  }
}

export async function stop() {
  try { await vapi?.stop(); } catch {}
  handlers.onEvent?.("status", "ended");
}

export function setMuted(muted) {
  try { vapi?.setMuted(!!muted); } catch {}
}

// Type a message into a live voice session (keyboard fallback).
export function say(text) {
  try {
    vapi?.send({ type: "add-message", message: { role: "user", content: text } });
  } catch {}
}
