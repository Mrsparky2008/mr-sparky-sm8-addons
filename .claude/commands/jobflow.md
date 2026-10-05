---
description: Optimise the ServiceM8 job flow for contractors, and polish the app GUI
---

# Job flow and app GUI

You are starting a session on **how the contractors' work flows through
ServiceM8**, and on polishing the Mr Sparky app around it. It runs **alongside**
another Claude session on the same business, so the first instruction matters
more than the rest.

---

## 1. Branch first. Before anything else.

Another session is working in these repos right now. Two sessions committing to
the same branch is how a morning's work disappears.

```bash
git checkout -b claude/jobflow-$(date +%m%d)
```

Then, for the whole session:

- **Add files by name. Never `git add -A` or `git add .`** — you will sweep up
  another session's half-finished work and commit it as yours.
- **Never force-push, never rebase a shared branch, never amend somebody
  else's commit.**

The other session works in `mr-sparky-network` and the `mr-sparky-portal`
worktrees. **This session lives in `sm8-addons`.** A portal change gets agreed,
not reached for.

---

## 2. THIS IS NOT A BUILD JOB

Steven, 5 Oct 2026, and it is the whole brief:

> **"I want to optimise ServiceM8 with what it has, not build anything new
> unless absolutely useful and ingenious."**

ServiceM8 is a mature product that already does almost all of this. **The
default answer is a setting, a template or a form — not code.** An addon is the
last resort, and it has to be obviously better than the native thing it
replaces, not merely newer.

**Before proposing anything, you must be able to say why ServiceM8 cannot
already do it.** If you cannot, you have not read enough.

### What is already there — counted, not guessed (5 Oct 2026)

| | |
|---|---|
| **Queues** — these ARE the buckets | **21** |
| **Badges** | **66** |
| **Forms** | **33**, with **917** responses |
| **Categories** | **4** |
| **Job templates** | **2** |

The active queues:

> To be Quoted · To be Scheduled · Call Customer · Check Customer Message /
> Email · Follow-up · For Review · Order Parts/Supplies · Waiting on
> Parts/Supplies · Reinspection/Revisit · Awaiting Approval

The categories:

> 001 - Mr Sparky Network · 002 - Contractor Client · 010 - Warranty Claim ·
> 003 - Mr Sparky Network pool

Checklists already sit on the job card — "101_Job Safety Analysis (JSA)" and
"001 - Job Share and Expenses" among them.

**Read all of it before designing anything.** Sixty-six badges and thirty-three
forms is not a blank page — it is more likely a system that has grown without
pruning. **Removing a form may be worth more than adding one.**

**`SERVICEM8-SETUP.md` in the root of this repo lists every queue, category,
badge, form and template by name.** Read it first - it needs no credentials and
it is the fastest way to see the shape of what is there.

**And read the inactive counts correctly.** 66 badges with 15 active, 33 forms
with 10 active, 21 queues with 10 active.

That is NOT clutter. Steven, 5 Oct 2026: **"SM8 didn't delete anything."**
ServiceM8 never deletes - deactivating IS how you remove something, and the
record stays because old jobs still reference it. So the inactive ones have
already been taken out. Somebody has pruned this.

Two things follow, and both matter:

1. **The live system is the active set** - 10 queues, 15 badges, 10 forms, 4
   categories, 1 template. Judge the setup on those, not on the totals.
2. **Removing something is cheap and safe.** It does not destroy history; the
   old jobs keep their badge or their form response. So if a form has outlived
   its use, say so - the cost of retiring it is close to zero.

Never propose "deleting" a ServiceM8 object. The word is deactivate.

To refresh it, or to look deeper:

```
GET https://api.servicem8.com/api_1.0/{queue|badge|form|category|jobtemplate}.json
```

The key is in AWS Secrets Manager, `mr-sparky/servicem8-job-push-telegram`,
field `SERVICEM8_API_KEY`, region `us-east-1`. **Read only — never write to
ServiceM8 from a script without Steven saying so.**

---

