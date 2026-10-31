import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { startPurchases } from "@/lib/purchases";
import { registerForPush, usePushNavigation } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { EarnCelebration } from "@/components/achievements/EarnCelebration";
import { RemindersSheet } from "@/components/reminders/RemindersSheet";
import { RoleWelcome } from "@/components/staff/RoleWelcome";

// The signed-in app: the tabs, and the screens that open over them (a book, adding a book, a reading
// circle, a club). Pushes are registered here, once onboarding is done.
export default function AppLayout() {
  const { colors, fonts } = useTheme();

  useEffect(() => {
    void registerForPush();
  }, []);

  // RevenueCat knows the reader by their Bookmark id, so a store purchase lands on the right account.
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (userId) void startPurchases(userId);
  }, [userId]);
  usePushNavigation();

  // Arriving from onboarding with somewhere to go (a book to add, a circle to start).
  const pendingPath = useAuth((s) => s.pendingPath);
  useEffect(() => {
    if (!pendingPath) return;
    useAuth.getState().setPendingPath(null);
    router.push(pendingPath as never);
  }, [pendingPath]);

  return (
    <>
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
        <Stack.Screen name="shelf/[shelf]" options={{ title: "" }} />
        <Stack.Screen name="profile/edit" options={{ title: "Edit profile" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="search" options={{ title: "Find readers" }} />
        <Stack.Screen name="u/[username]" options={{ title: "" }} />
        <Stack.Screen name="u/[username]/achievements" options={{ title: "Achievements" }} />
        <Stack.Screen name="u/[username]/reviews" options={{ title: "Reviews" }} />
        <Stack.Screen name="lists/[id]" options={{ title: "" }} />
        <Stack.Screen name="discover/genre/[slug]" options={{ title: "" }} />
        <Stack.Screen name="authors/[slug]" options={{ title: "" }} />
        <Stack.Screen name="discover/ask" options={{ title: "" }} />
        <Stack.Screen name="stats" options={{ title: "Stats" }} />
        <Stack.Screen name="stats-explore" options={{ title: "Explore" }} />
        <Stack.Screen name="wrapped/[year]" options={{ title: "Wrapped" }} />
        <Stack.Screen name="plus" options={{ title: "Plus" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="import" options={{ title: "Import" }} />
        <Stack.Screen name="first-book" options={{ title: "" }} />
        <Stack.Screen name="achievements" options={{ title: "Achievements" }} />
        <Stack.Screen name="circles/[id]" options={{ title: "Reading circle" }} />
        <Stack.Screen name="circles/new" options={{ title: "Start a reading circle", presentation: "modal" }} />
        <Stack.Screen name="circles/join/[code]" options={{ title: "Reading circle" }} />
        <Stack.Screen name="circles/schedule/[id]" options={{ title: "Schedule" }} />
        <Stack.Screen name="clubs/[id]" options={{ title: "Club" }} />
        <Stack.Screen name="clubs/new" options={{ title: "Start a club", presentation: "modal" }} />
        <Stack.Screen name="clubs/join/[code]" options={{ title: "Club" }} />
      </Stack>
      {/* Medals and tier-ups as they're earned, over whichever screen saved them. */}
      <EarnCelebration />
      {/* After a first finished book, once: the reminders on offer. */}
      <RemindersSheet />
      {/* Once per new staff role, as on the web. */}
      <RoleWelcome />
    </>
  );
}
