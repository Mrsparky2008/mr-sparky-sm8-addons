// AI Assist — the Mr Sparky app.
//
// Four questions, one tab each:
//   Work      what am I doing   — jobs, today's diary, a job card
//   AI Assist ask about it      — opens Claude with a primer, outside the app
//   My day    what's booked     — today's bookings
//   Money     what am I owed    — the subcontractor portal, natively
//   Business  how's it going    — admin only: the claims waiting on a decision
//
// Role-shaped: a subcontractor never learns the last tab exists. The portal
// already knows who is an admin, so the app asks it rather than deciding.
//
// Navigation is a stack per tab, held in state. React Navigation would bring a
// native dependency and a lot of ceremony for a shape this small.
//
// **Charlie and Vapi were removed on 25 Sep 2026.** The in-app voice assistant
// ran on Vapi over Daily's WebRTC, and that native module will not initialise
// under React Native's New Architecture on Android — the app installed, opened
// and died before rendering a thing. Charlie had already come off the tab bar
// on 30 Aug; keeping a retired feature's native dependency was costing us the
// whole Android platform. Gone with it: the microphone and speech-recognition
// permissions, which nothing else was using.
//
// Talking to the assistant now happens in Claude itself, opened by a link.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";

import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import ErrorBoundary from "./components/ErrorBoundary";
import TabBar from "./components/TabBar";
import AccountSheet from "./components/AccountSheet";
import { Banner, Segment } from "./components/ui";
import SignIn from "./screens/SignIn";
import Welcome from "./screens/Welcome";
import Apply from "./screens/Apply";
import Earnings from "./screens/Earnings";
import Jobs from "./screens/Jobs";
import AllJobs from "./screens/AllJobs";
import JobCard from "./screens/JobCard";
import JobDiary from "./screens/JobDiary";
import Diary from "./screens/Diary";
import MoneyHub from "./screens/pay/MoneyHub";
import RaiseInvoice from "./screens/pay/RaiseInvoice";
import Owed from "./screens/pay/Owed";
import ClaimsList from "./screens/pay/ClaimsList";
import ClaimDetail from "./screens/pay/ClaimDetail";
import SubmitClaim from "./screens/pay/SubmitClaim";
import AddReceipt from "./screens/pay/AddReceipt";
import OwnMaterial from "./screens/pay/OwnMaterial";
import JobMaterial from "./screens/JobMaterial";
import RctiView from "./screens/pay/RctiView";
import Statement from "./screens/pay/Statement";
import Retention from "./screens/pay/Retention";
import MyRate from "./screens/pay/MyRate";
import MyDetails from "./screens/pay/MyDetails";
import Documents from "./screens/pay/Documents";
import BusinessHub from "./screens/admin/BusinessHub";
import BucketList from "./screens/admin/BucketList";
import CrewList from "./screens/admin/CrewList";
import CrewMember from "./screens/admin/CrewMember";
import ApproveClaim from "./screens/admin/ApproveClaim";
import { signOut } from "./lib/auth";
import * as portal from "./lib/portal";

import { IS_DEV_APP } from "./lib/config";
import { C, S, suburb } from "./lib/theme";

const ROOTS = { work: { name: "work" }, pay: { name: "money" }, admin: { name: "bizhub" } };

export default function App() {
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}

