// Giving a job to somebody else, before anybody has done it.
//
// Steven, 17 Oct 2026: "If Jason wants to hand over a job to Peter, Peter could
// never see it and he could never complete it until Jason hands it over to him.
// And that's a record that he's given it to him." CLAUDE.md section 37.
//
// WHY THIS EXISTS AT ALL. A second contractor can only see a job because
// somebody allocated it in ServiceM8, so the only honest way to give work away
// is to offer it and have the other man take it. Without this the job gets
// scheduled to him by hand and the two records disagree afterwards - which is
// exactly what produced the handover question on job 167597.
//
// THE JOB NEVER LEAVES UNTIL HE SAYS YES. An offer moves nothing: not the
// ownership, not the allocation, not the money. So there is no "it came back",
// because it never went. Ignoring one is a valid answer and costs him nothing -
// "if somebody wants to palm them off, they just say no, just ignore them."
//
// NOTHING TIMES OUT. No chaser, no reminder, no expiry (section 20, rule 10).
// An offer nobody answers simply stays where the job already is.
//
// THE PHONE DECIDES NOTHING. Whether this job may be passed on, and who may
// receive it, are the portal's answers - the list is filtered by canAccessJobs
// at the other end, because passing work on would otherwise be a way to put a
// real job in front of somebody Steven never approved in ServiceM8.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Card } from "./ui";
import { C, R, S, T } from "../lib/theme";
import { ago } from "../lib/when";
import * as portal from "../lib/portal";

