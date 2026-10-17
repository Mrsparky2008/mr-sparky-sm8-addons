// The Telegram questions, in the app.
//
// Steven, 17 Oct 2026: "create a Notifications tab to mimic Telegram questions
// - purchases, handing over jobs, etc." And, asked whether it replaces Telegram
// or sits beside it: "Notifications will eventually replace Telegram. Until
// then they both run in parallel - only I have the new app."
//
// SO BOTH RUN, AND THAT IS NOT A DUPLICATE BUG. Jason and Marites answer in the
// group and will keep answering there. The record is the PORTAL's either way,
// so an answer given here closes the question there and the other way round -
// same position as push and Telegram both firing for one job (CLAUDE.md
// decision 10, section 32).
//
// THE PHONE DECIDES NOTHING HERE. Not who a question is addressed to, not what
// may be answered, not what the answer means. The portal sends rows and the
// buttons that belong to them; this screen draws them and posts back what was
// pressed. It does not parse what a man types either - the bot's own parser
// pulls supplier, invoice and job numbers out of free text server-side, and a
// second one on a phone is how the two stop agreeing.
//
// WHAT IS NOT BUILT, and deliberately: the portal's two routes. They do not
// exist yet (they are the network session's), so this screen is honest about
// it - "not switched on yet" in those words, not a red error. The day they
// land, nothing in here changes.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Card, Empty, Header } from "../components/ui";
import { C, R, S, T } from "../lib/theme";
import { ago } from "../lib/when";
import * as portal from "../lib/portal";

/** A row with nothing to press is a row already dealt with. */
const outstanding = (r) => !r.answered && Array.isArray(r.actions) && r.actions.length > 0;

/** The action that wants typing, if the portal sent one. */
const textAction = (row) => (row.actions || []).find((a) => a.needsText);

