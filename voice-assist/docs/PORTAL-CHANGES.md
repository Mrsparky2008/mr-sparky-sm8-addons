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

## 3. ONE CONSOLE CHANGE — the app's client must be an accepted audience

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
