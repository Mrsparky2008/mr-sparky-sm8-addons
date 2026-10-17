// How long ago, in words - and Sydney whenever a clock time is printed.
//
// THE RULE IT EXISTS FOR: every timestamp a man reads is Sydney. The portal
// sends ISO-8601 in UTC (network session, 17 Oct 2026), and a UTC time shown
// to a tradesman in Sydney is wrong by ten or eleven hours - which in the
// afternoon is wrong by a DAY as well.
//
// NEVER CONVERT BY HAND. No adding ten. Daylight saving moves twice a year and
// a hand-rolled offset is right half the time, which is worse than being
// wrong, because it is only wrong for six months at a stretch.
//
// RELATIVE FIRST, and not only for looks: "2 hours ago" has no timezone in it
// at all, so the common case cannot be got wrong by anybody. Only something
// older than a week prints an actual date, and that one goes through
// Australia/Sydney explicitly.

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Sydney, as a date. Falls back to the DEVICE's own idea of local time if this
 * JS engine was built without the timezone data - which on Steven's phone is
 * Sydney anyway, so the fallback is right where it matters and merely
 * approximate anywhere else. Deliberately not a hand-rolled offset.
 */
function sydney(d, opts) {
  try {
    return d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", ...opts });
  } catch {
    return d.toLocaleString("en-AU", opts);
  }
}

/**
 * Whole days between two instants BY THE SYDNEY CALENDAR, not by elapsed time.
 *
 * It reads the Sydney y/m/d off each date and subtracts those, so daylight
 * saving - the one night a year that is 23 or 25 hours long - cannot shift the
 * answer. Nothing here adds an offset by hand.
 */
function dayDiff(a, b) {
  const key = (d) => sydney(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const asUtc = (d) => {
    // en-AU gives day/month/year; pull the three numbers in the order they come.
    const n = key(d).match(/\d+/g);
    if (!n || n.length < 3) return NaN;
    return Date.UTC(Number(n[2]), Number(n[1]) - 1, Number(n[0]));
  };
  const x = asUtc(a);
  const y = asUtc(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Math.round((b - a) / DAY);
  return Math.round((y - x) / DAY);
}

/**
 * `value` is an ISO-8601 string, a Date, or epoch milliseconds.
 *
 * Anything that does not parse comes back UNCHANGED rather than as "Invalid
 * Date" - if the other end ever sends a phrase instead of a timestamp, the
 * phrase is shown. A screen should never print the word Invalid at a man.
 */
export function ago(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (!Number.isFinite(t)) return String(value);

  // A clock a few seconds ahead of the server is normal and is not the future.
  const diff = Math.max(0, now - t);

  if (diff < MIN) return "Just now";
  if (diff < HOUR) {
    const m = Math.round(diff / MIN);
    return `${m} min ago`;
  }
  if (diff < DAY) {
    const h = Math.round(diff / HOUR);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  /*
   * PAST A DAY, COUNT CALENDAR DAYS, NOT ELAPSED HOURS. Twenty-six hours is
   * "Yesterday" by arithmetic and two nights ago by the calendar - 11pm Monday
   * read at 1am Wednesday. A screen that says Yesterday about Monday is a
   * small lie, and small lies are how a man stops trusting the rest of it.
   */
  const days = dayDiff(d, new Date(now));
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  // Past a week it is not news any more, so say WHEN rather than how long.
  const sameYear = sydney(d, { year: "numeric" }) === sydney(new Date(now), { year: "numeric" });
  return sydney(d, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}

/** The full thing, Sydney, for a line that has to be exact. */
export function at(value) {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return sydney(d, {
    day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}
