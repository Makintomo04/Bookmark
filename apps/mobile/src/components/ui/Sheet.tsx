import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A sheet that rises from the bottom, for the web's small modals (an achievement's milestones, say).
// Tapping outside or the close button dismisses it. It rises above the keyboard, so a field in it (the
// put-up sheet's search) stays in sight while typing.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const frame = useRef<ViewInstance>(null);
  const keyboard = useKeyboardOverlap(frame);
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View ref={frame} style={[styles.fill, { paddingBottom: keyboard }]}>
        <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: (keyboard ? 0 : insets.bottom) + 16 }]}>
          <View style={styles.header}>
            <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// How far the keyboard reaches over the sheet's frame. Measured rather than assumed: Android draws edge to
// edge, so whether the modal's window shrinks for the keyboard differs by version, and only the part still
// covered needs lifting (Screen does the same for pages; KeyboardAvoidingView hung Android there).
function useKeyboardOverlap(frame: RefObject<ViewInstance | null>) {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const shown = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      const top = e.endCoordinates.screenY;
      frame.current?.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, y + h - top)));
    });
    const hidden = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setOverlap(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [frame]);
  return overlap;
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", width: "100%", maxWidth: 560, alignSelf: "center", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
});
