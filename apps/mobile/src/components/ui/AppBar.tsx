import { StyleSheet, View } from "react-native";
import { NotificationBell } from "@/components/social/NotificationBell";
import { Logo } from "./Logo";
import { Text } from "./Text";
import { useTheme } from "@/lib/theme";

// The top of each tab, after the web's header: the mark and the wordmark in the display serif, and the bell.
// It scrolls with the page, so a tab's own title sits right under it. Kept short: as tall as the bell (40),
// just under the status bar (cancelling most of the page's 24px top padding), and 4px off the page's gap
// below, so about 56px in all rather than 80.
export function AppBar() {
  const { fonts } = useTheme();
  return (
    <View style={styles.bar}>
      <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="Bookmark">
        <Logo size={20} />
        <Text style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 }}>Bookmark</Text>
      </View>
      <NotificationBell />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 40, marginTop: -20, marginBottom: -4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
});
