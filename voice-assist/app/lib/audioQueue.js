// Ordered playback of the Polly mp3 chunks the backend streams during a reply.
// Chunks arrive as base64 SSE events (possibly out of order via seq); each is
// written to a cache file and played sequentially with expo-audio.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

let q = [];
let next = 0;
let playing = false;
let stopped = false;
let player = null;
let gen = 0;       // bumped by stopAudio so stale callbacks/writes are ignored
let fileN = 0;
let onDrain = null;

export function setOnDrain(cb) { onDrain = cb; }

// True while a chunk is playing or queued — "the assistant is still talking".
export function isDraining() { return playing || !!q[next]; }

// iOS routes output to the quiet earpiece while recording is allowed, so we
// flip the audio mode: record mode while the mic is open, playback mode after.
export async function playbackMode() {
  try { await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, interruptionMode: "doNotMix" }); } catch {}
}
export async function recordMode() {
  try { await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, interruptionMode: "doNotMix" }); } catch {}
}

export function resetQueue() {
  stopAudio();
  stopped = false;
}

export async function enqueue(seq, b64) {
  const myGen = gen;
  const uri = FileSystem.cacheDirectory + "aiassist-" + fileN++ + ".mp3";
  try {
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  } catch {
    return;
  }
  if (myGen !== gen || stopped) return;
  q[seq] = uri;
  pump();
}

function finishOne(myGen) {
  if (myGen !== gen) return;
  try { if (player) player.release(); } catch {}
  player = null;
  playing = false;
  pump();
  if (!playing && !q[next] && onDrain) onDrain();
}

function pump() {
  if (playing || stopped) return;
  const uri = q[next];
  if (!uri) return;
  q[next] = null;
  next++;
  playing = true;
  const myGen = gen;
  let done = false;
  try {
    player = createAudioPlayer({ uri });
    player.addListener("playbackStatusUpdate", (s) => {
      if (done || myGen !== gen) return;
      if (s && s.didJustFinish) { done = true; finishOne(myGen); }
    });
    player.play();
    // If the finished event never lands (seen with some players), unstick.
    setTimeout(() => { if (!done && myGen === gen) { done = true; finishOne(myGen); } }, 60000);
  } catch {
    playing = false;
    pump();
  }
}

export function stopAudio() {
  gen++;
  stopped = true;
  try { if (player) player.pause(); } catch {}
  try { if (player) player.release(); } catch {}
  player = null;
  playing = false;
  q = [];
  next = 0;
}
