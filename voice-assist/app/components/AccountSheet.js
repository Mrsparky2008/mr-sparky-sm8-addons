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
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Cta, SectionLabel } from "./ui";
import { deleteAccount } from "../lib/portal";
import { C, R, S, T } from "../lib/theme";
import { IS_DEV_APP, VERSION } from "../lib/config";

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
