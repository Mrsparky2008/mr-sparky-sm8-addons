// The App Store reviewer's job book. Three invented jobs, no ServiceM8.
//
// Apple rejected 2.2.0 twice without ever seeing a contractor's side of the
// app, because that side is real: a subbie's Work tab is the jobs they ACCEPTED
// out of the live jobs table, and there is no accepting without Steven putting
// them in ServiceM8 by hand. Steven's rule for the reviewer, 8 Sep 2026:
// "Simulate it, I don't want them on my system." So a person carrying
// reviewSandbox: true in the portal's people list gets THESE jobs from every
// job route, and writes against them go nowhere.
//
// The portal keeps a twin of this list (lib/reviewsandbox.mjs) for the money
// side. Same numbers, same suburbs, same invoice values — change one and change
// the other, or the reviewer's Work tab and Money tab will disagree.
//
// Job numbers start at 990001: ServiceM8's are around 167xxx, so nothing real
// will reach these for years, and the app's numeric sort still works.

const CUSTOMER = "Sample Customer";

export const SANDBOX_JOBS = [
  {
    job_uuid: "review-sandbox-990001",
    job_number: "990001",
    status: "Completed",
    address: "12 Sample Street, Burwood NSW 2134",
    description: "Switchboard upgrade — replace old ceramic fuses with RCBOs, new main switch, label circuits. SAMPLE JOB for App Store review.",
    completed: "2026-09-01",
    billing: [
      { name: "Switchboard upgrade — labour", qty: 1, price: 1200 },
      { name: "8 x RCBO 20A", qty: 8, price: 62.5 },
      { name: "Main switch 63A", qty: 1, price: 100 },
    ],
    notes: ["Customer home from 8am. Board is in the garage.", "Completed and tested. Photos in diary."],
  },
  {
    job_uuid: "review-sandbox-990002",
    job_number: "990002",
    status: "Completed",
    address: "4 Sample Avenue, Strathfield NSW 2135",
    description: "Safety switch tripping — locate fault, replace faulty RCD, test all circuits. SAMPLE JOB for App Store review.",
    completed: "2026-09-03",
    billing: [
      { name: "Fault find and RCD replacement — labour", qty: 1, price: 320 },
      { name: "RCD 40A 30mA", qty: 1, price: 100 },
    ],
    notes: ["Fault was a damaged cable behind the dishwasher. Repaired and tested."],
  },
  {
    job_uuid: "review-sandbox-990003",
    job_number: "990003",
    status: "Work Order",
    address: "27 Sample Road, Ashfield NSW 2131",
    description: "Install 3 x LED downlights in kitchen, dimmer on existing switch. SAMPLE JOB for App Store review.",
    completed: null,
    billing: [
      { name: "Install 3 x LED downlights — labour", qty: 1, price: 280 },
      { name: "LED downlight 10W dimmable", qty: 3, price: 30 },
      { name: "LED dimmer", qty: 1, price: 45 },
    ],
    notes: ["Booked. Customer will leave the side gate open."],
  },
];

/** What GET /api/jobs returns — the same shape as a real subbie's list. */
export function sandboxJobList() {
  const counts = {};
  for (const j of SANDBOX_JOBS) counts[j.status] = (counts[j.status] || 0) + 1;
  return {
    ok: true,
    matches: SANDBOX_JOBS.map((j) => ({
      job_uuid: j.job_uuid,
      job_number: j.job_number,
      status: j.status,
      address: j.address,
      contact: CUSTOMER,
      work: j.description.slice(0, 90),
    })),
    counts,
  };
}

/** What GET /api/job/{n} returns — the job card, shaped like buildDossier. */
export function sandboxDossier(jobNumber) {
  const j = SANDBOX_JOBS.find((x) => x.job_number === String(jobNumber));
  if (!j) return null;
  const when = `${j.completed || "2026-09-08"} 08:00:00`;
  return {
    ok: true,
    job: { job_uuid: j.job_uuid, job_number: j.job_number, address: j.address, contact: CUSTOMER },
    status: j.status,
    description: j.description,
    contacts: [`JOB: ${CUSTOMER} 0491 570 156`],
    bookings: [],
    timeOnSite: { entries: 0, minutes: 0 },
    billing: j.billing,
    notes: j.notes,
    noteFeed: j.notes.map((note) => ({ note, when, by: "App Review Contractor" })).reverse(),
    attachments: [],
  };
}

/**
 * What GET /api/diary returns. The booked job sits on TODAY only — the same
 * job on every day the reviewer flicks to would read as a bug.
 */
export function sandboxDiary(date, today) {
  const j = SANDBOX_JOBS.find((x) => x.status === "Work Order");
  const bookings = date === today && j
    ? [{
        activity_uuid: "review-sandbox-booking-1",
        staff: "App Review Contractor",
        staff_uuid: "review-sandbox",
        start: `${date} 08:00:00`,
        end: `${date} 10:30:00`,
        job: { uuid: j.job_uuid, number: j.job_number, address: j.address, description: j.description },
      }]
    : [];
  return { ok: true, date, window: { from: `${date} 00:00:00`, to: `${date} 23:59:59` }, bookings, staff_list: [] };
}
