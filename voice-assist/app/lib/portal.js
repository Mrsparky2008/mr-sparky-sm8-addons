// The subcontractor portal, from the phone.
//
// THE RULE, and it is not negotiable: the phone renders, the portal calculates.
// Nothing in this file or in any screen that uses it adds, subtracts, applies a
// percentage or works out GST. Every figure shown to a human comes off the wire
// already worked out by lib/*.mjs in the portal repo, where the rules live and
// where they have tests. A claim freezes its figures at submission and the RCTI
// is built from that frozen copy — a second implementation on a phone is how
// those numbers quietly stop agreeing.
//
// Formatting is not calculating. money() puts a dollar sign in front of a
// number the server sent. That is allowed. Summing a column is not.
//
// Auth: the same Cognito ID token the rest of the app already holds. The portal
// is protected by an API Gateway JWT authoriser rather than by handler code, so
// the token has to be minted by a client the authoriser accepts as an audience.
import { getIdToken } from "./auth";
import { PORTAL } from "./config";
import { deviceHeaders } from "./device";

export class PortalError extends Error {
  constructor(message, { status = 0, code = "", demo = false, mobile = null, stage = null } = {}) {
    super(message);
    this.name = "PortalError";
    this.status = status;
    this.code = code;
    // notSetUp with demo:true means a DEMO APPLICANT signed in: the portal does
    // not know them as a contractor, but the earnings screen knows their
    // mobile. Without carrying these fields through, a signed-in demo user
    // lands on empty tabs — the exact thing an App Store review rejects.
    this.demo = demo;
    this.mobile = mobile;
    this.stage = stage;
  }
}

/** True when this person has an app login but no portal record — never a retry. */
export const isNotSetUp = (err) => err?.code === "notSetUp";

/** True when the session is genuinely gone and the user must sign in again. */
export const isSignedOut = (err) => err?.status === 401;

function requireBase() {
  if (!PORTAL) {
    throw new PortalError(
      "The portal address has not been set in lib/config.js yet.",
      { code: "noPortalUrl" },
    );
  }
  return PORTAL.replace(/\/+$/, "");
}

async function call(method, path, body) {
  const base = requireBase();
  const token = await getIdToken();
  const res = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      // Which phone this is. The portal remembers the ones it has seen and
      // asks for a code by text when it meets a new one - the bank's "we
      // don't recognise this device", and the half of device binding that
      // was missing (Steven, 13 Oct 2026).
      ...(await deviceHeaders()),
      ...(body ? { "Content-Type": "application/json" } : null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 comes from the API Gateway authoriser, before the handler runs. The
  // token is refreshed underneath us before it expires, so a 401 here means the
  // session is actually finished rather than merely stale.
  if (res.status === 401) {
    throw new PortalError("Your session has ended. Sign in again.", { status: 401 });
  }

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* handled below */ }

  if (!res.ok) {
    // "Signed in, but the portal does not know you." Signing in again will
    // never fix it, so the screen must not offer that as the way out.
    if (res.status === 403 && json?.error === "notSetUp") {
      throw new PortalError(json.message || "You are not set up in the portal yet.",
        { status: 403, code: "notSetUp",
          demo: json.demo === true, mobile: json.mobile || null, stage: json.stage || null });
    }
    throw new PortalError(json?.error || json?.message || `Portal error ${res.status}`,
      { status: res.status, code: json?.error || "" });
  }
  return json;
}

const get = (path) => call("GET", path);
const post = (path, body) => call("POST", path, body);
// Only push uses this: turning a device off is a DELETE that still carries the
// token in its body, because the token is which device, not which person.
const del = (path, body) => call("DELETE", path, body);
const qs = (params) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

/*
 * A job accepted by one man and finished by another.
 *
 * `action` is "ask" (I finished it, I want it), "handover" (it is his) or
 * "keep" (it stays mine). The portal checks who is allowed to say which -
 * never this screen.
 */
export const handover = ({ action, jobNumber }) =>
  post("/api/handover", { action, jobNumber });

