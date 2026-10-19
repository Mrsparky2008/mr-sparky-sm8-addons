// AI Assist — the Mr Sparky app.
//
// One question per tab:
//   Jobs      what am I doing   — his jobs, today's diary, a job card
//   Available what is up        — nobody has taken it, first to tap takes it
//   Alerts    what wants me     — the Telegram questions, labelled Notifications
//   Money     what am I owed    — the subcontractor portal, natively
//   Team      what is the crew carrying — employees, in Money's slot
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
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, View } from "react-native";

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
import JobBreakdown from "./screens/pay/JobBreakdown";
import ClaimsList from "./screens/pay/ClaimsList";
import ClaimDetail from "./screens/pay/ClaimDetail";
import SubmitClaim from "./screens/pay/SubmitClaim";
import Available from "./screens/Available";
import Team from "./screens/Team";
import Notifications from "./screens/Notifications";
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
import { hasStoredSession, signOut } from "./lib/auth";
import * as portal from "./lib/portal";
import { usePush, disable as disablePush } from "./lib/push";

import { IS_DEV_APP } from "./lib/config";
import { C, S, oneLine, suburb } from "./lib/theme";

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

  /*
   * Which front door is showing, and `null` means it has not been decided yet.
   * That is a state rather than a tidy default: deciding needs a Keychain read,
   * the read is async, and any other starting value puts the wrong door on the
   * screen for a frame.
   *
   * A PHONE THAT HAS SIGNED IN BEFORE GOES STRAIGHT TO SignIn, which unlocks
   * itself on Face ID the moment it mounts. `"welcome"` was hard-coded here
   * while the two screens were being reviewed and never went back, and that is
   * the whole of what Steven has been reporting as the app logging him out.
   * IT NEVER DID: CloudTrail has every silent renewal succeeding and not one
   * password sign-in from his handset on 18 or 19 Oct, with no RevokeToken and
   * no GlobalSignOut in the account (network session, 19 Oct 2026). He was
   * being shown the front door, which looks identical from the outside.
   *
   * IT FAILS TOWARDS Welcome, and that is the harmless direction. A Keychain
   * that throws or answers empty shows the menu, which costs a returning man
   * one tap. The other way strands him on a sign-in screen that has no way
   * back - SignIn carries no Back and no "start an application", so Welcome is
   * the only route to Apply on the whole phone.
   */
  const [entry, setEntry] = useState(null);
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
  const [goingNow, setGoingNow] = useState(0);        // jobs nobody has taken yet
  const [toAnswer, setToAnswer] = useState(0);        // questions waiting on him
  const [account, setAccount] = useState(false);      // the who-am-I / sign-out sheet

  // Which door, decided once per launch. Everything after this already exists
  // and already runs: SignIn's own mount effect does the Face ID prompt and
  // the token refresh, so this only has to point him at it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let returning = false;
      try { returning = await hasStoredSession(); } catch { returning = false; }
      if (!cancelled) setEntry(returning ? "signin" : "welcome");
    })();
    return () => { cancelled = true; };
  }, []);

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

  /*
   * Tapping the tab you are already on goes back to the top of it. Only three
   * tabs HAVE a top: Available and Team are a single screen each with no stack,
   * so resetting them used to write `[undefined]` into state - harmless, since
   * neither pane reads it, but it is junk that would bite whoever next assumed
   * stacks[tab] meant something for every tab.
   */
  const resetTab = useCallback((which) => {
    if (!ROOTS[which]) return;
    setStacks((s) => ({ ...s, [which]: [ROOTS[which]] }));
  }, []);

  // A job anywhere in the app is the same shape: number, address, suburb.
  const asJob = (j) =>
    j && { job_number: j.job_number, address: j.address || "", suburb: suburb(j.address) };

  // AI Assist in the bar: opens Claude on the tech's own seat as the general
  // offsider - standards, regs, calcs - standing at ease until spoken to.
  // (The job card's own button carries the per-job quoting prompt.)
  /*
   * openAssist is GONE with the tab it served. Steven, 13 Oct 2026, circling
   * it: "this button can go." It opened a chat that then had to ask which job
   * you meant, and the blue button on the job card does the same thing knowing
   * the answer. Two doors to one room, one of them blindfolded.
   */

  // Deep link from the ServiceM8 job card: mrsparky-aiassist://job/167483.
  // The add-on is the doorway, this is the room — it opens the job card for
  // that job. It stops
  // short of dialling straight into a live mic session off a single tap.
  const pendingJob = useRef(null);

  /*
   * Open a job by number. Two things arrive this way - the ServiceM8 job card's
   * link, and a tapped push alert - and both can land before Face ID has
   * finished, so both wait on the same hook.
   */
  const openJob = useCallback((number) => {
    if (!number) return;
    // Arrived before sign-in finished — hold it and replay once we're in.
    if (!emailRef.current) { pendingJob.current = String(number); return; }
    setTab("work");
    setStacks((s) => ({
      ...s,
      work: [ROOTS.work, { name: "job", job: { job_number: String(number), address: "" } }],
    }));
  }, []);

  const openLink = useCallback((url) => {
    openJob(/(?:^|\/)job\/(\d+)/.exec(String(url || ""))?.[1]);
  }, [openJob]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) openLink(url); }).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => openLink(url));
    return () => sub.remove();
  }, [openLink]);

  /*
   * Notifications. Asks the first time somebody is signed in, not on the splash
   * screen - a permission box before you know what the app is gets refused, and
   * iOS only ever asks once.
   *
   * Tapping an alert opens the job, the same path the ServiceM8 button uses.
   */
  const alerts = usePush({ signedIn: !!email, onJob: openJob });

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

  /*
   * SIGN OUT, in the order that cannot strand him.
   *
   * Steven, 14 Oct 2026: he pressed Sign out, nothing happened, and he
   * force-closed the app and signed in again instead.
   *
   * The old order was the cause. `await disablePush(...)` came FIRST, "before
   * anything else", on the reasoning that a phone being handed back must stop
   * ringing - right about the goal, wrong about the order. It put a network
   * call in front of the only part that actually signs him out, inside a
   * function nothing awaited, with no try/catch anywhere. A portal that hung
   * or threw took the whole sign-out with it and said nothing, while the sheet
   * had already closed as though it had worked.
   *
   * So the SCREEN goes back to the front door first, with nothing awaited in
   * front of it, and nothing below can leave him looking at a signed-in app.
   *
   * CORRECTED 17 Oct 2026, and the correction is the whole point of the
   * ordering now. That rewrite went on to clear the CREDENTIALS before telling
   * the portal - which quietly made telling the portal impossible, because the
   * DELETE is authenticated and the credentials it needs had just been
   * deleted. The fix was right about the unhandled rejection and wrong about
   * the order, in the opposite direction to the bug it was fixing.
   *
   * The order that satisfies all three, and each step says why in place:
   *   1. the screen        - local, instant, nothing awaited above it
   *   2. the push DELETE   - needs the session, so it goes BEFORE the session
   *                          is destroyed, capped at five seconds
   *   3. the credentials   - local, cannot fail, and runs whatever step 2 did
   *
   * The rule that has not changed and must not: a portal that hangs or throws
   * can never leave him signed in. Step 2 is capped and its error swallowed
   * for exactly that reason.
   */
  async function handleSignOut() {
    // 1. The screen goes back to the front door immediately. No await above
    //    this line, ever.
    setStacks(ROOTS);
    setTab("work");
    setWho(null);
    setWaiting(0);
    setGoingNow(0);
    setToAnswer(0);
    setDemoSignedIn(false);
    setWhoPending(false);
    emailRef.current = null;
    setEmail(null);
    // Back to the menu rather than to the screen he just signed out of. A
    // sign-out is usually "I am finished with this phone", and Welcome is the
    // only way to Apply if the next person on it is somebody new.
    setEntry("welcome");

    /*
     * 2. Retire the push registration - and it has to be HERE, before the
     *    credentials go, which it was not until 17 Oct 2026.
     *
     *    THE BUG, found by the network session reading this chain and
     *    confirmed here: `signOut()` nulls the id token and deletes the stored
     *    refresh token (lib/auth.js), and `disablePush` is an authenticated
     *    call - `call()` does `await getIdToken()`, which then has nothing to
     *    refresh from and throws "no stored session". So the DELETE never left
     *    the phone, and the `.catch(() => {})` below swallowed the evidence.
     *    Step 2 was destroying what step 3 needed.
     *
     *    MEASURED, not reasoned: the one live PUSHDEVICE row still reads
     *    `retiredAt: null` after a sign-out and sign-in on 14 Oct. The note in
     *    CLAUDE.md section 29 - "no DELETE arrived while he was trying" - was
     *    this same symptom. The fix that day was right about the unhandled
     *    rejection and never touched the cause.
     *
     *    NOT FIXED AT THE PORTAL END, deliberately. It could accept a bare
     *    token with no session, and then anybody guessing a push token could
     *    retire anybody's handset. Weakening the authenticated side to work
     *    around an ordering mistake on this side is the wrong trade.
     *
     *    THE COST OF THE REORDER, stated rather than hidden: the credentials
     *    now live up to five seconds longer than they did. That is the price
     *    of the DELETE being possible at all, and it buys a real protection -
     *    a handset handed back must not keep ringing with the last man's jobs.
     *    Still never a reason to stay signed in, so the five-second cap stays
     *    and the error is still swallowed: the portal retires a device on a
     *    410 from Apple anyway, so the worst case is it learns later rather
     *    than never.
     */
    const token = alerts?.token?.current;
    if (token) {
      await Promise.race([
        disablePush(token).catch(() => {}),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    }

    // 3. The credentials. Local, and the one failure worth reporting.
    let cleared = true;
    try {
      const r = await signOut();
      cleared = r?.cleared !== false;
    } catch {
      cleared = false;
    }

    /*
     * Only now, and only if the keychain would not let go. Everything else has
     * already happened, so this is information rather than an apology: the
     * consequence is that the next launch may sign him back in, which matters
     * most in the exact case he is doing it for - handing the phone to somebody
     * else.
     */
    if (!cleared) {
      Alert.alert(
        "Signed out, but check this phone",
        "This phone would not let go of the saved sign-in, so opening the app "
        + "again may sign you straight back in. If you are handing it over, "
        + "delete the app.",
      );
    }
  }

  if (!email) {
    /*
     * A phone that has signed in before skips the front door entirely - SignIn
     * unlocks on Face ID, and a returning contractor should not have to pick
     * "sign in" off a menu every morning. Only a fresh phone sees Welcome.
     *
     * That is now what the code does. IT SAID SO FOR WEEKS WHILE DOING THE
     * OPPOSITE, because the `entry` state above was hard-coded to "welcome"
     * and carried its own comment saying so - two comments in one file
     * disagreeing, and whichever a session read, the other one was sitting
     * there to be taken for the mistake. Both are now written from the code.
     *
     * The hold below is the beat while the Keychain is read. It is the same
     * spinner as the one after sign-in on purpose: both are the app working
     * out which screen you get, and they should not look like two different
     * kinds of event.
     */
    if (!entry) {
      return (
        <SafeAreaView style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
          <StatusBar style="light" />
          <ActivityIndicator size="large" color={C.brand} />
        </SafeAreaView>
      );
    }
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
          : entry === "signin" ? <SignIn onSignedIn={handleSignedIn} onBack={() => setEntry("welcome")} />
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

  // The bar carries Jobs, Available and Money - plus Team for an employee and
  // Business for the admin. Talking to the assistant happens in Claude itself,
  // opened by the blue button on a job card, which carries the job with it.
  /*
   * What this person may see. The portal decides it and sends it on /api/me;
   * the phone renders what it is told it may have.
   *
   * Steven, 1 October 2026, on the employees he is adding for Jason: "will
   * they have access to the app? Probably. Then we might have to hide the
   * business tab from them and just give them the day, the AI assist and the
   * work tab." The money on the jobs they finish is their employer's, not
   * theirs - a Money tab would show them somebody else's figures or an empty
   * screen, and both are worse than not having it.
   *
   * Defaults to the old four, so a portal that has not been updated yet, or a
   * reply that arrives without capabilities, behaves exactly as before.
   */
  const can = who?.can || {};
  const tabs = [
    "work",
    /*
     * AVAILABLE is listed the same way as the others so the portal can take it
     * away without an App Store trip.
     *
     * It did not exist when `capabilities()` was written, so that function has
     * no opinion about it and an employee is shown it today. Whether that is
     * right is Steven's call and not settled: an employee cannot accept a job
     * at all until `employeesCanAccept` is turned on, and a tab full of work he
     * is refused when he taps it is worse than no tab. But the day it IS turned
     * on, Available is the whole point of giving him the app.
     *
     * So it defaults to shown - no behaviour change for anybody today - and
     * obeys `available: false` the moment the portal starts sending it. That
     * turns a decision about people into one field on their side rather than a
     * release on mine.
     */
    ...(can.available === false ? [] : ["available"]),
    /*
     * MY DAY WAS HERE until 17 Oct 2026. Steven: "Remove My Day because it is
     * double." It was a bottom-bar button that jumped to the Today segment
     * already inside Jobs, so deleting it cost a shortcut and no feature.
     *
     * NOTIFICATIONS takes the slot - the Telegram questions, in the app.
     * Spec: docs/APP-TABS-AND-NOTIFICATIONS.md in mr-sparky-network.
     *
     * IT IS HERE BEFORE ITS PORTAL ROUTES ARE, and that was Steven's call on
     * 17 Oct 2026 after finding it missing: "how come you're not [showing it]
     * then... I didn't know I have to wait." He was right. Only the CONTENT
     * waits on `GET /api/notifications` - the tab, the screen and the
     * answering do not, and a 404 on that route is drawn as "not switched on
     * yet" rather than as a fault.
     *
     * Nothing is built against an invented row shape either: the portal sends
     * the BUTTONS along with the rows, so a new kind of question is a change at
     * their end and none at all at this one.
     *
     * Portal-decided like the rest, so it can be taken away without a release.
     */
    ...(can.notifications === false ? [] : ["alerts"]),
    /*
     * TEAM sits where Money sits for a subbie, so the bar stays the same width
     * for everybody. Steven, 14 Oct 2026: "the available, the jobs, the day,
     * and the team."
     *
     * Portal-decided, like the rest. Off unless it says on, because a man with
     * no crew opening a Team tab learns nothing and wonders what he is missing.
     */
    ...(can.team ? ["team"] : []),
    ...(can.money === false ? [] : ["pay"]),
    ...(who?.isAdmin && can.admin !== false ? ["admin"] : []),
  ];

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

        {/* ---- Available --------------------------------------------------
            Jobs nobody has taken. Its own pane rather than a stack, because
            there is one screen and tapping a row opens the job in WORK -
            where every other job on the phone already lives. */}
        <View style={[s.fill, tab !== "available" && s.hidden]} pointerEvents={tab === "available" ? "auto" : "none"}>
          <Available
            visible={tab === "available"}
            onCount={setGoingNow}
            /*
             * WHETHER HE MAY TAKE ONE, decided by the portal and nothing else.
             * Steven, 14 Oct 2026: "a tick on the employee side if he's allowed
             * to accept jobs or not."
             *
             * Defaults to ALLOWED, so every subbie on the app today is
             * unaffected and a portal that has not grown the field yet behaves
             * exactly as before. Only an explicit false greys the buttons.
             */
            mayAccept={can.acceptJobs !== false}
            onOpenJob={(j) => { setTab("work"); openJob(j.job_number); }}
          />
        </View>

        {/* ---- Notifications ----------------------------------------------
            The Telegram questions, in the app. One screen, no stack - every
            row is answered where it sits, because a question that takes you
            to another screen to answer it is a question that waits. Mounted
            from sign-in like Available, so its count is right before the tab
            has ever been opened. */}
        {can.notifications === false ? null : (
          <View style={[s.fill, tab !== "alerts" && s.hidden]} pointerEvents={tab === "alerts" ? "auto" : "none"}>
            <Notifications visible={tab === "alerts"} onCount={setToAnswer} />
          </View>
        )}

        {/* ---- Team -------------------------------------------------------
            What the rest of the crew is carrying. Same shape as Available:
            one screen, no stack, and tapping a row opens the job in WORK
            where every other job on this phone already lives. Mounted only
            when the portal gave him the tab, so a man with no crew is not
            quietly running a screen he cannot see. */}
        {can.team ? (
          <View style={[s.fill, tab !== "team" && s.hidden]} pointerEvents={tab === "team" ? "auto" : "none"}>
            <Team onOpenJob={(j) => { setTab("work"); openJob(j.job_number); }} />
          </View>
        ) : null}

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
            <View style={s.fill}>
              <Statement
                data={top.data} onBack={pop}
                onOpenJob={(job, meta) => push({ name: "jobmoney", job, jobMeta: meta })}
              />
            </View>
          ) : null}
          {/* One job and how its number was arrived at. Reachable from the
              claim screen and the statement, because the moment somebody
              wants to check a figure is the moment they are about to sign
              for it (Steven, 30 Sep 2026). */}
          {top?.name === "jobmoney" ? (
            <View style={s.fill}>
              <JobBreakdown job={top.job} meta={top.jobMeta} onBack={pop} />
            </View>
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
                // The address beside every number. Nobody recognises #167705;
                // everybody recognises the street they were standing in.
                jobAddresses={Object.fromEntries(
                  Object.entries(top.data?.meta || {}).map(([n, m]) => [n, m?.suburb || ""]),
                )}
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
                onOpenJob={(job, meta) => push({ name: "jobmoney", job, jobMeta: meta })}
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
          /*
           * Every tab in the bar is now a PLACE. The two that were actions -
           * AI Assist, which opened Claude, and My day, which jumped to the
           * Today segment inside Jobs - are both gone, so there is no longer a
           * button here that does something without becoming "current".
           */
          /*
           * Tapping the tab you are already on takes you back to the top of
           * it. Steven, 13 Oct 2026: "I feel like the thumb works better from
           * the bottom" - four screens deep in Money, the way out was the
           * chevron in the far top left, which is the hardest corner of a
           * phone to reach one-handed. It is also what iOS does everywhere
           * else, so it is what a thumb already expects.
           */
          if (t === tab) { resetTab(t); return; }
          setTab(t);
        }}
        /* Notifications gets its OWN count, never folded into goingNow: two
           different things are outstanding and one number for both would be
           meaningless. One badge colour on the bar, not two - the bar has one
           badge style and two kinds of urgent read as two systems. */
        badges={{ admin: waiting, available: goingNow, alerts: toAnswer }}
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
