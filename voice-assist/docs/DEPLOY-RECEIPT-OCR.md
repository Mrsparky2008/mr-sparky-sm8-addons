# Deploy note — the receipt reads itself

Steven, 2026-08-06: *"AI can read the receipt, fill in all the details. If it
doesn't have a job number, ask for it. If it has the wrong job number, flag it.
And we should have a cancel option somewhere."*

## Two halves, two deploys

**App half — OTA, no build needed.** `screens/pay/AddReceipt.js` and
`lib/api.js`. Ships with `eas update`.

**Backend half — needs a Lambda deploy from the PC.** New route
`POST /api/receipt/read` in `backend/index.mjs`, new `readReceipt()` in
`backend/brain.mjs`.

    cd voice-assist/backend
    node deploy.mjs

No new environment variables: it uses the `CLAUDE_API_KEY` and `CLAUDE_MODEL`
the brain already runs on. No new IAM, no new services, no new spend beyond a
few cents of vision tokens per docket.

**Order matters slightly, but nothing breaks either way.** If the OTA lands
first, the read call 404s and the screen says "Couldn't read the photo — type
the details in", which is exactly the old behaviour. Nothing is blocked.

## What the route does, and deliberately does not do

It reads. It doesn't file. The photo goes to Claude with a forced tool call, so
the reply comes back schema-shaped rather than as prose to be parsed, and the
model is told to **omit** anything it can't read — an empty field is correct, a
guessed one is a false record someone signs off on. Values that survive are
tidied server-side (amount must be a positive number, date must be a real
`YYYY-MM-DD`) and anything that doesn't survive arrives as `null`.

The job number gets one extra step. A number printed on a docket is a claim,
not a fact, so the route looks it up in the ServiceM8 job index before the app
shows it, and returns what SM8 says that job actually is:

    docket: { jobNumber, label, known, address, contact, status }

That's what lets the app say *"the paper says Order No: 4821 — #4821,
12 Smith St Marrickville · Work Order — you're filing it to #4830"* instead of
a bare number the reader has to trust.

## What the screen does with it

- Fields fill in the moment the photo is taken. Every one is editable, and a
  field you've typed in is never overwritten by a re-read.
- **Mismatch is flagged, never resolved automatically.** Two buttons: file to
  the docket's job, or keep the one you opened. Whichever way it goes, if the
  paper named a different job that fact is appended to the receipt's note, so
  nobody has to reconstruct it later.
- **No job anywhere** — no anchor, nothing readable on the paper — and it asks.
  Save stays disabled until a job is chosen.
- A docket number ServiceM8 doesn't recognise never becomes the job. It says so
  and asks for the right one.
- **Cancel**, under Save. Nothing is saved until the button is pressed, so it
  simply drops the lot.

## Still true

The receipt stays anchored to where you opened it from — Steven's call:
*"I'd leave receipt entry from within the diary, because there may be some
receipts where it doesn't have the job number."* The reading is an assistant
filling in the form, not a router deciding where the money goes.

And the other one: `portal-receipts-any-job.patch` still has to be deployed to
the **portal** Lambda, or a receipt on a live Work Order is refused no matter
how well it was read.
