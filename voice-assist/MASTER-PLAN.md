# Mr Sparky AI Voice — MASTER PLAN (locked 2026-08-01)

The single reference for every scenario. Execute in order; no backtracking.
One brain, many faces. Nothing here replaces anything already built.

## The one shared foundation (exists today)
- **Brain**: Lambda `mr-sparky-ai-assist` (ap-southeast-2) — Claude + full ServiceM8 toolbox
  (find_job, quote workshop w/ add-only billing + dupe guard, bookings, notes, status, clone).
  Repo: github.com/Mrsparky2008/mr-sparky-sm8-addons → voice-assist/backend/.
  ALL surfaces talk to this one brain. Improvements land everywhere at once.
- **Voice policy (LOCKED, Steven 2026-08-01)**: staff surfaces (app + Steven's line) run on
  POLLY (near-free; "techs and myself can manage with Polly") — ElevenLabs is reserved for
  CUSTOMER-FACING Voice Henri ("happy to pay for a good voice for paying customers"), sub
  starts only when Henri goes live. Upgrade staff to 11labs later "when we're making money
  and have a company image to maintain" — it's a one-setting swap, no rebuild.
- App stack final: Apple ears (free) + our orchestration + brain + Polly voice. No Vapi,
  no ElevenLabs, no per-minute cost. App runs on: Apple $99/yr + Claude tokens.

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
  **auth = EXISTING PORTAL CREDENTIALS** (Steven's call 2026-08-01: sign in once with the
  mr-sparky-portal account, persistent session + Face ID unlock — no separate users/PINs;
  portal role drives permissions: bookings self-assign, signed notes, contractors scoped);
  screen feedback (live captions + drafted quote lines on screen — Steven's standing request).
- **Skin locked 2026-08-01**: https://claude.ai/code/artifact/0dc1b247-0554-4100-bb63-7ca3b28539b1
  (AU-wiring-code state colours: active brown = mic live, neutral blue = idle, earth green =
  locked in; dark cab UI, glove-sized targets). Build to match screen-for-screen.
- **Steven's final picks (2026-08-01)**: LOOK A (Switchboard dark) + BOTH bonus screens
  (Day diary + Job card) in v1. Real Mr Sparky logo embedded (SVG from mrsparky.com.au;
  true brand = navy #19488F + yellow #FEDA00 — consider tuning accents to true navy later).
- **GRAND PLAN (Steven, 2026-08-01)**: the app grows into the PRIMARY ServiceM8 interface
  for the whole crew — staff eventually interact with SM8 "through the app only". And the
  SUBBIE PORTAL (mr-sparky-portal, live on AWS — read ~/Documents/mr-sparky-app CLAUDE.md
  before touching) becomes an app module: since app sign-in ALREADY = portal credentials,
  a contractor logging in simply sees portal features (job pool, claims, expenses) + scoped
  Charlie; staff see diary/jobs/quoting. One app, role-shaped. Sequence unchanged: Charlie
  v1 first, portal module after.
- **This is also the seed of the broader company app** (job lists, timesheets, whatever) —
  Charlie is feature #1, not the whole app.

## Cost summary (locked assumptions)
| Surface | Per-use cost | Flat cost |
|---|---|---|
| Steven phone (Vapi) | ~12c/min → ~7c/min after BYO keys | — |
| Voice Henri (Vapi) | same per-min, offset by jobs won | — |
| Staff app | ~zero (Claude tokens only) | 11labs $5-22/mo + Apple $99/yr |
| Add-on + web app | Claude tokens only | — |

## App build — live coordination facts (2026-08-01)
- **EAS/Expo project created by Steven**: id `d31c0122-3886-4d57-8388-ec1bfd817f9f`
  (link the app with: `npx eas-cli@latest init --id d31c0122-3886-4d57-8388-ec1bfd817f9f`)
- **Apple Developer enrolment: PENDING** (individual; submitted 2026-08-01, expect ≤48h).
  When active, Steven supplies: Team ID, enrolment Apple ID, App Store Connect API key
  (.p8 saved to voice-assist/, Key ID + Issuer ID), for EAS-signed TestFlight builds.
- **Session ownership**: the Expo-app session owns voice-assist/app/; other sessions keep to
  backend/brain/Vapi. Coordinate through this file + git.

## Execution order (no backtracking)
1. NOW: Steven uses the phone line daily; audition voices in Vapi dashboard; get ElevenLabs
   sub + BYO keys into Vapi (cost drop, also pre-req for Henri's voice).
2. NEXT (Steven's go): Voice Henri — switchboard + customer brain + own voice.
3. THEN (second user demand): Apple account + Mr Sparky app (staff Charlie, logins, screen).
4. ONGOING: brain polish items land for every surface simultaneously.
