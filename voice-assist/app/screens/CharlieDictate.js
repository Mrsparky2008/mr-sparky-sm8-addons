// Charlie, dictated.
//
// Steven, after a week of the live voice session: "it keeps listening for ages
// before it responds... I'd much prefer we do what I'm doing with you now.
// Transcribe, listen, and then summarise."
//
// He is describing a different machine, not a faster one. A duplex voice call
// has to GUESS when you have finished talking, and every guess is either a
// wait or an interruption. Dictation doesn't guess: you say when you're done.
//
// So this mode drops the whole call. No WebRTC, no Deepgram, no ElevenLabs, no
// turn-taking. The phone transcribes on-device — instant, no network — you
// read what it heard and fix it if it misheard, and one press sends it to the
// same brain the voice session uses. The reply arrives as text you can read
// back at a switchboard, which is the other half of what he asked for: it can
// be re-read, and it can be checked before anything is acted on.
//
// The live session stays. Hands full up a ladder, talking is still better.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import {
  ExpoSpeechRecognitionModule, useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Empty, Header, JobChip } from "../components/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import Icon from "../components/icons";
import KeyboardToggle from "../components/KeyboardToggle";
import { C, R, S, T, mono } from "../lib/theme";
import { chatTurn } from "../lib/api";
import { addToThread, asHistory, getThread } from "../lib/thread";

let msgId = 0;

// Dictating means talking, not touching — so iOS auto-lock fires mid-sentence
// and takes the recogniser (and the words) with it. The live call screen has
// always held the screen awake; this one never did (Steven, 9 Aug: "phone
// goes off screen while talking and not saving the dictation").
const AWAKE_TAG = "charlie-dictation";

// Where an unsent draft waits out a lock, a phone call, or a force-quit.
// Per job, because a draft belongs to the job it was spoken about.
const draftKey = (job) => `charlie.draft.${job?.job_number || "general"}`;

