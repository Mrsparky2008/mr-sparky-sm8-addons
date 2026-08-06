// AI Assist — the Mr Sparky app.
//
// Four questions, one tab each:
//   Work      what am I doing   — jobs, today's diary, a job card
//   Charlie   talk to it        — voice, and the quote he builds on screen
//   Pay       what am I owed    — the subcontractor portal, natively
//   Business  how's it going    — admin only: the claims waiting on a decision
//
// Role-shaped: a subcontractor never learns the fourth tab exists. The portal
// already knows who is an admin, so the app asks it rather than deciding.
//
// Navigation is a stack per tab, held in state. React Navigation would bring a
// native dependency and a lot of ceremony for a shape this small — and tabs
// give us something the old single stack had to fake: screens that stay
// mounted. Charlie's cleanup hangs up the call, so he must never be unmounted
// while a call is live; that used to need a hidden absolutely-positioned
// overlay, and now it is just what a tab bar does.
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import ErrorBoundary from "./components/ErrorBoundary";
import TabBar from "./components/TabBar";
import AccountSheet from "./components/AccountSheet";
import { Banner, Segment } from "./components/ui";
import SignIn from "./screens/SignIn";
import Jobs from "./screens/Jobs";
import JobCard from "./screens/JobCard";
import CharlieLive from "./screens/CharlieLive";
import QuoteWorkshop from "./screens/QuoteWorkshop";
import Diary from "./screens/Diary";
import Earnings from "./screens/pay/Earnings";
import ClaimDetail from "./screens/pay/ClaimDetail";
import SubmitClaim from "./screens/pay/SubmitClaim";
import AddReceipt from "./screens/pay/AddReceipt";
import RctiView from "./screens/pay/RctiView";
import ClaimsInbox from "./screens/admin/ClaimsInbox";
import ApproveClaim from "./screens/admin/ApproveClaim";
import { signOut } from "./lib/auth";
import * as portal from "./lib/portal";
import * as VV from "./lib/vapiVoice";
import { IS_DEV_APP } from "./lib/config";
import { C, S, suburb } from "./lib/theme";

const ROOTS = { work: { name: "work" }, pay: { name: "earnings" }, admin: { name: "inbox" } };

export default function App() {
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}

