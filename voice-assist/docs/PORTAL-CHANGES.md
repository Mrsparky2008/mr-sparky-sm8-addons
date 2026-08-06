# Changes the app needs in the portal repo

## How to deploy this repo — `portal-deploy-script.patch`

Apply once, then every deploy after it is one command.

    git apply <sm8-addons>/voice-assist/docs/portal-deploy-script.patch
    node scripts/deploy.mjs

It runs the test suite first and refuses to upload if anything fails, builds
the bundle itself, uploads, and waits for the function to go active.

**Why a script and not three typed commands.** PowerShell's `Compress-Archive`
writes zip entries with **backslashes**. The Linux Lambda runtime reads those
as one file with an odd name rather than as directories, so the function can't
import itself and the portal is down until somebody works out why. The script
writes the archive itself with forward slashes — the same lesson
`voice-assist/backend/deploy.mjs` was written for.

It also refuses to upload if the function's configured handler isn't
`api/index.handler`, because this bundle keeps `api/ lib/ settings/` as real
directories and a mismatch there would replace working code with something the
runtime can't find.

Nothing about the deploy changes: same function (`mr-sparky-portal-api`), same
region (`us-east-1`), same file set the CLAUDE.md always said to zip.


## 5. The suppliers list — `portal-suppliers.patch`

Steven, 2026-08-06: *"a section in settings to add common suppliers to select
from ... if not in list select other and open a field to type the supplier
name. It will serve as dial purposes later."*

The receipt form on the phone gets a row of chips instead of a free-text box,
so the same wholesaler is spelled one way and spend actually groups. It is a
shortcut, never a gate: **Other** and a typed name always work.

**What's in it**

- `lib/suppliers.mjs` — the list and the matcher, with `DEFAULT_SUPPLIERS` as
  the seed. `matchSupplier` is deliberately conservative: a whole name or alias
  appearing in the text, never a fuzzy near-miss. A confidently wrong match
  would file one wholesaler's spend under another's name and nobody would spot
  it. 7 new tests.
- `settings/portal-settings.json` — a `suppliers` array. **Aliases are what the
  docket prints**: the paper says MIDDENDORP ELECTRIC CO PTY LTD, the trade
  says Middy's. That is what lets a photographed receipt land on the right chip.
- `lib/settings-store.mjs` — `suppliers` added to `EDITABLE`, so the office can
  maintain it without a deploy.
- `api/index.mjs` — `/api/me` serves the list (the cheap route the app calls on
  every launch), and `/api/settings` serves the **effective** list to the admin
  pane.
- `api/shell.mjs` — a Suppliers card and section under Settings: name, phone,
  add, remove. Aliases are not editable there and ride through a save
  untouched — they are a reading concern, not an office one.

**The DynamoDB trap this sidesteps:** stored settings win over the bundled
file, so a new key added to the JSON never appears live on an existing
install. `suppliersFor()` falls back to the seed when settings carry no list,
which is exactly the `DEFAULT_*` pattern the repo already uses — so the chips
work the moment it deploys, with no need to clear the settings item, and the
first save from the pane persists the list properly.

**Verified: 200/200 tests pass** (193 existing, 7 new), including
`test/shell-script.test.mjs`, which is the one that matters for `api/shell.mjs`
— it parses the emitted browser script and checks every `data-*` hook has a
listener and every CSS class is styled.

    git apply /path/to/voice-assist/docs/portal-suppliers.patch
    node --test "test/*.test.mjs"

**Base it is cut from:** the portal tree with sections 1–4 already applied —
i.e. current master on the PC, not the pre-patch base. The PC session flagged
that section 4's file had been generated against the old base and hit a
duplicate-function trap because of it; this one does not repeat that, and
touches no file section 4 touched except `api/index.mjs`, in two unrelated
routes.

Until it lands the phone simply shows no chips and the supplier is typed, as
it is today.

**AGM Electrical Supplies is in the seed** because it is the first real docket
that went through the reader (2026-08-06, $130.17, IN688575). The seed is a
starting point, not a survey — the office adds the rest in the pane.

## 4. URGENT — receipts could never be filed from the field

