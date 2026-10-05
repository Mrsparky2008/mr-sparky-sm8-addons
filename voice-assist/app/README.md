# AI Assist — the Mr Sparky app

Expo (React Native, SDK 54), iPhone first. One app, role-shaped: staff get jobs,
Charlie and quoting; subcontractors get the portal; the owner gets both plus the
claims waiting on a decision.

Sign-in is the SAME account as the subcontractor portal — one login per person
across both.

## The four tabs

| Tab | What it answers | Backed by |
|---|---|---|
| **Work** | what am I doing | AI Lambda `/api/jobs`, `/api/job/{n}`, `/api/diary` |
| **Charlie** | talk to it | Vapi WebRTC → the brain's custom-LLM bridge |
| **Pay** | what am I owed | the subcontractor portal's API, natively |
| **Business** | what needs a decision | portal claims, admin only |

Work has a Jobs/Today segment rather than a fifth tab — five breaks glove-sized
targets, and the diary is a view of your work, not a peer of it.

## The rule the Pay and Business tabs are built on

**The phone renders. The portal calculates.**

No screen here adds, subtracts, applies a percentage or works out GST. Every
figure arrives already computed by `lib/*.mjs` in the portal repo, where the
rules live and where they have tests. A claim freezes its figures at submission
and the RCTI is built from that frozen copy; a second implementation on a phone
is how those numbers quietly stop agreeing.

Formatting is not calculating — putting a dollar sign in front of a number the
server sent is fine. Summing a column is not.

Two visible consequences, both deliberate:

- **No running total** while you tick jobs on and off a claim. With everything
  selected the served total is exact and shown; with a partial selection the app
  says the portal will confirm the figure, because that is the truth.
- **The RCTI is a WebView**, not a native screen. It is a document rendered from
  the frozen claim, and it leaves as a PDF via print.

## Two apps on one phone

The daily driver never has to come off to test the next version.

```bash
npx expo start                    # production identity
APP_VARIANT=dev npx expo start    # the dev app, own bundle id and icon
```

`app.json` says what the app is; `app.config.js` says which one is being built;
`eas.json` sets the variant per build profile. The dev app claims
`mrsparky-aiassist-dev://` so the ServiceM8 job-card button can never open a
test build, and it wears a stripe saying everything it does is real — because it
is, against live data.

```bash
eas build --profile development --platform ios   # one build, then JS is free
eas update --branch development                  # every JS change after that
```

`runtimeVersion` follows `appVersion`, so an OTA update only reaches builds of
the SAME version. Bumping `version` in app.json cuts off every phone still on
the old one until they take a new build.

## Files

- `App.js` — tabs, per-tab stacks, deep link, sign-in gate
- `components/` — `ui.js` (shared furniture), `TabBar.js`, `Logo.js`, `ErrorBoundary.js`
- `lib/api.js` — the AI Lambda: `/chat` SSE, jobs, job, diary
- `lib/portal.js` — the portal API, and the rule above in comment form
- `lib/auth.js` — Cognito USER_AUTH, refresh token in the Keychain behind Face ID
- `lib/vapiVoice.js` — the voice session
- `lib/config.js` — backend URLs, version and variant (read from the app config)
- `screens/` — Work and Charlie at the top level, `pay/` and `admin/` beneath

## Before the Pay and Business tabs work

Two environment variables off the `mr-sparky-portal-api` Lambda, and one patch —
see `../docs/PORTAL-CHANGES.md`. `PORTAL` in `lib/config.js` is empty until then,
and `portal.js` refuses to call rather than firing requests at a placeholder.

## Notes

- The PWA stays live at the Function URL as the desktop face, untouched.
- The web portal is untouched too, and stays the right place for analytics,
  settings and the ladder review — a big screen and a keyboard beat a thumb.
- `docs.expo.dev` is blocked by the cloud environment's network policy. The
  authoritative version map is `node_modules/expo/bundledNativeModules.json`,
  which is what `expo install` itself uses.
