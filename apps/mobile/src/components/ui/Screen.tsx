import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

// A screen's page ground, inside the safe area, scrolling and clear of the keyboard. Content is capped
// at a readable width on tablets and the web build, with the 16px gutter phones get.
export function Screen({ children, scroll = true, edges = ["top", "left", "right"] }: { children: ReactNode; scroll?: boolean; edges?: Edge[] }) {
  const { colors } = useTheme();
  const body = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flexGrow: 1, width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 24, gap: 16 },
});
