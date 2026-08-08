// Put the keyboard away, and get it back.
//
// Steven's ask after the second keyboard complaint: "keyboard disappear by
// pressing a down arrow and appear by pressing another up arrow, away at the
// bottom of page, never over text."
//
// So: one small control, pinned bottom-right, that rides just above the
// keyboard while it is up (▼ dismisses) and drops to the corner when it is
// down (▲ brings it back to the field you were in). It never sits over a
// field because it tracks the keyboard's real height from the OS, and the
// screens it lives on already inset their scroll for that same height.
import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text } from "react-native";
import { C, R, S } from "../lib/theme";

export default function KeyboardToggle({ inputRef }) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // "will" events fire with the animation rather than after it, so the
    // button travels with the keyboard instead of jumping once it lands.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const shown = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height || 0));
    const hidden = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  const up = height > 0;

  // With the keyboard down and nothing to focus, the button would do nothing —
  // and a control that does nothing is worse than no control.
  if (!up && !inputRef?.current) return null;

  return (
    <Pressable
      onPress={() => (up ? Keyboard.dismiss() : inputRef?.current?.focus())}
      style={[s.btn, { bottom: up ? height + 10 : 14 }]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={up ? "Hide the keyboard" : "Show the keyboard"}
    >
      <Text style={s.arrow}>{up ? "▼" : "▲"}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    position: "absolute",
    right: S.screen,
    width: 44,
    height: 44,
    borderRadius: R.chip,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // Above the content, below nothing else on these screens.
    zIndex: 10,
    // A little lift so it reads as floating rather than as a field.
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  arrow: { color: C.ink, fontSize: 15, fontWeight: "800", lineHeight: 18 },
});
