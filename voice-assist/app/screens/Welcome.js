// Screen 0 — the front door.
//
// Two kinds of person open this app and they need different things. A sparky
// who is new applies. A contractor already on the network signs in. Applying
// is the only way in — there is no "have a look" door, because the demo is
// what an applicant gets while they wait, not a showroom for people who are
// not applying.
//
// Apply hands out a login immediately, but it is stamped `demo` and opens the
// demo earnings screen only. Real job access still waits on Steven creating
// them in ServiceM8 by hand and recording the Staff ID.
//
// A phone that has signed in before never sees this. App.js checks for a
// stored session first and goes straight to SignIn, which unlocks on Face ID —
// putting a menu in front of a returning contractor every morning would be a
// tax on the people who use this most.
//
// REDESIGNED 14 Oct 2026. Steven: "this looks hideous." He was right, and only
// one of the three problems was taste:
//
//   · THE WRONG LOGO. The horizontal banner is made for a van and a
//     letterhead — white and yellow blocks on a white page. On a dark phone it
//     is a rectangle pasted onto navy, with hard edges belonging to nothing
//     else in the app. This uses the APP ICON: the thing he just tapped to get
//     here, so the first screen looks like the app he opened.
//
//   · THE NAME TWICE. The icon already carries "MR SPARKY NETWORK", so a
//     heading under it said the same thing again. Steven: "add Mr Sparky
//     Network in the logo, like the app logo." One mark, large, nothing else.
//
//   · TWO EQUAL DOORS for things that are not equals. Almost everybody opening
//     this for the first time is applying; everybody else has Face ID and will
//     never see this screen again. So: one solid button and a quiet line, both
//     at the bottom under the thumb, rather than two 60pt words floating in
//     the middle.
//
// "Start my application" rather than "Apply to join", because it is a process
// and not a sign-up — which is what the line underneath has always said.
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { C, S, T } from "../lib/theme";

const ICON = require("../assets/icon.png");

export default function Welcome({ onSignIn, onApply }) {
  return (
    <View style={s.wrap}>
      <View style={s.middle}>
        <Image source={ICON} style={s.icon} resizeMode="cover" />
        <Text style={s.tagline}>
          Private job distribution for licensed electricians.
        </Text>
      </View>

      {/*
        * SIGN IN IS THE BUTTON, applying is the line. Steven, 14 Oct 2026:
        * "swap the options — easier to sign in, and on text to sign up."
        *
        * I had it the other way round on the grounds that a first-timer is
        * applying. His read is better: applying happens ONCE in a man's life
        * with this app, and signing in happens every time he has changed
        * phone, signed out, or been logged out. The solid button belongs to
        * the thing done repeatedly.
        */}
      <View style={s.bottom}>
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
        >
          <Text style={s.ctaText}>Sign in</Text>
        </Pressable>

        <Pressable
          onPress={onApply}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [s.secondary, pressed && { opacity: 0.6 }]}
        >
          <Text style={s.secondaryText}>New here? Start an application</Text>
        </Pressable>

        {/* What it will cost him before he starts, rather than three fields in. */}
        <Text style={s.foot}>
          Every application is read by a person.{"\n"}
          You will need your licence and your ABN.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: S.screen },
  middle: { flex: 1, alignItems: "center", justifyContent: "center" },
  icon: { width: 196, height: 196, borderRadius: 44 },
  tagline: {
    ...T.small,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 26,
    maxWidth: 264,
  },
  // Lifted off the bottom edge rather than hard against it. Steven: "lift
  // them higher, or [make] the logo 50% bigger" - both, so the dead band in
  // the middle closes from each end instead of one.
  bottom: { paddingBottom: 52 },
  cta: {
    backgroundColor: C.brand,
    borderRadius: 15,
    paddingVertical: 18,
    alignItems: "center",
  },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  secondary: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  secondaryText: { color: C.infoChipInk, fontSize: 15.5, fontWeight: "700" },
  foot: { ...T.small, fontSize: 12.5, lineHeight: 19, textAlign: "center", marginTop: 10 },
});
