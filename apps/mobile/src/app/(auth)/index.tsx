import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { PITCH } from "@bookmark/shared/pitch";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";

// The first screen for a signed-out reader: the mark with the web's headline under it (the words live in
// @bookmark/shared/pitch), and the two ways in. The rest of the pitch is left to the store page and the
// website. If the app has just signed itself out (a suspension), it says why above the mark.
export default function Welcome() {
  const notice = useAuth((s) => s.notice);
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      {notice && <Notice tone="error" message={notice} />}
      <View style={styles.mark}>
        <Logo size={64} />
        <Text variant="display" accessibilityRole="header" style={styles.headline}>{PITCH.headline}</Text>
      </View>
      <View style={styles.actions}>
        <Button title="Create an account" onPress={() => router.push("/register")} />
        <Button title="Sign in" variant="outline" onPress={() => router.push("/sign-in")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, paddingHorizontal: 8 },
  // Narrow enough that the headline breaks into three even lines rather than stranding "app." on its own.
  headline: { textAlign: "center", maxWidth: 270 },
  actions: { gap: 12, paddingBottom: 8 },
});
