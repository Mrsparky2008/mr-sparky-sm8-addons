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

export class PortalError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "PortalError";
    this.status = status;
    this.code = code;
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
        { status: 403, code: "notSetUp" });
    }
    throw new PortalError(json?.error || json?.message || `Portal error ${res.status}`,
      { status: res.status, code: json?.error || "" });
  }
  return json;
}

const get = (path) => call("GET", path);
const post = (path, body) => call("POST", path, body);
const qs = (params) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

/** Who the portal thinks you are: name, role, and whether you can approve. */
export const me = () => get("/api/me");

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
 * Submit a claim. The request says WHICH jobs and nothing about what they are
 * worth — the portal re-derives every figure from the caller's own statement,
 * so a tampered payload cannot inflate a claim.
 */
export const submitClaim = ({ jobNumbers, includeHelpingHand = false, acceptDeclaration, name }) =>
  post("/api/claims", { jobNumbers, includeHelpingHand, acceptDeclaration, name });

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
