// Furniture shared across the Money screens.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Cta, Header } from "../../components/ui";
import { C, S, T, mono, money } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { StatusChip } from "../../components/ui";

/*
 * Why a job is not payable yet, in the words the office uses for it.
 *
 * THIS MAP IS A FALLBACK, NOT THE SOURCE. The portal owns the reason - it has
 * its own `blockedWhy` in the same words - and this list went stale the moment
 * the portal grew an outcome nobody told the app about: a SETTLING job printed
 * the word SETTLING at a tradesman. So `heldWhy` below prefers whatever the
 * server sent with the row, and only falls back to these.
 */
export const HELD = {
  AWAITING_FORM: "Waiting on Form 001",
  AMBIGUOUS_FORM: "More than one Form 001 — needs a human",
  NOT_THEIR_JOB: "Not attributed to you",
  NO_RULE: "No rate in force on that date",
  // The portal's own wording for these three (api/shell.mjs blockedWhy).
  SETTLING: "Material still arriving",
  AWAITING_INVOICE: "Awaiting material confirmation",
  BILL_NOT_ALLOCATED: "A bill for this job is not allocated",
  NO_VALUE: "No invoice value",
};

/**
 * The reason, for the row he is looking at.
 *
 * A SETTLING job carries its own sentence - "Awaiting clearing period - 3
 * working days to go" - because the day count is in it, and a count the phone
 * worked out for itself is a second copy of a rule that can drift from the
 * server's. Network session, 18 Oct 2026: print `settling.say`, do not
 * compose your own.
 */
export function heldWhy(job) {
  if (!job || !job.outcome || job.outcome === "OK") return null;
  return job.settling?.say || job.why || HELD[job.outcome] || "Not claimable yet";
}

/**
 * A figure the server has not worked out is NOT nought.
 *
 * A settling job's row carries its job number, its invoice value and the
 * reason, and no payable figure at all - the engine stops before pricing it,
 * because the material on it is not yet what it will be. `money(undefined)`
 * is "$0.00", which on a money screen says this job is worth nothing. A dash
 * is what a screen shows when it does not know (CLAUDE.md section 31).
 */
export const moneyOrDash = (n) => (Number.isFinite(Number(n)) && n !== null && n !== "" ? money(n) : "—");

/**
 * A job that cannot be claimed yet, shown rather than hidden.
 *
 * Steven, 18 Oct 2026, having watched three jobs leave the claim screen the
 * hour the settling window shipped: "the jobs that are claimable, they should
 * still show up in there, but they just can't be selected. And there'll be a
 * disclaimer saying awaiting clearing period or something along those lines
 * to identify what's going on."
 *
 * THE REASON GETS ITS OWN FULL-WIDTH LINE. His condition was that it fits on
 * one line. Inside the row it cannot: the row is about 313pt wide on his
 * phone and the label, the figure and a 46-character sentence do not share
 * that. Out here it has the whole card - which fits on his 16 Plus and wraps,
 * rather than truncates, on a small phone. A reason with its last three words
 * cut off is worse than one on two lines.
 *
 * `tick` draws the disabled checkbox, so on the claim screen it lines up with
 * the jobs he CAN tick and reads as one list with some of it out of reach.
 */
export function HeldRow({ job, suburb, why, tick, onPress, last }) {
  const body = (
    <View style={[s.held, last && { borderBottomWidth: 0 }]}>
      <View style={s.heldTop}>
        {tick ? <View style={s.box} /> : null}
        <Text style={s.heldLabel} numberOfLines={1}>
          {`${job?.jobNumber || ""}  ${suburb || ""}`.trim()}
        </Text>
        <Text style={[s.heldValue, mono]}>{moneyOrDash(job?.payableIncGst)}</Text>
        {onPress ? <Text style={s.heldChev}>{"›"}</Text> : null}
      </View>
      <Text style={s.heldWhy}>{why || heldWhy(job)}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const CLAIM_LABEL = {
  submitted: "awaiting approval",
  approved: "approved",
  invoiced: "approved",
  paid: "paid",
  rejected: "rejected",
};

/** Claim status as a chip, using ServiceM8's own status palette. */
export function ClaimStatus({ status }) {
  return <StatusChip status={CLAIM_LABEL[status] || status} />;
}

/**
 * Portal errors that need different endings. "Not set up" means signed in but
 * unknown to the portal — signing in again will never fix that, so this must
 * not offer it as the way out.
 */
export function PayError({ error, onRetry, onSignOut, title = "Money" }) {
  const notSetUp = portal.isNotSetUp(error);
  const noUrl = error?.code === "noPortalUrl";
  return (
    <View style={{ flex: 1 }}>
      <Header title={title} />
      <View style={s.body}>
        <Card>
          <Text style={T.body}>{error?.message || "Could not reach the portal."}</Text>
        </Card>
        {notSetUp || noUrl ? null : <Cta label="Try again" onPress={onRetry} />}
        {notSetUp && onSignOut ? <Cta label="Sign out" tone="ghost" onPress={onSignOut} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
  held: { paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: 1 },
  heldTop: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: S.touch - 20 },
  heldLabel: { flex: 1, color: C.muted, fontSize: 14.5 },
  heldValue: { color: C.muted, fontSize: 14.5, fontWeight: "700" },
  heldChev: { color: C.muted, fontSize: 20, lineHeight: 22 },
  heldWhy: { color: C.warnChipInk, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  // The same box as a tick, drawn empty and with nothing listening - it says
  // "not yours to choose yet" in the only place the eye is already looking.
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5,
    borderColor: C.line, opacity: 0.55,
  },
});
