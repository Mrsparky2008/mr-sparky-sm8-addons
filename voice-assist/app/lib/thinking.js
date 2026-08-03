// The "thinking" bed: a soft looping computer-blip track (S1) that fills the
// gap while Charlie works. Rules, so it never becomes annoying:
//   - only after ~600ms of silence, so quick answers stay silent
//   - fades in, fades out; never cuts abruptly
//   - stops the instant he starts speaking
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

const FADE_MS = 220;
const START_DELAY_MS = 600;
const VOLUME = 0.5; // relative to Charlie's voice

let player = null;
let startTimer = null;
let fadeTimer = null;
let wanted = false;

function clearTimers() {
  if (startTimer) { clearTimeout(startTimer); startTimer = null; }
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
}

function fadeTo(target, done) {
  if (fadeTimer) clearInterval(fadeTimer);
  const steps = Math.max(1, Math.round(FADE_MS / 40));
  let i = 0;
  const from = player?.volume ?? 0;
  fadeTimer = setInterval(() => {
    i++;
    const v = from + (target - from) * (i / steps);
    try { if (player) player.volume = Math.max(0, Math.min(1, v)); } catch {}
    if (i >= steps) { clearInterval(fadeTimer); fadeTimer = null; done?.(); }
  }, 40);
}

/** Called when the assistant starts working. */
export function start() {
  wanted = true;
  clearTimers();
  startTimer = setTimeout(() => {
    if (!wanted) return;
    try {
      if (!player) {
        player = createAudioPlayer(require("../assets/thinking.wav"));
        player.loop = true;
      }
      player.volume = 0;
      player.play();
      fadeTo(VOLUME);
    } catch {}
  }, START_DELAY_MS);
}

/** Called the moment he speaks, or the turn ends. */
export function stop() {
  wanted = false;
  clearTimers();
  if (!player) return;
  fadeTo(0, () => {
    try { player.pause(); player.seekTo(0); } catch {}
  });
}

export function release() {
  wanted = false;
  clearTimers();
  try { player?.remove(); } catch {}
  player = null;
}
