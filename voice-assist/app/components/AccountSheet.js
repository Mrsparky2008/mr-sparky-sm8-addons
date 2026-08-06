// Who is signed in, and the way out.
//
// Steven's ask, verbatim: "no way of logging out or tell me who's logged in."
// The sheet answers both, plus the two questions that come right after them in
// practice: what does the portal think this person is (which explains why the
// Business tab does or doesn't exist), and which build is this (two near-
// identical dark apps live on the same phone during testing).
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Cta, SectionLabel } from "./ui";
import { C, R, S, T } from "../lib/theme";
import { IS_DEV_APP, VERSION } from "../lib/config";

export default function AccountSheet({ visible, email, who, onClose, onSignOut }) {
  const role = who
    ? who.isAdmin
      ? `${who.name} — Admin. Sees Business, can approve claims.`
      : `${who.name} — ${who.role || "Subbie"}.`
    : "The portal doesn't recognise this login yet. Pay needs the office to add you.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.veil} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <SectionLabel>Signed in as</SectionLabel>
          <Text style={s.email}>{email}</Text>

          <Card style={{ marginTop: 10 }}>
            <SectionLabel>Portal</SectionLabel>
            <Text style={T.small}>{role}</Text>
          </Card>

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
          <Cta label="Close" onPress={onClose} />
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
