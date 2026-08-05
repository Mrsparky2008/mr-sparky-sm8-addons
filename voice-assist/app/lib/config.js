// AI Assist native app — shared constants.
// Same backend as the PWA: Lambda mr-sparky-ai-assist streaming Function URL.
import Constants from "expo-constants";

export const BACKEND = "https://ty7yjtyvwm5jhuk7hu2tztpxaq0htqpm.lambda-url.ap-southeast-2.on.aws";

// The subcontractor portal. Its own repo's CLAUDE.md says "no custom domain
// yet" and gives only the API Gateway URL, but that line is out of date —
// api/shell.mjs already handles "the custom domain and the original API Gateway
// URL both work", and portal.mrsparky.com.au resolves into AWS us-east-1, which
// is where the portal Lambda runs. (mrsparky.com.au itself is not on AWS at all.)
//
// Inferred, not confirmed: this sandbox's network policy would not let the page
// be fetched to check. If the Pay tab cannot reach anything, this is the first
// line to doubt. portal.js refuses to call at all while it is empty, rather than
// firing requests at a placeholder and reporting it as a network error.
export const PORTAL = "https://portal.mrsparky.com.au";

// Read from the resolved app config rather than typed here. This used to be a
// hand-written string and it drifted — it still said v2.0 while app.json had
// moved to 2.1.0, so the app told you the wrong version about itself.
export const VERSION = `app v${Constants.expoConfig?.version || "?"}`;

// "dev" when this is the side-by-side test build (see app.config.js). Two
// identical dark apps on one home screen is a mistake waiting to happen, and
// the mistake would be approving a real claim from a test build.
export const VARIANT = Constants.expoConfig?.extra?.variant || "production";
export const IS_DEV_APP = VARIANT === "dev";

// Voice engine: "vapi" = WebRTC session (real echo cancellation, Deepgram ears,
// ElevenLabs voice, our brain via the assistant's custom-LLM bridge).
// "local" = the hand-rolled mic/Polly path kept as a fallback.
export const VOICE_ENGINE = "vapi";
export const VAPI_PUBLIC_KEY = "13a3a262-9ccf-4fb5-a69e-0c943718dce6";
export const VAPI_ASSISTANT_ID = "8ff8436f-b6b3-4c3b-9226-0a70d22f2c63";
