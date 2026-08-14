// Screen 3 — Charlie live. The voice session, with the conversation on screen
// so nothing important is trapped in audio.
//
// HARD RULE carried from v1.2: never play local audio during a Vapi session.
// iOS hands the audio session to one owner, and a local player takes it off the
// WebRTC call — which killed the mic AND Charlie's voice. Every cue here is
// visual for that reason.
import { useEffect, useRef, useState } from "react";
import {
  Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { Header, JobChip } from "../components/ui";
import { C, R, S, T, mono } from "../lib/theme";
import * as VV from "../lib/vapiVoice";
import { addToThread, getThread } from "../lib/thread";

const ORB = 120;

let msgId = 0;

export default function CharlieLive({ job, onBack, onDraft, onSwitchToDictate }) {
  useKeepAwake();

  // Seeded from the shared thread: a call opened after a dictation exchange
  // shows that exchange above it — one conversation, whatever the mouth.
  const [log, setLog] = useState(() =>
    getThread().map((m) => ({ id: msgId++, cls: m.who, text: m.text })));
  const [streamAi, setStreamAi] = useState("");
  const [liveText, setLiveText] = useState("");
  const [typed, setTyped] = useState("");
  const [phase, setPhaseState] = useState("idle"); // idle listening thinking speaking
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const phaseRef = useRef("idle");
  const liveRef = useRef(false);
  const scrollRef = useRef(null);
  const aiTailRef = useRef({ text: "", at: 0 });
  const meTailRef = useRef({ text: "", at: 0 });
  const speakTimer = useRef(null);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const think = useRef(new Animated.Value(0)).current;

  const setPhase = (p) => { phaseRef.current = p; setPhaseState(p); };
  const addMsg = (cls, text) => setLog((l) => [...l, { id: msgId++, cls, text }]);

  // ---------- session ----------
  useEffect(() => {
    start();
    return () => {
      if (speakTimer.current) clearTimeout(speakTimer.current);
      VV.stop().catch(() => {});
    };
  }, []);

  async function start() {
    // A dial that hangs looks identical to a dial in progress — and "it just
    // takes ages, it doesn't connect" is unanswerable without a clock. If the
    // line is not live in 15 seconds, say so out loud instead of spinning.
    const watchdog = setTimeout(() => {
      if (!liveRef.current && phaseRef.current === "thinking") {
        addMsg("sys", "Still not connected after 15s — that's a network or Vapi problem, not you. Tap the orb to retry, or check reception.");
      }
    }, 15000);
    try {
      await VV.start({ onEvent, job });
    } catch (e) {
      addMsg("sys", "Couldn't start the voice session — " + (e?.message || e));
      setPhase("idle");
    } finally {
      clearTimeout(watchdog);
    }
  }

  function onEvent(kind, payload) {
    if (kind === "status") {
      if (payload === "connecting") setPhase("thinking");
      if (payload === "live") { liveRef.current = true; setPhase("listening"); }
      if (payload === "ended") { liveRef.current = false; setPhase("idle"); setLiveText(""); setStreamAi(""); }
      return;
    }
    // A speech turn OPENING is not the same as Charlie saying something.
    //
    // Now that he holds his tongue on an unfinished sentence, he returns
    // nothing for each fragment — but Vapi still opens and closes a speech
    // turn around that empty reply. Rendering those directly made the label
    // strobe listening/speaking on every fragment while no audio ever played:
    // "the microphone keeps swapping from listening to speaker back and forth,
    // it doesn't stay in listening mode while I'm talking" (Steven, 13 Aug).
    // The mic never stopped listening — the label was lying.
    //
    // So make "speaking" earn it: hold the flip for a beat, and cancel it if
    // the turn closes first. Real speech lasts far longer than this; an empty
    // turn never survives it.
    if (kind === "speaking") {
      if (speakTimer.current) { clearTimeout(speakTimer.current); speakTimer.current = null; }
      if (payload.on) {
        speakTimer.current = setTimeout(() => {
          speakTimer.current = null;
          if (phaseRef.current !== "idle") setPhase("speaking");
        }, 350);
      } else if (phaseRef.current !== "idle") {
        setPhase("listening");
      }
      return;
    }
    if (kind === "draft") { onDraft(payload); return; }
    if (kind === "error") { addMsg("sys", "Voice error — " + payload); return; }
    // Audio routing: loud when it FAILS, silent when it works. The success
    // line earned its keep while the earpiece bug was being chased; once
    // fixed it was just four grey lines of noise per call (Steven, 9 Aug).
    if (kind === "audio") {
      if (payload?.error) addMsg("sys", "Audio route failed — " + payload.error);
      return;
    }
    if (kind !== "speech") return;

    const { who, text, final } = payload;
    if (who === "user") {
      if (final) {
        const mine = text.trim();
        if (mine) {
          addToThread("me", mine);
          // Vapi commits a turn every time it reckons you paused, so ONE
          // spoken sentence lands as three or four finals. Rendering each as
          // its own bubble is what made the screen look like a shouting
          // match with itself — "the transcription is three or four lines"
          // (Steven, 13 Aug). Glue a run into one bubble, exactly the way
          // Charlie's own sentences already are below. The run ends when he
          // answers, so a real back-and-forth still reads as a conversation.
          const at = Date.now();
          const run = meTailRef.current;
          if (run.at && at - run.at < 12000) {
            setLog((l) => {
              const copy = [...l];
              for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].cls === "me") { copy[i] = { ...copy[i], text: `${copy[i].text} ${mine}`.trim() }; break; }
              }
              return copy;
            });
            meTailRef.current = { text: `${run.text} ${mine}`.trim(), at };
          } else {
            addMsg("me", mine);
            meTailRef.current = { text: mine, at };
          }
        }
        setLiveText("");
      }
      else setLiveText(text);
      return;
    }
    if (!final) { setStreamAi(text); return; }
    const t = text.trim();
    setStreamAi("");
    if (!t) return;
    // Charlie answering closes your run: whatever you say next starts a fresh
    // bubble rather than being glued onto what you said before he spoke.
    meTailRef.current = { text: "", at: 0 };
    // The thread gets each final sentence; its duplicate guard drops echoes.
    addToThread("ai", t);
    // Vapi reports Charlie sentence by sentence and repeats a line when the
    // audio restarts — glue the run into one bubble, drop the echoes.
    const now = Date.now();
    const prev = aiTailRef.current;
    if (prev.at && now - prev.at < 6000) {
      if (prev.text.includes(t)) return;
      setLog((l) => {
        const copy = [...l];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].cls === "ai") { copy[i] = { ...copy[i], text: `${copy[i].text} ${t}`.trim() }; break; }
        }
        return copy;
      });
      aiTailRef.current = { text: `${prev.text} ${t}`.trim(), at: now };
      return;
    }
    addMsg("ai", t);
    aiTailRef.current = { text: t, at: now };
  }

  // ---------- call timer ----------
  useEffect(() => {
    if (phase === "idle") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase === "idle"]);

  // ---------- orb motion ----------
  // Two rings, half a cycle apart, so the mic reads as live rather than blinking.
  useEffect(() => {
    if (phase !== "listening") return;
    const wave = (value, delay) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    const a = wave(ring1, 0);
    const b = wave(ring2, 900);
    ring1.setValue(0); ring2.setValue(0);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); ring1.setValue(0); ring2.setValue(0); };
  }, [phase]);

  useEffect(() => {
    if (phase === "thinking") {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(think, { toValue: 1, duration: 620, useNativeDriver: true }),
        Animated.timing(think, { toValue: 0, duration: 620, useNativeDriver: true }),
      ]));
      loop.start();
      return () => { loop.stop(); think.setValue(0); };
    }
  }, [phase]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [log, streamAi, liveText]);

  function onOrbPress() {
    if (liveRef.current) { VV.stop().catch(() => {}); return; }
    setSeconds(0);
    start();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    VV.setMuted(next);
  }

  function sendTyped() {
    const t = typed.trim();
    if (!t) return;
    addMsg("me", t);
    addToThread("me", t);
    VV.say(t);
    setTyped("");
  }

  const label = {
    idle: "tap to start",
    listening: muted ? "mic muted" : "listening — just talk",
    thinking: "connecting…",
    speaking: "speaking — talk over it any time",
  }[phase];

  const stateColour = { idle: C.brand, listening: C.active, thinking: C.thinking, speaking: C.earth }[phase];
  const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <View style={s.screen}>
      <Header title="Charlie" meta={phase === "idle" ? undefined : timer} onBack={onBack} />
      {/* The way out of a laggy call. A live session has to guess when you
          have stopped talking; dictation is told. */}
      {onSwitchToDictate ? (
        <Pressable onPress={onSwitchToDictate} hitSlop={8} style={s.toDictate}>
          <Text style={s.toDictateText}>Switch to dictation</Text>
        </Pressable>
      ) : null}

      {/* No KeyboardAvoidingView — see SignIn: its relayout on focus is what
          blacked the screen out. The transcript scroller takes keyboard insets
          natively instead. */}
      <View style={{ flex: 1 }}>
        {!!job && (
          <View style={s.chipWrap}>
            <JobChip job={job} />
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          style={s.log}
          contentContainerStyle={{ paddingBottom: 12 }}
          automaticallyAdjustKeyboardInsets
        >
          {log.map((m) =>
            m.cls === "sys" ? (
              <Text key={m.id} style={s.sys}>{m.text}</Text>
            ) : m.cls === "me" ? (
              <View key={m.id} style={[s.bubble, s.me]}><Text style={s.bubbleText}>{m.text}</Text></View>
            ) : (
              <View key={m.id} style={[s.bubble, s.ai]}><Text style={s.bubbleText}>{m.text}</Text></View>
            )
          )}
          {!!streamAi && <View style={[s.bubble, s.ai]}><Text style={s.bubbleText}>{streamAi}</Text></View>}
        </ScrollView>

        {!!liveText && (
          <View style={s.caption}>
            <Text style={T.label}>You</Text>
            <Text style={s.captionText}>{liveText}</Text>
          </View>
        )}

        <View style={s.orbWrap}>
          <Pressable onPress={onOrbPress} hitSlop={10}>
            {phase === "listening" && (
              <>
                <Ring anim={ring1} />
                <Ring anim={ring2} />
              </>
            )}
            {phase === "thinking" && (
              <Animated.View
                pointerEvents="none"
                style={[s.ring, {
                  borderColor: C.thinking,
                  opacity: think.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.12] }),
                  transform: [{ scale: think.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
                }]}
              />
            )}
            <View style={[s.orb, { backgroundColor: stateColour }]}>
              <Text style={s.orbIcon}>{phase === "speaking" ? "🔊" : "🎙"}</Text>
            </View>
          </Pressable>
          <Text style={[s.stateLabel, { color: stateColour }]}>{label}</Text>
        </View>

        <View style={s.dock}>
          <Pressable onPress={toggleMute} hitSlop={8} style={s.muteBtn}>
            <Text style={[s.mute, muted && { color: C.active }]}>{muted ? "unmute" : "mute"}</Text>
          </Pressable>
          <TextInput
            style={s.input}
            value={typed}
            onChangeText={setTyped}
            placeholder="or type"
            placeholderTextColor={C.muted}
            selectionColor={C.brand}
            onSubmitEditing={sendTyped}
            returnKeyType="send"
          />
          <Pressable style={s.send} onPress={sendTyped}>
            <Text style={s.sendText}>Send</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** One ring expanding out of the orb and fading as it goes. */
function Ring({ anim }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.ring, {
        borderColor: C.activeLight,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }]}
    />
  );
}

