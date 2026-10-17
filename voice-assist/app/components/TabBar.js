// The questions the app answers, one per slot.
//
//   Jobs       what am I doing
//   Available  what is up for grabs
//   Money      what am I owed
//   Team       what is the crew carrying  (employees, in Money's slot)
//   Business   how is the business        (admin only)
//
// Role-shaped: a subcontractor never learns the admin slot exists. Icons are
// white line-work; the Mr Sparky yellow marks where you are - except the
// Claude starburst, which wears Claude orange because that button IS Claude
// (Steven's call, 30 Aug 2026).
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./icons";
import { C, R, S, mono } from "../lib/theme";

export const TABS = {
  /*
   * "Jobs", not "Work". Steven, 13 Oct 2026, working through the bar after
   * Available arrived: Work and Jobs are the same word to a tradesman, and
   * with both in the bar he has to learn which is which. This tab shows HIS
   * jobs, so it says Jobs; the other one is not his yet, so it says Available.
   */
  work: { icon: "wrench", label: "Jobs" },
  /*
   * Steven, 13 Oct 2026, circling the AI Assist tab: "this button can go."
   *
   * It opened a chat and little else, and the slot was the only one in the bar
   * not doing a job. Available is the one that is time-critical - first to tap
   * takes it - so it earns a permanent place under the thumb. The blue AI
   * Assist button on the job card stays; that is the one that carries the job
   * with it and does the work.
   */
  available: { icon: "spark", label: "Available", tint: "#2F9E57" },
  /*
   * MY DAY WAS DELETED, 17 Oct 2026, and it is worth saying why here so it is
   * not added back as an oversight.
   *
   * Steven: "Remove My Day because it is double." It was the one entry in this
   * list that was never a screen - a bottom-bar button that jumped to the
   * Today segment already sitting inside Jobs. Deleting it removed a shortcut,
   * not a feature, and everything it reached is one tap away on the segment it
   * was pointing at.
   *
   * The slot it freed goes to NOTIFICATIONS, which is waiting on the portal's
   * routes (docs/APP-TABS-AND-NOTIFICATIONS.md in mr-sparky-network).
   *
   * Available deliberately did NOT move. Folding it into the Jobs segment was
   * the first plan and it would have left `goingNow` - the dot that is how a
   * man learns there is work up - with nowhere on the bar to live.
   */
  /*
   * THE CREW'S WORK. Steven, 14 Oct 2026: "I prefer the team tab... the
   * available, the jobs, the day, and the team."
   *
   * It fills the slot Money leaves for an employee, who never sees Money
   * because the money on a job he finishes is his employer's. The portal
   * decides who gets it (`can.team`), so the bar stays four wide for everyone -
   * a subbie gets Money in this position, an employee gets Team.
   */
  team: { icon: "people", label: "Team" },
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
