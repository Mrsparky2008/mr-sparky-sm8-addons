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
import { VERSION } from "./lib/config";

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
    AQ.playbackMode();
    AQ.setOnDrain(() => { deafUntilRef.current = Date.now() + 700; if (!busyRef.current) afterTurn(); });
  }, []);

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
    quietRoundsRef.current = 0;
    lastSentRef.current = { text, at: Date.now() };
    addMsg("me", text);
    chatRef.current = [...chatRef.current, { role: "user", text }];
    setLiveText("");
    setPhase("thinking");
    AQ.resetQueue();
    if (!nativeSpeechAvailable) await AQ.playbackMode();
    let got = "";
    try {
      const { reply } = await chatTurn({
        messages: chatRef.current,
        pin: pinRef.current,
        onDelta: (x) => {
          got += x;
          setStreamAi(got);
          if (phaseRef.current === "thinking") setPhase("speaking");
        },
        onAudio: (seq, b64) => AQ.enqueue(seq, b64),
      });
      const final = (reply || got).trim();
      if (final) chatRef.current = [...chatRef.current, { role: "assistant", text: final }];
      setStreamAi("");
      if (final) addMsg("ai", final);
    } catch (e) {
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
      deafUntilRef.current = Math.max(deafUntilRef.current, Date.now() + 250);
      if (!recActiveRef.current) return nativeStart();
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
  async function nativeStart() {
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
      setPhase("listening");
    } catch (e) {
      recActiveRef.current = false;
      sysMsg("Speech recognition failed to start — " + (e.message || e));
      setPhase("idle");
    }
  }

  function nativeConsume(text) {
    const t = (text || "").trim();
    if (!t || busyRef.current) return;
    const last = lastSentRef.current;
    if (t === last.text && Date.now() - last.at < 4000) return; // isFinal + timer double-fire
    lastResultRef.current = null;
    send(t);
  }

  useEffect(() => {
    if (!nativeSpeechAvailable) return;
    const subs = [
      SpeechModule.addListener("result", (ev) => {
        const t = ev?.results?.[0]?.transcript || "";
        if (!t.trim()) return;
        // Echo guard: while the assistant is talking (or just finished), the
        // recogniser is mostly hearing US through the speaker — discard it all.
        // (Barge-in returns once echo cancellation is proven; without it the
        // app interrupts itself and loops its own replies back as input.)
        if (phaseRef.current === "speaking" || AQ.isDraining() || Date.now() < deafUntilRef.current) {
          lastResultRef.current = null;
          return;
        }
        if (phaseRef.current === "listening") {
          setLiveText(t);
          lastResultRef.current = { text: t, at: Date.now() };
          if (ev.isFinal) nativeConsume(t);
        }
      }),
      SpeechModule.addListener("error", (ev) => {
        if (ev?.error === "not-allowed") sysMsg("Mic blocked — allow microphone access in Settings.");
      }),
      SpeechModule.addListener("end", () => {
        // Recognition service stopped (timeout etc) — re-open ONLY if hands-free
        // still wants it; otherwise stay properly off (no restart storms).
        recActiveRef.current = false;
        if (nativeWantRef.current && handsFreeRef.current && !busyRef.current) setTimeout(nativeStart, 300);
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

  const stateLabel = {
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
            AI Assist <Text style={st.headerVer}>{VERSION} · {nativeSpeechAvailable ? "native mic" : "Expo Go"}</Text>
          </Text>
          <Pressable onPress={toggleHandsFree}>
            <Text style={[st.hf, handsFree && st.hfOn]}>{handsFree ? "hands-free ✓" : "hands-free off"}</Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={st.log} contentContainerStyle={{ paddingBottom: 10 }}>
          {log.map((m) =>
            m.cls === "sys" ? (
              <Text key={m.id} style={st.sys}>{m.text}</Text>
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
