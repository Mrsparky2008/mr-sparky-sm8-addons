// AI Assist — native voice app (Phase 2). Same brain/backend as the PWA.
// Two speech paths, chosen automatically:
//   - Dev build: expo-speech-recognition — mic opens once, stays open,
//     continuous en-AU recognition, true barge-in.
//   - Expo Go:   native mic RECORDING with silence auto-stop (metering VAD)
//     -> backend /stt (Amazon Transcribe) -> same conversation loop.
import { useEffect, useRef, useState } from "react";
import {
  Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";
import {
  AudioQuality, IOSOutputFormat, requestRecordingPermissionsAsync,
  useAudioRecorder, useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { chatTurn, sttTranscribe } from "./lib/api";
import * as AQ from "./lib/audioQueue";
import { nativeSpeechAvailable, SpeechModule } from "./lib/nativeSpeech";
import { loadSettings, saveSettings } from "./lib/settings";
import { VERSION, VOICE_ENGINE } from "./lib/config";
import * as VV from "./lib/vapiVoice";

// Vapi mode: the whole audio layer (mic, echo cancellation, turn-taking,
// barge-in, voice) is WebRTC's job, and the brain runs server-side through the
// assistant's custom-LLM bridge. The local path below stays as a fallback.
const VAPI_MODE = VOICE_ENGINE === "vapi";

// Expo Go path records 16k mono WAV (linear PCM) — exactly what /stt expects.
// (Android's MediaRecorder can't write WAV; iPhone is the target device.)
const WAV_RECORDING = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true,
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    numberOfChannels: 1,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: { extension: ".m4a", outputFormat: "mpeg4", audioEncoder: "aac" },
};

// VAD tuning (Expo Go path). Metering is dBFS: speech ~ -30..-10, quiet ~ -50.
const SPEECH_DB = -38;      // above this = someone is talking
const SILENCE_MS = 900;     // this much quiet after speech = utterance over
const NO_SPEECH_MS = 9000;  // heard nothing at all -> recycle the round
const MAX_UTTER_MS = 30000; // hard cap per utterance
const MAX_QUIET_ROUNDS = 8; // ~72s of silence -> stop hands-free relistening

const GREETING = "G'day. Which job are we working on? Give me a job number and we'll get into it.";

let msgId = 0;

export default function App() {
  useKeepAwake();

  const [log, setLog] = useState([{ id: msgId++, cls: "ai", text: GREETING }]);
  const [streamAi, setStreamAi] = useState("");
  const [liveText, setLiveText] = useState("");
  const [typed, setTyped] = useState("");
  const [phase, setPhaseState] = useState("idle"); // idle listening transcribing thinking speaking
  const [pin, setPin] = useState(null);            // null = loading, "" = locked
  const [pinEntry, setPinEntry] = useState("");
  const [handsFree, setHandsFree] = useState(true);

  const phaseRef = useRef("idle");
  const pinRef = useRef("");
  const handsFreeRef = useRef(true);
  const busyRef = useRef(false);
  const chatRef = useRef([]);
  const vadRef = useRef(null);
  const sttRetriesRef = useRef(0);
  const quietRoundsRef = useRef(0);
  const lastResultRef = useRef(null); // native path: { text, at }
  const lastSentRef = useRef({ text: "", at: 0 });
  // Echo guard: without AEC the mic hears the app's own voice. Everything the
  // recogniser reports while we're speaking (plus a short tail) is discarded.
  const deafUntilRef = useRef(0);
  const recActiveRef = useRef(false); // is the native recognition session live
  const lastReplyRef = useRef("");    // reply being spoken right now (echo filter)
  const prevReplyRef = useRef("");    // the one before it — tails can still be in the air
  const speakStartRef = useRef(0);    // when this reply started playing
  const listenThroughRef = useRef(false); // recognising WHILE the assistant talks (barge-in)
  const echoPrefixRef = useRef("");   // transcript so far that was pure echo — stripped off
  const turnIdRef = useRef(0);        // stale replies from an interrupted turn are dropped

  const nativeWantRef = useRef(false);
  const scrollRef = useRef(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const recorder = useAudioRecorder(WAV_RECORDING);
  const recState = useAudioRecorderState(recorder, 150);

  const setPhase = (p) => { phaseRef.current = p; setPhaseState(p); };
  const addMsg = (cls, text) => setLog((l) => [...l, { id: msgId++, cls, text }]);
  const sysMsg = (text) => addMsg("sys", text);

  // ---------- init ----------
  useEffect(() => {
    loadSettings().then((s) => {
      pinRef.current = s.pin || "";
      setPin(s.pin || "");
    });
    if (!VAPI_MODE) {
      AQ.playbackMode();
      AQ.setOnDrain(() => { deafUntilRef.current = Date.now() + 700; if (!busyRef.current) afterTurn(); });
    }
    return () => { if (VAPI_MODE) VV.stop(); };
  }, []);

  // ---------- Vapi session ----------
  const vapiLiveRef = useRef(false);
  const partialRef = useRef({ user: "", ai: "" });

  function onVapiEvent(kind, payload) {
    if (kind === "status") {
      if (payload === "connecting") setPhase("thinking");
      if (payload === "live") { vapiLiveRef.current = true; setPhase("listening"); }
      if (payload === "ended") { vapiLiveRef.current = false; setPhase("idle"); setLiveText(""); setStreamAi(""); }
      return;
    }
    if (kind === "speaking") {
      setPhase(payload.on ? "speaking" : "listening");
      return;
    }
    if (kind === "draft") {
      setLog((l) => [...l, { id: msgId++, cls: "draft", lines: payload }]);
      return;
    }
    if (kind === "speech") {
      const { who, text, final } = payload;
      if (who === "user") {
        if (final) { if (text.trim()) addMsg("me", text.trim()); setLiveText(""); }
        else setLiveText(text);
      } else {
        if (final) { if (text.trim()) addMsg("ai", text.trim()); setStreamAi(""); }
        else setStreamAi(text);
      }
      return;
    }
    if (kind === "error") sysMsg("Voice error — " + payload);
  }

  async function vapiToggle() {
    if (vapiLiveRef.current) { await VV.stop(); return; }
    try {
      await VV.start({ onEvent: onVapiEvent });
    } catch (e) {
      sysMsg("Couldn't start the voice session — " + (e?.message || e));
      setPhase("idle");
    }
  }

  // ---------- listening-state pulse ----------
  useEffect(() => {
    if (phase === "listening") {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]));
      loop.start();
      return () => { loop.stop(); pulse.setValue(1); };
    }
  }, [phase]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [log, streamAi, liveText]);

  // ---------- shared turn flow ----------
  function afterTurn() {
    if (busyRef.current) return;
    if (handsFreeRef.current && quietRoundsRef.current < MAX_QUIET_ROUNDS) {
      setTimeout(() => { if (!busyRef.current && phaseRef.current !== "listening") startListening(); }, 150);
    } else {
      setPhase("idle");
    }
  }

  async function send(text) {
    if (!text || busyRef.current) return;
    busyRef.current = true;
    // Kill recognition for the whole speaking turn: the session transcript is
    // CUMULATIVE, so anything overheard (echo) gets glued onto the user's next
    // utterance. Stopping now is race-safe — busy=true blocks the auto-restart,
    // and startListening opens a fresh session afterwards.
    if (nativeSpeechAvailable) {
      recActiveRef.current = false;
      listenThroughRef.current = false;
      echoPrefixRef.current = "";
      try { SpeechModule.stop(); } catch {}
      lastResultRef.current = null;
      setLiveText("");
    }
    const myTurn = ++turnIdRef.current;
    prevReplyRef.current = lastReplyRef.current; // its tail may still be echoing
    quietRoundsRef.current = 0;
    lastSentRef.current = { text, at: Date.now() };
    addMsg("me", text);
    chatRef.current = [...chatRef.current, { role: "user", text }];
    setLiveText("");
    setPhase("thinking");
    AQ.resetQueue();
    AQ.setExpectMore(true); // reply audio is still streaming in
    if (!nativeSpeechAvailable) await AQ.playbackMode();
    let got = "";
    try {
      const { reply } = await chatTurn({
        messages: chatRef.current,
        pin: pinRef.current,
        onDelta: (x) => {
          got += x;
          setStreamAi(got);
          // Echo reference must track the reply being spoken RIGHT NOW — using
          // only the previous reply made the assistant interrupt itself.
          lastReplyRef.current = got;
          if (phaseRef.current === "thinking") setPhase("speaking");
        },
        onAudio: (seq, b64) => {
          AQ.enqueue(seq, b64);
          // First chunk of the reply: reopen the mic so the user can cut in.
          if (!listenThroughRef.current && myTurn === turnIdRef.current) {
            speakStartRef.current = Date.now();
            startListenThrough();
          }
        },
      });
      if (myTurn !== turnIdRef.current) return; // user barged in — this turn is stale
      const final = (reply || got).trim();
      if (final) {
        chatRef.current = [...chatRef.current, { role: "assistant", text: final }];
        lastReplyRef.current = final; // echo filter reference (full reply)
      }
      setStreamAi("");
      if (final) addMsg("ai", final);
      AQ.setExpectMore(false); // stream closed; queue may still have chunks
    } catch (e) {
      if (myTurn !== turnIdRef.current) return; // stale turn, user already moved on
      AQ.setExpectMore(false);
      setStreamAi("");
      busyRef.current = false;
      chatRef.current = chatRef.current.slice(0, -1);
      if (e.status === 401) return lock();
      sysMsg("Network error — try again.");
      setPhase("idle");
      return;
    }
    busyRef.current = false;
    if (!AQ.isDraining()) afterTurn();
    // else: the drain callback picks it up when the voice finishes.
  }

  function lock() {
    AQ.stopAudio();
    busyRef.current = false;
    pinRef.current = "";
    saveSettings({ pin: "" });
    setPin("");
    setPhase("idle");
  }

  // ---------- Expo Go path: record -> VAD stop -> /stt ----------
  async function startListening() {
    if (busyRef.current || phaseRef.current === "listening" || !pinRef.current) return;
    if (nativeSpeechAvailable) {
      // Fresh round: clear echo buffers WITHOUT restarting the session —
      // stop+start races itself and kills recognition (v0.3 lesson).
      lastResultRef.current = null;
      setLiveText("");
      listenThroughRef.current = false; // the reply is over; this is the user's turn
      deafUntilRef.current = Math.max(deafUntilRef.current, Date.now() + 250);
      if (!recActiveRef.current) { echoPrefixRef.current = ""; return nativeStart(); }
      setPhase("listening");
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { sysMsg("Microphone permission needed — allow it in iPhone Settings."); return; }
    AQ.stopAudio();
    await AQ.recordMode();
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      sysMsg("Mic failed to start — " + (e.message || e));
      setPhase("idle");
      return;
    }
    vadRef.current = { heard: false, lastLoud: 0, startAt: Date.now() };
    setPhase("listening");
  }

  useEffect(() => {
    if (nativeSpeechAvailable || phaseRef.current !== "listening") return;
    const v = vadRef.current;
    if (!v) return;
    const now = Date.now();
    const m = recState && typeof recState.metering === "number" ? recState.metering : null;
    if (m !== null && m > SPEECH_DB) { v.heard = true; v.lastLoud = now; }
    if (v.heard && now - v.lastLoud > SILENCE_MS) return void finishListening();
    if (!v.heard && now - v.startAt > NO_SPEECH_MS) return void recycleQuietRound();
    if (now - v.startAt > MAX_UTTER_MS) return void finishListening();
  }, [recState]);

  async function stopRecorder() {
    try { await recorder.stop(); } catch {}
    AQ.playbackMode(); // not awaited — settles in ms, well before any audio plays
  }

  // Nothing said all round: keep hands-free alive quietly (no /stt call),
  // give up after MAX_QUIET_ROUNDS so the mic doesn't run forever.
  async function recycleQuietRound() {
    if (phaseRef.current !== "listening") return;
    setPhase("transcribing"); // blocks re-entry while we cycle
    vadRef.current = null;
    await stopRecorder();
    bumpQuietRound();
  }

  function bumpQuietRound() {
    quietRoundsRef.current++;
    if (handsFreeRef.current && quietRoundsRef.current < MAX_QUIET_ROUNDS) startListening();
    else { quietRoundsRef.current = 0; setPhase("idle"); }
  }

  async function finishListening() {
    if (phaseRef.current !== "listening") return;
    const v = vadRef.current || {};
    vadRef.current = null;
    setPhase("transcribing");
    await stopRecorder();
    const uri = recorder.uri;
    if (!uri || !v.heard) return bumpQuietRound();
    let text = "";
    try {
      const wavB64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      text = await sttTranscribe({ wavB64, pin: pinRef.current });
    } catch (e) {
      if (e.status === 401) return lock();
      sysMsg("Couldn't transcribe that — " + (e.message || "network error"));
      setPhase("idle");
      return;
    }
    if (!text.trim()) {
      // Heard sound but no words (bump, cough). A couple of quick retries.
      if (handsFreeRef.current && sttRetriesRef.current < 2) { sttRetriesRef.current++; return startListening(); }
      sttRetriesRef.current = 0;
      setPhase("idle");
      return;
    }
    sttRetriesRef.current = 0;
    send(text.trim());
  }

  // ---------- dev-build path: continuous native recognition ----------
  async function nativeStart(opts = {}) {
    try {
      const perm = await SpeechModule.requestPermissionsAsync();
      if (!perm.granted) { sysMsg("Speech permission needed — allow it in Settings."); return; }
      nativeWantRef.current = true;
      SpeechModule.start({
        lang: "en-AU",
        interimResults: true,
        continuous: true,
        iosCategory: {
          category: "playAndRecord",
          categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
          // NOT voiceChat: it routes output through call-processing (ducked,
          // pumping volume, HFP Bluetooth). The deaf-guard alone handles echo.
          mode: "default",
        },
      });
      recActiveRef.current = true;
      // silent = listen-through during a reply: the UI stays "speaking".
      if (!opts.silent) setPhase("listening");
    } catch (e) {
      recActiveRef.current = false;
      sysMsg("Speech recognition failed to start — " + (e.message || e));
      setPhase("idle");
    }
  }

  // Safety net: even with the mic closed during replies, a stray tail can be
  // transcribed. If most of what we "heard" is words the assistant just said,
  // it's echo — drop it and keep listening.
  const normWords = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

  // Words heard that the assistant did NOT just say — the real signal that a
  // human is talking. (Transcription mangles echo, so exact matching is out.)
  function foreignWords(t) {
    const bag = new Set([...normWords(lastReplyRef.current), ...normWords(prevReplyRef.current)]);
    return normWords(t).filter((w) => !bag.has(w));
  }

  function isEcho(t) {
    const heard = normWords(t);
    if (heard.length < 2) return false;
    return foreignWords(t).length / heard.length <= 0.4;
  }

  // Listen WHILE the assistant speaks so the user can cut in. The session
  // transcript will contain echo of the reply; echoPrefixRef tracks how much of
  // it was pure echo, so the user's actual words can be split off cleanly.
  async function startListenThrough() {
    if (!nativeSpeechAvailable || !handsFreeRef.current) return;
    listenThroughRef.current = true;
    echoPrefixRef.current = "";
    lastResultRef.current = null;
    if (!recActiveRef.current) await nativeStart({ silent: true });
  }

  function nativeConsume(text) {
    const t = (text || "").trim();
    if (!t || busyRef.current) return;
    const last = lastSentRef.current;
    if (t === last.text && Date.now() - last.at < 4000) return; // isFinal + timer double-fire
    lastResultRef.current = null;
    if (isEcho(t)) { setLiveText(""); return; }
    send(t);
  }

  useEffect(() => {
    if (!nativeSpeechAvailable || VAPI_MODE) return;
    const subs = [
      SpeechModule.addListener("result", (ev) => {
        const t = ev?.results?.[0]?.transcript || "";
        if (!t.trim()) return;
        // While the assistant is speaking: separate echo from a real interruption.
        if (listenThroughRef.current) {
          if (isEcho(t)) { echoPrefixRef.current = t; return; } // just our own voice
          const spoken = t.startsWith(echoPrefixRef.current)
            ? t.slice(echoPrefixRef.current.length).trim()
            : t.trim();
          // A real interruption needs THREE words the assistant didn't just say,
          // and not in the first second of the reply (that window is almost
          // always echo of its own opening). Anything less, keep talking.
          const foreign = foreignWords(spoken).length;
          if (foreign >= 3 && Date.now() - speakStartRef.current > 1000) {
            AQ.stopAudio();
            AQ.setExpectMore(false);
            listenThroughRef.current = false;
            busyRef.current = false;
            turnIdRef.current++; // abandon the interrupted turn's bookkeeping
            setStreamAi("");
            setPhase("listening");
            setLiveText(spoken);
            lastResultRef.current = { text: spoken, at: Date.now() };
          }
          return;
        }
        if (Date.now() < deafUntilRef.current) { lastResultRef.current = null; return; }
        if (phaseRef.current === "listening") {
          // The session transcript is cumulative and may still carry the echo
          // of the reply we listened through — strip that prefix off.
          const pre = echoPrefixRef.current;
          const spoken = pre && t.startsWith(pre) ? t.slice(pre.length).trim() : t.trim();
          if (!spoken) return;
          setLiveText(spoken);
          lastResultRef.current = { text: spoken, at: Date.now() };
          if (ev.isFinal) nativeConsume(spoken);
        }
      }),
      SpeechModule.addListener("error", (ev) => {
        if (ev?.error === "not-allowed") sysMsg("Mic blocked — allow microphone access in Settings.");
      }),
      SpeechModule.addListener("end", () => {
        // Recognition service stopped (timeout etc) — re-open ONLY if hands-free
        // still wants it; otherwise stay properly off (no restart storms).
        recActiveRef.current = false;
        if (nativeWantRef.current && handsFreeRef.current && !busyRef.current) {
          setTimeout(() => { if (!recActiveRef.current && !busyRef.current) nativeStart(); }, 300);
        }
      }),
    ];
    // iOS can be slow to flag isFinal in continuous mode — a stable interim
    // transcript for 1.1s counts as end-of-utterance.
    const timer = setInterval(() => {
      const r = lastResultRef.current;
      if (r && phaseRef.current === "listening" && Date.now() > deafUntilRef.current && Date.now() - r.at > 1100) nativeConsume(r.text);
    }, 300);
    return () => { subs.forEach((s) => s.remove()); clearInterval(timer); };
  }, []);

  // ---------- controls ----------
  function onBigPress() {
    Keyboard.dismiss();
    if (VAPI_MODE) return void vapiToggle();
    quietRoundsRef.current = 0;
    if (phaseRef.current === "speaking" || AQ.isDraining()) {
      AQ.stopAudio();
      if (!busyRef.current) startListening();
      return;
    }
    if (phaseRef.current === "listening") {
      if (nativeSpeechAvailable) {
        const r = lastResultRef.current;
        if (r) nativeConsume(r.text);
      } else {
        finishListening();
      }
      return;
    }
    if (phaseRef.current === "idle") startListening();
  }

  function onSendTyped() {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    Keyboard.dismiss();
    if (VAPI_MODE) {
      if (!vapiLiveRef.current) { sysMsg("Tap the button to start the voice session first."); return; }
      addMsg("me", t);
      VV.say(t);
      return;
    }
    if (phaseRef.current === "listening" && !nativeSpeechAvailable) {
      vadRef.current = null;
      stopRecorder();
      setPhase("idle");
    }
    send(t);
  }

  function toggleHandsFree() {
    const v = !handsFreeRef.current;
    handsFreeRef.current = v;
    setHandsFree(v);
    if (VAPI_MODE) { VV.setMuted(!v); return; } // mute the mic, keep the session
    if (!v) {
      // OFF must mean OFF: recognition stopped, buffers cleared, UI idle.
      if (nativeSpeechAvailable) {
        nativeWantRef.current = false;
        recActiveRef.current = false;
        try { SpeechModule.stop(); } catch {}
      }
      lastResultRef.current = null;
      setLiveText("");
      if (phaseRef.current === "listening") setPhase("idle");
    } else if (phaseRef.current === "idle" && !busyRef.current) {
      startListening();
    }
  }

  async function unlock() {
    const p = pinEntry.trim();
    if (!p) return;
    pinRef.current = p;
    await saveSettings({ pin: p });
    setPin(p);
    setPinEntry("");
  }

  // ---------- render ----------
  if (pin === null) return <View style={st.body} />;

  if (!pin) {
    return (
      <SafeAreaView style={st.body}>
        <StatusBar style="light" />
        <View style={st.veil}>
          <Text style={st.veilTitle}>AI Assist</Text>
          <Text style={st.veilSub}>Enter PIN</Text>
          <TextInput
            style={st.pinInput} value={pinEntry} onChangeText={setPinEntry}
            keyboardType="number-pad" autoFocus onSubmitEditing={unlock}
          />
          <Pressable style={st.veilBtn} onPress={unlock}>
            <Text style={st.veilBtnText}>Unlock</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stateLabel = VAPI_MODE
    ? {
        idle: "tap to start talking",
        listening: "listening — just talk",
        transcribing: "…",
        thinking: "connecting…",
        speaking: "speaking — talk over it any time",
      }[phase]
    : {
        idle: "tap the mic and talk",
        listening: "listening… pause to send",
        transcribing: "transcribing…",
        thinking: "thinking…",
        speaking: "tap to interrupt",
      }[phase];

  const bigColor = {
    idle: "#1a73e8", listening: "#e53935", transcribing: "#f9ab00",
    thinking: "#f9ab00", speaking: "#34a853",
  }[phase];

  const bigIcon = {
    idle: "\u{1F3A4}", listening: "\u{1F3A4}", transcribing: "…",
    thinking: "…", speaking: "\u{1F50A}",
  }[phase];

  return (
    <SafeAreaView style={st.body}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={st.header}>
          <Text style={st.headerTitle}>
            AI Assist <Text style={st.headerVer}>{VERSION} · {VAPI_MODE ? "vapi voice" : nativeSpeechAvailable ? "native mic" : "Expo Go"}</Text>
          </Text>
          <Pressable onPress={toggleHandsFree}>
            <Text style={[st.hf, handsFree && st.hfOn]}>{VAPI_MODE ? (handsFree ? "mic on" : "mic muted") : handsFree ? "hands-free ✓" : "hands-free off"}</Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={st.log} contentContainerStyle={{ paddingBottom: 10 }}>
          {log.map((m) =>
            m.cls === "sys" ? (
              <Text key={m.id} style={st.sys}>{m.text}</Text>
            ) : m.cls === "draft" ? (
              <View key={m.id} style={st.draft}>
                <Text style={st.draftHead}>QUOTE DRAFT — not saved yet</Text>
                {m.lines.map((l, i) => {
                  const qty = Number(l.quantity) > 0 ? Number(l.quantity) : 1;
                  const price = Number(l.unit_price) || 0;
                  return (
                    <View key={i} style={st.draftRow}>
                      <Text style={st.draftName}>{l.name}</Text>
                      <View style={st.draftNums}>
                        <Text style={st.draftQty}>{qty} × ${price.toFixed(2)}</Text>
                        <Text style={st.draftLine}>${(qty * price).toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })}
                <View style={st.draftTotalRow}>
                  <Text style={st.draftTotalLabel}>Total ex GST</Text>
                  <Text style={st.draftTotal}>
                    ${m.lines.reduce((t, l) => t + (Number(l.quantity) > 0 ? Number(l.quantity) : 1) * (Number(l.unit_price) || 0), 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            ) : (
              <View key={m.id} style={[st.msg, m.cls === "me" ? st.me : st.ai]}>
                <Text style={st.msgText}>{m.text}</Text>
              </View>
            )
          )}
          {!!streamAi && (
            <View style={[st.msg, st.ai]}><Text style={st.msgText}>{streamAi}</Text></View>
          )}
          {!!liveText && phase === "listening" && (
            <View style={[st.msg, st.me, { opacity: 0.6 }]}><Text style={st.msgText}>{liveText}</Text></View>
          )}
        </ScrollView>

        <Text style={st.state}>{stateLabel}</Text>

        <View style={st.dock}>
          <Pressable onPress={onBigPress} style={{ borderRadius: 37 }}>
            <Animated.View style={[st.big, { backgroundColor: bigColor, opacity: phase === "listening" ? pulse : 1 }]}>
              <Text style={{ fontSize: 30 }}>{bigIcon}</Text>
            </Animated.View>
          </Pressable>
          <TextInput
            style={st.box} value={typed} onChangeText={setTyped}
            placeholder="or type here" placeholderTextColor="#61708a"
            onSubmitEditing={onSendTyped} returnKeyType="send"
          />
          <Pressable style={st.sendBtn} onPress={onSendTyped}>
            <Text style={{ color: "#fff", fontSize: 15 }}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  body: { flex: 1, backgroundColor: "#0f1b2d" },
  header: {
    paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row",
    justifyContent: "space-between", alignItems: "center",
  },
  headerTitle: { color: "#e8eef7", fontWeight: "700", fontSize: 17 },
  headerVer: { color: "#7d8ba1", fontWeight: "400", fontSize: 12 },
  draft: {
    backgroundColor: "#16233a", borderColor: "#c96a2b", borderWidth: 1,
    borderRadius: 14, padding: 12, marginVertical: 8,
  },
  draftHead: {
    color: "#efa96a", fontSize: 10, fontWeight: "800", letterSpacing: 1.2,
    marginBottom: 8,
  },
  draftRow: { borderBottomColor: "#25375a", borderBottomWidth: 1, paddingVertical: 8 },
  draftName: { color: "#e9eff8", fontSize: 14, lineHeight: 19 },
  draftNums: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  draftQty: { color: "#8da0bc", fontSize: 12, fontVariant: ["tabular-nums"] },
  draftLine: { color: "#e9eff8", fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  draftTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10 },
  draftTotalLabel: { color: "#8da0bc", fontSize: 13 },
  draftTotal: { color: "#fff", fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  hf: { color: "#61708a", fontSize: 13, padding: 4 },
  hfOn: { color: "#34a853" },
  log: { flex: 1, paddingHorizontal: 14 },
  msg: {
    maxWidth: "88%", marginVertical: 5, paddingHorizontal: 13, paddingVertical: 9,
    borderRadius: 14, alignSelf: "flex-start",
  },
  me: { backgroundColor: "#1a73e8", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  ai: { backgroundColor: "#1c2b42", borderWidth: 1, borderColor: "#27395a", borderBottomLeftRadius: 4 },
  msgText: { color: "#e8eef7", fontSize: 15, lineHeight: 21 },
  sys: { color: "#61708a", fontSize: 12, textAlign: "center", marginVertical: 6 },
  state: { color: "#7d8ba1", fontSize: 12, textAlign: "center", paddingBottom: 4 },
  dock: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14,
  },
  big: {
    width: 74, height: 74, borderRadius: 37,
    alignItems: "center", justifyContent: "center",
  },
  box: {
    flex: 1, backgroundColor: "#16233a", borderWidth: 1, borderColor: "#27395a",
    color: "#e8eef7", borderRadius: 12, paddingHorizontal: 13, height: 48, fontSize: 15,
  },
  sendBtn: {
    backgroundColor: "#1a73e8", borderRadius: 12, height: 48,
    paddingHorizontal: 16, alignItems: "center", justifyContent: "center",
  },
  veil: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  veilTitle: { color: "#e8eef7", fontSize: 20, fontWeight: "700" },
  veilSub: { color: "#7d8ba1" },
  pinInput: {
    fontSize: 22, textAlign: "center", letterSpacing: 6, backgroundColor: "#16233a",
    borderWidth: 1, borderColor: "#27395a", color: "#fff", borderRadius: 10,
    padding: 12, width: 190,
  },
  veilBtn: { backgroundColor: "#1a73e8", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 26 },
  veilBtnText: { color: "#fff", fontSize: 16 },
});
