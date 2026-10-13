// Who is signed in, and the ways out.
//
// Steven's ask, verbatim: "no way of logging out or tell me who's logged in."
// The sheet answers both, plus the two questions that come right after them in
// practice: what does the portal think this person is (which explains why the
// Business tab does or doesn't exist), and which build is this (two near-
// identical dark apps live on the same phone during testing).
//
// Deleting your account lives here too. Apple requires it of any app offering
// signup (Guideline 5.1.1(v)) and asks to see it in the review recording — but
// the reason it belongs on THIS sheet rather than a screen of its own is that
// this is already where someone goes when they want out.
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Cta, SectionLabel } from "./ui";
import { deleteAccount } from "../lib/portal";
import { C, R, S, T } from "../lib/theme";
import { IS_DEV_APP, VERSION } from "../lib/config";
import { pushState } from "../lib/push";
import * as portal from "../lib/portal";

export default function AccountSheet({
  visible, email, who, demo, onClose, onSignOut, onDeleted,
}) {
  // "idle" -> "confirm" -> "busy". Two taps, because there is no undo at the
  // other end and a misfire costs someone their application.
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState("");

  const role = who
    ? who.isAdmin
      ? `${who.name} — Admin. Sees Business, can approve claims.`
      : `${who.name} — ${who.role || "Subbie"}.`
    : demo
      ? "Application in progress. Job access switches on once the office approves you."
      : "The portal doesn't recognise this login yet. Pay needs the office to add you.";

  // Closing mid-confirmation must not leave it armed for next time.
  const close = () => { setStage("idle"); setError(""); onClose?.(); };

  async function reallyDelete() {
    setStage("busy");
    setError("");
    try {
      await deleteAccount();
      onDeleted?.();
    } catch (e) {
      // A contractor is refused by the server on purpose — claims and payment
      // history sit behind a real staff record. Show what it actually said,
      // because "ring the office" is the real next step and a generic failure
      // would have them tapping it again.
      setError(e?.message || "That didn't work. Try again shortly.");
      setStage("confirm");
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.veil} onPress={close}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <SectionLabel>Signed in as</SectionLabel>
          <Text style={s.email}>{email}</Text>

          <Card style={{ marginTop: 10 }}>
            <SectionLabel>Portal</SectionLabel>
            <Text style={T.small}>{role}</Text>
          </Card>

          {stage === "idle" ? (
            <>
              <Card style={{ marginTop: 10 }}>
                <SectionLabel>This app</SectionLabel>
                <Text style={T.small}>
                  {VERSION}
                  {IS_DEV_APP ? " — test build. Everything it does is real." : ""}
                </Text>
              </Card>

              {/*
                * NOTIFICATIONS, SAID OUT LOUD.
                *
                * Everything about push failed silently tonight and nobody
                * could see it: the app asked, got its token, called the
                * portal, and the portal could not write to the table. Three
                * failures in a row and not one of them showed on a screen.
                *
                * So the state is on the account sheet. "Not allowed" is a
                * setting he can change; "no Apple token" is a bug; both of
                * them beat a quiet nothing. And the token itself is here
                * because it is the one thing needed to prove the pipe from
                * outside the app - it is an address, not a secret, and
                * useless to anybody without the signing key.
                */}
              <PushState />

              <View style={{ height: 14 }} />
              <Cta
                label="Sign out"
                tone="ghost"
                onPress={onSignOut}
                sub="Signing back in needs your password once; Face ID after that."
              />
              <View style={{ height: 8 }} />
              <Cta label="Close" onPress={close} />

              {/* Offered only to people whose account was created IN the app —
                  applicants and demo logins. A contractor's account is made by
                  the office with claims and payment history behind it, and the
                  server refuses to delete one; showing a button that always
                  fails would be worse than not showing it. The server check is
                  the real guard, this is just not putting it in their way. */}
              {!who ? (
                <>
                  <View style={{ height: 20 }} />
                  <Cta
                    label="Delete my account"
                    tone="ghost"
                    onPress={() => { setError(""); setStage("confirm"); }}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <Card style={{ marginTop: 10 }}>
                <SectionLabel>Delete my account</SectionLabel>
                <Text style={T.small}>
                  This removes your login and your application from Mr Sparky for
                  good. Nothing is kept, and it can't be undone — you would have to
                  apply again from the beginning.
                </Text>
              </Card>

              {error ? (
                <Card style={{ marginTop: 10 }}>
                  <Text style={T.small}>{error}</Text>
                </Card>
              ) : null}

              <View style={{ height: 14 }} />

              {/* The safe way out is the loud button and the destructive one is
                  quiet and second. The other way round is how people delete
                  things they meant to keep. */}
              {stage === "busy" ? (
                <ActivityIndicator color={C.brand} style={{ marginVertical: 16 }} />
              ) : (
                <>
                  <Cta label="Keep my account" onPress={() => { setStage("idle"); setError(""); }} />
                  <View style={{ height: 8 }} />
                  <Cta label="Yes, delete it permanently" tone="ghost" onPress={reallyDelete} />
                </>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PushState() {
  const [st, setSt] = useState(null);
  const [ring, setRing] = useState("");
  useEffect(() => { pushState().then(setSt).catch(() => setSt({ why: "could not check" })); }, []);
  if (!st) return null;

  /*
   * Ring my own phone. Steven spent an hour tonight unable to tell whether
   * push worked, and the answer was only findable by reading server logs. A
   * button he can press himself is the difference between "it is broken" and
   * "it is broken HERE".
   *
   * It only ever rings the caller's own devices - an admin who could push to
   * anybody is a way to wake the whole business at 3am.
   */
  async function sendTest() {
    setRing("…");
    try {
      await portal.testPush();
      setRing("sent — it should arrive in a second or two");
    } catch (e) {
      setRing(e?.message || "the portal would not send it");
    }
  }

  return (
    <Card style={{ marginTop: 10 }}>
      <SectionLabel>Notifications</SectionLabel>
      <Text style={T.small}>
        {st.granted ? "Allowed" : "NOT allowed — turn them on in iPhone Settings"}
        {st.granted ? (st.apns ? " · Apple token ok" : " · no Apple token yet") : ""}
      </Text>
      {st.granted ? (
        <Pressable onPress={sendTest} hitSlop={8} style={{ paddingVertical: 10 }}>
          <Text style={{ color: C.infoChipInk, fontSize: 13.5, fontWeight: "700" }}>
            Send me a test notification
          </Text>
        </Pressable>
      ) : null}
      {ring ? <Text style={[T.small, { fontSize: 12 }]}>{ring}</Text> : null}
      {st.apns ? (
        <Text selectable style={[T.small, { marginTop: 6, fontSize: 11 }]}>{st.apns}</Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  veil: {
    flex: 1, backgroundColor: "rgba(4,10,18,.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.bg, borderColor: C.line, borderWidth: 1,
    borderTopLeftRadius: R.card + 4, borderTopRightRadius: R.card + 4,
    padding: S.screen, paddingBottom: S.screen + 14,
  },
  email: { color: C.ink, fontSize: 16, fontWeight: "700" },
});
