# mr-sparky-ai-assist — the app's backend

The Lambda behind the native app's work tab, Charlie, and the job routes.

- **Function:** `mr-sparky-ai-assist`, region **ap-southeast-2** (NOT us-east-1
  like everything else — always pass the region)
- **URL:** the `BACKEND` constant in `../app/lib/config.js`
- In this repo since the Charlie/standards commits (see git log). Deploy with
  node deploy.mjs - it zips with forward slashes; Compress-Archive breaks it.

## Authorization (added 27 Aug 2026)

`auth.mjs` proves a Cognito token is genuine. `authz.mjs` decides what its
owner may see, from the PORTAL'S people list (`mr-sparky-portal` DynamoDB
table, us-east-1, SETTINGS/CURRENT) — the same list the Telegram Approve
button writes. Approving someone is what grants app access; nothing is
maintained twice.

  Owner/Office/Admin -> everything (plus ADMIN_EMAILS env as belt-and-braces)
  Active Subbie      -> empty job list, 403 elsewhere; their money is in the
                        portal and their practice job in ServiceM8's own app
  anyone else        -> 403 on every /api route, Charlie included

Why it exists: every demo signup gets a genuine token, and before this gate a
demo login could read the entire job book — 608 customers with names and
addresses — and talk to Charlie, who holds ServiceM8 write tools.

## Deploying

Zip the files flat (no folder) and:

    aws lambda update-function-code --function-name mr-sparky-ai-assist \
      --region ap-southeast-2 --zip-file fileb://deploy.zip

Download the deployed zip FIRST and diff it — this function has been edited
in the console before.
