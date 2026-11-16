import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { BadgeCheck, ChartColumn, ChevronRight, Download, Gift, LogOut, Settings, ShieldCheck, Trophy } from "lucide-react-native";
import { isWrappedSeason } from "@bookmark/shared/wrappedSeason";
import { DEFAULT_COLOUR, readerName } from "@bookmark/shared/profile";
import { Avatar } from "@/components/profile/Avatar";
import { AppBar } from "@/components/ui/AppBar";
import { ListGroup, ListRow } from "@/components/ui/ListGroup";
import { Screen } from "@/components/ui/Screen";
import { cardStyle } from "@/components/ui/Section";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";
import { openWebSignedIn } from "@/lib/webSignedIn";
import useSWR from "swr";
import { staffBadgeOf } from "@bookmark/shared/staffBadge";
import { isStaffRole } from "@bookmark/shared/roles";
import { StaffSeal } from "@/components/profile/StaffSeal";

// The rest of the web's user menu: who you're signed in as, your reading, the account (settings, Plus,
// import), and the legal pages. Grouped lists, as in a phone's settings.
export default function More() {
  const { colors, radii, fonts } = useTheme();
  const { user, signOut } = useAuth();
  // The session keeps only who you are; /api/user (cached by the profile tab) has your picture and role.
  const { data: me } = useSWR<{ username?: string | null; displayName?: string | null; name?: string | null; image?: string | null; favColour?: string | null; role?: string | null; isStaff?: boolean | null; hideStaffBadge?: boolean | null }>("/api/user");
  const ownSeal = staffBadgeOf(me);
  const year = new Date().getFullYear();
  const username = me?.username ?? user?.username;

  return (
    <Screen>
      <AppBar />
      <Text variant="display" accessibilityRole="header">More</Text>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Your profile, signed in as ${username ? `@${username}` : user?.email}`}
        onPress={() => router.navigate("/")}
        style={({ pressed }) => [styles.me, cardStyle(colors, radii.lg, pressed, colors.muted)]}
      >
        <Avatar image={me?.image ?? null} name={username ?? user?.email ?? "?"} colour={me?.favColour || DEFAULT_COLOUR} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.name}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 24 }}>{me ? readerName(me) : username ?? ""}</Text>
            {ownSeal && <StaffSeal kind={ownSeal} size={16} pressable={false} />}
          </View>
          <Text variant="muted" numberOfLines={1}>{username ? `@${username}` : user?.email}</Text>
        </View>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>

      <View style={styles.groups}>
        <ListGroup label="Your reading">
          <ListRow icon={ChartColumn} label="Stats" onPress={() => router.push("/stats")} />
          <ListRow icon={Trophy} label="Achievements" onPress={() => router.push("/achievements")} />
          {/* From 1 December, as in the web's menu. Every year with a Wrapped is linked from Stats. */}
          {isWrappedSeason() && <ListRow icon={Gift} label={`Your ${year} Wrapped`} onPress={() => router.push(`/wrapped/${year}`)} />}
        </ListGroup>

        <ListGroup label="Account">
          <ListRow icon={Settings} label="Settings" onPress={() => router.push("/settings" as never)} />
          <ListRow icon={BadgeCheck} label="Bookmark Plus" onPress={() => router.push("/plus" as never)} />
          <ListRow icon={Download} label="Import from Goodreads or StoryGraph" onPress={() => router.push("/import" as never)} />
          {/* The staff console stays on the web, opened signed in; the server checks the role again there. */}
          {isStaffRole(me) && <ListRow icon={ShieldCheck} label="Staff console" accessibilityHint="Opens on the web" onPress={() => void openWebSignedIn("/staff")} />}
        </ListGroup>

        <ListGroup>
          <ListRow icon={LogOut} label="Sign out" tone="danger" chevron={false} onPress={signOut} />
        </ListGroup>
      </View>

      <View style={styles.footer}>
        <View style={styles.links}>
          <FooterLink label="Privacy" path="/privacy" />
          <Text variant="small" aria-hidden>·</Text>
          <FooterLink label="Terms" path="/terms" />
          <Text variant="small" aria-hidden>·</Text>
          <FooterLink label="About" path="/about" />
        </View>
        <Text variant="small">Bookmark {Constants.expoConfig?.version}</Text>
      </View>
    </Screen>
  );
}

function FooterLink({ label, path }: { label: string; path: string }) {
  return (
    <Pressable accessibilityRole="link" hitSlop={10} onPress={() => WebBrowser.openBrowserAsync(webUrl(path))}>
      <Text variant="muted">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  name: { flexDirection: "row", alignItems: "center", gap: 6 },
  groups: { gap: 24, marginTop: 8 },
  footer: { gap: 8, marginTop: 8, alignItems: "flex-start" },
  links: { flexDirection: "row", alignItems: "center", gap: 10 },
});
