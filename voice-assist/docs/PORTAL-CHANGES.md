# Changes the app needs in the portal repo

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

## Still needed from Steven — two environment variables

Both are on the `mr-sparky-portal-api` Lambda, so one look gets both:

1. **`COGNITO_CLIENT_ID`** — is it `5pvilebmogbvcf1edja0uatcrj` (the client the
   app signs in with)? The portal API is protected by an API Gateway JWT
   authoriser, which validates the token's audience. If the IDs differ, the
   app's token is rejected at the gateway and **nothing on the Pay side works** —
   the fix is to add the app's client to the authoriser's audience list.
2. **`PORTAL_URL`** — the API Gateway base URL. It is not in the repo. Goes into
   `voice-assist/app/lib/config.js` as `PORTAL`; until it is set, `portal.js`
   refuses to call rather than firing requests at a placeholder.
