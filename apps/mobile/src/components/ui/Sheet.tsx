import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A sheet that rises from the bottom, for the web's small modals (an achievement's milestones, say).
// Tapping outside or the close button dismisses it.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", width: "100%", maxWidth: 560, alignSelf: "center", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
});
