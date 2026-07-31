# AI Assist Voice — standalone conversational quoting app (SCOPE, locked 2026-07-31)

Steven's words: "I wanna have a conversation with AI. I don't wanna be listening to script reading."

## What it is
A standalone installable web app (home-screen icon on phone, also works on desktop) for having a
real spoken conversation with AI Assist — primarily to build quotes, plus core admin actions.
NOT launched from a ServiceM8 job card: Steven opens the app and anchors it to a job by
number/address/identifier; the app looks the job up itself.

## Core workflow (the quoting loop)
1. Open app → say/give a job number or identifier → app pulls the job and confirms it.
2. Steven rattles off the work conversationally ("level off a whole bunch of stuff").
3. AI comes back with a polished, professionally-worded line-item list (wording style per the
   existing quote-workshop rules), iterates with him — wording, prices, quantities.
4. "Okay, go for it / apply" → dumps the agreed lines into the job's Billing (invoicing) section.
   Add-only guarantee carries over: can never delete or edit existing lines. Duplicate guard active.

## Also in v1 (existing toolbox carries over)
- Move/book/cancel bookings ("move that job to Thursday")
- Add notes to the job card
- Job lookup by number/address/keyword

## Queued features (deliberately easy adds later)
- Send SMS to customer (with spoken confirmation gate before sending)
- Note addressed to a person, e.g. "note for Marites: ..." → note formatted to notify/assign
  Marites on the job card
- Whatever else surfaces from use — backend tool additions are ~1-hour jobs

## Smoothness bar (the actual point)
- Live streaming transcription with fast end-of-speech detection (no "pause and hope")
- Claude begins thinking before the sentence is finished
- Speech-out starts within ~0.5s (first sentence speaks while the rest composes)
- Barge-in: talking over the AI stops it and it listens
- Target: < ~1.5s from Steven finishing a sentence to the AI starting to answer
- Natural neural Aussie voice — START with Amazon Polly neural (en-AU "Olivia", near-free,
  already on AWS); upgrade path to ElevenLabs if not natural enough for Steven

## Architecture notes
- Front end: PWA (installable), WebSocket/stream connection
- Backend: reuses the ENTIRE existing AI Assist brain (tools, prompts, guards) from
  handlers/assist.mjs — the brain is shared; only the ears/mouth/transport are new
- Auth: stored ServiceM8 key (like Henri), tech account first — NOT the per-click add-on token
  (standalone has no job-card session). App itself gated by a login/PIN.
- This build is also the natural moment for the agreed backend split to its own Lambda/repo.

## Build phases
- Phase 1 (DONE 2026-07-31): PWA + voice loop + job lookup + quoting workflow end-to-end.
  Verdict after live testing: backend/brain/voice-out excellent; browser round-based mic is
  fundamentally unreliable on phones (works once, hangs on auto-restart). Browser ceiling hit.
- Phase 2 (DECIDED 2026-07-31, Steven: "let's do it"): NATIVE APP via Expo (React Native).
  - Native continuous speech recognition (SFSpeechRecognizer-grade) — mic opens once, stays
    open, true barge-in, no tap-per-turn
  - Backend UNCHANGED — the app is a new front-end on the same Lambda /chat SSE + Polly
  - Test path: Expo Go on Steven's iPhone (free, no Apple account) → TestFlight later ($99/yr,
    optional, only for a standalone home-screen install)
  - OTA updates via Expo Updates = keep one-minute deploys, no app-store review per change
  - ~2-3 days to first working version; ~1 week polished
  - The PWA stays live as the desktop face (auto-loop works well there)
  - SUPERSEDED: the browser streaming-mic (Amazon Transcribe) plan — skip unless native path fails
  - BUILT 2026-07-31 (app v0.1, `voice-assist/app`, Expo SDK 54 = App Store Expo Go): reality
    check — expo-speech-recognition is dev-build-only (NOT loadable in Expo Go), and every iOS
    dev-build route needs the $99 Apple account. So the app has TWO speech paths, auto-detected:
    (a) Expo Go TODAY: native mic recording + silence auto-stop (metering VAD) → new backend
    /stt endpoint (Amazon Transcribe streaming, en-AU — the one sanctioned exception to
    "backend unchanged"; /chat and the PWA untouched) → normal /chat turn; hands-free loop
    with auto-relisten, tap-to-interrupt. (b) Dev build LATER: expo-speech-recognition
    continuous mic + true barge-in — code already wired, activates automatically.
  - PIVOT 2026-07-31 (Steven's call, keys in hand): VOICE LAYER -> VAPI. Steven found the
    Expo Go round-based loop as clunky as the PWA (correct — same architecture ceiling), and
    chose a managed voice platform over the $99 Apple dev-build path. Built same day:
    /llm/chat/completions OpenAI-SSE bridge on the Lambda (Bearer LLM_TOKEN, brain unchanged,
    VERIFIED), Vapi assistant 8ff8436f-b6b3-4c3b-9226-0a70d22f2c63 (Deepgram nova-2 en-AU,
    ElevenLabs Charlie AU voice, custom-llm -> bridge), PWA page rewritten to Vapi Web SDK
    (voice v1.0: WebRTC call, live captions, barge-in by talking, PIN gate + 15-min idle
    relock + auto-hangup on backgrounding, typed path kept via /chat). Works on iPhone Safari
    — native Expo app now a fallback branch, not the main line. BLOCKED ON: Steven adding a
    payment method to the Vapi account (calls 402 until then).
- Phase 3 (queued): SMS tool, Marites-notes, custom domain, wake word / lock-screen listening
  if wanted (native makes these possible)

## Explicitly rejected
- Job-card-launch as the primary entry (kept only as a secondary door via existing add-on)
- Robot/browser TTS voice