## 3. The brief

Make the contractors' work flow better: **buckets, mandatory forms and
checklists**, so the job moves efficiently and the customer stays well informed,
**without overloading the subbies with steps.**

That last clause is the hard part and the whole test. Every form is a tax on a
man standing in somebody's hallway with a torch in his teeth.

**Judge every idea against these, in order:**

1. **Does ServiceM8 already do this?** If yes, the work is configuration and
   showing Steven where it lives. Stop there.
2. **Does it save the sparky a step, or cost him one?** A checklist that
   replaces a phone call is a win. One that duplicates what ServiceM8 already
   knows is a tax.
3. **Does the customer find out something they would otherwise have chased?**
   On the way, running late, done, here is your certificate.
4. **Can it be answered with a tap?** Typing on a phone, one-handed, in a roof
   space, is the thing to design out.
5. **What happens if he skips it?** If nothing, it is not mandatory and should
   not pretend to be. If something, say what.

**Deleting and merging counts as progress.** Fewer, better-placed forms beat
more of them.

---

## 4. The app

Polish, not rebuild. (`voice-assist/app`, Expo.)

- `voice-assist/DESIGN.md` — **the locked design spec. It wins over everything,
  including `lib/theme.js`. Steven approves changes; nobody else.**
- `app/components/ui.js` — Header, JobChip, StatusChip, Card, Cta, Empty.
  **Use these. Do not invent a second button.**
- `app/screens/` — AllJobs, Apply, Diary, Earnings, JobCard, JobDiary,
  JobMaterial, Jobs, SignIn, Welcome, WhatsNext, plus `admin/` and `pay/`.
- `app/App.js` — a plain stack in state. No React Navigation.

**Built, deployed, and not yet called by the app** — do not rebuild these:

| What | Where |
|---|---|
| Accept a job | `POST /api/jobs/accept` |
| Register for push | `POST`/`DELETE /api/push/register` |

Sections 14 and 15 of `CLAUDE.md` in `mr-sparky-network` explain them.

---

## 5. Who you are working with

**Steven Sukar is not a developer.** Read `CLAUDE.md` in `mr-sparky-network`
first — it is the handover notes for the whole business and it is kept current.

- Plain words. Short replies. **One command at a time.**
- He thinks in problems, not solutions. "Why does this take four taps?" is the
  brief. Work out the fix and tell him what you recommend.
- **He is usually right when he pushes back.** If he says a screen is useless,
  replace it rather than defending it.
- **Never guess.** His words: *"Don't guess. If you're guessing, let me know.
  You read the code. You give me the answer."*
- Anything decided belongs in a file, not the chat.

---

## 6. Rules that are not negotiable

- **Number masking is the core of the product.** Real client phone numbers live
  only in the `customers` table. Never on a screen a contractor sees.
- **Nobody accepts work unless Steven created them in ServiceM8 by hand.** The
  gate is `canAccessJobs`. Do not add a second way in.
- **Employees do not claim and do not see money.** What they complete belongs to
  the subcontractor they work for.
- **Do not write to ServiceM8 programmatically** without Steven agreeing it.
  Configuration changes are his to make in the console, where he can see them.
- **Do not publish to the `production` EAS channel.** Jason and his employees
  are on it; a publish reaches their phones in minutes with no review. Build on
  `preview` — a separate app they cannot receive.
- **A rename, a native capability or a new permission needs a rebuild and an
  App Store submission.** Only JavaScript goes over the air.

---

## 7. Where the business actually is

There are **no subbies on the network yet** — Steven, Jason, and Jason's
employees. The contractor side has no live users, so process can change freely.
Jobs arriving and being accepted is real. The call path is **not** live.

Target is 3–5 new sparkies a month. Design for the man who joins in six months
and has never been shown anything.

---

**Start by reading the queues, forms and badges that already exist. Then tell
Steven what you found — especially anything that looks unused, duplicated or in
the wrong place — and ask him what annoys him most about the current flow.**
That answer is worth more than any amount of designing.
