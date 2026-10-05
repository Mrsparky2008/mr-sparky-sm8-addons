---
description: Design session — app GUI and the ServiceM8 job flow for contractors
---

# Job flow and app GUI

You are starting a **design and build session** on the Mr Sparky app and the
ServiceM8 process the contractors work inside. It runs **alongside** another
Claude session working on the same business, so the first instruction matters
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
- If you need the other session's latest work, merge the base branch in
  deliberately. Do not assume it is there.

The other session works mainly in `mr-sparky-network` and the `mr-sparky-portal`
worktrees. **This session lives in `sm8-addons`.** If you need a portal change,
say so and agree it rather than reaching in.

---

## 2. Who you are working with

**Steven Sukar is not a developer.** Read `CLAUDE.md` in `mr-sparky-network`
first — it is the handover notes for the whole business and it is kept current.

- Plain words. Short replies. **One command at a time.**
- He thinks in problems, not solutions. "Why does this take four taps?" is the
  brief. Work out the fix yourself and tell him what you recommend.
- **He is usually right when he pushes back.** If he says a screen is useless,
  it is useless — do not defend it, replace it.
- Anything decided belongs in a file, not in the chat. The chat is gone next
  week.

---

## 3. The brief

> Polish the app GUI, and the ServiceM8 job management the contractors work
> inside — **buckets, mandatory forms and checklists** — so the work is more
> efficient and the customer stays well informed, **without overloading the
> subbies with steps.**

That last clause is the hard part and the whole test. Every form is a tax on a
man standing in somebody's hallway with a torch in his teeth. The job is to
make the *right* thing the easy thing, not to add gates.

**Judge every idea against these, in order:**

1. **Does it save the sparky a step, or cost him one?** A checklist that
   replaces a phone call is a win. One that duplicates what ServiceM8 already
   knows is a tax.
2. **Does the customer find out something they would otherwise have chased?**
   On the way, running late, done, here is your certificate.
3. **Can it be answered with a tap?** Typing on a phone, one-handed, in a roof
   space, is the thing to design out.
4. **What happens if he skips it?** If nothing, it is not mandatory and should
   not pretend to be. If something, say what.

---

## 4. What already exists — read before designing

**The app** (`voice-assist/app`, Expo):

- `voice-assist/DESIGN.md` — **the locked design spec. It wins over everything,
  including `lib/theme.js`. Steven approves changes to it; nobody else.**
- `app/lib/theme.js` — tokens, type, spacing. Follows DESIGN.md.
- `app/components/ui.js` — Header, JobChip, StatusChip, Card, Cta, Empty. Use
  these. Do not invent a second button.
- `app/screens/` — AllJobs, Apply, Diary, Earnings, JobCard, JobDiary,
  JobMaterial, Jobs, SignIn, Welcome, WhatsNext, plus `admin/` and `pay/`.
- `app/App.js` — a plain stack in state. No React Navigation.

**ServiceM8** already has checklists on the job card — "101_Job Safety Analysis
(JSA)" and "001 - Job Share and Expenses" among them. Look at what is there
before adding to it.

**The backend is built and deployed, and the app does not call it yet:**

| What | Where |
|---|---|
| Accept a job | `POST /api/jobs/accept` |
| Register for push | `POST`/`DELETE /api/push/register` |
| The decisions behind both | `lib/jobaccept.mjs`, `lib/push.mjs` in the portal repo |

Sections 14 and 15 of the network `CLAUDE.md` explain both.

---

## 5. Rules that are not negotiable

- **Number masking is the core of the product.** Real client phone numbers live
  only in the `customers` table. Never put one on a screen a contractor sees.
- **Nobody accepts work unless Steven created them in ServiceM8 by hand.** The
  gate is `canAccessJobs`. Do not add a second way in.
- **Employees do not claim and do not see money.** Whatever they complete
  belongs to the subcontractor they work for.
- **Do not publish to the `production` EAS channel.** Jason and his employees
  are on it; a publish reaches their phones in minutes with no review. Build and
  test on `preview`, which is a **separate app** they cannot receive.
- **A rename, a new native capability, or a new permission needs a rebuild and
  an App Store submission.** Only JavaScript goes over the air.
- **Do not deploy anything in the other session's repos** without agreeing it.

---

## 6. How to work

1. **Look before you design.** Open the screens, read DESIGN.md, look at a real
   job card in ServiceM8. Most of the answer is already on screen somewhere.
2. **Show him, do not describe.** A mockup he can look at beats three
   paragraphs. He has said so repeatedly.
3. **One change at a time, deployed and seen**, rather than a batch he has to
   unpick.
4. **Write the reasoning into the file you change**, in his words where you
   have them. The next session has only what is written down.
5. **Never guess.** If you are not sure, read the code or say you are not sure.
   He has asked for this directly: *"Don't guess. If you're guessing, let me
   know. You read the code. You give me the answer."*

---

## 7. Where the business actually is

There are **no subbies on the network yet** — it is Steven, Jason, and Jason's
employees. The contractor side has no live users, so it can be changed freely.
Jobs arriving and being accepted is real. The call path is **not** live.

Target is 3–5 new sparkies a month. Design for the man who joins in six months
and has never been shown anything.

---

**Start by telling Steven which branch you are on, then ask him what is
annoying him most about the current flow.** That answer is worth more than any
amount of reading.
