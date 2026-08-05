# Changes the app needs in the portal repo

The subcontractor portal (github.com/Mrsparky2008/mr-sparky-portal) is a
separate repo and a separate deploy. This session can edit and test it but
**cannot deploy it** — the AWS credentials live on Steven's PC and there is no
CI. So changes it needs land here as reviewed patches.

Apply from the portal repo root:

    git apply /path/to/voice-assist/docs/portal-claims-all.patch
    node --test "test/*.test.mjs"
    # then zip api/ lib/ settings/ and update the Lambda as per its CLAUDE.md

## portal-claims-all.patch — the admin approval inbox

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

**Blast radius on the web portal: none.** `api/shell.mjs` is not touched, so its
template-literal hazard and the test that guards it stay out of play. The
browser never sends `all`, so it takes the existing branch unchanged.

**Verified:** 186/186 tests pass with the patch applied.

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