/*
 * An invoice the contractor sends US - their own tax invoice for hours they
 * put into somebody else's job. Not the RCTI, which runs untouched for their
 * own jobs, and paid on its own rather than folded into a claim.
 *
 * `preview: true` renders the document and stores nothing. The number is
 * issued by the portal, never sent from here.
 */
export const raiseInvoice = ({ jobNumber, reference, lines, preview }) =>
  post("/api/invoices", { jobNumber, reference, lines, preview: !!preview });

/** The ones this person has already raised. */
export const myInvoices = () => get("/api/invoices");

/** Who the portal thinks you are: name, role, and whether you can approve. */
export const me = () => get("/api/me");

/**
 * Close your own account: the Cognito login and the application behind it.
 *
 * Apple requires this of any app that offers signup (Guideline 5.1.1(v)) and
 * asks to see it in the review recording. Who gets deleted comes from the
 * token at the other end, never from anything sent here — there is deliberately
 * nothing to pass.
 *
 * Contractors are refused with code "contactOffice": there are claims and
 * payment history behind a real staff record, so closing one is an office job.
 */
export const deleteAccount = () => post("/api/account/delete");

/**
 * Everything the Pay tab shows for one person: jobs, what each is worth, what
 * is ready to claim, what is held and why, claims with their frozen figures and
 * their approval checks, receipts, retention, the ladder. One call.
 *
 * `name` is only honoured for admins looking at somebody else.
 */
export const statement = (name) => get(`/api/statement${qs({ name })}`);

/** One person's claims. Admins may pass a name. */
export const claims = (name) => get(`/api/claims${qs({ name })}`);

/**
 * Every claim awaiting a decision, across everyone — the admin inbox.
 *
 * Needs the `all=1` parameter added to the portal's existing GET /api/claims
 * (see docs/portal-app-support.patch in this repo). Until that is deployed this
 * throws rather than quietly showing one person's claims and calling it the
 * inbox. Same route and method, so no new API Gateway route is involved.
 */
export const claimsAwaiting = () => get(`/api/claims${qs({ all: 1, status: "submitted" })}`);

/** Every claim across everyone, all statuses — the Business hub's raw feed. */
export const allClaims = () => get(`/api/claims${qs({ all: 1 })}`);

/** The people an admin can look at. */
export const contractors = () => get("/api/contractors");

/**
 * Set a contractor's agreed flat rate - the deal that overrides the ladder.
 * percent is a whole number; reviewOn is optional and looks like 2026-11-27.
 * Pass { personId, clear: true } to drop them back onto the ladder.
 */
export const setAgreedRate = ({ personId, percent, reviewOn, note, clear }) =>
  post("/api/crew/agreed-rate", { personId, percent, reviewOn, note, clear });

/**
 * Submit a claim. The request says WHICH jobs and nothing about what they are
 * worth — the portal re-derives every figure from the caller's own statement,
 * so a tampered payload cannot inflate a claim.
 */
/*
 * `recoverBillIds` are bills HE chose to clear with this claim - ids off his
 * own owedBack list. Steven, 13 Oct 2026: "they get the first opportunity
 * before they put a claim in", and he keeps the override.
 *
 * They ride on the SUBMIT rather than a call of their own, on purpose: submit
 * is already the one atomic act that settles recoveries and enforces
 * never-split, and a separate call would be a second bite at the same bills -
 * which is the thing "taken back once is never offered again" forbids.
 */
export const submitClaim = ({
  jobNumbers, includeHelpingHand = false, acceptDeclaration, recoverBillIds = [], name,
}) => post("/api/claims", {
  jobNumbers, includeHelpingHand, acceptDeclaration, recoverBillIds, name,
});

/**
 * Move a claim along: submitted → approved → invoiced → paid, or rejected.
 *
 * The portal refuses a rejection with no reason and refuses to invoice a
 * contractor whose company details cannot carry an RCTI (409). Both are real
 * answers the screen has to show, not failures to swallow.
 */
export const setClaimStatus = ({ name, claimId, status, reason, paidAt, paymentReference }) =>
  post("/api/claims/status", { name, claimId, status, reason, paidAt, paymentReference });

