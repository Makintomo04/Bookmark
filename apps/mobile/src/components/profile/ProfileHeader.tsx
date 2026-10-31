import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Link2 } from "lucide-react-native";
import { bannerPresetOf, resolveBanner } from "@bookmark/shared/banners";
import { DEFAULT_COLOUR, profileLinkLabel, readerName } from "@bookmark/shared/profile";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { MedalShowcase } from "@/components/achievements/MedalShowcase";
import { BannerPattern } from "@/components/profile/BannerPattern";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

export interface ProfileUser {
  id: string;
  name: string | null;
  username: string | null;
  // Set by the reader; the username heads the profile when unset.
  displayName?: string | null;
  image: string | null;
  banner: string | null;
  bio: string | null;
  // Their links (TikTok, a newsletter…), as chips under the bio. Missing on older payloads.
  profileLinks?: string[];
  favColour: string | null;
  _count?: { books?: number };
}

// The top of a profile: banner, picture, name and bio (the web's ProfileHead, without its menus yet).
// staffBadge: "Bookmark team" or "Librarian", a seal on the avatar's corner (packages/shared/src/staffBadge.ts).
// medals: earned milestone keys for the top-three showcase, with where pressing it goes.
export function ProfileHeader({ user, staffBadge, medals }: {
  user: ProfileUser;
  staffBadge?: StaffBadgeKind | null;
  medals?: { earned: { key: string }[]; onPress: () => void };
}) {
  const { colors } = useTheme();
  const colour = user.favColour || DEFAULT_COLOUR;
  const banner = resolveBanner(user.banner, user.id);
  const preset = bannerPresetOf(banner);
  // Only when known: a restricted profile doesn't say how much they read.
  const booksRead = user._count?.books;
  return (
    <View>
      <View style={styles.banner}>
        {preset ? <BannerPattern preset={preset} colour={colour} /> : <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      </View>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Avatar image={user.image} name={user.username ?? user.name} colour={colour} size={84} ring />
          {staffBadge && <StaffSeal kind={staffBadge} name={readerName(user)} size={28} cutOut shine style={styles.seal} />}
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="display">{readerName(user)}</Text>
          {user.username && <Text variant="muted">@{user.username}{booksRead !== undefined ? ` · ${booksRead.toLocaleString("en-GB")} ${booksRead === 1 ? "book" : "books"} read` : ""}</Text>}
        </View>
        {user.bio ? <Text>{user.bio}</Text> : null}
        {user.profileLinks && user.profileLinks.length > 0 && (
          <View style={styles.links} accessibilityLabel="Links">
            {user.profileLinks.map((link) => (
              <Pressable
                key={link}
                accessibilityRole="link"
                accessibilityHint="Opens outside Bookmark"
                onPress={() => void Linking.openURL(link).catch(() => {})}
                style={({ pressed }) => [styles.link, { backgroundColor: pressed ? colors.border : colors.muted }]}
              >
                <Link2 size={14} color={colors.foreground} />
                <Text variant="label">{profileLinkLabel(link)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {medals && <MedalShowcase earned={medals.earned} onPress={medals.onPress} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 132, overflow: "hidden", marginHorizontal: -16, marginTop: -24 },
  identity: { marginTop: -42, gap: 10 },
  avatar: { alignSelf: "flex-start" },
  seal: { position: "absolute", right: 0, bottom: 5 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999 },
});