export default function Notifications({ visible = true, onCount }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState("");
  const [notLive, setNotLive] = useState(false);
  // Which row has its typing box open, and what is in it. One at a time: two
  // open boxes on a phone means one of them is off the bottom of the screen.
  const [typing, setTyping] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const load = useCallback(() => {
    setBusy(true);
    setRefused("");
    portal.notifications()
      .then((d) => {
        if (!live.current) return;
        const list = Array.isArray(d?.rows) ? d.rows : [];
        setRows(list);
        setNotLive(false);
        /*
         * THE COUNT COMES OFF THE SERVER'S `badge`, never counted from the
         * rows - the two must not be able to disagree (section 27, rule 2).
         * Reported on EVERY read including zero, or the dot sticks forever
         * advertising something answered twenty minutes ago.
         */
        if (onCount) {
          const n = Number(d?.badge);
          onCount(Number.isFinite(n) ? n : list.filter(outstanding).length);
        }
      })
      .catch((e) => {
        if (!live.current) return;
        setRows([]);
        /*
         * A FAILED READ LEAVES THE DOT ALONE rather than zeroing it. A list we
         * could not fetch is not a list of none, and a false zero says there
         * is nothing waiting on a day there is.
         */
        if (Number(e?.status) === 404) {
          // The portal has no such route yet. Not a fault, and it must not
          // look like one - see the header note.
          setNotLive(true);
        } else if (Number(e?.status) >= 400) {
          // The rule out of the push failures: a server that ANSWERS and says
          // no must never be silent. A phone that cannot get out stays quiet.
          setRefused(e?.message || "The portal would not answer.");
        }
      })
      .finally(() => { if (live.current) setBusy(false); });
  }, [onCount]);

  // On mount, not on first view: this pane sits behind the others from
  // sign-in, and a count you only get by opening the tab it is on tells you
  // nothing you did not already know.
  useEffect(() => { load(); }, [load]);
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) load();
    wasVisible.current = visible;
  }, [visible, load]);

  async function answer(row, action) {
    if (!action || !action.key) return;
    if (action.needsText && typing !== row.id) {
      setTyping(row.id);
      setDraft("");
      return;
    }
    const text = action.needsText ? draft.trim() : "";
    if (action.needsText && !text) return;
    setSending(row.id);
    try {
      await portal.answerNotification({ id: row.id, action: action.key, text });
      if (!live.current) return;
      setTyping(null);
      setDraft("");
      /*
       * Mark it answered HERE as well as reloading. The reload is the truth,
       * but on a slow phone the row would otherwise sit there still asking,
       * and a man taps it twice - which is exactly how a pickup gets claimed
       * by two people.
       */
      setRows((prev) => (prev || []).map((r) => (
        r.id === row.id ? { ...r, answered: { text: text || action.label } } : r
      )));
      load();
    } catch (e) {
      if (!live.current) return;
      setRefused(e?.message || "That answer did not go through.");
    } finally {
      if (live.current) setSending("");
    }
  }

  const waiting = (rows || []).filter(outstanding).length;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Notifications" meta={waiting ? String(waiting) : undefined} />
      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.muted} />}
      >
        {rows === null ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
        ) : notLive ? (
          /*
           * NOT AN ERROR, and it must not read as one. The tab is here, the
           * screen works, and the portal end of it has not been switched on.
           * Saying that plainly is the difference between "they are building
           * it" and "my app is broken".
           */
          <Card style={s.note}>
            <Text style={s.noteTitle}>Not switched on yet</Text>
            <Text style={s.noteBody}>
              The questions still come through Telegram. When the portal starts
              sending them here they will appear on this screen on their own,
              with nothing to update.
            </Text>
            <Pressable onPress={load} style={s.again} disabled={busy}>
              <Text style={s.againText}>{busy ? "Checking..." : "Check again"}</Text>
            </Pressable>
          </Card>
        ) : refused ? (
          <Card style={s.note}>
            <Text style={s.noteTitle}>This list could not be loaded</Text>
            <Text style={s.noteBody}>{refused}</Text>
            <Pressable onPress={load} style={s.again} disabled={busy}>
              <Text style={s.againText}>{busy ? "Trying..." : "Try again"}</Text>
            </Pressable>
          </Card>
        ) : !rows.length ? (
          <Empty>Nothing waiting on you.</Empty>
        ) : (
          rows.map((row) => (
            <Card key={String(row.id)} style={[s.row, !outstanding(row) && s.done]}>
              <View style={s.rowTop}>
                <Text style={s.title}>{row.title || "A question for you"}</Text>
                {/* `when` arrives ISO-8601 in UTC (network session, 17 Oct
                    2026). lib/when turns it into words, and anything it has to
                    print as a clock time goes through Australia/Sydney - a UTC
                    time shown to a tradesman here is out by ten or eleven
                    hours, and in the afternoon by a day as well. */}
                {row.when ? <Text style={s.when}>{ago(row.when)}</Text> : null}
              </View>

              {row.body ? <Text style={s.bodyText}>{row.body}</Text> : null}

              {row.answered ? (
                /*
                 * Answered rows STAY for a while, with what was said. He has
                 * to be able to see he dealt with it - a row that vanishes on
                 * the tap looks like it was lost.
                 */
                <Text style={s.answered}>
                  {"✓ "}{row.answered.text || "Answered"}
                  {row.answered.at ? ` · ${ago(row.answered.at)}` : ""}
                </Text>
              ) : (
                <>
                  <View style={s.actions}>
                    {(row.actions || []).map((a) => (
                      <Pressable
                        key={String(a.key)}
                        onPress={() => answer(row, a)}
                        disabled={sending === row.id}
                        style={({ pressed }) => [
                          s.act,
                          a.tone === "brand" && s.actBrand,
                          (pressed || sending === row.id) && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={[s.actText, a.tone === "brand" && s.actTextBrand]}>
                          {a.label || a.key}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {typing === row.id ? (
                    <View style={s.typing}>
                      <TextInput
                        style={s.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={textAction(row)?.placeholder || "Type your answer"}
                        placeholderTextColor={C.muted}
                        selectionColor={C.brand}
                        autoFocus
                        multiline
                      />
                      <View style={s.typingRow}>
                        <Pressable
                          onPress={() => { setTyping(null); setDraft(""); }}
                          style={s.act}
                        >
                          <Text style={s.actText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => answer(row, textAction(row))}
                          disabled={!draft.trim() || sending === row.id}
                          style={[s.act, s.actBrand, (!draft.trim() || sending === row.id) && s.actOff]}
                        >
                          <Text style={[s.actText, s.actTextBrand, !draft.trim() && { color: C.muted }]}>
                            {sending === row.id ? "Sending..." : "Send"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: S.screen, paddingTop: 0, paddingBottom: 24 },
  row: { marginBottom: 10, gap: 7 },
  done: { opacity: 0.62 },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  title: { flex: 1, color: C.ink, fontSize: 15.5, fontWeight: "800" },
  when: { color: C.muted, fontSize: 12 },
  bodyText: { ...T.body, fontSize: 14, lineHeight: 20 },
  answered: { ...T.small, color: C.muted, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 },
  // Glove-sized, like every other target in the app.
  act: {
    minHeight: S.touch - 8, paddingHorizontal: 15, justifyContent: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  actBrand: { backgroundColor: C.brand, borderColor: C.brand },
  actOff: { backgroundColor: C.panel, borderColor: C.line },
  actText: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
  actTextBrand: { color: "#fff" },
  typing: { gap: 8, marginTop: 4 },
  input: {
    minHeight: S.touch, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
    borderRadius: R.card, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 11,
    color: C.ink, fontSize: 15,
  },
  typingRow: { flexDirection: "row", gap: 8 },
  note: { marginTop: 10, gap: 7 },
  noteTitle: { color: C.ink, fontSize: 15.5, fontWeight: "800" },
  noteBody: { ...T.small, lineHeight: 19 },
  again: {
    marginTop: 7, alignSelf: "flex-start", minHeight: S.touch - 8,
    paddingHorizontal: 18, justifyContent: "center",
    borderRadius: R.button, borderWidth: 1, borderColor: C.line,
  },
  againText: { color: C.ink, fontSize: 14.5, fontWeight: "700" },
});
