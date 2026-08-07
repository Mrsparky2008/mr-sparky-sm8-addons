// Vapi voice session — WebRTC audio with real echo cancellation, Deepgram
// listening, ElevenLabs speaking, and OUR brain behind it (the assistant's
// custom-LLM points at the same Lambda bridge the phone line uses).
//
// This replaces the hand-rolled mic/VAD/TTS stack: turn-taking, barge-in and
// echo are the transport's job here, not ours.
import Vapi from "@vapi-ai/react-native";
import { VAPI_PUBLIC_KEY, VAPI_ASSISTANT_ID } from "./config";

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
      // Opened from a job card or the jobs list: tell the brain which job we
      // are on so it doesn't open by asking a question we already answered.
      // Sent as a system line, so it never appears as something the user said.
      const j = handlers.job;
      if (j?.job_number) {
        try {
          vapi.send({
            type: "add-message",
            message: {
              role: "system",
              content: `APP_CONTEXT: the user has job ${j.job_number}${j.address ? ` (${j.address})` : ""} open on screen. Anchor to it and get straight to work.`,
            },
          });
        } catch {}
      }
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
    vapi.on("error", (e) => handlers.onEvent("error", String(e?.message || e)));
  }
  handlers.onEvent("status", "connecting");
  await vapi.start(VAPI_ASSISTANT_ID);
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