/**
 * The RCTI, as HTML. Rendered on demand from the frozen claim, so it is a
 * document rather than data — it goes to a WebView or expo-print, and is the
 * one thing on the Pay side that is deliberately not a native screen.
 */
export async function rctiHtml({ claimId, name }) {
  const base = requireBase();
  const token = await getIdToken();
  const res = await fetch(`${base}/api/claims/rcti${qs({ claimId, name })}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    throw new PortalError("Your session has ended. Sign in again.", { status: 401 });
  }
  const text = await res.text();
  if (!res.ok) {
    let json = null;
    try { json = JSON.parse(text); } catch { /* the error body is HTML */ }
    throw new PortalError(json?.error || `Could not build the RCTI (${res.status})`,
      { status: res.status });
  }
  return text;
}

/** A short-lived URL to put a receipt photo straight into the private bucket. */
export const receiptUploadUrl = ({ jobNumber, contentType, extension, name }) =>
  post("/api/receipts/upload-url", { jobNumber, contentType, extension, name });

/** Record the receipt once its image is in the bucket. */
export const saveReceipt = (receipt) => post("/api/receipts", receipt);

/**
 * Look an ABN up on the Australian Business Register, through the portal —
 * the register GUID stays server-side. Eleven digits returns the business that
 * holds it; anything else is a name search.
 *
 * This is what makes typing an ABN better than typing a supplier name on a
 * docket that photographed badly: eleven digits with a checksum cannot be
 * fumbled into a plausible-but-wrong supplier, and the register supplies the
 * name so nobody has to spell it.
 */
export const abnLookup = (q) => get(`/api/abr${qs({ q })}`);

/** A short-lived URL to look at a receipt; the bucket blocks public access. */
export const receiptViewUrl = (key) => get(`/api/receipts/view${qs({ key })}`);

/*
 * The supplier's own paperwork behind a charge - the PDF they sent, or the
 * photo of a docket that was paid on the card. A short-lived signed URL.
 *
 * The office may open anything; a contractor may open the paper on their own
 * jobs and anything charged against them, and nothing else.
 */
export const purchaseDoc = ({ emailId, docIndex }) =>
  get(`/api/purchases/doc${qs({ emailId, docIndex })}`);

/* ---- Insurance: the Certificate of Currency, same rails as receipts ------ */
/** A short-lived URL to put a certificate photo straight into the bucket. */
export const insuranceUploadUrl = ({ contentType, extension }) =>
  post("/api/insurance/upload-url", { contentType, extension });
/** Claude reads the certificate; a human confirms every field before saving. */
export const insuranceRead = (imageKey) => post("/api/insurance/read", { imageKey });
/** Append the confirmed policy to the record — history is never overwritten. */
export const saveInsurance = (policy) => post("/api/insurance", policy);
/** A short-lived URL to view a certificate already on file. */
export const insuranceViewUrl = (key) => get(`/api/insurance/view${qs({ key })}`);

/**
 * "Own material, no receipt" — van stock, declared on trust. Material bought
 * earlier in bulk has no per-job docket and never can, so it is declared
 * rather than photographed. The server holds the cap ($50 default, set per
 * person, zero = receipts only) and refuses anything over it with the cap in
 * the message. Zero clears a declaration.
 */
export const declareOwnMaterial = ({ jobNumber, amountIncGst, name }) =>
  post("/api/material/declare", { jobNumber, amountIncGst, name });

/**
 * Remove your own mistaken upload. A VOID, never a delete — the row and its
 * photo stay on file, marked, counted towards nothing. The server refuses
 * once the job is on a claim: pulling evidence out of claimed money is the
 * office's call, on the record.
 */
export const voidReceipt = ({ jobNumber, receiptId, reason }) =>
  post("/api/receipts/void", { jobNumber, receiptId, reason });

/* ---- Push: telling the portal where to ring ----------------------------- */
/*
 * The token is iOS's postal address for this app on this phone - unguessable,
 * and it changes if the app is deleted and reinstalled. Keyed on the TOKEN
 * rather than the person, because a man can carry two phones and a phone can
 * change hands.
 */
/*
 * Passed straight through rather than destructured field by field. The old
 * signature named each one, so adding `model`, `osVersion` and
 * `tookOverHandset` in push.js silently dropped all three here - the call
 * looked right, the fields never left the phone, and nothing would have failed
 * loudly enough to notice. A registration is already a flat bag of facts about
 * one handset; naming them twice bought nothing but a place to forget one.
 */
export const registerPush = (device) => post("/api/push/register", { ...device });

/*
 * Signing out on a phone being handed back has to stop other people's jobs
 * arriving on it. The record is retired, not deleted, so "he was never told"
 * can still be answered afterwards.
 */
export const unregisterPush = ({ token }) =>
  del("/api/push/register", { token });

/* ---- Accepting a job ---------------------------------------------------- */
/*
 * Taking a job from the app instead of from the Telegram group.
 *
 * The decision is entirely the portal's: canAccessJobs, whether employees may
 * accept at all, and whether somebody already took it. The phone asks and is
 * told. 409 means it is gone - that is a race nobody loses money over, and it
 * has to read as "Jason got there first", never as an error.
 */
export const acceptJob = ({ jobNumber }) =>
  post("/api/jobs/accept", { jobNumber });

/*
 * The jobs that are going, that nobody has taken.
 *
 * Empty for somebody who cannot claim, rather than a refusal - "nothing going
 * right now" is the honest answer for him and the common one for everybody.
 */
export const availableJobs = () => get("/api/jobs/available");

/*
 * THE CREW'S WORK, in one list.
 *
 * Steven, 13 Oct 2026: "in Multiskill it will show the jobs that belong to
 * Jason, Andrew and John in one tab... they can grab jobs from others because
 * they all work together." Confirmed 14 Oct as the fourth tab, in place of
 * Money, which an employee never sees.
 *
 * Who the crew IS is entirely the portal's answer - `employeesOf` and the
 * `worksForId` on each person. The phone asks "what is my crew doing" and
 * renders the reply; it has no idea who Jason's men are and must never work it
 * out, because that is the rule that keeps one man's money off another man's
 * screen.
 */
export const teamJobs = () => get("/api/jobs/team");

/*
 * Ring my own phone, now.
 *
 * Deliberately only the caller's own devices: an admin who could push to
 * anybody is a way to wake every phone in the business at 3am.
 */
export const testPush = () => post("/api/push/test", {});

/*
 * THE TELEGRAM QUESTIONS, IN THE APP.
 *
 * Today a bot posts "Who picked this up?" into a Telegram group and waits for
 * somebody to type back. These two routes are the same conversation without
 * Telegram in it, and they are the network session's to write
 * (docs/APP-TABS-AND-NOTIFICATIONS.md in mr-sparky-network).
 *
 * NEITHER EXISTS YET. The portal's API Gateway has no catch-all, so an
 * undeclared route answers 404 before the authoriser even runs - which is why
 * the screen treats a 404 on these two as "not switched on yet" and says so in
 * those words, rather than as a fault. The moment the routes land, nothing in
 * the app changes.
 *
 * THE SHAPE THE SCREEN RENDERS, and every field of it is optional so a row
 * carrying something unexpected still draws rather than crashing a tab:
 *
 *   { badge, rows: [{
 *       id, kind, title, body, when,
 *       answered: { text, at } | null,
 *       actions: [{ key, label, needsText, placeholder, tone }]
 *   }] }
 *
 * ACTIONS COME FROM THE SERVER, and that is the one decision here worth
 * defending. The portal already knows what it is willing to accept for a given
 * question; a phone that invents the buttons would be a second opinion about
 * that, and a new kind of notification would then need an App Store trip. The
 * same rule as `can`: the phone renders what it is told.
 */
export const notifications = () => get("/api/notifications");

/*
 * `text` carries whatever he typed, UNPARSED. The bot already pulls supplier,
 * invoice numbers and job numbers out of free text server-side
 * (`supplierFrom`, `invoiceNumbersFrom`, `jobFrom`), and a second parser on a
 * phone is how the two quietly stop agreeing about what a man said.
 */
export const answerNotification = ({ id, action, text }) =>
  post("/api/notifications/answer", { id, action, text });
