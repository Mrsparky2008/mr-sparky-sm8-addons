// Who may see what, decided by the portal's people list.
//
// Found the hard way, 27 Aug 2026: auth.mjs proves a token is GENUINE but
// nothing ever asked WHO it belongs to — and every demo signup gets a genuine
// token. A stranger who passed the app's licence check could open the work tab
// and read the whole job book: 608 customers, names and addresses. Steven's
// rule, verbatim: "Jason should not see any jobs unless the one I create and
// allocate to him."
//
// The authority is the portal's settings.people[] in DynamoDB (us-east-1) —
// the same list Steven's Approve button writes to. Nothing to maintain twice:
// approving someone in Telegram is what grants their app access.
//
//   Owner / Office / Admin  -> admin: everything, unchanged
//   Subbie                  -> subbie: signed in, but no job book. Their money
//                              lives in the portal (scoped server-side) and
//                              their practice happens in ServiceM8's own app.
//                              Allocation-scoped job lists can come later —
//                              the job index carries no allocation data today.
//   anyone else             -> none: 403 on every /api route
//
// ADMIN_EMAILS (env, comma-separated) is belt and braces on top, so a portal
// mishap can never lock Steven out of his own assistant.
//
// Fails CLOSED for unknowns but stale-OPEN for admins: if DynamoDB is briefly
// unreachable the cached list keeps working; with no cache at all, nobody but
// ADMIN_EMAILS gets in. A flaky network must never expose the book.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const PORTAL_TABLE = process.env.PORTAL_TABLE || "mr-sparky-portal";
const PORTAL_REGION = process.env.PORTAL_REGION || "us-east-1";
const ADMIN_ROLES = new Set(["Owner", "Office", "Admin"]);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: PORTAL_REGION }));

let cache = { at: 0, people: null };
const FRESH_MS = 60 * 1000;

async function people() {
  if (cache.people && Date.now() - cache.at < FRESH_MS) return cache.people;
  try {
    const r = await ddb.send(new GetCommand({
      TableName: PORTAL_TABLE,
      Key: { pk: "SETTINGS", sk: "CURRENT" },
    }));
    const list = r.Item?.settings?.people;
    if (Array.isArray(list)) cache = { at: Date.now(), people: list };
  } catch (err) {
    console.error("authz: portal settings unreadable:", err.message);
  }
  return cache.people || [];
}

const adminEnv = () => String(process.env.ADMIN_EMAILS || "")
  .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

/**
 * email -> { level: "admin" | "subbie" | "none", name }
 * Levels are deliberately coarse. Fine-grained comes when the data exists.
 */
export async function authorize(email) {
  const wanted = String(email || "").trim().toLowerCase();
  if (!wanted) return { level: "none" };
  if (adminEnv().includes(wanted)) return { level: "admin", name: wanted };

  const match = (await people()).find(
    (p) => String(p?.email || "").trim().toLowerCase() === wanted
      && p?.status !== "blocked",
  );
  if (!match) return { level: "none" };
  if (ADMIN_ROLES.has(match.role)) return { level: "admin", name: match.name };
  if (match.role === "Subbie" && match.status === "Active") {
    return {
      level: "subbie",
      name: match.name,
      personId: match.id,
      // How their accepted jobs are found: ACCEPT stamps the network jobs
      // table with the accepter's Telegram ID.
      telegramId: match.telegramId ? String(match.telegramId) : null,
    };
  }
  return { level: "none" };
}

/** The response bodies, in words a sparky can act on. */
export const DENIED = {
  ok: false,
  error: "Your account doesn't have access to this yet. If you've just been approved, give it a minute and try again.",
};
export const SUBBIE_EMPTY_JOBS = {
  ok: true,
  matches: [],
  counts: {},
  note: "Jobs you accept will appear here.",
};

import { ScanCommand } from "@aws-sdk/lib-dynamodb";

const JOBS_TABLE = process.env.NETWORK_JOBS_TABLE || "jobs";

/**
 * The jobs this subbie accepted, shaped like the admin job list so the app
 * renders them with zero client changes. Status carries through from the
 * network record (Quote / Work Order / Completed), so the app's buckets work.
 *
 * A scan, not an index: the network jobs table is a few hundred rows and
 * this runs when one subbie opens one tab. The day that stops being true, a
 * GSI on claimed_by_telegram_id is the fix - not caching, not clever.
 */
export async function subbieJobs(telegramId) {
  if (!telegramId) return SUBBIE_EMPTY_JOBS;
  try {
    const items = [];
    let ExclusiveStartKey;
    do {
      const r = await ddb.send(new ScanCommand({
        TableName: JOBS_TABLE,
        FilterExpression: "claimed_by_telegram_id = :t",
        ExpressionAttributeValues: { ":t": String(telegramId) },
        ExclusiveStartKey,
      }));
      items.push(...(r.Items || []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    items.sort((a, b) => Number(b.job_number) - Number(a.job_number));
    const counts = {};
    for (const j of items) counts[j.status || "Quote"] = (counts[j.status || "Quote"] || 0) + 1;
    return {
      ok: true,
      matches: items.map((j) => ({
        job_uuid: j.job_uuid,
        job_number: j.job_number,
        status: j.status || "Quote",
        address: j.job_address || j.suburb || "",
        work: j.description ? String(j.description).slice(0, 90) : undefined,
      })),
      counts,
    };
  } catch (err) {
    // Their own list failing must read as empty, never as an error screen.
    console.error("subbieJobs failed:", err.message);
    return SUBBIE_EMPTY_JOBS;
  }
}
