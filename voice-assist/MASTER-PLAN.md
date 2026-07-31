# Mr Sparky AI Voice — MASTER PLAN (locked 2026-08-01)

The single reference for every scenario. Execute in order; no backtracking.
One brain, many faces. Nothing here replaces anything already built.

## The one shared foundation (exists today)
- **Brain**: Lambda `mr-sparky-ai-assist` (ap-southeast-2) — Claude + full ServiceM8 toolbox
  (find_job, quote workshop w/ add-only billing + dupe guard, bookings, notes, status, clone).
  Repo: github.com/Mrsparky2008/mr-sparky-sm8-addons → voice-assist/backend/.
  ALL surfaces talk to this one brain. Improvements land everywhere at once.
- **Voice identity**: "Charlie" (ElevenLabs) for STAFF surfaces. Customer agent gets its own
  DISTINCT voice (pick female, so staff/customer agents are never confused).
- **ElevenLabs subscription (Steven's own, ~US$5-22/mo)**: ONE sub feeds everything —
  BYO key into Vapi for calls, direct API for the app.

## Scenario 1 — Steven, driving (LIVE TODAY)
- **Stack**: Phone call → 0482 088 317 (voice side) → Twilio → Vapi (timing/barge-in/ears)
  → custom-LLM bridge → brain. Voice: ElevenLabs Charlie via Vapi.
- **Auth**: caller allowlist (env ALLOWED_CALLERS) — only Steven's mobile reaches Charlie.
- **Cost**: ~12c AUD/min all-in; drops when BYO ElevenLabs/Deepgram keys are added to Vapi.
- **Backup number**: +1 603 403 9184 (free Vapi US number).
- **Remaining tweaks (do anytime)**: BYO 11labs key in Vapi; dup-note fix; midnight-"tomorrow"
  ask-don't-guess; wrap-up "lock the quote in before you go?" prompt.

## Scenario 2 — Steven, at a desk (LIVE TODAY)
- **Stack**: SM8 job-card add-on (chat popup, uuid 019fb596-…) + web app
  (Lambda page, PIN 633154). Text-first; web app speaks via Polly.
- **No changes planned.** These ride brain improvements for free.

## Scenario 3 — Customers calling in: "VOICE HENRI" (BUILD NEXT, on Steven's go)
- **Stack**: same number 0482 088 317 → Vapi **assistant-request switchboard**
  (per-caller routing endpoint on our Lambda):
    - Steven/staff numbers → Charlie (staff assistant, full powers)
    - everyone else → **Voice Henri**: SEPARATE assistant + SEPARATE locked-down brain —
      intake ONLY (Henri's SMS persona/rules/knowledge base: gather problem/address/urgency,
      service-area check, create lead/job, emergency → Telegram alert). NO diary/billing/status
      powers. Own ElevenLabs voice (distinct from Charlie).
- **Why calls pay for themselves**: after-hours + missed calls become booked jobs.
- **Cost control**: BYO ElevenLabs + Deepgram keys in Vapi → Vapi charges orchestration only.
- **Build steps**: (1) BYO keys, (2) switchboard endpoint + number serverUrl, (3) Voice-Henri
  brain (port Henri's intake prompt, restricted tools), (4) test hard like Henri's launch,
  (5) SMS side of the number NEVER changes (text-Henri stays; snapshot/restore sms_url after
  ANY Vapi number operation — Vapi hijacks it on import, proven 2026-08-01).

## Scenario 4 — Techs/contractors: "MR SPARKY APP" (the $99 moment)
- **Trigger**: Charlie proven + a second person wants access. NOT before.
- **Stack**: Native app (Expo/React Native, iPhone first) —
  **Apple on-device speech (free ears) + brain via /chat SSE + ElevenLabs direct (Charlie)**.
  NO Vapi, NO per-minute cost. Polly = fallback voice if 11labs sub lapses.
- **Needs**: Apple Developer US$99/yr; TestFlight distribution (covers 100 users);
  per-person logins (bookings self-assign, signed notes, scoped powers — contractors can
  quote but not cancel, etc.); screen feedback (live captions + drafted quote lines on
  screen — Steven's standing request).
- **This is also the seed of the broader company app** (job lists, timesheets, whatever) —
  Charlie is feature #1, not the whole app.

## Cost summary (locked assumptions)
| Surface | Per-use cost | Flat cost |
|---|---|---|
| Steven phone (Vapi) | ~12c/min → ~7c/min after BYO keys | — |
| Voice Henri (Vapi) | same per-min, offset by jobs won | — |
| Staff app | ~zero (Claude tokens only) | 11labs $5-22/mo + Apple $99/yr |
| Add-on + web app | Claude tokens only | — |

## Execution order (no backtracking)
1. NOW: Steven uses the phone line daily; audition voices in Vapi dashboard; get ElevenLabs
   sub + BYO keys into Vapi (cost drop, also pre-req for Henri's voice).
2. NEXT (Steven's go): Voice Henri — switchboard + customer brain + own voice.
3. THEN (second user demand): Apple account + Mr Sparky app (staff Charlie, logins, screen).
4. ONGOING: brain polish items land for every surface simultaneously.
