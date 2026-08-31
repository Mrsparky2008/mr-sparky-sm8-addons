// One Charlie conversation, whatever mouth it comes through.
//
// Voice and dictation were built as alternatives, each with its own memory,
// and switching between them met a Charlie with amnesia (Steven, 9 Aug:
// "between dictation and voice there is no link — I thought those parts were
// supposed to be supplementary to each other"). This module is the link: a
// single in-app transcript both screens read and append to.
//
//  - Dictation sends the whole thread as its history, so it simply continues.
//  - A voice call can't be handed history directly (Vapi refuses model
//    overrides outright — the 400 that broke connecting for two days), so a
//    new call carries recap() through variableValues, and the bridge feeds
//    it to the brain as the same conversation. Because it is.
//
// In-memory only, by design: a conversation is a working session, not a
// record — anything that matters ends up on the job as a note, task or
// quote. Killing the app starts fresh, which is also the escape hatch.

const messages = [];   // { who: "me" | "ai", text }
const MAX = 60;

export function addToThread(who, text) {
  const t = String(text || "").trim();
  if (!t) return;
  // Voice finals can repeat the tail of what streaming already appended.
  const last = messages[messages.length - 1];
  if (last && last.who === who && last.text === t) return;
  messages.push({ who, text: t });
  if (messages.length > MAX) messages.splice(0, messages.length - MAX);
}

/** The whole thread, oldest first, for rendering. */
export const getThread = () => messages.slice();

/** As the brain's /chat route wants it. */
export const asHistory = () =>
  messages.map((m) => ({ role: m.who === "me" ? "user" : "assistant", text: m.text }));

/**
 * The other channel's recent turns, compressed for a variableValue. Vapi
 * carries it untouched; the bridge unpacks it. Kept under ~1500 chars so the
 * call payload stays light — older context matters less than recent by
 * definition in a conversation.
 */
export function recap() {
  if (!messages.length) return "";
  let out = [];
  let size = 0;
  for (let i = messages.length - 1; i >= 0 && size < 1500; i--) {
    const line = `${messages[i].who === "me" ? "Tech" : "Charlie"}: ${messages[i].text}`.slice(0, 400);
    out.unshift(line);
    size += line.length;
  }
  return out.join("\n");
}

export function clearThread() { messages.length = 0; }
