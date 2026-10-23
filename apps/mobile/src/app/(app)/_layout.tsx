import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { registerForPush, usePushNavigation } from "@/lib/push";
import { useTheme } from "@/lib/theme";

// The signed-in app: the tabs, and the screens that open over them (a book, adding a book, a reading
// circle). Pushes are registered here, once onboarding is done.
export default function AppLayout() {
  const { colors, fonts } = useTheme();

  useEffect(() => {
    void registerForPush();
  }, []);
  usePushNavigation();

  // Arriving from onboarding with somewhere to go (a book to add, a circle to start).
  const pendingPath = useAuth((s) => s.pendingPath);
  useEffect(() => {
    if (!pendingPath) return;
    useAuth.getState().setPendingPath(null);
    router.push(pendingPath as never);
  }, [pendingPath]);

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.foreground,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fonts.sansSemibold, fontSize: 17 },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="book/[id]" options={{ title: "" }} />
      <Stack.Screen name="add-book" options={{ title: "Add a book", presentation: "modal" }} />
      <Stack.Screen name="book/edit/[id]" options={{ title: "Edit details" }} />
      <Stack.Screen name="profile/edit" options={{ title: "Edit profile" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="search" options={{ title: "Find readers" }} />
      <Stack.Screen name="u/[username]" options={{ title: "" }} />
      <Stack.Screen name="lists/[id]" options={{ title: "" }} />
      <Stack.Screen name="discover/genre/[slug]" options={{ title: "" }} />
      <Stack.Screen name="discover/ask" options={{ title: "" }} />
      <Stack.Screen name="stats" options={{ title: "Stats" }} />
      <Stack.Screen name="wrapped/[year]" options={{ title: "Wrapped" }} />
      <Stack.Screen name="achievements" options={{ title: "Achievements" }} />
      <Stack.Screen name="quests/index" options={{ title: "Quests" }} />
      <Stack.Screen name="quests/[slug]" options={{ title: "" }} />
      <Stack.Screen name="circles/[id]" options={{ title: "Reading circle" }} />
      <Stack.Screen name="circles/new" options={{ title: "Start a reading circle", presentation: "modal" }} />
      <Stack.Screen name="circles/join/[code]" options={{ title: "Reading circle" }} />
      <Stack.Screen name="circles/schedule/[id]" options={{ title: "Schedule" }} />
    </Stack>
  );
}
