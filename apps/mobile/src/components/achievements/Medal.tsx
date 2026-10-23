import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Award, Crown, Flame, Library, Mountain, Quote, ScrollText, Star, Target, Users } from "lucide-react-native";

// The medals, drawn as on the web (components/achievements/Medal.tsx and achievementTheme.ts): a
// ladder medal in its own colour.

export const MEDAL_INK = "#FBF1DF";

const MEDAL_COLOURS: Record<string, string> = {
  BOOKS_READ: "#C8372D",
  PAGES_READ: "#3E7B4F",
  BIG_BOOKS: "#2C7380",
  STREAK: "#D06A2A",
  GOALS: "#B8892B",
  REVIEWS: "#8A3B5C",
  RATINGS: "#2E4F7A",
  BUDDY_READS_FINISHED: "#5B4B8A",
  BUDDY_READS_HOSTED: "#7A5A2E",
};

const ICONS: Record<string, typeof Award> = {
  BOOKS_READ: Library,
  PAGES_READ: ScrollText,
  BIG_BOOKS: Mountain,
  STREAK: Flame,
  GOALS: Target,
  REVIEWS: Quote,
  RATINGS: Star,
  BUDDY_READS_FINISHED: Users,
  BUDDY_READS_HOSTED: Crown,
};

export const getMedalColour = (key: string) => MEDAL_COLOURS[key] ?? "#6B6B6B";

// The rim is the medal colour pushed towards black, so each medal keeps its own hue.
export function shade(hex: string, amount = 0.3) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// The pill under a medal turns bronze, silver, then gold as the ladder is climbed, and black-and-gold
// once every rung is earned.
export function tierPill(earnedCount: number, total: number): { backgroundColor: string; color: string; borderColor?: string } {
  if (earnedCount === 0) return { backgroundColor: "#525252", color: "#ffffff" };
  if (earnedCount >= total) return { backgroundColor: "#0a0a0a", color: "#E9C46A", borderColor: "rgba(233,196,106,0.6)" };
  const ratio = earnedCount / total;
  if (ratio <= 1 / 3) return { backgroundColor: "#9A5B2C", color: "#ffffff" };
  if (ratio <= 2 / 3) return { backgroundColor: "#7C8894", color: "#ffffff" };
  return { backgroundColor: "#B08422", color: "#ffffff" };
}

// Unearned medals are greyed out. The web uses a grayscale filter; here the medal is redrawn in grey.
const GREY = "#7a7a7a";

export function Medal({ achievementKey, earned, size }: { achievementKey: string; earned: boolean; size: number }) {
  const Icon = ICONS[achievementKey] ?? Award;
  const colour = earned ? getMedalColour(achievementKey) : GREY;
  return (
    <View style={{ width: size, height: size, opacity: earned ? 1 : 0.4 }}>
      <Svg viewBox="0 0 100 100" width={size} height={size}>
        <Circle cx="50" cy="50" r="50" fill={shade(colour)} />
        <Circle cx="50" cy="50" r="44" fill={colour} />
        <Circle cx="50" cy="50" r="36.5" fill="none" stroke={MEDAL_INK} strokeOpacity={0.45} strokeWidth={1.5} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>
        <Icon size={size * 0.4} strokeWidth={1.75} color={MEDAL_INK} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: "center", justifyContent: "center" },
});
