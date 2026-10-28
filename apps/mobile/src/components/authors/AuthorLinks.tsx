import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as WebBrowser from "expo-web-browser";
import { AtSign, Globe } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import type { AuthorLink, AuthorLinkKind } from "@/lib/authors";
import { useTheme } from "@/lib/theme";

// Brand marks from Font Awesome Free 6 (CC BY 4.0, fontawesome.com), the same ones the web uses through
// react-icons. lucide has no brand icons; Bluesky gets lucide's "@" as on the web.
const BRAND_PATHS: Partial<Record<AuthorLinkKind, { viewBox: string; d: string }>> = {
  instagram: {
    viewBox: "0 0 448 512",
    d: "M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z",
  },
  x: {
    viewBox: "0 0 512 512",
    d: "M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z",
  },
  tiktok: {
    viewBox: "0 0 448 512",
    d: "M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z",
  },
};

const NAMES: Record<AuthorLinkKind, string> = { website: "website", instagram: "Instagram", x: "X", tiktok: "TikTok", bluesky: "Bluesky" };

function LinkIcon({ kind, color }: { kind: AuthorLinkKind; color: string }) {
  const brand = BRAND_PATHS[kind];
  if (brand) return <Svg width={14} height={14} viewBox={brand.viewBox}><Path d={brand.d} fill={color} /></Svg>;
  const Icon = kind === "website" ? Globe : AtSign;
  return <Icon size={14} color={color} />;
}

// An author's website and social accounts (the web's AboutAuthor link row). Each opens in the in-app browser.
export function AuthorLinks({ name, links }: { name: string; links: AuthorLink[] }) {
  const { colors } = useTheme();
  if (links.length === 0) return null;
  return (
    <View style={styles.row}>
      {links.map((link) => (
        <Pressable
          key={link.kind}
          accessibilityRole="link"
          accessibilityLabel={link.kind === "website" ? `${name}'s website, ${link.label}` : `${name} on ${NAMES[link.kind]}, ${link.label}`}
          onPress={() => WebBrowser.openBrowserAsync(link.url)}
          style={({ pressed }) => [styles.chip, { borderColor: pressed ? colors.brand : colors.border }]}
        >
          <LinkIcon kind={link.kind} color={colors.mutedForeground} />
          <Text variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
