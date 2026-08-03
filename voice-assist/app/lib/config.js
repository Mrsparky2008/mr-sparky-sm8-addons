// AI Assist native app — shared constants.
// Same backend as the PWA: Lambda mr-sparky-ai-assist streaming Function URL.
export const BACKEND = "https://ty7yjtyvwm5jhuk7hu2tztpxaq0htqpm.lambda-url.ap-southeast-2.on.aws";
export const VERSION = "app v0.9";

// Voice engine: "vapi" = WebRTC session (real echo cancellation, Deepgram ears,
// ElevenLabs voice, our brain via the assistant's custom-LLM bridge).
// "local" = the hand-rolled mic/Polly path kept as a fallback.
export const VOICE_ENGINE = "vapi";
export const VAPI_PUBLIC_KEY = "13a3a262-9ccf-4fb5-a69e-0c943718dce6";
export const VAPI_ASSISTANT_ID = "8ff8436f-b6b3-4c3b-9226-0a70d22f2c63";
