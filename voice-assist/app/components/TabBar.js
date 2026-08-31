// The questions the app answers, one per slot.
//
//   Work       what am I doing
//   AI Assist  ask Claude (an ACTION - opens Claude, never becomes "current")
//   My day     where am I meant to be
//   Money      what am I owed
//   Business   how is the business  (admin only)
//
// Role-shaped: a subcontractor never learns the admin slot exists. Icons are
// white line-work; the Mr Sparky yellow marks where you are - except the
// Claude starburst, which wears Claude orange because that button IS Claude
// (Steven's call, 30 Aug 2026).
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./icons";
import { C, R, S, mono } from "../lib/theme";

export const TABS = {
  work: { icon: "wrench", label: "Work" },
  assist: { icon: "claude", label: "AI Assist", tint: "#D97757" },
  day: { icon: "board", label: "My day" },
  pay: { icon: "dollar", label: "Money" },
  admin: { icon: "chart", label: "Business" },
};

export default function TabBar({ tabs, value, onChange, badges = {} }) {
  return (
    <View style={s.bar}>
      {tabs.map((key) => {
        const t = TABS[key];
        const on = key === value;
        const badge = badges[key];
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={s.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
          >
            <View style={!on && !t.tint && s.iconOff}>
              <Icon name={t.icon} size={21} color={t.tint || (on ? C.yellow : C.muted)} />
              {badge ? (
                <View style={s.badge}>
                  <Text style={[s.badgeText, mono]}>{badge > 9 ? "9+" : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[s.label, on && { color: C.ink }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopColor: C.line, borderTopWidth: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 6, paddingTop: 7, paddingBottom: 6,
  },
  // Glove-sized: the whole column is the target, not the icon.
  tab: {
    flex: 1, minHeight: S.touch, alignItems: "center", justifyContent: "center", gap: 3,
  },
  iconOff: { opacity: 0.65 },
  label: { color: C.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  badge: {
    position: "absolute", top: -4, right: -14, minWidth: 17, height: 17,
    borderRadius: R.chip, paddingHorizontal: 4,
    backgroundColor: C.active, alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
});
