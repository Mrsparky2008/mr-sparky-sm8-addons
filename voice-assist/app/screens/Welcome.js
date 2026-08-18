// Screen 0 — the front door.
//
// Two doors, because there are two kinds of person opening this app and they
// need different things. A contractor already on the network signs in. A sparky
// who has spoken to Steven applies, and an application is NOT a sign-up: no
// account exists until Steven has created them in ServiceM8 by hand and
// recorded the Staff ID. Calling the second tile "register" would promise a
// login the flow deliberately does not hand out, so it says "apply".
//
// A phone that has signed in before never sees this. App.js checks for a stored
// session first and goes straight to SignIn, which unlocks on Face ID — putting
// a menu in front of a returning contractor every morning would be a tax on the
// people who use this most.
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { Logo } from "../components/Logo";
import { C, R, S, T } from "../lib/theme";

function Door({ title, sub, onPress, tone }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => [
        s.door,
        tone === "brand" && { borderColor: C.brand },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.doorTitle}>{title}</Text>
        <Text style={s.doorSub}>{sub}</Text>
      </View>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

export default function Welcome({ onSignIn, onApply }) {
  return (
    <ScrollView
      contentContainerStyle={s.wrap}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.logo}>
        <Logo width={212} />
      </View>

      <Door
        title="Contractor sign in"
        sub="Already with Mr Sparky"
        onPress={onSignIn}
      />

      <Door
        tone="brand"
        title="Have a look around"
        sub="Licensed electricians"
        onPress={onApply}
      />

      <Text style={s.foot}>
        A private network. Every application is reviewed by our team.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: S.screen, paddingTop: 64, gap: S.gap },
  logo: { alignItems: "center", marginBottom: 36 },
  door: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 18,
    minHeight: 76,
  },
  doorTitle: { ...T.body, fontSize: 16, fontWeight: "700", color: C.ink },
  doorSub: { ...T.small, marginTop: 3 },
  chev: { fontSize: 26, color: C.muted, marginTop: -2 },
  foot: { ...T.small, textAlign: "center", marginTop: 28, paddingHorizontal: 20 },
});
