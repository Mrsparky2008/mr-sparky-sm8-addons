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
- Phase 1 (~1 week): PWA + streaming voice loop + job lookup + quoting workflow end-to-end
- Phase 2 (few days): barge-in, polish, install-to-home-screen niceties, SMS + named-note tools

## Explicitly rejected
- Job-card-launch as the primary entry (kept only as a secondary door via existing add-on)
- Robot/browser TTS voice
