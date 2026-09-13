// Furniture shared across the Money screens.
import { StyleSheet, Text, View } from "react-native";
import { Card, Cta, Header } from "../../components/ui";
import { C, S, T } from "../../lib/theme";
import * as portal from "../../lib/portal";
import { StatusChip } from "../../components/ui";

// Why a job is not payable yet, in the words the office uses for it.
export const HELD = {
  AWAITING_FORM: "Waiting on Form 001",
  AMBIGUOUS_FORM: "More than one Form 001 — needs a human",
  NOT_THEIR_JOB: "Not attributed to you",
  NO_RULE: "No rate in force on that date",
};

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
});
