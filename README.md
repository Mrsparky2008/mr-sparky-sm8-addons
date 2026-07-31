# Mr Sparky — ServiceM8 Add-ons (backups)

Backups of ServiceM8 **Simple Function Add-ons**. The live code is hosted in the
ServiceM8 developer portal editor (Developer → Store Items) and runs on ServiceM8's
own infrastructure — **the portal is the source of truth**. If you edit an add-on in
the portal, paste the updated code here and push.

## Add-ons

### ai-assist/
"AI Assist" — job-card chat assistant for staff (smart scheduler/admin helper):
book/move/cancel bookings, check the diary, notes, reminders, job status, clone
job. Backend = POST https://webchat.mrsparky.com.au/assist (Henri's Lambda,
handlers/assist.mjs). Manifest has BOTH an "online" (desktop web) and "app"
(mobile) action — SM8 shows a button only for the platforms declared.

- Install URL: https://go.servicem8.com/addon_install?uuid=019fb596-165a-7c2d-8a12-a5a9c4ee98eb
- Install per account (tech AND primary are separate installs); the assistant
  acts on whichever account it was opened from.

### job-cloner/
"Job Cloner" — job-card action that duplicates a job for re-inspection:
creates a new Quote-status job at the same address/company/category/PO/reference
(description prefixed "Re-inspection (auto): …" with the original appended) and
copies the JOB + BILLING contacts across.

- Install URL: https://go.servicem8.com/addon_install?uuid=60e2541e-af6f-4d90-a96e-23270474412b
- Auth: per-invocation temporary OAuth token (`event.auth.accessToken`) — no stored keys.
- Note: the AWS Lambda `sm8-advnaced-clone` (ap-southeast-2) is a leftover debug stub
  from development, not part of this add-on.
