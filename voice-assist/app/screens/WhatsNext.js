// What happens after you apply — the answer to the question the earnings
// screen's button asks.
//
// It exists because that button used to be wired to onBack, which for a
// signed-in applicant meant SIGN OUT. Tapping "what's next?" logged you out and
// dropped you on the login screen. Apple hit exactly that on 8 Sep 2026 and
// rejected 2.2.0 for it (Guideline 2.1(a)) — a question should be answered, not
// answered by ejecting the person asking.
//
// Keep the three steps honest. Approval is done by hand on purpose: a person
// checks the licence before anyone gets near a paying job, and saying so is
// reassurance, not an apology.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Cta, Header } from "../components/ui";
import { C, R, S, T } from "../lib/theme";

const STEPS = [
  {
    title: "We check you out",
    body: "A person reads your application — licence, business and insurance. "
      + "Not a form filter. That is what keeps the network worth being in.",
  },
  {
    title: "We have a chat",
    body: "If it looks like a fit we call you on the mobile you verified, walk "
      + "you through how the work and the pay run, and send you the agreement.",
  },
  {
    title: "Jobs start coming",
    body: "Once you're on, job alerts reach you on your phone and you take the "
      + "ones that suit. Materials, job notes and your pay claims all live in "
      + "this app.",
  },
];

export default function WhatsNext({ onBack, meta, onMeta }) {
  return (
    <View style={{ flex: 1 }}>
      <Header title="What happens next" onBack={onBack} meta={meta} onMeta={onMeta} />
      <ScrollView contentContainerStyle={st.wrap}>

        <Text style={st.blurb}>
          Your application is with us. Here's how it goes from here.
        </Text>

        {STEPS.map((step, i) => (
          <View key={step.title} style={st.step}>
            <View style={st.num}><Text style={st.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.stepTitle}>{step.title}</Text>
              <Text style={st.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}

        <Text style={st.foot}>
          Nothing for you to do in the meantime. Sign in whenever you like — the
          numbers stay here.
        </Text>

        <Cta label="Back to the numbers" onPress={onBack} tone="ghost" />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.screen, paddingBottom: 56 },
  blurb: { ...T.small, marginBottom: 18 },
  step: {
    flexDirection: "row",
    gap: 13,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 15,
    marginBottom: 11,
  },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  stepTitle: { ...T.body, fontSize: 15.5, fontWeight: "700", marginBottom: 4 },
  stepBody: { ...T.small },
  foot: { ...T.small, fontSize: 11.5, textAlign: "center", marginTop: 6, marginBottom: 16 },
});
