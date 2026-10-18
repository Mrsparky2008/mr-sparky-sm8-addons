// The job-by-job truth: every job, what it's worth, and the held ones with the
// reason in plain words. Was the front page of the old Pay tab; now a bucket.
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Card, Empty, Header, Row, SectionLabel } from "../../components/ui";
import { S, money } from "../../lib/theme";
import { HeldRow } from "./shared";

export default function Statement({ data, onBack, onOpenJob }) {
  const st = data?.statement || {};
  const meta = data?.meta || {};
  const claimed = new Set(data?.claimedJobNumbers || []);

  const ready = (st.jobs || []).filter((j) => j.outcome === "OK" && !claimed.has(j.jobNumber));
  const onClaims = (st.jobs || []).filter((j) => j.outcome === "OK" && claimed.has(j.jobNumber));
  const held = (st.jobs || []).filter((j) => j.outcome !== "OK");

  return (
    <View style={{ flex: 1 }}>
      <Header title="Statement" meta={`${(st.jobs || []).length} jobs`} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body}>
        {ready.length ? (
          <View>
            <SectionLabel>Ready to claim</SectionLabel>
            <Card>
              {ready.map((j, i) => (
                <Row
                  key={j.jobNumber}
                  onPress={onOpenJob ? () => onOpenJob(j, meta[j.jobNumber]) : undefined}
                  label={`${j.jobNumber}  ${meta[j.jobNumber]?.suburb || ""}`.trim()}
                  value={money(j.payableIncGst)}
                  last={i === ready.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {held.length ? (
          <View>
            <SectionLabel>Held — {held.length}</SectionLabel>
            {/*
              * One row shape for every held job, reason and all. It used to
              * print the outcome as the row's VALUE, in the money column -
              * which fitted while the reasons were short and printed the bare
              * word SETTLING at a tradesman the day the portal grew a fourth
              * one. The reason now gets its own line and comes from the
              * server, so a new outcome needs nothing here.
              */}
            <Card>
              {held.map((j, i) => (
                <HeldRow
                  key={j.jobNumber}
                  job={j}
                  suburb={meta[j.jobNumber]?.suburb}
                  onPress={onOpenJob ? () => onOpenJob(j, meta[j.jobNumber]) : null}
                  last={i === held.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {onClaims.length ? (
          <View>
            <SectionLabel>Already on a claim</SectionLabel>
            <Card>
              {onClaims.map((j, i) => (
                <Row
                  key={j.jobNumber}
                  onPress={onOpenJob ? () => onOpenJob(j, meta[j.jobNumber]) : undefined}
                  label={`${j.jobNumber}  ${meta[j.jobNumber]?.suburb || ""}`.trim()}
                  value={money(j.payableIncGst)}
                  dim
                  last={i === onClaims.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {!ready.length && !held.length && !onClaims.length ? (
          <Empty>No jobs on the statement yet.</Empty>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, gap: S.gap },
});
