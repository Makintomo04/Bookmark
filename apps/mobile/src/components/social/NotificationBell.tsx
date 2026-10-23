import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { Bell } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// The bell, with how many are unread. Checks every 30 seconds while open, like the web's; pushes do the
// rest when the app is closed.
export function NotificationBell({ color }: { color?: string } = {}) {
  const { colors } = useTheme();
  const { data } = useSWR<{ unreadCount: number }>("/api/notifications", { refreshInterval: 30_000 });
  const unread = data?.unreadCount ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
      hitSlop={8}
      onPress={() => router.push("/notifications")}
      style={styles.bell}
    >
      <Bell size={22} color={color ?? colors.foreground} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.brandFill }]}>
          <Text style={{ color: colors.onBrand, fontSize: 10, lineHeight: 12 }}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center" },
});
