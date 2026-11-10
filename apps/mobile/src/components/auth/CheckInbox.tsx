import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Mail } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// After creating an account or asking for a sign-in link: one calm, centred message, then what to do next.
export function CheckInbox({ message, note, children }: { message: string; note: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: colors.muted }]}>
          <Mail size={26} strokeWidth={1.75} color={colors.foreground} />
        </View>
        <Text variant="display" accessibilityRole="header" style={styles.center}>Check your inbox</Text>
        <Text style={[styles.center, { lineHeight: 24 }]}>{message}</Text>
        <Text variant="muted" style={styles.center}>{note}</Text>
        <View style={styles.actions}>{children}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, paddingBottom: 48 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  center: { textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 8, marginTop: 16, alignItems: "center" },
});
