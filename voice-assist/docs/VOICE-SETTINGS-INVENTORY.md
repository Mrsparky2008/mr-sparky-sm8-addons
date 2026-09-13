# Charlie Voice — Settings Inventory

**Assistant:** `8ff8436f-b6b3-4c3b-9226-0a70d22f2c63` (named **"AI Assist"** — "Charlie" is the
ElevenLabs *voice*, not the assistant)
**Prepared:** 10 August 2026 · **Read from the live API:** 13 August 2026

**Status: no longer presumed.** Every value below was read from the live assistant with an
authenticated call. The earlier framing — "everything is on defaults" — was **wrong**, and
wrong in a way that cost real time: the assistant had been tuned, and tuned *tighter* than the
platform defaults in exactly the places that were causing the trouble.

Read it before you reason about it. That is the lesson of this document.

---

## The stack

| Layer | What runs it |
|---|---|
| Orchestration | **Vapi** (managed) — WebRTC transport, turn-taking, barge-in |
| Ears (STT) | **Deepgram nova-2**, `en-AU` — via Vapi |
| Brain | **Anthropic Messages API**, streaming — our own AWS Lambda, 17 tools into ServiceM8 |
| Voice (TTS) | **ElevenLabs "Charlie" AU** — via Vapi |
| Client | React Native / Expo SDK 54 native app |

## The problem we're solving

Charlie decides the speaker has finished when they've only paused mid-sentence, and starts
talking over them. Latency *after* a genuine stop is acceptable.

**This is a turn-detection problem, not a speed problem.** Tune for patience, not for speed.

## Where these settings live — important

None of this is in our codebase. We searched every source file for `endpointing`,
`startSpeaking`, `stopSpeaking`, `transcriber`, `numWords`, `silenceTimeout`, `interrupt` —
nothing. The app holds only three Vapi values (engine flag, public key, assistant ID) and
sends only `firstMessage` and `variableValues` as per-call overrides.

Every setting below lives **server-side in the Vapi dashboard**. Consequences:

- Changes are made by clicking in the dashboard, not by deploying code.
- A change takes effect on the next call. Reverting is instant.
- The key our app holds is a **public** key and cannot read assistant config — which is why
  the "Current" column below says "default (presumed)" rather than a real number.

To fill in the real current values, one authenticated read is needed:

```
curl https://api.vapi.ai/assistant/8ff8436f-b6b3-4c3b-9226-0a70d22f2c63 \
  -H "Authorization: Bearer <VAPI_PRIVATE_KEY>"
```

---

## 1. Vapi — Start Speaking Plan

*When Vapi decides the speaker has finished and lets Charlie begin.*
**This is where the cut-off problem lives.**

| Parameter | Type | Default | **Was** (13 Aug) | **Now** | Controls |
|---|---|---|---|---|---|
| ⚠️ `…transcriptionEndpointingPlan.onPunctuationSeconds` | number (s) | `0.1` | **0.1** | **1** | Silence to wait when the transcript ends **with** punctuation |
| `…transcriptionEndpointingPlan.onNoPunctuationSeconds` | number (s) | `1.5` | **1** *(below default)* | **2** | Silence to wait when there's **no** punctuation |
| `…transcriptionEndpointingPlan.onNumberSeconds` | number (s) | `0.5` | **0.4** *(below default)* | **2** | Silence to wait when the transcript ends on a **number** |
| `…transcriptionEndpointingPlan.waitSeconds` | number (s) | not stated | *absent* | *absent* | Base delay before the branches above. Never set — so it adds nothing |
| `startSpeakingPlan.smartEndpointingPlan.provider` | enum | `off` | **livekit** | livekit | Whether the **words** get a vote on "are they finished", or only silence does |
| `startSpeakingPlan.smartEndpointingPlan.waitFunction` | string (expr) | `200 + 8000 * x` | **`2000 + 4000 * max(0, x-0.5)`** | unchanged | LiveKit only. Maps probability-they're-done → wait in ms |
| `startSpeakingPlan.waitSeconds` | number (s) | `0.4` | **0.2** *(below default)* | unchanged | Final pause after the turn commits, before Charlie's audio starts |
| `startSpeakingPlan.customEndpointingRules` | object[] | none | *absent* | *absent* | Per-phrase timeout overrides |

**The finding that mattered.** Both plans run at once, and the tighter one wins. Smart
endpointing being on did **not** take the punctuation timers out of play — they were live the
whole time at 0.1s. Deepgram's smart-format drops a comma after a filler word ("I want you to
look at, **um,**"), the punctuation branch fires at 100ms, and the turn commits mid-thought.
That is what split one sentence into three or four, each triggering its own reply.

**The wait function was a red herring.** `2000 + 4000 * max(0, x-0.5)` was already published
and live during a test that still fragmented badly — proof, in the assistant's own `updatedAt`
timestamp, that it was never the thing doing the damage.

**LiveKit `waitFunction` presets:**

