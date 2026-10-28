import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { isWrappedSeason } from "@bookmark/shared/wrappedSeason";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import useSWR from "swr";
import { staffBadgeOf } from "@bookmark/shared/staffBadge";
import { StaffSeal } from "@/components/profile/StaffSeal";

// The rest of the web's user menu: your reading, then the account (settings, Plus, import), and the legal pages.
export default function More() {
  const { user, signOut } = useAuth();
  // The session keeps only who you are; /api/user (cached by the profile tab) has your role.
  const { data: me } = useSWR<{ role?: string | null; isStaff?: boolean | null; hideStaffBadge?: boolean | null }>("/api/user");
  const ownSeal = staffBadgeOf(me);

  return (
    <Screen>
      <Text variant="display">More</Text>

      <View style={styles.section}>
        <Text variant="title">Your reading</Text>
        <Button title="Stats" variant="outline" onPress={() => router.push("/stats")} />
        <Button title="Achievements" variant="outline" onPress={() => router.push("/achievements")} />
        {/* From 1 December, as in the web's menu. Every year with a Wrapped is linked from Stats. */}
        {isWrappedSeason() && <Button title={`Your ${new Date().getFullYear()} Wrapped`} variant="outline" onPress={() => router.push(`/wrapped/${new Date().getFullYear()}`)} />}
      </View>

      <View style={styles.section}>
        <Text variant="title">Account</Text>
        <View style={styles.signedIn}>
          <Text variant="muted">Signed in as {user?.username ? `@${user.username}` : user?.email}</Text>
          {ownSeal && <StaffSeal kind={ownSeal} size={18} />}
        </View>
        <Button title="Settings" variant="outline" onPress={() => router.push("/settings" as never)} />
        <Button title="Bookmark Plus" variant="outline" onPress={() => router.push("/plus" as never)} />
        <Button title="Import from Goodreads or StoryGraph" variant="outline" onPress={() => router.push("/import" as never)} />
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
  signedIn: { flexDirection: "row", alignItems: "center", gap: 6 },
  section: { gap: 10 },
  links: { flexDirection: "row", gap: 12 },
});
