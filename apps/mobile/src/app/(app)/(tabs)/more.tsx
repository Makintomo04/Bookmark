import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useThemePreference, type ThemePreference } from "@/lib/theme";

const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match device" },
];

// Settings and the rest of the web's user menu. For now: appearance, the account, and the legal pages.
export default function More() {
  const { preference, setPreference } = useThemePreference();
  const { user, signOut } = useAuth();

  return (
    <Screen>
      <Text variant="display">More</Text>

      <View style={styles.section}>
        <Text variant="title">Appearance</Text>
        <Segmented options={APPEARANCE} value={preference} onChange={setPreference} />
      </View>

      <View style={styles.section}>
        <Text variant="title">Account</Text>
        <Text variant="muted">Signed in as {user?.username ? `@${user.username}` : user?.email}</Text>
        <Button title="Sign out" variant="outline" onPress={signOut} />
      </View>

      <View style={styles.links}>
        <Button title="Privacy" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(webUrl("/privacy"))} />
        <Button title="Terms" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(webUrl("/terms"))} />
        <Button title="About" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(webUrl("/about"))} />
      </View>
      <Text variant="small">Bookmark {Constants.expoConfig?.version}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  links: { flexDirection: "row", gap: 12 },
});
