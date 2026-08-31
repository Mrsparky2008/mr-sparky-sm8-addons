// AI Assist native app — shared constants.
// Same backend as the PWA: Lambda mr-sparky-ai-assist streaming Function URL.
import Constants from "expo-constants";

export const BACKEND = "https://ty7yjtyvwm5jhuk7hu2tztpxaq0htqpm.lambda-url.ap-southeast-2.on.aws";

// The subcontractor portal. Confirmed 2026-08-05 off its own sign-in redirect
// (redirect_uri=https://portal.mrsparky.com.au/). The portal repo's CLAUDE.md
// still says "no custom domain yet" and gives only an API Gateway URL — that
// line is out of date; api/shell.mjs already handles both origins.
//
// The portal signs in through the SAME Cognito pool as this app
// (us-east-1_xOJ0DPHK6) but through a DIFFERENT client: the portal is a browser
// client using code + PKCE (3nkghs3rv6uk58ms62afqviu3d), this app is a native
// one using USER_AUTH (5pvilebmogbvcf1edja0uatcrj). Its API sits behind an API
// Gateway JWT authoriser, which validates the token's audience — so this app's
// client has to be listed there or every call 401s before the handler runs.
// See ../../docs/PORTAL-CHANGES.md. That is the first thing to check if the Pay
// tab says the session has ended the moment it opens.
export const PORTAL = "https://portal.mrsparky.com.au";

// Read from the resolved app config rather than typed here. This used to be a
// hand-written string and it drifted — it still said v2.0 while app.json had
// moved to 2.1.0, so the app told you the wrong version about itself.
// The native BUILD NUMBER rides along (Steven, 30 Aug: "build version would
// be handy — app 2.1.0 build (xx)"), and the OTA update date answers "which
// of tonight's five updates am I actually on".
import * as Updates from "expo-updates";

// nativeBuildVersion comes back null on the shipped builds, so the number
// is stamped into app.config.js extra per runtime (Steven, 30 Aug 2026:
// "can we have the build no or maybe both").
const buildNo = Constants.nativeBuildVersion || Constants.expoConfig?.extra?.iosBuild;
const build = buildNo ? ` (${buildNo})` : "";
const ota = Updates.createdAt
  ? ` · update ${new Date(Updates.createdAt).toLocaleDateString("en-AU")} ${new Date(Updates.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`
  : " · embedded";
export const VERSION = `app v${Constants.expoConfig?.version || "?"}${build}${ota}`;

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