function Shell() {
  const [email, setEmail] = useState(null);           // null = not signed in

  // Which front door is showing. Always starts on Welcome for now: Steven is
  // reviewing both screens and wants to pick each time. The Face ID
  // short-circuit for returning phones goes back in once the screens are
  // settled - SignIn itself still unlocks on Face ID the moment it opens.
  const [entry, setEntry] = useState("welcome");
  // The verified mobile, which is how the demo asks the portal for its view.
  const [demoMobile, setDemoMobile] = useState(null);
  const emailRef = useRef(null);                      // readable from listeners
  const [who, setWho] = useState(null);               // the portal's view of you
  // A signed-in DEMO applicant: has a login, is not a contractor. They get the
  // earnings screen, never the tabs. whoPending covers the beat while /api/me
  // decides which they are - showing the tabs during that beat would flash an
  // empty app at exactly the person (an App Store reviewer) it must not.
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  const [whoPending, setWhoPending] = useState(false);
  const [tab, setTab] = useState("work");
  const [stacks, setStacks] = useState(ROOTS);
  const [workView, setWorkView] = useState("jobs");   // jobs | today
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

  // Swap the screen you are on for a sibling - swiping from one job to the
  // next must not stack up twenty screens for Back to unwind.
  const replaceTop = useCallback((screen) => {
    setStacks((s) => {
      const cur = Array.isArray(s[tab]) ? s[tab] : [s[tab]];
      return { ...s, [tab]: [...cur.slice(0, -1), screen] };
    });
  }, [tab]);

  const resetTab = useCallback((which) => {
    setStacks((s) => ({ ...s, [which]: [ROOTS[which]] }));
  }, []);

  // A job anywhere in the app is the same shape: number, address, suburb.
  const asJob = (j) =>
    j && { job_number: j.job_number, address: j.address || "", suburb: suburb(j.address) };

  // AI Assist in the bar: opens Claude on the tech's own seat as the general
  // offsider - standards, regs, calcs - standing at ease until spoken to.
  // (The job card's own button carries the per-job quoting prompt.)
  const openAssist = useCallback(() => {
    const primer = [
      "Mr Sparky offsider.",
      "You are the on-the-tools offsider for a licensed electrician on the Mr Sparky "
        + "Network in Sydney. Help with whatever the day throws up: AS/NZS 3000 and other "
        + "standards, NSW regs and compliance, cable sizing and calcs, product and fault "
        + "questions, safe work method thinking. Short, practical, tradie-plain. If it is "
        + "about a specific job, ask for the job number and use the Mr Sparky tools.",
      'Do NOTHING yet - reply with exactly one line, "Ready when you are.", and wait for me to speak.',
    ].join("\n\n");
    Linking.openURL("https://claude.ai/new?q=" + encodeURIComponent(primer));
  }, []);

  // Deep link from the ServiceM8 job card: mrsparky-aiassist://job/167483.
  // The add-on is the doorway, this is the room — it opens the job card for
  // that job. It stops
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

    // Who the portal thinks you are decides everything after this point: a
    // contractor gets the tabs, a demo applicant gets the earnings screen. A
    // failure that is neither is swallowed as before — the app's own screens
    // work without the portal, and the Pay tab explains itself.
    setWhoPending(true);
    portal.me()
      .then((me) => { setWho(me); setWhoPending(false); })
      .catch((err) => {
        if (err?.demo && err?.mobile) {
          setDemoMobile(err.mobile);
          setDemoSignedIn(true);
        } else {
          setWho(null);
        }
        setWhoPending(false);
      });

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
    await signOut();
    setStacks(ROOTS);
    setTab("work");
    setWho(null);
    setWaiting(0);
    setDemoSignedIn(false);
    setWhoPending(false);
    emailRef.current = null;
    setEmail(null);
  }

  if (!email) {
    // A phone that has signed in before skips the front door entirely — SignIn
    // unlocks on Face ID, and a returning contractor should not have to pick
    // "sign in" off a menu every morning. Only a fresh phone sees Welcome.
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        {entry === "demo" ? <Earnings mobile={demoMobile} onBack={() => setEntry("welcome")} />
          : entry === "apply" ? (
            <Apply
              onBack={() => setEntry("welcome")}
              onDone={(m) => { setDemoMobile(m); setEntry("demo"); }}
            />
          )
          : entry === "signin" ? <SignIn onSignedIn={handleSignedIn} />
          : <Welcome
              onSignIn={() => setEntry("signin")}
              onApply={() => setEntry("apply")}
            />}
      </SafeAreaView>
    );
  }

  // The beat between sign-in and /api/me answering. Without this hold, the
  // empty tabs flash up first for everyone, and stay up for a demo user.
  if (whoPending) {
    return (
      <SafeAreaView style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={C.brand} />
      </SafeAreaView>
    );
  }

  // A signed-in demo applicant. The earnings screen is their whole app until
  // Steven approves them; sign out is the honest way back, because there is
  // nowhere else for them to go.
  //
  // The account sheet rides along because this branch has no tab bar to hang it
  // off, and without it a demo applicant could neither sign out from here nor
  // delete their account — the flow Apple asks to see (Guideline 5.1.1(v)).
  // Deleting takes the login with it, so afterwards there is nothing to sign
  // out OF: handleSignOut is still right, it just tidies up locally.
  if (demoSignedIn) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        {/* No onBack here on purpose. A back arrow on the only screen you
            have has nowhere honest to go, and wiring it to sign-out is what
            Apple tripped over: the "what's next?" button ran the same handler
            and threw the reviewer out to the login screen. Signing out and
            deleting both live in the account sheet, behind the email. */}
        <Earnings
          mobile={demoMobile}
          meta={email}
          onMeta={() => setAccount(true)}
        />
        <AccountSheet
          visible={account}
          email={email}
          who={null}
          demo
          onClose={() => setAccount(false)}
          onSignOut={() => { setAccount(false); handleSignOut(); }}
          onDeleted={() => { setAccount(false); handleSignOut(); }}
        />
      </SafeAreaView>
    );
  }

  // AI Assist (Claude via the connector) does
  // the talking. The bar carries the everyday four: Work, AI Assist, My day,
  // Money - plus Business for the admin.
  const tabs = ["work", "assist", "day", "pay", ...(who?.isAdmin ? ["admin"] : [])];

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
          {/* Kept MOUNTED behind pushed screens, only hidden - so coming back
              from a job lands on the same list, scrolled where you left it,
              with the same category still open (Steven, 30 Aug 2026: "when I
              click back it returns to home"). Unmounting threw all of that
              away every time. */}
          <View
            style={[{ flex: 1 }, top?.name !== "work" && s.hidden]}
            pointerEvents={top?.name === "work" ? "auto" : "none"}
          >
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
                onOpenJob={(j, siblings) => push({
                  name: "job", job: asJob(j), siblings: (siblings || []).map(asJob).filter(Boolean),
                })}
                onDiary={() => setWorkView("today")}
                onAllJobs={() => push({ name: "alljobs" })}
                onSignOut={handleSignOut}
                onAccount={() => setAccount(true)}
              />
            ) : (
              <Diary
                onOpenJob={(j) => push({ name: "job", job: asJob(j) })}
              />
            )}
          </View>

          {top?.name === "alljobs" ? (
            <View style={s.fill}>
              <AllJobs onOpenJob={(j) => push({ name: "job", job: asJob(j) })} onBack={pop} />
            </View>
          ) : null}

          {top?.name === "job" ? (
            <View style={s.fill}>
              <JobCard
                jobNumber={top.job.job_number}
                siblings={top.siblings}
                onSibling={(j) => replaceTop({ name: "job", job: j, siblings: top.siblings })}
                onBack={pop}
                onJobDiary={(payload) => push({ name: "jobdiary", job: top.job, ...payload })}
                onAddReceipt={(jobNumber) => push({ name: "jobreceipt", jobNumber })}
                onMaterials={(jobNumber) => push({ name: "jobmaterial", jobNumber })}
              />
            </View>
          ) : null}

          {top?.name === "jobdiary" ? (
            <View style={s.fill}>
              <JobDiary
                jobNumber={top.job.job_number}
                bookings={top.bookings}
                notes={top.notes}
                noteFeed={top.noteFeed}
                attachments={top.attachments}
                timeOnSite={top.timeOnSite}
                onAddReceipt={() => push({ name: "jobreceipt", jobNumber: top.job.job_number })}
                onBack={pop}
              />
            </View>
          ) : null}

          {top?.name === "jobreceipt" ? (
            <View style={s.fill}>
              <AddReceipt
                jobNumbers={[top.jobNumber]} jobNumber={top.jobNumber}
                onBack={pop} onSaved={pop}
                onOwnMaterial={(jobNumber) => push({ name: "ownmaterial", jobNumber })}
                suppliers={who?.suppliers || []}
              />
            </View>
          ) : null}
          {top?.name === "ownmaterial" ? (
            <View style={s.fill}>
              <OwnMaterial jobNumber={top.jobNumber} onBack={pop} />
            </View>
          ) : null}
          {top?.name === "jobmaterial" ? (
            <View style={s.fill}>
              <JobMaterial jobNumber={top.jobNumber} onBack={pop} />
            </View>
          ) : null}
        </View>

        {/* ---- Money ------------------------------------------------------
            The hub loads the statement once; every bucket screen renders a
            slice of that same payload, pushed through the route. */}
        <View style={[s.fill, tab !== "pay" && s.hidden]} pointerEvents={tab === "pay" ? "auto" : "none"}>
          {top?.name === "money" || tab !== "pay" ? (
            <MoneyHub
              onOpen={(name, data) => push({ name, data })}
              onMakeClaim={(data) => push({ name: "submit", data })}
              onSignOut={handleSignOut}
              onAccount={() => setAccount(true)}
            />
          ) : null}
          {top?.name === "claims" ? (
            <View style={s.fill}>
              <ClaimsList
                claims={top.data?.claims || []}
                onOpenClaim={(claim) => push({ name: "claim", claim })}
                onBack={pop}
              />
            </View>
          ) : null}
          {top?.name === "statement" ? (
            <View style={s.fill}><Statement data={top.data} onBack={pop} /></View>
          ) : null}
          {top?.name === "raise" ? (
            <View style={s.fill}><RaiseInvoice onBack={pop} /></View>
          ) : null}
          {top?.name === "owed" ? (
            <View style={s.fill}><Owed data={top.data} onBack={pop} /></View>
          ) : null}
          {top?.name === "retention" ? (
            <View style={s.fill}><Retention data={top.data} onBack={pop} /></View>
          ) : null}
          {top?.name === "rate" ? (
            <View style={s.fill}><MyRate data={top.data} onBack={pop} /></View>
          ) : null}
          {top?.name === "details" ? (
            <View style={s.fill}><MyDetails data={top.data} onBack={pop} /></View>
          ) : null}
          {top?.name === "docs" ? (
            <View style={s.fill}><Documents data={top.data} onBack={pop} onSaved={() => resetTab("pay")} /></View>
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
                onOwnMaterial={(jobNumber) => push({ name: "ownmaterial", jobNumber })}
                suppliers={who?.suppliers || []}
                // Their own filings, so a supplier they have used before comes
                // back with the ABN they filed it under.
                pastReceipts={Object.values(top.data?.receipts || {}).flatMap((r) => r?.rows || [])}
              />
            </View>
          ) : null}
          {top?.name === "ownmaterial" ? (
            <View style={s.fill}>
              <OwnMaterial jobNumber={top.jobNumber} onBack={pop} />
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

        {/* ---- Business (admin only) --------------------------------------
            Hub → buckets. Actionable buckets open the decision screen;
            record buckets open the frozen claim read-only. */}
        {who?.isAdmin ? (
          <View style={[s.fill, tab !== "admin" && s.hidden]} pointerEvents={tab === "admin" ? "auto" : "none"}>
            {top?.name === "bizhub" || tab !== "admin" ? (
              <BusinessHub
                onOpen={(name, params) => push({ name, ...params })}
                onAccount={() => setAccount(true)}
                onCountChange={setWaiting}
              />
            ) : null}
            {top?.name === "bucket" ? (
              <View style={s.fill}>
                <BucketList
                  title={top.title}
                  claims={top.claims}
                  act={top.act}
                  onOpenClaim={(claim, act) => push(act ? { name: "approve", claim } : { name: "bizclaim", claim })}
                  onBack={pop}
                />
              </View>
            ) : null}
            {top?.name === "crewlist" ? (
              <View style={s.fill}>
                <CrewList
                  people={top.people}
                  onOpenPerson={(person) => push({ name: "crew", person })}
                  onBack={pop}
                />
              </View>
            ) : null}
            {top?.name === "crew" ? (
              <View style={s.fill}>
                <CrewMember
                  person={top.person}
                  onOpenClaim={(claim) => push({ name: "bizclaim", claim })}
                  onBack={pop}
                />
              </View>
            ) : null}
            {top?.name === "bizclaim" ? (
              <View style={s.fill}>
                <ClaimDetail
                  claim={top.claim}
                  onBack={pop}
                  onViewRcti={(claim) => push({ name: "bizrcti", claim })}
                />
              </View>
            ) : null}
            {top?.name === "bizrcti" ? (
              <View style={s.fill}>
                <RctiView claim={top.claim} name={top.claim?.contractorName} onBack={pop} />
              </View>
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
        onChange={(t) => {
          // Two of these are ACTIONS, not places: AI Assist opens Claude and
          // My day jumps to the Work tab's diary. Neither becomes "current".
          if (t === "assist") { openAssist(); return; }
          if (t === "day") { setTab("work"); setWorkView("today"); return; }
          setTab(t);
        }}
        badges={{ admin: waiting }}
      />

      <AccountSheet
        visible={account}
        email={email}
        who={who}
        onClose={() => setAccount(false)}
        onSignOut={() => { setAccount(false); handleSignOut(); }}
        onDeleted={() => { setAccount(false); handleSignOut(); }}
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