export default function PassJob({ jobNumber, onDone }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notLive, setNotLive] = useState(false);
  const [refused, setRefused] = useState("");
  const [sending, setSending] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const load = useCallback(() => {
    setBusy(true);
    setRefused("");
    portal.passTargets(jobNumber)
      .then((d) => {
        if (!live.current) return;
        setState(d || {});
        setNotLive(false);
      })
      .catch((e) => {
        if (!live.current) return;
        /*
         * The same three answers as every other screen here, and the reason is
         * the push failures of 13-16 Oct: a server that ANSWERS and says no
         * must never be silent, and a phone that cannot get out must never
         * shout. A 404 is neither - it is a route that has not been built yet.
         */
        if (Number(e?.status) === 404) setNotLive(true);
        else if (Number(e?.status) >= 400) setRefused(e?.message || "The portal would not answer.");
        else setState(null);
      })
      .finally(() => { if (live.current) setBusy(false); });
  }, [jobNumber]);

  // On mount, so the row can say "Offered to Jason" without being opened.
  useEffect(() => { load(); }, [load]);

  const offer = state?.offer || null;

  async function send(body, key) {
    setSending(key);
    setRefused("");
    try {
      await portal.passJob({ jobNumber, ...body });
      if (!live.current) return;
      setOpen(false);
      load();
      if (onDone) onDone();
    } catch (e) {
      if (!live.current) return;
      setRefused(e?.message || "That did not go through.");
    } finally {
      if (live.current) setSending("");
    }
  }

  /*
   * NOT SHOWN AT ALL when the portal says nothing about this job.
   *
   * A job he cannot pass on says so WITH THE REASON once the route exists
   * (`canPass: false, why`), because a button that vanishes looks like a bug
   * and a greyed one with no explanation is worse. But before the route is
   * built there is nothing to explain, and a dead row on every job card is
   * clutter on a screen he reads twenty times a day.
   */
  // Nothing at all until the portal has answered. Rendering the button while
  // the first call is still in flight means a button that appears and then
  // vanishes on every job card, which reads as a bug rather than as a route
  // that is not built yet.
  if (notLive || !state) return null;
  if (state && state.canPass === false && !offer && !state.why) return null;

  return (
    <Card style={s.card}>
      {offer ? (
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.offerTitle}>Offered to {offer.toName || "another contractor"}</Text>
            <Text style={T.small}>
              {offer.at ? `${ago(offer.at)} · ` : ""}It stays yours until they take it.
            </Text>
          </View>
          <Pressable
            style={s.cancel}
            disabled={!!sending}
            onPress={() => send({ cancel: true }, "cancel")}
          >
            <Text style={s.cancelText}>{sending === "cancel" ? "..." : "Cancel"}</Text>
          </Pressable>
        </View>
      ) : state?.canPass === false ? (
        <View style={s.row}>
          <Text style={[T.small, { flex: 1 }]}>{state.why}</Text>
        </View>
      ) : (
        <Pressable style={s.row} onPress={() => { setOpen(true); load(); }}>
          <Text style={s.passText}>Pass This Job On</Text>
          <Text style={s.chev}>›</Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={s.veil} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Pass job {jobNumber} on</Text>
            <Text style={[T.small, s.sheetNote]}>
              It stays yours until they take it. Nothing moves until then.
            </Text>

            {refused ? <Text style={s.refused}>{refused}</Text> : null}

            {busy && !state ? (
              <ActivityIndicator color={C.brand} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {(state?.contractors || []).map((c) => (
                  <Pressable
                    key={String(c.id)}
                    style={s.pick}
                    disabled={!!sending}
                    onPress={() => send({ toId: c.id }, String(c.id))}
                  >
                    <Text style={s.pickName}>{c.name}</Text>
                    <Text style={s.chev}>{sending === String(c.id) ? "..." : "›"}</Text>
                  </Pressable>
                ))}

                {/*
                  * BACK ON THE NETWORK, and it was Steven's own answer rather
                  * than one of the two we offered him: "resubmit the job to the
                  * network ... haven't spoken to anyone."
                  *
                  * Passing it to a named man is what you do AFTER a phone call.
                  * This is for when there has not been one - it goes up for
                  * anybody, first to take it, which is the Available tab doing
                  * the job it already does.
                  */}
                <Pressable
                  style={[s.pick, s.network]}
                  disabled={!!sending}
                  onPress={() => send({ toNetwork: true }, "network")}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickName}>Put It Back On The Network</Text>
                    <Text style={T.small}>Anyone can take it. First one in gets it.</Text>
                  </View>
                  <Text style={s.chev}>{sending === "network" ? "..." : "›"}</Text>
                </Pressable>

                {!(state?.contractors || []).length ? (
                  <Text style={[T.small, { marginTop: 10 }]}>
                    Nobody else on the network can take this one yet.
                  </Text>
                ) : null}
              </ScrollView>
            )}

            <Pressable style={s.close} onPress={() => setOpen(false)}>
              <Text style={s.closeText}>Not now</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  card: { paddingVertical: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    minHeight: S.touch,
  },
  passText: { flex: 1, color: C.ink, fontSize: 15, fontWeight: "700" },
  offerTitle: { color: C.ink, fontSize: 15, fontWeight: "700" },
  chev: { color: C.muted, fontSize: 20 },
  cancel: {
    minHeight: S.touch - 10, paddingHorizontal: 14, justifyContent: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  cancelText: { color: C.muted, fontSize: 14.5, fontWeight: "700" },
  veil: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.panel, borderTopLeftRadius: R.card, borderTopRightRadius: R.card,
    padding: S.screen, paddingBottom: 30, gap: 4,
  },
  sheetTitle: { color: C.ink, fontSize: 17, fontWeight: "800" },
  sheetNote: { marginBottom: 10 },
  refused: { color: C.active, fontSize: 13.5, marginBottom: 8 },
  pick: {
    flexDirection: "row", alignItems: "center", gap: 10,
    minHeight: S.touch, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  network: { marginTop: 6, borderBottomWidth: 0 },
  pickName: { flex: 1, color: C.ink, fontSize: 15.5, fontWeight: "700" },
  close: {
    marginTop: 14, minHeight: S.touch, justifyContent: "center", alignItems: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  closeText: { color: C.ink, fontSize: 15, fontWeight: "700" },
});