- Conservative — `700 + 4000 * max(0, x-0.5)`
- Normal — `(20 + 500 * sqrt(x) + 2500 * x^3 + 700 + 4000 * max(0, x-0.5)) / 2`
- Aggressive — `2000 / (1 + exp(-10 * (x - 0.5)))`

⚠️ = most likely cause of the mid-sentence cut-offs. See "Prime suspects" below.

---

## 2. Vapi — Stop Speaking Plan

*How easily the speaker can interrupt Charlie once he's talking.*
Not the reported fault, but the other half of turn-taking.

| Parameter | Type | Default | **Live value** | Controls |
|---|---|---|---|---|
| `stopSpeakingPlan.numWords` | integer | `0` | **2** | Words needed to cut Charlie off. Already raised off 0 — this is the van road-noise protection, and it was in place before we started |
| `stopSpeakingPlan.voiceSeconds` | number (s) | `0.2` | **0.2** | How long noise must last to count as an interruption. Only applies when `numWords = 0`, so currently inert |
| `stopSpeakingPlan.backoffSeconds` | number (s) | `1.0` | **0.8** | How long Charlie stays quiet after being interrupted before he may resume |
| `stopSpeakingPlan.acknowledgementPhrases` | string[] | platform list | *absent* | Backchannel noises ("mm-hm", "yeah") that must **not** interrupt |
| `stopSpeakingPlan.interruptionPhrases` | string[] | platform list | *absent* | Phrases that always interrupt ("stop", "hang on") |

---

## 3. Deepgram — Transcriber (the ears), via Vapi

Upstream of everything above. If Deepgram finalises a transcript early, no Vapi setting can
rescue it — **two cut-off timers in series, and the tighter one wins.**

The **entire** live transcriber block is four lines:

```json
"transcriber": {
  "model": "nova-2",
  "language": "en-AU",
  "provider": "deepgram",
  "fallbackPlan": { "autoFallback": { "enabled": true } }
}
```

| Parameter | Live value | Controls |
|---|---|---|
| `transcriber.provider` / `.model` / `.language` | **deepgram / nova-2 / en-AU** | The ears |
| `transcriber.fallbackPlan.autoFallback.enabled` | **true** | Falls back to a backup STT provider if Deepgram falters |
| `transcriber.endpointing` | **absent** | Deepgram's own silence timer — **priority 0 on the tracker, now closed.** Not set, therefore on Deepgram's default and not reachable from Vapi's config. It is not the second timer we feared |
| `transcriber.smartFormat` | **absent** (Deepgram default) | Inserts the punctuation that feeds `onPunctuationSeconds`. Still doing so — the link between the platforms is real even though the field isn't set here |
| `transcriber.numerals` / `.confidenceThreshold` / `.keywords` | **absent** (defaults) | Never configured |
| `transcriber.eotThreshold` / `.eotTimeoutMs` / `.eagerEotThreshold` | **n/a — Flux models only** | Purpose-built end-of-turn detection, unreachable on nova-2 |

**Priority 0 is answered.** We spent a fortnight treating Deepgram's endpointing as the
dangerous unknown sitting upstream. It simply isn't set. The "an absent field is a valid
answer, not a blocked step" rule written into the method section is exactly what happened.

### Worth a decision

Deepgram's **Flux** models carry purpose-built end-of-turn detection (`eotThreshold`,
`eotTimeoutMs`, `eagerEotThreshold`), and Vapi exposes `deepgram-flux` as a smart-endpointing
provider. **None of it is reachable on nova-2.**

If turn detection is the whole problem, changing the transcriber model may be a more direct
fix than tuning silence timers. Bigger change, so it's a call to make deliberately.

---

## 4. ElevenLabs — Voice, via Vapi

Not implicated in the cut-off fault. Included because it's the other half of the audio
experience.

**Deliberately left blank.** Vapi's ElevenLabs config page didn't resolve when checked, and
we're not going to quote field names we haven't confirmed.

What is known for certain: the voice is **ElevenLabs "Charlie" AU**, configured entirely in
the Vapi dashboard. If stability, similarity, style, speed or streaming-latency optimisation
need tuning, name them and the exact field names will be confirmed against the live assistant
config first.

---

## 5. Vapi — Assistant level

| Parameter | Type | Default | **Live value** | Controls |
|---|---|---|---|---|
| `silenceTimeoutSeconds` | number (s) | `30` | **120** | Hangs the call up after total silence |
| ⚠️ `backgroundSound` | enum / URL | `off` (web/RN) | **`…/plugin/ai-ambient.wav`** | **A custom ambient bed plays through every call.** Not off, as previously recorded — someone chose this deliberately |
| `voice.provider` / `.model` / `.voiceId` | — | **11labs / eleven_flash_v2_5 / IKne3meq5aSn9XLyUdCD** | The voice everyone calls "Charlie" |

