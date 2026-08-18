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
export function startSignup({ name, mobile, email, licence, promoCode }) {
  return post("/api/demo/signup", { name, mobile, email, licence, promoCode });
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

/** Choose a password. This is what actually creates the login. */
export function setPassword({ mobile, password }) {
  return post("/api/demo/password", { mobile, password });
}
