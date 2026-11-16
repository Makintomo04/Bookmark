import { useEffect } from "react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { Literata_400Regular_Italic, Literata_600SemiBold } from "@expo-google-fonts/literata";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { setSentryUser, startSentry, wrapRoot } from "@/lib/sentry";
import { useTheme } from "@/lib/theme";

// The app's root: fonts, theme, data fetching, and which part of the app the reader can reach.
//   - signed out: the sign-in screens, (auth)
//   - signed in, onboarding not finished: setup
//   - signed in: the app, (app): the tabs and everything pushed over them
// Email sign-in links (open/signin, signin/link) work either way.

startSentry();
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Literata_600SemiBold, Literata_400Regular_Italic });
  const { status, user, restore } = useAuth();
  const { scheme, colors } = useTheme();

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    setSentryUser(user?.id);
  }, [user?.id]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const ready = fontsLoaded && status !== "loading";
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, primary: colors.brandFill, background: colors.background, card: colors.background, text: colors.foreground, border: colors.border, notification: colors.brand },
  };
  const signedIn = status === "signedIn";

  return (
    <ThemeProvider value={navigationTheme}>
      <SWRConfig value={{ fetcher, shouldRetryOnError: (e) => !(e && typeof e === "object" && "status" in e && (e as { status: number }).status < 500) }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={signedIn && !!user?.onboarded}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !user?.onboarded}>
            <Stack.Screen name="setup" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Screen name="open/signin" />
          <Stack.Screen name="signin/link" />
        </Stack>
      </SWRConfig>
    </ThemeProvider>
  );
}

// Reports render crashes and unhandled errors to Sentry (src/lib/sentry.ts).
export default wrapRoot(RootLayout);
