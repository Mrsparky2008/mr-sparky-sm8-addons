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
