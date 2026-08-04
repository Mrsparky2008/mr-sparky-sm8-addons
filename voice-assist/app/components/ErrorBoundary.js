// A render error used to unmount the whole tree and leave a black screen with
// no clue what happened — on a phone there is no console to go and look at.
// This puts the actual error on screen so a photo of it is a bug report.
import { Component } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { C, S, T } from "../lib/theme";

export default class ErrorBoundary extends Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("render error:", error, info?.componentStack);
  }

  // A boundary only sees RENDER errors. Anything thrown from a touch handler,
  // a promise or a native callback would still take the app down silently, so
  // the global handler routes those here as well.
  componentDidMount() {
    const EU = globalThis.ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    this.previousHandler = EU.getGlobalHandler?.();
    EU.setGlobalHandler((error, isFatal) => {
      if (isFatal) this.setState({ error });
      this.previousHandler?.(error, isFatal);
    });
  }

  componentWillUnmount() {
    if (this.previousHandler) globalThis.ErrorUtils?.setGlobalHandler?.(this.previousHandler);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={s.wrap}>
        <Text style={s.title}>Something broke</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={s.message}>{String(error?.message || error)}</Text>
          {!!info?.componentStack && (
            <>
              <Text style={[T.label, { marginTop: 18, marginBottom: 6 }]}>Where</Text>
              <Text style={s.stack}>{String(info.componentStack).trim().split("\n").slice(0, 12).join("\n")}</Text>
            </>
          )}
          {!!error?.stack && (
            <>
              <Text style={[T.label, { marginTop: 18, marginBottom: 6 }]}>Stack</Text>
              <Text style={s.stack}>{String(error.stack).split("\n").slice(0, 12).join("\n")}</Text>
            </>
          )}
        </ScrollView>
        <Text style={s.hint}>Screenshot this and send it through.</Text>
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, padding: S.screen, paddingTop: 70 },
  title: { ...T.title, color: C.warnChipInk, marginBottom: 14 },
  message: { ...T.body, fontSize: 14 },
  stack: { color: C.muted, fontSize: 11, lineHeight: 16 },
  hint: { ...T.small, textAlign: "center", paddingTop: 10 },
});
