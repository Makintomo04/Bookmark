import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";

// The first screen for a signed-out reader. Same promise as the web's landing page.
export default function Welcome() {
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View style={styles.hero}>
        <Logo size={48} />
        <Text variant="hero">Read with your friends. Nobody gets spoiled.</Text>
        <Text variant="muted" style={styles.lede}>
          The group chat for your book, minus the {"‘"}don{"’"}t read past chapter 12{"’"}. Everyone reads at their own pace, and comments stay hidden until you catch up.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Create an account" onPress={() => router.push("/register")} />
        <Button title="Sign in" variant="outline" onPress={() => router.push("/sign-in")} />
        <Text variant="small" style={styles.footnote}>Paperback, ebook or audiobook: everyone reads their own copy.</Text>
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
