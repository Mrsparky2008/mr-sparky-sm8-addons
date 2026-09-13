// Screen 0 — the front door.
//
// Two doors, because there are two kinds of person opening this app and they
// need different things. A contractor already on the network signs in. A sparky
// who is new applies. Applying is the only way in — there is no separate
// "have a look" door, because the demo is what an applicant gets while they
// wait, not a showroom for people who are not applying.
//
// Apply hands out a login immediately, but it is stamped `demo` and opens the
// demo earnings screen only. Real job access still waits on Steven creating
// them in ServiceM8 by hand and recording the Staff ID.
//
// A phone that has signed in before never sees this. App.js checks for a stored
// session first and goes straight to SignIn, which unlocks on Face ID — putting
// a menu in front of a returning contractor every morning would be a tax on the
// people who use this most.
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  useWindowDimensions,
} from "react-native";
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
        <Text style={s.doorTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.doorSub}>{sub}</Text>
      </View>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

export default function Welcome({ onSignIn, onApply }) {
  // The logo spans the same width as the doors below it. Measured rather than
  // hardcoded because a fixed number is right on exactly one handset — and it
  // follows a rotation, which Dimensions.get() at module scope would not.
  const { width } = useWindowDimensions();
  const logoWidth = width - S.screen * 2;

  return (
    <ScrollView
      contentContainerStyle={s.wrap}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.logo}>
        <Logo width={logoWidth} />
      </View>

      <Door
        tone="brand"
        title="Apply"
        sub="New to Mr Sparky"
        onPress={onApply}
      />

      <Door
        title="Sign In"
        sub="Already with Mr Sparky"
        onPress={onSignIn}
      />

      <Text style={s.foot}>
        A private network. Every application is reviewed by our team.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: S.screen, paddingTop: 56, gap: S.gap },
  logo: { alignItems: "center", marginBottom: 28 },
  door: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 20,
    minHeight: 152,
  },
  // lineHeight must be set with fontSize: T.body carries lineHeight 20 for
  // 14.5pt text, and spreading it under a 60pt size crops the glyphs to a 20pt
  // box — the letters lose their top half and it looks like a render bug.
  doorTitle: {
    ...T.body,
    fontSize: 60,
    lineHeight: 70,
    fontWeight: "700",
    color: C.ink,
  },
  doorSub: { ...T.small, fontSize: 16, lineHeight: 22, marginTop: 2 },
  chev: { fontSize: 36, color: C.muted, marginTop: -2 },
  foot: { ...T.small, textAlign: "center", marginTop: 28, paddingHorizontal: 20 },
});
