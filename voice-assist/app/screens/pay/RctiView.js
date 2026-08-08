// The RCTI.
//
// The one screen on the Pay side that is deliberately not native. The portal
// renders this document on demand from the FROZEN claim — never from a fresh
// calculation — so rebuilding it here would mean recomputing an invoice on a
// phone, which is the exact thing the whole Pay tab is built to avoid.
//
// So it is shown as what it is: a document. And because it is a document,
// getting it off the phone matters more than how it scrolls — print turns the
// same HTML into a PDF that can go to an accountant or into an email.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Card, Cta, Empty, Header } from "../../components/ui";
import { C, S, T } from "../../lib/theme";
import * as portal from "../../lib/portal";

export default function RctiView({ claim, name, onBack }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHtml(await portal.rctiHtml({ claimId: claim.claimId, name }));
    } catch (err) {
      setError(err);
    }
  }, [claim?.claimId, name]);

  useEffect(() => { load(); }, [load]);

  async function share() {
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (err) {
      setError(err);
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="RCTI" meta={claim?.rctiNumber || claim?.claimId} onBack={onBack} />
      {error ? (
        <View style={s.pad}>
          <Card style={{ borderColor: C.active }}>
            <Text style={[T.body, { color: C.warnChipInk }]}>{error.message}</Text>
          </Card>
          <View style={{ height: S.gap }} />
          <Cta label="Try again" onPress={load} />
        </View>
      ) : !html ? (
        <Empty>Building the document…</Empty>
      ) : (
        <>
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            style={s.web}
            // A document, not an app. The inline HTML loads as about:blank, so
            // allowing that and refusing http(s) lets it render while stopping
            // anything in it from navigating the view somewhere else.
            onShouldStartLoadWithRequest={(req) => !/^https?:/i.test(req.url || "")}
          />
          <View style={s.pad}>
            <Cta
              label={sharing ? "Preparing…" : "Send as PDF"}
              disabled={sharing}
              onPress={share}
            />
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pad: { padding: S.screen, paddingTop: 0 },
  web: { flex: 1, backgroundColor: "#fff" },
});
