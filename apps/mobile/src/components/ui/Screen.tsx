import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

// A screen's page ground, inside the safe area, scrolling and clear of the keyboard. Content is capped
// at a readable width on tablets and the web build, with the 16px gutter phones get.
export function Screen({ children, scroll = true, edges = ["top", "left", "right"] }: { children: ReactNode; scroll?: boolean; edges?: Edge[] }) {
  const { colors } = useTheme();
  const scroller = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const keyboard = useAndroidKeyboard(scroller, offset);
  const body = <View style={[styles.content, !scroll && { paddingBottom: 24 + keyboard }]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            ref={scroller}
            contentContainerStyle={[styles.scroll, { paddingBottom: keyboard }]}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={64}
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Android draws edge to edge (Android 15 on), so the window no longer shrinks for the keyboard and a field low
// on the page sat under it. KeyboardAvoidingView's padding hung the app there (it measures itself against the
// keyboard while the keyboard animates), so instead, once the keyboard is up, the page gets its height as room
// at the bottom and scrolls the field being typed in clear of it.
const CLEARANCE = 24;
function useAndroidKeyboard(scroller: RefObject<ScrollViewInstance | null>, offset: RefObject<number>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      setHeight(e.endCoordinates.height);
      const top = e.endCoordinates.screenY;
      // After the room is added, so there's somewhere to scroll to.
      setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        input?.measureInWindow((_x, y, _w, h) => {
          const under = y + h + CLEARANCE - top;
          if (under > 0) scroller.current?.scrollTo({ y: offset.current + under, animated: true });
        });
      }, 50);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [scroller, offset]);
  return height;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flexGrow: 1, width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 24, gap: 16 },
});
