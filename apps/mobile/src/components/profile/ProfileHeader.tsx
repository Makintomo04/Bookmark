import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { bannerPresetOf, resolveBanner } from "@bookmark/shared/banners";
import { DEFAULT_COLOUR, readerName } from "@bookmark/shared/profile";
import { STAFF_BADGE, type StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { Avatar } from "@/components/profile/Avatar";
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
  favColour: string | null;
  _count?: { books?: number };
}

// The top of a profile: banner, picture, name and bio (the web's ProfileHead, without its menus yet).
// staffBadge: "Bookmark team" or "Librarian" beside the name (packages/shared/src/staffBadge.ts).
// medals: earned milestone keys for the top-three showcase, with where pressing it goes.
export function ProfileHeader({ user, staffBadge, medals }: {
  user: ProfileUser;
  staffBadge?: StaffBadgeKind | null;
  medals?: { earned: { key: string }[]; onPress: () => void };
}) {
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
        <Avatar image={user.image} name={user.username ?? user.name} colour={colour} size={84} ring />
        <View style={{ gap: 2 }}>
          <Text variant="display">{readerName(user)}</Text>
          {staffBadge && <StaffBadge kind={staffBadge} />}
          {user.username && <Text variant="muted">@{user.username}{booksRead !== undefined ? ` · ${booksRead.toLocaleString("en-GB")} ${booksRead === 1 ? "book" : "books"} read` : ""}</Text>}
        </View>
        {user.bio ? <Text>{user.bio}</Text> : null}
        {medals && <MedalShowcase earned={medals.earned} onPress={medals.onPress} />}
      </View>
    </View>
  );
}

// Quiet on purpose, like the web's: a hairline and muted text, no brand colour or tick.
function StaffBadge({ kind }: { kind: StaffBadgeKind }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: colors.border }]} accessibilityLabel={STAFF_BADGE[kind].title}>
      <Text variant="small">{STAFF_BADGE[kind].label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 132, overflow: "hidden", marginHorizontal: -16, marginTop: -24 },
  identity: { marginTop: -42, gap: 10 },
  badge: { alignSelf: "flex-start", borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginVertical: 2 },
});
