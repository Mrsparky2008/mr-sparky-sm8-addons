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
export async function start({ onEvent }) {
  handlers = { onEvent: onEvent || (() => {}) };
  if (!vapi) {
    vapi = new Vapi(VAPI_PUBLIC_KEY);
    vapi.on("call-start", () => handlers.onEvent("status", "live"));
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
      }
    });
    vapi.on("error", (e) => handlers.onEvent("error", String(e?.message || e)));
  }
  handlers.onEvent("status", "connecting");
  await vapi.start(VAPI_ASSISTANT_ID);
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