function Shell() {
  const [email, setEmail] = useState(null);           // null = not signed in
  const emailRef = useRef(null);                      // readable from listeners
  const [who, setWho] = useState(null);               // the portal's view of you
  const [tab, setTab] = useState("work");
  const [stacks, setStacks] = useState(ROOTS);
  const [workView, setWorkView] = useState("jobs");   // jobs | today
  const [charlieJob, setCharlieJob] = useState(null);
  // Charlie's screen dials the moment it mounts — right when he was a screen
  // you tapped into, wrong for a tab that exists from launch. Found live: the
  // app opened and started talking. So he is born on the FIRST visit to his
  // tab and stays mounted after (leaving mid-call must not hang up the line).
  const [charlieBorn, setCharlieBorn] = useState(false);
  const [draft, setDraft] = useState(null);           // quote lines from Charlie
  const [committing, setCommitting] = useState(false);
  const [waiting, setWaiting] = useState(0);          // claims needing a decision
  const [account, setAccount] = useState(false);      // the who-am-I / sign-out sheet

  const stack = Array.isArray(stacks[tab]) ? stacks[tab] : [stacks[tab]];
  const top = stack[stack.length - 1];

  const push = useCallback((screen) => {
    setStacks((s) => {
      const cur = Array.isArray(s[tab]) ? s[tab] : [s[tab]];
      return { ...s, [tab]: [...cur, screen] };
    });
  }, [tab]);

  const pop = useCallback(() => {
    setStacks((s) => {
      const cur = Array.isArray(s[tab]) ? s[tab] : [s[tab]];
      return { ...s, [tab]: cur.length > 1 ? cur.slice(0, -1) : cur };
    });
  }, [tab]);

  const resetTab = useCallback((which) => {
    setStacks((s) => ({ ...s, [which]: [ROOTS[which]] }));
  }, []);

  // A job anywhere in the app is the same shape: number, address, suburb.
  const asJob = (j) =>
    j && { job_number: j.job_number, address: j.address || "", suburb: suburb(j.address) };

  // Talking about a job is a tab change, not a push — Charlie is a place you go
  // back to, and the call has to survive going somewhere else and returning.
  const openCharlie = useCallback((job) => {
    setDraft(null);
    setCharlieJob(asJob(job));
    setCharlieBorn(true);
    setTab("charlie");
  }, []);

  // Charlie surfaces a draft as a tool call; it gets its own screen so nobody
  // mistakes talk for something that has been saved.
  const onDraft = useCallback((lines) => {
    setDraft(lines);
    setTab("charlie");
  }, []);

  // Committing is Charlie's job, not the app's: saying the approval out loud
  // runs the same add-only, duplicate-guarded write the voice flow already uses,
  // rather than inventing a second path into ServiceM8 billing.
  const lockIn = useCallback(() => {
    setCommitting(true);
    VV.say("Lock it in — add those lines to the job.");
    setTimeout(() => { setCommitting(false); setDraft(null); }, 900);
  }, []);

  // Deep link from the ServiceM8 job card: mrsparky-aiassist://job/167483.
  // The add-on is the doorway, this is the room — it opens the job card for
  // that job, from which Charlie is one tap away already anchored. It stops
  // short of dialling straight into a live mic session off a single tap.
  const pendingJob = useRef(null);

  const openLink = useCallback((url) => {
    const number = /(?:^|\/)job\/(\d+)/.exec(String(url || ""))?.[1];
    if (!number) return;
    // Arrived before sign-in finished — hold it and replay once we're in.
    if (!emailRef.current) { pendingJob.current = number; return; }
    setTab("work");
    setStacks((s) => ({
      ...s,
      work: [ROOTS.work, { name: "job", job: { job_number: number, address: "" } }],
    }));
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) openLink(url); }).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => openLink(url));
    return () => sub.remove();
  }, [openLink]);

  // A cold launch from the job card lands here before Face ID has finished,
  // so the job waits and is replayed the moment we're signed in.
  const handleSignedIn = useCallback((signedInAs) => {
    emailRef.current = signedInAs;
    setEmail(signedInAs);

    // Who the portal thinks you are decides whether the Business tab exists.
    // A failure here is not a failed sign-in — the app's own screens work
    // without the portal — so it is swallowed and the Pay tab explains itself.
    portal.me().then(setWho).catch(() => setWho(null));

    const held = pendingJob.current;
    if (held) {
      pendingJob.current = null;
      setTab("work");
      setStacks((s) => ({
        ...s,
        work: [ROOTS.work, { name: "job", job: { job_number: held, address: "" } }],
      }));
    }
  }, []);

  async function handleSignOut() {
    await VV.stop().catch(() => {});
    await signOut();
    setStacks(ROOTS);
    setTab("work");
    setDraft(null);
    setCharlieJob(null);
    setCharlieBorn(false);
    setWho(null);
    setWaiting(0);
    emailRef.current = null;
    setEmail(null);
  }

  if (!email) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        <SignIn onSignedIn={handleSignedIn} />
      </SafeAreaView>
    );
  }

  const tabs = ["work", "charlie", "pay", ...(who?.isAdmin ? ["admin"] : [])];

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />

      {/* Two identical dark apps live on this phone during testing. The one
          that can approve a real claim should never be a guess. */}
      {IS_DEV_APP ? (
        <View style={s.devStripe}>
          <Banner tone="warn">Test build — everything you do here is real</Banner>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {/* ---- Work ------------------------------------------------------ */}
        <View style={[s.fill, tab !== "work" && s.hidden]} pointerEvents={tab === "work" ? "auto" : "none"}>
          {top?.name === "work" || tab !== "work" ? (
            <View style={{ flex: 1 }}>
              <View style={s.segment}>
                <Segment
                  options={[{ key: "jobs", label: "Jobs" }, { key: "today", label: "Today" }]}
                  value={workView}
                  onChange={setWorkView}
                />
              </View>
              {workView === "jobs" ? (
                <Jobs
                  email={email}
                  onOpenJob={(j) => push({ name: "job", job: asJob(j) })}
                  onTalk={openCharlie}
                  onDiary={() => setWorkView("today")}
                  onSignOut={handleSignOut}
                  onAccount={() => setAccount(true)}
                />
              ) : (
                <Diary onTalk={openCharlie} />
              )}
            </View>
          ) : null}

          {top?.name === "job" ? (
            <View style={s.fill}>
              <JobCard
                jobNumber={top.job.job_number}
                onBack={pop}
                onTalk={openCharlie}
                onDiary={() => { pop(); setWorkView("today"); }}
              />
            </View>
          ) : null}
        </View>

        {/* ---- Charlie ---------------------------------------------------
            Mounted on first visit, never unmounted after: mounting dials, and
            unmounting runs his cleanup, which hangs up the call — so leaving
            this tab must never destroy him, and launching the app must never
            create him. Hang up by tapping the orb, or sign out. */}
        <View style={[s.fill, tab !== "charlie" && s.hidden]} pointerEvents={tab === "charlie" ? "auto" : "none"}>
          {charlieBorn ? (
          <CharlieLive
            job={charlieJob}
            onBack={() => setTab("work")}
            onDraft={onDraft}
          />
          ) : null}
          {draft ? (
            <View style={s.fill}>
              <QuoteWorkshop
                job={charlieJob}
                lines={draft}
                committing={committing}
                onKeepTalking={() => setDraft(null)}
                onLockIn={lockIn}
              />
            </View>
          ) : null}
        </View>

        {/* ---- Pay ------------------------------------------------------- */}
        <View style={[s.fill, tab !== "pay" && s.hidden]} pointerEvents={tab === "pay" ? "auto" : "none"}>
          {top?.name === "earnings" || tab !== "pay" ? (
            <Earnings
              onOpenClaim={(claim) => push({ name: "claim", claim })}
              onMakeClaim={(data) => push({ name: "submit", data })}
              onAddReceipt={(data) => push({ name: "receipt", data })}
              onSignOut={handleSignOut}
              onAccount={() => setAccount(true)}
            />
          ) : null}
          {top?.name === "claim" ? (
            <View style={s.fill}>
              <ClaimDetail
                claim={top.claim}
                onBack={pop}
                onViewRcti={(claim) => push({ name: "rcti", claim })}
              />
            </View>
          ) : null}
          {top?.name === "rcti" ? (
            <View style={s.fill}>
              <RctiView claim={top.claim} onBack={pop} />
            </View>
          ) : null}
          {top?.name === "receipt" ? (
            <View style={s.fill}>
              <AddReceipt
                jobNumbers={(top.data?.statement?.jobs || []).map((j) => j.jobNumber)}
                onBack={pop}
                onSaved={() => resetTab("pay")}
              />
            </View>
          ) : null}
          {top?.name === "submit" ? (
            <View style={s.fill}>
              <SubmitClaim
                data={top.data}
                onBack={pop}
                onSubmitted={(claim) => {
                  resetTab("pay");
                  if (claim) push({ name: "claim", claim });
                }}
              />
            </View>
          ) : null}
        </View>

        {/* ---- Business (admin only) -------------------------------------- */}
        {who?.isAdmin ? (
          <View style={[s.fill, tab !== "admin" && s.hidden]} pointerEvents={tab === "admin" ? "auto" : "none"}>
            {top?.name === "inbox" || tab !== "admin" ? (
              <ClaimsInbox
                onOpenClaim={(claim) => push({ name: "approve", claim })}
                onCountChange={setWaiting}
              />
            ) : null}
            {top?.name === "approve" ? (
              <View style={s.fill}>
                <ApproveClaim
                  claim={top.claim}
                  onBack={pop}
                  onDone={() => resetTab("admin")}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <TabBar
        tabs={tabs}
        value={tab}
        onChange={(t) => { if (t === "charlie") setCharlieBorn(true); setTab(t); }}
        badges={{ admin: waiting }}
      />

      <AccountSheet
        visible={account}
        email={email}
        who={who}
        onClose={() => setAccount(false)}
        onSignOut={() => { setAccount(false); handleSignOut(); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg },
  hidden: { opacity: 0 },
  devStripe: { paddingHorizontal: S.screen, paddingBottom: 8 },
  segment: { paddingHorizontal: S.screen, paddingBottom: S.gap },
});