`portal-receipts-any-job.patch`. Found by Steven trying to lodge a real L&H
docket, twice: **"Not your job, or not found"** on a job he was standing on.

The receipt route required the job to be on the caller's STATEMENT. The
statement is built from `loadData`, which at `api/index.mjs:85` keeps only
`status === 'Completed'` jobs, and then attributes them by Form 001. So a
receipt could only be filed against a job that was already finished AND
carried the subbie's form — the opposite end of the day from when a docket is
in your hand at the wholesaler, mid-Work-Order.

The check is now "does this job exist in ServiceM8", using `allJobStatus`
which `loadData` already indexes across every job at every status.

**Why this is safe:** filing is not payment. The receipt records who lodged
it, the S3 key is scoped to their contractor id, and reimbursement still runs
through the commission engine, which pays only on jobs genuinely theirs. A
receipt against a job that never becomes theirs sits visible to the office and
unpaid — strictly better than the previous behaviour, which was to refuse
every receipt anyone tried to take on site.

**Verified:** 193/193 tests still pass. `api/shell.mjs` untouched.

**Status (2026-08-06, 8:00pm):** applied and tested on the PC — 193/193, one
file, 15 insertions. The deploy was authorised there; confirm it landed by
re-saving a receipt on a live Work Order. Until the Lambda actually carries it,
the app shows *"Not your job, or not found"* at save even though the docket
read perfectly, which is exactly what job #167595 did on the first real run.

**Note for anyone regenerating this patch file:** it was cut against the
pre-patch base, so re-applying it to current master hits a duplicate-function
trap. Diff against `9331b78` instead.

## Where this stands (2026-08-06, ~11:45am — morning-after update)

- ✅ Gateway audience widened (section 3) — done from Steven's phone at 12:08am
- ✅ Portal URL confirmed and wired into the app (`portal.mrsparky.com.au`)
- ✅ **The patch below is DEPLOYED** — applied on the PC by a local Claude Code
  session, 193/193 tests, smoke-tested live, committed to the portal repo as
  `9331b78` on master. The rollback zip of the pre-deploy code is in that
  session's scratchpad (copy it somewhere durable if wanted). Sections 1–2 are
  kept as the record of what changed and why.
- ✅ Apple side done: ASC key `WA5RT56XZ7` on EAS, distribution certificate
  created, Steven's iPhone registered (UDID captured via the register-device
  page after iOS's one-hour Stolen Device Protection delay).
- ⏳ The dev build — queued/running from the PC as of this update; install link
  lands on Steven's iPhone when it finishes. Quota was a non-issue: the account
  is on the paid Starter plan.
- Known nit for the NEXT App Store submit (not today): `eas.json`
  `submit.production` still points at `../AuthKey_R59FG54N39.p8`, which lives
  only on the PC. Fine as long as submits run there.
- Not built, by choice: the entitlement gate. It needs a decision on where the
  paid-seat flag lives in `people[]` first.
- Cleanup once the build is installed: revoke the Expo robot token that
  appears in the session transcript, delete the spare undownloaded Apple key
  `9H7U8P3T8N`, and delete `AuthKey_WA5RT56XZ7.p8` from Downloads once it's
  uploaded to EAS.

The subcontractor portal (github.com/Mrsparky2008/mr-sparky-portal) is a
separate repo and a separate deploy. This session can edit and test it but
**cannot deploy it** — the AWS credentials live on Steven's PC and there is no
CI. So changes it needs land here as reviewed patches.

Apply from the portal repo root:

    git apply /path/to/voice-assist/docs/portal-app-support.patch
    node --test "test/*.test.mjs"
    # then zip api/ lib/ settings/ and update the Lambda as per its CLAUDE.md

**Verified: 193/193 tests pass with the patch applied** (186 existing, 7 new).
`api/shell.mjs` is not touched by any of it, so the web portal's behaviour is
unchanged and its template-literal hazard stays out of play.

## 1. The admin approval inbox — `all=1` on GET /api/claims

**Why:** `GET /api/claims` returns one contractor at a time; an admin has to
pass a name. The phone's approval inbox asks the opposite question — "is there
anything waiting?" — and there was no call that answers it.

