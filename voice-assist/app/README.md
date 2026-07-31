# AI Assist — native app (Phase 2)

Expo (React Native) front-end on the same backend as the PWA (Lambda
`mr-sparky-ai-assist`, `/chat` SSE + Polly). Expo SDK 54 — matches the
App Store build of Expo Go.

## Test on the iPhone (Expo Go, no Apple account)

1. On the iPhone: install **Expo Go** from the App Store.
2. On the PC:

```bash
cd C:\Users\ssuka\Documents\sm8-addons\voice-assist\app
npx expo start --tunnel
```

3. Scan the QR code with the iPhone camera → opens in Expo Go.
4. Enter the app PIN, allow the microphone, talk.

`--tunnel` works from any network (4G included). On the same Wi-Fi you can
drop it.

## Two speech paths (automatic)

- **Expo Go (today):** records with the native mic, auto-stops on ~1.3s of
  silence (metering VAD), transcribes via the backend `/stt` endpoint
  (Amazon Transcribe streaming, en-AU), then runs the normal `/chat` turn.
  Hands-free loop: after the reply finishes speaking, the mic re-opens.
  Tap the green button to interrupt a reply.
- **Dev build (later, needs Apple dev account for iPhone):**
  `expo-speech-recognition` — mic opens once and stays open, continuous
  recognition, true barge-in (talking over the AI cuts it off). The code
  detects the native module automatically; nothing to configure.

## Files

- `App.js` — UI + conversation state machine (PIN gate, transcript, big
  state button, hands-free toggle)
- `lib/api.js` — `/chat` SSE client (`expo/fetch` streaming) + `/stt`
- `lib/audioQueue.js` — ordered Polly mp3 chunk playback (expo-audio)
- `lib/nativeSpeech.js` — defensive loader for expo-speech-recognition
- `lib/settings.js` — persisted PIN
- `lib/config.js` — backend URL + version

## Notes

- The PWA stays live at the Function URL — desktop face, untouched.
- Android fallback path won't transcribe (records m4a, `/stt` wants WAV);
  iPhone is the target device.
- VAD tuning knobs are constants at the top of `App.js`.