const s = StyleSheet.create({
  toDictate: { alignSelf: "center", paddingVertical: 4, paddingHorizontal: 10, marginBottom: 2 },
  toDictateText: { color: C.muted, fontSize: 12.5, fontWeight: "700" },
  screen: { flex: 1, backgroundColor: C.bg },
  chipWrap: { paddingHorizontal: S.screen, paddingBottom: 10 },
  log: { flex: 1, paddingHorizontal: S.screen },
  bubble: { maxWidth: "88%", marginVertical: 5, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14 },
  me: { backgroundColor: C.brand, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  ai: {
    backgroundColor: C.charlieBg, borderWidth: 1, borderColor: C.charlieLine,
    alignSelf: "flex-start", borderBottomLeftRadius: 4,
  },
  bubbleText: { ...T.body, fontSize: 15 },
  sys: { ...T.small, textAlign: "center", marginVertical: 8 },

  caption: {
    marginHorizontal: S.screen, marginBottom: 10, backgroundColor: C.panel,
    borderColor: C.line, borderWidth: 1, borderRadius: R.card, padding: 11,
  },
  captionText: { ...T.body, marginTop: 4 },

  orbWrap: { alignItems: "center", paddingBottom: 14 },
  orb: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    alignItems: "center", justifyContent: "center",
  },
  orbIcon: { fontSize: 40 },
  ring: {
    position: "absolute", top: 0, left: 0, width: ORB, height: ORB,
    borderRadius: ORB / 2, borderWidth: 2,
  },
  stateLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.9, textTransform: "uppercase", marginTop: 14 },

  dock: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: S.screen, paddingTop: 10, paddingBottom: 8,
    borderTopColor: C.line, borderTopWidth: 1,
  },
  muteBtn: { paddingHorizontal: 4, paddingVertical: 10 },
  mute: { color: C.muted, fontSize: 12.5, fontWeight: "700" },
  input: {
    flex: 1, minHeight: 44, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 12, color: C.ink, fontSize: 15,
  },
  send: {
    minHeight: 44, paddingHorizontal: 15, borderRadius: R.card,
    backgroundColor: C.brand, alignItems: "center", justifyContent: "center",
  },
  sendText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
