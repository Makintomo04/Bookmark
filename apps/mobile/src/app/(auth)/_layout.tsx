import { Stack } from "expo-router";
import { useTheme } from "@/lib/theme";

// The signed-out screens: welcome, then sign in, create an account, or an email link.
export default function AuthLayout() {
  const { colors, fonts } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: "",
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.foreground,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fonts.sansSemibold },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
