import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";
import Constants from "expo-constants";

const configuredUrl = Constants.expoConfig?.extra?.portalUrl;
const portalUrl = typeof configuredUrl === "string" ? configuredUrl : "";
const validPortal = (() => {
  try {
    const url = new URL(portalUrl);
    return url.protocol === "https:" && url.hostname !== "example.edu";
  } catch {
    return false;
  }
})();
const portalOrigin = validPortal ? new URL(portalUrl).origin : "";

export default function App() {
  const browser = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      browser.current?.goBack();
      return true;
    });
    return () => listener.remove();
  }, [canGoBack]);

  if (!validPortal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.message}>
          <Text style={styles.title}>CampusHub setup</Text>
          <Text style={styles.description}>Configure an HTTPS portal URL in app.json before starting the mobile application.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#102b5a" />
      <View style={styles.header}>
        <View><Text style={styles.brand}>CampusHub</Text><Text style={styles.subtitle}>School & college portal</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Go to portal home" onPress={() => browser.current?.injectJavaScript("window.location.href = '/'; true;")}>
          <Text style={styles.home}>Home</Text>
        </Pressable>
      </View>
      {failed ? (
        <View style={styles.message}>
          <Text style={styles.title}>Connection unavailable</Text>
          <Text style={styles.description}>Check your internet connection and confirm the school portal is online.</Text>
          <Pressable style={styles.retry} onPress={() => { setFailed(false); browser.current?.reload(); }}>
            <Text style={styles.retryText}>Retry connection</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.web, failed && styles.hidden]}>
        <WebView
          ref={browser}
          source={{ uri: portalUrl }}
          originWhitelist={["https://*"]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled={false}
          allowFileAccess={false}
          mixedContentMode="never"
          sharedCookiesEnabled={false}
          setSupportMultipleWindows={false}
          onNavigationStateChange={(event: WebViewNavigation) => setCanGoBack(event.canGoBack)}
          onLoadStart={() => { setBusy(true); setFailed(false); }}
          onLoadEnd={() => setBusy(false)}
          onError={() => { setBusy(false); setFailed(true); }}
          onShouldStartLoadWithRequest={(request) => {
            try {
              const url = new URL(request.url);
              if (url.origin === portalOrigin) return true;
              if (["https:", "mailto:", "tel:"].includes(url.protocol)) {
                void Linking.openURL(request.url).catch(() => {});
              }
            } catch {
              // Block malformed and unrecognized URLs.
            }
            return false;
          }}
        />
        {busy && <View style={styles.spinner}><ActivityIndicator size="large" color="#2563eb" /></View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { backgroundColor: "#102b5a", paddingVertical: 14, paddingHorizontal: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: "#fff", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#b7d0f9", fontSize: 11, letterSpacing: 1, marginTop: 3 },
  home: { color: "#fff", fontWeight: "700", padding: 10 },
  web: { flex: 1 },
  hidden: { display: "none" },
  spinner: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  message: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  title: { fontSize: 24, fontWeight: "800", color: "#152c53", textAlign: "center" },
  description: { color: "#66768e", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 14 },
  retry: { marginTop: 22, borderRadius: 11, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: "#245bd1" },
  retryText: { color: "#fff", fontWeight: "700" },
});
