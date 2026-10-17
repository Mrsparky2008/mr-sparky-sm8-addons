// Signing up for a look around, from the phone.
//
// Separate from lib/portal.js on purpose: every call in there carries a Cognito
// token, and a sparky signing up has no account yet. These two routes are the
// only ones on the portal that answer without a login, so they get their own
// tiny client rather than a flag threaded through the authenticated one.
//
// The rules live in the portal (lib/demosignup.mjs, lib/nswlicence.mjs) and the
// portal decides. Nothing here validates, rate limits or judges a licence — the
// phone renders, the portal calculates, same as everywhere else.
import { PORTAL } from "./config";

export class DemoError extends Error {
  constructor(message, { status = 0, errors = null } = {}) {
    super(message);
    this.name = "DemoError";
    this.status = status;
    this.errors = errors;
  }
}

/** True when the portal rejected individual fields rather than the whole call. */
export const isFieldError = (err) => Boolean(err?.errors);

async function get(path) {
  let res;
  try {
    res = await fetch(`${PORTAL}${path}`);
  } catch {
    throw new DemoError("Can't reach Mr Sparky. Check your signal and try again.");
  }
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    throw new DemoError(data.error || "Something went wrong. Try again.", { status: res.status });
  }
  return data;
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${PORTAL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // No signal, aeroplane mode, a dead tunnel. Say something a person can act
    // on rather than surfacing a fetch failure.
    throw new DemoError("Can't reach Mr Sparky. Check your signal and try again.");
  }

  let data = {};
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    throw new DemoError(data.error || "Something went wrong. Try again.", {
      status: res.status,
      errors: data.errors || null,
    });
  }
  return data;
}

/**
 * Send the four answers. The portal checks the licence, texts a code, and
 * returns what it found so the sparky can see his own licence read back.
 */
// business is the record chosen off the ABR, not a typed name. It carries
// the ABN, and the ABN is what ends up on an RCTI - so it travels with the
// signup rather than being asked for again later.
export function startSignup({ name, mobile, email, licence, promoCode, business }) {
  return post("/api/demo/signup", {
    name, mobile, email, licence, promoCode, business,
  });
}

/** Hand back the code that arrived by text. */
export function verifyCode({ mobile, code }) {
  return post("/api/demo/verify", { mobile, code });
}

/**
 * Search the Australian Business Register by name.
 *
 * Returns [] rather than throwing when the register is unavailable — the
 * portal soft-fails it deliberately, and a sparky should never be stopped
 * signing up because a government service is having a moment.
 */
/**
 * The full register record behind one ABN.
 *
 * The search list returns TRADING names - "MULTISKILL" is a trading name whose
 * legal entity is someone else entirely. Storing the label off the search
 * result put a trading name in the legal-name field and left the portal saying
 * "not verified against the register" (28 Aug 2026). So a selection is always
 * followed by a details lookup, and the ENTITY name is what travels.
 *
 * Returns null rather than throwing: a register having a bad morning must not
 * stop someone signing up, and the portal re-verifies at approval anyway.
 */
export async function businessDetails(abn) {
  try {
    const res = await fetch(`${PORTAL}/api/demo/abr?q=${encodeURIComponent(abn)}`);
    if (!res.ok) return null;
    return (await res.json()).details || null;
  } catch {
    return null;
  }
}

export async function searchBusiness(q) {
  try {
    const res = await fetch(`${PORTAL}/api/demo/abr?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.matches || [];
  } catch {
    return [];
  }
}

/**
 * Ask for a one-time link that connects their Telegram account.
 *
 * The link is what carries their identity, not anything they type. Opening it
 * signs the account that opened it, so there is no username to mistype and no
 * way to link the wrong person.
 *
 * Linking grants nothing on its own - job access still waits on Steven creating
 * them in ServiceM8 by hand. This only makes the job alerts findable.
 */
export function connectTelegram(mobile) {
  return post("/api/demo/telegram-link", { mobile });
}

/** Choose a password. This is what actually creates the login. */
export function setPassword({ mobile, password }) {
  return post("/api/demo/password", { mobile, password });
}

/**
 * Check a licence number against the live NSW register, while they type.
 *
 * Never throws and never rejects: an unreachable register returns a note, not
 * a failure. The field claims to be checked against the register, so it has to
 * visibly be checked — but a government service having a moment must not be
 * the reason a real electrician gives up.
 */
export async function checkLicence(number, name) {
  try {
    const q = `number=${encodeURIComponent(number)}`
      + (name ? `&name=${encodeURIComponent(name)}` : "");
    const res = await fetch(`${PORTAL}/api/demo/licence?${q}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Real jobs and what they paid, for someone who has verified a mobile.
 *
 * The portal strips every customer detail before this leaves it, and checks
 * again on the way out. Nothing here needs to filter anything - if a customer's
 * name ever reached this function, the mistake was made a long way upstairs.
 */
export async function getEarnings(mobile) {
  return get(`/api/demo/earnings?mobile=${encodeURIComponent(mobile)}`);
}
