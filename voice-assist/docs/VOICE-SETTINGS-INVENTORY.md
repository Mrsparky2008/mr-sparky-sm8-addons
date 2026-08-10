# Charlie Voice — Settings Inventory

**Assistant:** `8ff8436f-b6b3-4c3b-9226-0a70d22f2c63`
**Prepared:** 10 August 2026
**Status:** Nothing has been changed. Every setting below is on its platform default unless marked otherwise.

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

| Parameter | Type | Range / options | Default | Current | Controls | New value |
|---|---|---|---|---|---|---|
| ⚠️ `startSpeakingPlan.transcriptionEndpointingPlan.onPunctuationSeconds` | number (s) | float | `0.1` | default (presumed) | Silence to wait when the transcript ends **with** punctuation | |
| `startSpeakingPlan.transcriptionEndpointingPlan.onNoPunctuationSeconds` | number (s) | float | `1.5` | default (presumed) | Silence to wait when there's **no** punctuation | |
| `startSpeakingPlan.transcriptionEndpointingPlan.onNumberSeconds` | number (s) | float | `0.5` | default (presumed) | Silence to wait when the transcript ends on a **number** | |
| `startSpeakingPlan.transcriptionEndpointingPlan.waitSeconds` | number (s) | float | not stated | default (presumed) | Base delay after transcription, before the branches above | |
| ⚠️ `startSpeakingPlan.smartEndpointingPlan.provider` | enum | `off` · `livekit` · `vapi` · `krisp` · `deepgram-flux` · `assembly` | `off` | default (presumed) | Whether the **words** get a vote on "are they finished", or only silence does | |
| `startSpeakingPlan.smartEndpointingPlan.waitFunction` | string (expression) | maths expr, `x` = probability | `200 + 8000 * x` | n/a unless LiveKit on | LiveKit only. Maps probability-they're-done → wait in ms | |
| `startSpeakingPlan.smartEndpointingPlan.threshold` | number | 0.0 – 1.0 | `0.5` | n/a unless Krisp on | Krisp only. Audio-based confidence cut-off | |
| `startSpeakingPlan.waitSeconds` | number (s) | 0 – 5 | `0.4` | default (presumed) | Final pause after the turn commits, before Charlie's audio starts | |
| `startSpeakingPlan.customEndpointingRules` | object[] | `{type, regex, timeoutSeconds}` | none | none (presumed) | Per-phrase timeout overrides | |

**LiveKit `waitFunction` presets:**

- Conservative — `700 + 4000 * max(0, x-0.5)`
- Normal — `(20 + 500 * sqrt(x) + 2500 * x^3 + 700 + 4000 * max(0, x-0.5)) / 2`
- Aggressive — `2000 / (1 + exp(-10 * (x - 0.5)))`

⚠️ = most likely cause of the mid-sentence cut-offs. See "Prime suspects" below.

---

## 2. Vapi — Stop Speaking Plan

*How easily the speaker can interrupt Charlie once he's talking.*
Not the reported fault, but the other half of turn-taking.

| Parameter | Type | Range / options | Default | Current | Controls | New value |
|---|---|---|---|---|---|---|
| `stopSpeakingPlan.numWords` | integer | 0 – 10 | `0` | default (presumed) | Words needed to cut Charlie off. `0` = voice-activity detection, so any noise interrupts | |
| `stopSpeakingPlan.voiceSeconds` | number (s) | 0 – 0.5 | `0.2` | default (presumed) | How long noise must last to count as an interruption. Applies only when `numWords = 0` | |
| `stopSpeakingPlan.backoffSeconds` | number (s) | 0 – 10 | `1.0` | default (presumed) | How long Charlie stays quiet after being interrupted before he may resume | |
| `stopSpeakingPlan.acknowledgementPhrases` | string[] | list of phrases | platform list | default (presumed) | Backchannel noises ("mm-hm", "yeah") that must **not** interrupt | |
| `stopSpeakingPlan.interruptionPhrases` | string[] | list of phrases | platform list | default (presumed) | Phrases that always interrupt ("stop", "hang on") | |

---

## 3. Deepgram — Transcriber (the ears), via Vapi

Upstream of everything above. If Deepgram finalises a transcript early, no Vapi setting can
rescue it — **two cut-off timers in series, and the tighter one wins.**

| Parameter | Type | Range / options | Default | Current | Controls | New value |
|---|---|---|---|---|---|---|
| `transcriber.provider` | enum | deepgram · assembly · gladia · … | — | **deepgram** ✅ | Which STT engine | |
| ⚠️ `transcriber.model` | enum | `nova-2` · `nova-3` · `flux-general-en` · … | — | **nova-2** ✅ | Accuracy, latency — *and* which turn-detection features are available at all | |
| `transcriber.language` | string | BCP-47 | — | **en-AU** ✅ | Accent model | |
| ⚠️ `transcriber.smartFormat` | boolean | true / false | unknown | unknown | Inserts punctuation, formats numbers. **This is what feeds `onPunctuationSeconds`** — the link between the two platforms | |
| `transcriber.numerals` | boolean | true / false | unknown | unknown | "one six seven" → "167". Changes which endpointing branch fires on job numbers | |
| `transcriber.confidenceThreshold` | number | 0.0 – 1.0 | `0.4` ⁽ᵛ⁾ | unknown | Drops low-confidence words before they reach endpointing | |
| `transcriber.keywords` | string[] | `["word", "word:2"]` | none | unknown | Boosted vocabulary — trade terms, suburb names, "switchboard", "RCD" | |
| `transcriber.keyterm` | string[] | nova-3 only | none | n/a on nova-2 | Keyterm prompting for named terms | |
| `transcriber.eotThreshold` | number | 0.5 – 0.9 | — | **n/a — Flux only** | End-of-turn confidence | |
| `transcriber.eotTimeoutMs` | integer (ms) | 500 – 10000 | `5000` | **n/a — Flux only** | Max wait before force-finalising a turn | |
| `transcriber.eagerEotThreshold` | number | 0.0 – 1.0 | — | **n/a — Flux only** | Early end-of-turn guess for snappier replies | |

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

| Parameter | Type | Range / options | Default | Current | Controls | New value |
|---|---|---|---|---|---|---|
| `silenceTimeoutSeconds` | number (s) | seconds | `30` | default (presumed) | Hangs the call up after total silence | |
| `backgroundSound` | enum / URL | `off` · `office` · URL | `off` (web/RN) | **off** ✅ | Ambient bed — already off, and staying off | |

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

**Record each change here** — setting, old value, new value, what it did. This document going
stale is exactly how everything ended up on defaults in the first place.

### Change log

| Date | Setting | From | To | Result |
|---|---|---|---|---|
| | | | | |

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
