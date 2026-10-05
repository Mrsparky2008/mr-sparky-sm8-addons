# What ServiceM8 is already set up to do

Pulled from the ServiceM8 API on 5 October 2026 and written down so a session
can read it **without AWS credentials** - a cloud or phone session has none,
and the key lives only on the PC and the Mac.

**This is configuration, not secrets.** No keys, no customer data, no money.

Refresh it from a machine that has credentials:

```
GET https://api.servicem8.com/api_1.0/{queue|category|badge|form|jobtemplate}.json
```

---

## The numbers

| | Active | Total |
|---|---|---|
| Queues (the buckets) | 10 | 21 |
| Categories | 4 | 4 |
| Badges | 15 | 66 |
| Forms | 10 | 33 |
| Job templates | 1 | 2 |

**917 form responses** have been submitted against those forms.

**Read the gap between Active and Total correctly.** ServiceM8 never deletes -
deactivating is how you remove something, and the record stays because old jobs
still reference it. So the inactive ones have already been taken out, not
forgotten. The live system is the ACTIVE column.

It also means retiring something is cheap: history keeps working.

---

## Queues - what Steven calls the buckets

A job sits in one queue at a time. This is the spine of the flow.

- **To be Quoted**
- **To be Scheduled**
- **Call Customer**
- **Check Customer Message / Email**
- **Follow-up**
- **For Review**
- **Order Parts/Supplies**
- **Waiting on Parts/Supplies**
- **Reinspection/Revisit**
- **Awaiting Approval**

Inactive, kept for history: Nicholas - Follow up, Nicholas - Hussle, Parts on Order, Peter - Flexible bookings , Peter - Follow up, Peter - Hussle, Scheduled Work, Steven, Uber Pool, Work orders to be scheduled , Workshop

## Categories

- **001 - Mr Sparky Network**
- **002 - Contractor Client**
- **003 - Mr Sparky Network pool**
- **010 - Warranty Claim**

## Job templates

- **Mr Sparky Network Pool**
- **(no name)**

## Forms

Thirty-three is a lot. Worth asking which of these are still filled in, and
which are two forms that should be one.

- 001 - Job Share and Expenses
- 101_Job Safety Analysis (JSA) -  Procedures
- 202_Certificate of Compliance Electrical Work (CCEW)
- 203_Fire Safety Certificate 
- BCNSW CCEW 1.4
- DB Schedule Chassis 
- DB Schedule DIN Rail
- Inspection report 
- TCA1
- Test & Tag

Inactive: BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW, BCNSW CCEW 1.0, BCNSW CCEW 1.2, BCNSW CCEW 1.2, BCNSW CCEW 1.3, Certificate of Compliance Electrical Work (CCEW), Fire Safety Certificate , Job Safety Analysis (JSA) Card, Job Safety Analysis (JSA) Card (1), Job Safety Analysis (JSA) Card (1), Sample Authority to Proceed, Sample Contract Variation, Sample Job Safety Analysis, Sample Vehicle Safety Maintenance Check, Test Form CCEW

## Badges

Sixty-six. Badges are free to create and never get tidied, so this is the
most likely place to find clutter - and removing some may be worth more than
adding anything.

- Booking Reminder
- CCEW
- CCEW
- DB_CHASSIS
- DB_DIN
- FSC
- Form 001
- Inspection
- JSA Card
- T&T
- TCA1
- Take Payment Facilities
- VIP
- Warranty
- test badge

---

## What a first look found (5 Oct 2026, corrected)

Counted from the live form responses. **Start here rather than rediscovering
it** - and read the correction below before trusting any count in this file.

### How to count form responses properly

The first version of this section got it wrong twice, and both traps are easy
to fall into:

1. **Use `timestamp`, not `edit_date`.** `edit_date` is the LAST EDIT. A
   response filled in during May and touched in August looks like August.
2. **Check whether the FORM is still active**, not just the response. ServiceM8
   never deletes, so an inactive form still has all its old responses - and
   those responses are not evidence that anybody can still fill it in.

Steven, 5 Oct 2026, correcting this: **"only 1.4 is available per job."**

### 1. The BCNSW CCEW versions are a sequence, not a conflict

| Form | Filled since 1 Jul | Form active |
|---|---|---|
| BCNSW CCEW 1.4 | 4 | **yes - the only one in the picker** |
| BCNSW CCEW 1.3 | 2 | no |
| BCNSW CCEW 1.2 | 4 | no |
| BCNSW CCEW | 7 | no |

Steven has been revising it and deactivating each version as he replaced it.
That is the system working. **Nothing to fix here.**

### 2. But there ARE two active CCEW forms

| Form | Total | Since 1 Jul |
|---|---|---|
| `202_Certificate of Compliance Electrical Work (CCEW)` | 32 | **13** |
| `BCNSW CCEW 1.4` | 4 | **4** |

Both are active and both appear in the form picker. 202 is used three times as
often.

**Worth asking, not assuming:** is 202 the older route that BCNSW CCEW 1.4 is
replacing, or do they do different jobs? It matters because the eCert
lodgement reads a form to build the certificate - see `docs/ecert` and sections
11-15 of `CLAUDE.md` in `mr-sparky-network`. If it reads one and the techs are
filling in the other, certificates go missing.

### 3. The JSA has quietly stopped

`101_Job Safety Analysis (JSA) - Procedures`: **155 all time, 1 since July.**
The form is still active and still in the picker - it is simply not being
filled in.

Either it moved somewhere else or it was abandoned. A safety form that stopped
being used is a compliance exposure, not a tidiness problem. **Find out which
before touching it.**

Same shape - active, in the picker, not used:

| Form | Total | Since 1 Jul |
|---|---|---|
| Inspection report | 17 | **0** |
| Test & Tag | 7 | **0** |
| TCA1 | 2 | **0** |
| DB Schedule Chassis | 1 | **0** |
| DB Schedule DIN Rail | 0 | **0** |

### 4. Form 001 is the one that actually gets used

`001 - Job Share and Expenses`: **604 responses, 49 since July.** More than
everything else put together.

That makes it the one worth making faster, and the one where a saved tap is
worth the most. It is also the form the retired form-to-sheets Lambda used to
copy into a Google Sheet - that is gone now, so where its answers should end up
is an open question.

### 5. Badges

Fifteen active, two of them both called **CCEW**, one called **"test badge"**.

### What this suggests, without deciding it

The forms are not a mess. There is a workhorse everybody uses, a tidy sequence
of CCEW revisions, and a handful that have fallen out of use. The two questions
worth a straight answer are **which CCEW form is the real one now**, and **what
happened to the JSA**.
