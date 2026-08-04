// AI Assist — the Mr Sparky app.
//
// Sign in once with the same account as the subcontractor portal, then: pick a
// job, talk to Charlie about it, watch a quote build on screen, and commit it
// deliberately. Six screens, per voice-assist/DESIGN.md.
//
// The router is a plain stack in state. React Navigation would bring a native
// dependency and a lot of ceremony for six screens that only ever push and pop.
import { useCallback, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import SignIn from "./screens/SignIn";
import Jobs from "./screens/Jobs";
import JobCard from "./screens/JobCard";
import CharlieLive from "./screens/CharlieLive";
import QuoteWorkshop from "./screens/QuoteWorkshop";
import Diary from "./screens/Diary";
import { signOut } from "./lib/auth";
import * as VV from "./lib/vapiVoice";
import { C, suburb } from "./lib/theme";

export default function App() {
  const [email, setEmail] = useState(null);           // null = not signed in
  const [stack, setStack] = useState([{ name: "jobs" }]);
  const [draft, setDraft] = useState(null);           // quote lines from Charlie
  const [committing, setCommitting] = useState(false);

  const top = stack[stack.length - 1];
  const push = useCallback((screen) => setStack((s) => [...s, screen]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  // A job anywhere in the app is the same shape: number, address, suburb.
  const asJob = (j) =>
    j && { job_number: j.job_number, address: j.address || "", suburb: suburb(j.address) };

  const openCharlie = useCallback((job) => {
    setDraft(null);
    push({ name: "charlie", job: asJob(job) });
  }, [push]);

  // Charlie surfaces a draft as a tool call; it gets its own screen so nobody
  // mistakes talk for something that has been saved.
  const onDraft = useCallback((lines) => {
    setDraft(lines);
    setStack((s) => (s[s.length - 1].name === "quote" ? s : [...s, { name: "quote" }]));
  }, []);

  // Committing is Charlie's job, not the app's: saying the approval out loud
  // runs the same add-only, duplicate-guarded write the voice flow already uses,
  // rather than inventing a second path into ServiceM8 billing.
  const lockIn = useCallback(() => {
    setCommitting(true);
    VV.say("Lock it in — add those lines to the job.");
    setTimeout(() => { setCommitting(false); pop(); }, 900);
  }, [pop]);

  async function handleSignOut() {
    await VV.stop().catch(() => {});
    await signOut();
    setStack([{ name: "jobs" }]);
    setDraft(null);
    setEmail(null);
  }

  if (!email) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        <SignIn onSignedIn={setEmail} />
      </SafeAreaView>
    );
  }

  const charlie = [...stack].reverse().find((f) => f.name === "charlie");

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {top.name === "jobs" && (
          <Jobs
            email={email}
            onOpenJob={(j) => push({ name: "job", job: asJob(j) })}
            onTalk={openCharlie}
            onDiary={() => push({ name: "diary" })}
            onSignOut={handleSignOut}
          />
        )}

        {top.name === "job" && (
          <JobCard jobNumber={top.job.job_number} onBack={pop} onTalk={openCharlie} />
        )}

        {top.name === "diary" && <Diary onBack={pop} onTalk={openCharlie} />}

        {/* Charlie stays MOUNTED while the quote screen is up: unmounting him
            runs his cleanup, which hangs up the call — so "Keep talking" would
            come back to a dead line. Hidden, not destroyed. */}
        {charlie && (
          <View style={[s.fill, top.name !== "charlie" && s.hidden]} pointerEvents={top.name === "charlie" ? "auto" : "none"}>
            <CharlieLive
              job={charlie.job}
              onBack={() => { VV.stop().catch(() => {}); pop(); }}
              onDraft={onDraft}
            />
          </View>
        )}

        {top.name === "quote" && (
          <View style={s.fill}>
            <QuoteWorkshop
              job={charlie?.job}
              lines={draft || []}
              committing={committing}
              onKeepTalking={pop}
              onLockIn={lockIn}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg },
  hidden: { opacity: 0 },
});
