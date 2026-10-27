import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { PITCH } from "@bookmark/shared/pitch";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";

// The first screen for a signed-out reader. Same promise as the web's landing page (the words live in @bookmark/shared/pitch). If the app has just
// signed itself out (a suspension), it says why above the promise.
export default function Welcome() {
  const notice = useAuth((s) => s.notice);
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View style={styles.hero}>
        {notice && <Notice tone="error" message={notice} />}
        <Logo size={48} />
        <Text variant="hero">{PITCH.headline}</Text>
        <Text variant="muted" style={styles.lede}>
          {PITCH.lede}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Create an account" onPress={() => router.push("/register")} />
        <Button title="Sign in" variant="outline" onPress={() => router.push("/sign-in")} />
        <Text variant="small" style={styles.footnote}>{PITCH.importLine}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: "center", gap: 20, paddingTop: 24 },
  lede: { fontSize: 16, lineHeight: 24 },
  actions: { gap: 12, paddingBottom: 8 },
  footnote: { textAlign: "center", marginTop: 4 },
});