**What it does:** adds `all=1` (and an optional `status=submitted`) to the
**existing** route. Admin only. Returns every contractor's claims with
`contractorId` and `contractorName` attached, oldest first, so the list can say
whose claim it is and what has been waiting longest.

**Why a parameter and not a new route:** a new route in this API needs the API
Gateway route *and* a Lambda invoke permission added by hand, or the gateway
returns 500 with the handler never running. `template.yaml` is already out of
date. Same path and method means none of that applies.

The browser never sends `all`, so it takes the existing branch unchanged.

## 2. `claimable` on GET /api/statement — the figure, served not derived

**Why:** the app must not do arithmetic (see the rule in `app/lib/portal.js`),
but the Earnings screen has to headline "what's ready to claim". That number
only existed in `api/shell.mjs` as `claimableNow()`, computed in the browser.

Its own comment records what that cost:

> "Ready to claim" must mean the same thing here as it does in the list below
> it. It previously counted jobs already on a claim, so the tile and the heading
> under it disagreed by tens of thousands of dollars.

That is precisely the failure a second client invites. So `claimableNow()` moves
into `lib/claims.mjs` as a pure, tested function and is returned on the statement
as `claimable` — selection and total out of the same pass, by construction.

**What it returns:** `jobNumbers`, `helperJobNumbers`, `jobCount`, `jobsIncGst`,
`helpingIncGst`, `totalIncGst`, `totalExGst`, `gstAmount`.

**Additive:** the browser ignores a field it does not read, so nothing changes
for the web today. Worth doing later, separately: point `api/shell.mjs` at
`DATA.claimable` and delete its local copy, so the two can never disagree again.
That one *does* touch the shell, so run `test/shell-script.test.mjs` before
deploying it.

**New tests:** `test/claimable.test.mjs` — 7 cases, including the one that bit
(a job already on a claim must leave both the list and the total together), and
that a helping-hand line and the job of the same number are claimed separately.

## 3. ~~ONE CONSOLE CHANGE~~ — DONE, live since 2026-08-06 ~12:08am

Steven made this change from his phone: authorizer `cognito-portal` (id
`fymw6d`) on `mr-sparky-portal-api (qqrq18zxxk)` now lists BOTH audiences —
verified by screenshot of the saved authorizer. The gateway accepts the app's
tokens as of that moment. Nothing below remains to be done; the section is kept
because it explains WHY there are two audiences, which someone will eventually
wonder.

**Both unknowns are now answered** (2026-08-05, read off the portal's sign-in
redirect):

| | |
|---|---|
| Portal URL | `https://portal.mrsparky.com.au` — set in `app/lib/config.js` |
| Cognito pool | `us-east-1_xOJ0DPHK6` — **the same pool the app uses** |
| Portal client | `3nkghs3rv6uk58ms62afqviu3d` (hosted UI, code + PKCE) |
| App client | `5pvilebmogbvcf1edja0uatcrj` (native, USER_AUTH) |

Same pool, **different clients** — so this change is required before the Pay or
Business tabs can load anything:

> **API Gateway → the portal's HTTP API → Authorization → the JWT authorizer →
> Audience → add `5pvilebmogbvcf1edja0uatcrj`**, keeping `3nkghs3rv6uk58ms62afqviu3d`.

Without it every portal call from the app returns 401 at the gateway, before the
handler runs — which the app reports as "Your session has ended", because from
the phone's point of view that is indistinguishable from an expired token.

**Why not just point the app at the portal's client instead:** the app's own
backend hard-checks the audience (`voice-assist/backend/auth.mjs:65`), so that
would break the Work and Charlie tabs and need a second Lambda deploy. It would
also mean either enabling password auth on the browser client, which weakens it,
or putting the app back through the hosted-UI redirect that going native
avoided. Two clients on one pool is the right shape; the audience list exists so
one API can trust several.

**Identity is unaffected.** `caller()` in `api/index.mjs` matches people on
`email` or `cognitoSub`, both pool-level — the same person resolves the same way
whichever client minted the token.

**If `/api/me` returns `notSetUp` after the audience is fixed:** the ID token's
`email` claim is not matching any `people[]` entry in
`settings/portal-settings.json`. That is a settings gap, not an auth problem, and
signing in again will never fix it.