export default function CharlieDictate({ job, onBack, onDraft, onSwitchToVoice }) {
  // Seeded from the shared thread, so a voice call's conversation is sitting
  // here when you switch — one conversation, whatever the mouth.
  const [log, setLog] = useState(() =>
    getThread().map((m) => ({ id: msgId++, who: m.who, text: m.text })));
  const [draft, setDraft] = useState("");      // what he said, before sending
  const [partial, setPartial] = useState("");  // while still speaking
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sending = useRef(false);
  // Mirrors `draft` so the restore-on-mount effect can tell "nothing typed
  // yet" from "already speaking" without re-running on every word.
  const draftRef = useRef("");
  // Mirrors `partial` so the AppState handler — registered once, at mount —
  // can read the in-flight sentence instead of a stale copy of it.
  const partialRef = useRef("");

  // The transcript, as the brain needs it. Kept in a ref as well because a
  // send reads it inside a callback that would otherwise capture a stale copy.
  const history = useRef(asHistory());   // continues whatever was said in voice

  // Stopping the recogniser makes iOS deliver one LAST final result — after
  // send() has already cleared the box — which silently refills it with the
  // sentence just sent. Anything that arrives between a send and the next
  // deliberate mic tap is an echo, and echoes are dropped.
  const discard = useRef(false);

  useSpeechRecognitionEvent("result", (e) => {
    if (discard.current) return;
    const said = e.results?.[0]?.transcript || "";
    if (e.isFinal) {
      // Append rather than replace: iOS ends a segment on a long pause, and
      // replacing would silently drop the first half of a long sentence.
      setDraft((d) => (d ? `${d} ${said}`.trim() : said));
      setPartial("");
    } else {
      setPartial(said);
    }
  });
  useSpeechRecognitionEvent("end", () => { setListening(false); setPartial(""); });
  useSpeechRecognitionEvent("error", (e) => {
    setListening(false);
    setPartial("");
    // "no-speech" is someone tapping the mic and thinking — not a fault.
    if (e.error && e.error !== "no-speech") setError(`Couldn't hear that — ${e.error}`);
  });

  useEffect(() => () => {
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    try { deactivateKeepAwake(AWAKE_TAG); } catch {}
  }, []);

  // Hold the screen open while there is anything to lose — listening, or an
  // unsent draft sitting there. Released the moment there isn't, so a screen
  // left open on the bench doesn't cook the battery.
  useEffect(() => {
    const holding = listening || !!draft.trim() || !!partial.trim();
    if (holding) activateKeepAwakeAsync(AWAKE_TAG).catch(() => {});
    else { try { deactivateKeepAwake(AWAKE_TAG); } catch {} }
  }, [listening, draft, partial]);

  // Belt and braces: iOS kills the recogniser when the app leaves the
  // foreground (a call, a lock, the app switcher). Fold whatever was
  // mid-sentence into the draft and write it down before that happens —
  // the words are the thing that must not be lost.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") return;
      const p = partialRef.current.trim();
      if (p) {
        setDraft((d) => (d ? `${d} ${p}`.trim() : p));
        setPartial("");
      }
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
    });
    return () => sub.remove();
  }, []);

  // The draft outlives the screen, the lock, even a force-quit.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(draftKey(job))
      .then((saved) => { if (alive && saved && !draftRef.current) setDraft(saved); })
      .catch(() => {});
    return () => { alive = false; };
  }, [job?.job_number]);

  useEffect(() => { partialRef.current = partial; }, [partial]);

  useEffect(() => {
    draftRef.current = draft;
    const key = draftKey(job);
    if (draft.trim()) AsyncStorage.setItem(key, draft).catch(() => {});
    else AsyncStorage.removeItem(key).catch(() => {});
  }, [draft, job?.job_number]);

  async function toggleMic() {
    setError("");
    if (listening) {
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
      return;
    }
    discard.current = false;   // a deliberate mic tap — results are wanted again
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError("AI Assist needs the microphone and speech recognition to take dictation.");
      return;
    }
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-AU",
        interimResults: true,
        continuous: true,          // he stops it; it never stops mid-thought
        addsPunctuation: true,
        // Job numbers and trade words are what a general recogniser fumbles.
        contextualStrings: [
          job?.job_number ? String(job.job_number) : "",
          "ServiceM8", "switchboard", "RCD", "MCB", "Middy's", "Lawrence and Hanson",
        ].filter(Boolean),
      });
      setListening(true);
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  const send = useCallback(async () => {
    const text = `${draft} ${partial}`.trim();
    if (!text || sending.current) return;
    sending.current = true;
    discard.current = true;   // the stop below echoes a final result; drop it
    if (listening) { try { ExpoSpeechRecognitionModule.stop(); } catch {} }

    setLog((l) => [...l, { id: msgId++, who: "me", text }]);
    history.current = [...history.current, { role: "user", text }];
    addToThread("me", text);
    setDraft("");
    setPartial("");
    setThinking(true);
    setStreamed("");
    setError("");

    try {
      let acc = "";
      const { reply } = await chatTurn({
        messages: history.current,
        jobNumber: job?.job_number,
        onDelta: (d) => { acc += d; setStreamed(acc); },
      });
      const answer = (reply || acc || "").trim();
      history.current = [...history.current, { role: "assistant", text: answer }];
      setLog((l) => [...l, { id: msgId++, who: "ai", text: answer || "(no answer)" }]);
      addToThread("ai", answer);
    } catch (e) {
      setError(e?.message === "signed out" ? "Signed out — sign in again." : (e?.message || "Charlie didn't answer."));
    } finally {
      setStreamed("");
      setThinking(false);
      sending.current = false;
    }
  }, [draft, partial, listening]);

  const heard = `${draft}${partial ? (draft ? " " : "") + partial : ""}`;

  return (
    <View style={s.screen}>
      <Header
        title="Charlie"
        meta={job?.job_number ? `#${job.job_number}` : undefined}
        onBack={onBack}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {job?.job_number ? (
            <View style={{ marginBottom: S.gap }}>
              <JobChip job={job} />
            </View>
          ) : null}

          {log.length === 0 && !thinking ? (
            <Empty>
              Hold the mic and talk, or type. He answers in writing — read it back before
              anything gets acted on.
            </Empty>
          ) : null}

          {log.map((m) => (
            <View key={m.id} style={[s.bubble, m.who === "me" ? s.me : s.ai]}>
              <Text style={[s.bubbleText, m.who === "me" && { color: C.ink }]}>{m.text}</Text>
            </View>
          ))}

          {thinking ? (
            <View style={[s.bubble, s.ai]}>
              {streamed ? (
                <Text style={s.bubbleText}>{streamed}</Text>
              ) : (
                <View style={s.thinkingRow}>
                  <ActivityIndicator color={C.brand} size="small" />
                  <Text style={T.small}>Thinking…</Text>
                </View>
              )}
            </View>
          ) : null}

          {error ? <Text style={s.error}>{error}</Text> : null}
        </ScrollView>

        {/* What he said, editable before it goes. A misheard word fixed here
            costs a second; misheard into the brain it costs a wrong answer. */}
        <View style={s.dock}>
          <TextInput
            ref={inputRef}
            value={heard}
            onChangeText={(v) => { setDraft(v); setPartial(""); }}
            placeholder={listening ? "Listening…" : "Talk or type"}
            placeholderTextColor={C.muted}
            multiline
            style={[s.input, listening && { borderColor: C.brand }]}
          />
          <View style={s.controls}>
            <Pressable
              onPress={toggleMic}
              style={[s.mic, listening && s.micOn]}
              accessibilityRole="button"
              accessibilityLabel={listening ? "Stop dictating" : "Start dictating"}
            >
              <Icon name="mic" size={22} color={listening ? C.bg : C.ink} />
            </Pressable>
            <Pressable
              onPress={send}
              disabled={!heard.trim() || thinking}
              style={[s.send, (!heard.trim() || thinking) && { opacity: 0.4 }]}
            >
              <Text style={s.sendText}>{thinking ? "…" : "Send"}</Text>
            </Pressable>
            {onSwitchToVoice ? (
              <Pressable onPress={onSwitchToVoice} hitSlop={8} style={s.switchWrap}>
                <Text style={s.switchText}>Live voice</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
      <KeyboardToggle inputRef={inputRef} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { paddingHorizontal: S.screen, paddingBottom: 16 },
  bubble: { borderRadius: R.card, padding: 12, marginBottom: 9, maxWidth: "92%" },
  me: { alignSelf: "flex-end", backgroundColor: C.charlieBg, borderColor: C.brand, borderWidth: 1 },
  ai: { alignSelf: "flex-start", backgroundColor: C.panel, borderColor: C.line, borderWidth: 1 },
  bubbleText: { color: C.ink, fontSize: 15, lineHeight: 21 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  error: { color: C.warnChipInk, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  dock: {
    paddingHorizontal: S.screen, paddingTop: 10, paddingBottom: 10,
    borderTopColor: C.line, borderTopWidth: 1, backgroundColor: C.bg,
  },
  input: {
    minHeight: 46, maxHeight: 140, backgroundColor: C.panel, borderColor: C.line,
    borderWidth: 1, borderRadius: R.card, paddingHorizontal: 13, paddingTop: 12,
    paddingBottom: 12, color: C.ink, fontSize: 15.5, textAlignVertical: "top",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 9 },
  mic: {
    width: 48, height: 48, borderRadius: R.chip, alignItems: "center", justifyContent: "center",
    backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
  },
  micOn: { backgroundColor: C.brand, borderColor: C.brand },
  send: {
    flex: 1, minHeight: 48, borderRadius: R.button, backgroundColor: C.earth,
    alignItems: "center", justifyContent: "center",
  },
  sendText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  switchWrap: { paddingHorizontal: 6 },
  switchText: { color: C.muted, fontSize: 12.5, fontWeight: "700" },
});