**The background sound is a live decision, not a bug.** The sound spec written for this project
says to remove any noise playing while the user speaks — a constant bed reads as the machine
talking over you, and it may also feed the voice-activity detection. It is still on. Left
alone deliberately, because someone chose that WAV on purpose. Switching it to `"off"` is a
one-field change whenever that call gets made.

---

## Prime suspects for the mid-sentence cut-offs

**1. `onPunctuationSeconds` = 0.1**

Deepgram's smart-format inserts punctuation as it goes. When someone pauses mid-thought, it
very often closes the clause with a comma or full stop. Vapi sees punctuation, applies the
**100 millisecond** branch, and commits the turn — the speaker has only taken a breath after
*"so the job at Ryde, the switchboard one,"* and Charlie is already talking.

Note the shape of the defaults: **0.1s with punctuation against 1.5s without.** A fifteen-fold
difference decided by whether a transcriber guessed a comma. For a natural, pausing speaker
that is exactly backwards.

**2. `smartEndpointingPlan.provider` = off**

With it off, silence is the only judge. Nothing weighs meaning — *"the switchboard is…"* and
*"that's all, thanks"* are treated identically if the silence matches. LiveKit's text-based
mode is Vapi's own recommendation for English, and its conservative wait function is built for
precisely this complaint.

**Also check:** Deepgram's own `endpointing` value. If it's set low, the transcript is
finalised early and nothing downstream can rescue it.

---

## Method for changing these

**One setting at a time.** Several of these mask each other — loosen the punctuation timer
*and* switch smart endpointing on together, and if the cut-offs stop you won't know which one
did it, or whether one fixed it while the other made something else worse.

**Two settings are coupled and must move together as a single change:**

- `smartEndpointingPlan.provider` and the `transcriptionEndpointingPlan` timers are
  *alternative mechanisms*, not independent dials.
- `smartFormat` and `onPunctuationSeconds` — turning smart-format off means no punctuation is
  inserted, so the punctuation branch stops firing entirely.

**Use a repeatable test.** Same phrase, same deliberate pause in the same place, every time.
For example: *"the job at Ryde — [pause two seconds] — the switchboard one"*. If the test
sentence changes between attempts, you're comparing nothing.

**Ask two questions after every test, not one.**

1. Did it cut you off? y/n
2. Did *short* answers feel sluggish — "yeah", "that's right", a job number? y/n

Question 2 is the one that gets forgotten. Raising `onPunctuationSeconds` buys patience and
pays for it in responsiveness on short complete utterances. If the cut-offs stop but short
answers drag, the tuning isn't finished — the right value sits between 0.1 and 0.6, so try
0.35 next. Logging only "no cut-off" lands you on the *first* value that works rather than the
best one.

**A missing field is a valid answer.** `transcriber.endpointing` is marked unverified above for
a reason: it appears in Vapi's custom-transcriber example, which is not the same thing as the
built-in Deepgram config. If the authenticated read returns no such field, that closes the
question — it isn't exposed, or it's on Deepgram's own default and out of reach. Don't treat an
absent field as a blocked step.

**Record each change here** — setting, old value, new value, what it did. This document going
stale is exactly how everything ended up on defaults in the first place.

### Change log

The working change log lives in **`Charlie-Voice-Settings-Tracker.xlsx`** (same folder),
Change Log tab — append-only, one row per change. This document is the reference; that
workbook is the thing you fill in as you go.

| Date | Setting | From | To | Result (cut off? y/n · short answers sluggish? y/n) |
|---|---|---|---|---|
| 13 Aug | *(read only — no change)* | — | — | Live config read for the first time. Every "presumed default" in this document was wrong; the assistant had been tuned tighter than default. Deepgram `endpointing` confirmed absent, closing priority 0 |
| 13 Aug | `onPunctuationSeconds` | 0.1 | **1** | *pending test* |
| 13 Aug | `onNoPunctuationSeconds` | 1 | **2** | *same change — one plan, one edit* |
| 13 Aug | `onNumberSeconds` | 0.4 | **2** | *same change. Matters because job numbers are read aloud with pauses between digits* |

---

## Confidence key

| Marker | Meaning |
|---|---|
| ✅ | Confirmed from project records or code |
| (no marker) | Parameter name, type and default from Vapi's published configuration docs |
| ⁽ᵛ⁾ | Appears on some Vapi pages and not others — probable, verify before relying on |
| unknown | Never recorded; needs an authenticated read of the live assistant config |

Every "Current" column entry reading *"default (presumed)"* means exactly that: the setting has
never been explicitly touched, so the platform default applies. That's an inference from the
absence of any config in our repo, not a reading of the live assistant.

**Sources:**
[Vapi — Voice pipeline configuration](https://docs.vapi.ai/customization/voice-pipeline-configuration) ·
[Vapi — Speech configuration](https://docs.vapi.ai/customization/speech-configuration) ·
[Vapi — Transcriber fallback configuration](https://docs.vapi.ai/customization/transcriber-fallback-plan)
