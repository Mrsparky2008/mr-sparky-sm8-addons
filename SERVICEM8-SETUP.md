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

## What a first look already found (5 Oct 2026)

Counted from 917 form responses. **Start here rather than rediscovering it.**

### 1. The CCEW is split across six forms, and five are still in use

The statutory certificate - the one lodged to BCNSW - is being filled in on
whichever version the tech happens to tap:

| Form | All time | Since 1 Jul |
|---|---|---|
| 202_Certificate of Compliance Electrical Work (CCEW) | 33 | **13** |
| BCNSW CCEW | 7 | **7** |
| BCNSW CCEW 1.4 | 4 | **4** |
| BCNSW CCEW 1.2 | 4 | **4** |
| BCNSW CCEW 1.3 | 2 | **2** |
| Test Form CCEW | 3 | 0 |
| Certificate of Compliance Electrical Work (CCEW) *(inactive)* | 5 | 0 |

**This is the first thing to look at.** If the fields differ between versions
then the eCert lodgement is reading different shapes of the same certificate,
and a statutory document is not a place for five versions. There is also a live
form called "Test Form CCEW".

Related: the lodgement itself is built and running - see `docs/ecert` and
sections 11-15 of `CLAUDE.md` in `mr-sparky-network`.

### 2. The JSA has quietly stopped being filled in

`101_Job Safety Analysis (JSA) - Procedures`: **155 all time, 1 since July.**

Either it moved somewhere else or it was abandoned. A safety form that stopped
being used is a compliance exposure, not a tidiness problem. **Find out which
before touching it.**

Two more in the same shape - used, then not:

| Form | All time | Since 1 Jul |
|---|---|---|
| Inspection report | 43 | **0** |
| Test & Tag | 7 | **0** |
| TCA1 | 2 | **0** |

### 3. Form 001 is the one that actually gets used

`001 - Job Share and Expenses`: **605 responses, 49 since July.** Three times
everything else put together.

That makes it the one worth making faster, and the one where a saved tap is
worth the most. It is also the form the retired form-to-sheets Lambda used to
copy into a Google Sheet - that is gone now, so where its answers should end up
is an open question.

### 4. Badges

Fifteen active, and two of them are both called **CCEW**. One is called
**"test badge"**.

### What this suggests, without deciding it

The system is not short of forms. It has a workhorse that everybody uses, a
safety form that has stopped, a few that have fallen out of use, and one
statutory certificate wearing five different faces. **Consolidating the CCEW
and finding out what happened to the JSA are worth more than anything new.**
