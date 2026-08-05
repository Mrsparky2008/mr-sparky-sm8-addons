// The four questions the app answers, one per tab.
//
//   Work      what am I doing
//   Charlie   talk to it
//   Pay       what am I owed
//   Business  how is the business  (admin only)
//
// Role-shaped: a subcontractor sees three tabs and never learns the fourth
// exists. That is the whole of "one app, role-shaped" — the portal already
// knows who is an admin, so the app asks it rather than deciding for itself.
//
// A tab bar also fixes something the old stack was working around: Charlie has
// to stay mounted or his cleanup hangs up the call, which used to need a hidden
// absolutely-positioned overlay. Tabs keep their screens alive by nature.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, R, S, mono } from "../lib/theme";

export const TABS = {
  work: { icon: "🔧", label: "Work" },
  charlie: { icon: "🎙", label: "Charlie" },
  pay: { icon: "💰", label: "Pay" },
  admin: { icon: "📋", label: "Business" },
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
            <View>
              <Text style={[s.icon, !on && s.iconOff]}>{t.icon}</Text>
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
  icon: { fontSize: 21 },
  iconOff: { opacity: 0.45 },
  label: { color: C.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  badge: {
    position: "absolute", top: -4, right: -12, minWidth: 17, height: 17,
    borderRadius: R.chip, paddingHorizontal: 4,
    backgroundColor: C.active, alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
});
