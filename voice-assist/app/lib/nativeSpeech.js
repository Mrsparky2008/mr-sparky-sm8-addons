// expo-speech-recognition is a dev-build-only native module: present in a real
// build (npx expo run:ios / EAS), absent in Expo Go. Load it defensively so the
// same code runs in both — Expo Go falls back to record + backend /stt.
let mod = null;
try {
  mod = require("expo-speech-recognition");
  if (!mod || !mod.ExpoSpeechRecognitionModule || typeof mod.ExpoSpeechRecognitionModule.start !== "function") {
    mod = null;
  }
} catch {
  mod = null;
}

export const nativeSpeechAvailable = !!mod;
export const SpeechModule = mod ? mod.ExpoSpeechRecognitionModule : null;
