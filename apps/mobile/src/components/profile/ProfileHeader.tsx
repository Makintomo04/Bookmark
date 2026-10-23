import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { bannerPresetOf, resolveBanner } from "@bookmark/shared/banners";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { Avatar } from "@/components/profile/Avatar";
import { BannerPattern } from "@/components/profile/BannerPattern";
import { Text } from "@/components/ui/Text";

export interface ProfileUser {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  banner: string | null;
  bio: string | null;
  favColour: string | null;
  _count?: { books?: number };
}

// The top of a profile: banner, picture, name and bio (the web's ProfileHead, without its menus yet).
export function ProfileHeader({ user }: { user: ProfileUser }) {
  const colour = user.favColour || DEFAULT_COLOUR;
  const banner = resolveBanner(user.banner, user.id);
  const preset = bannerPresetOf(banner);
  const booksRead = user._count?.books ?? 0;
  return (
    <View>
      <View style={styles.banner}>
        {preset ? <BannerPattern preset={preset} colour={colour} /> : <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      </View>
      <View style={styles.identity}>
        <Avatar image={user.image} name={user.username ?? user.name} colour={colour} size={84} ring />
        <View style={{ gap: 2 }}>
          <Text variant="display">{user.name || user.username}</Text>
          {user.username && <Text variant="muted">@{user.username} · {booksRead.toLocaleString("en-GB")} {booksRead === 1 ? "book" : "books"} read</Text>}
        </View>
        {user.bio ? <Text>{user.bio}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 132, overflow: "hidden", marginHorizontal: -16, marginTop: -24 },
  identity: { marginTop: -42, gap: 10 },
});
