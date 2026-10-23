import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Award, BookOpen, Crown, Flame, Flower2, Leaf, Library, Moon, Mountain, Quote, ScrollText, Snowflake, Sparkles, Star, Sun, Target, Users } from "lucide-react-native";
import type { QuestMedalDesign } from "@bookmark/shared/questRules";

// The medals, drawn as on the web (components/achievements/Medal.tsx, QuestMedal.tsx and
// achievementTheme.ts): a ladder medal in its own colour, and the limited-edition quest rosette.

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

const QUEST_ICONS: Record<string, typeof Award> = {
  leaf: Leaf,
  snowflake: Snowflake,
  flower: Flower2,
  sun: Sun,
  mountain: Mountain,
  book: BookOpen,
  sparkles: Sparkles,
  moon: Moon,
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

// A limited-edition medal: the round face in the quest's colourway, a dashed inner ring and a star at
// the top for "limited", hanging from two notched ribbon tails like a rosette. `width` sets the size.
export function QuestMedal({ design, earned, width, style }: { design: QuestMedalDesign; earned: boolean; width: number; style?: ViewStyle }) {
  const Icon = QUEST_ICONS[design.icon] ?? BookOpen;
  const colour = earned ? design.colour : GREY;
  const ribbon = earned ? design.ribbon : "#9a9a9a";
  const height = width * 1.18;
  return (
    <View style={[{ width, height, opacity: earned ? 1 : 0.4 }, style]}>
      <Svg viewBox="0 0 100 118" width={width} height={height}>
        <Path d="M30 62 L16 114 L25 107 L31 117 L46 66 Z" fill={ribbon} />
        <Path d="M70 62 L84 114 L75 107 L69 117 L54 66 Z" fill={shade(ribbon, 0.25)} />
        <Circle cx="50" cy="50" r="50" fill={shade(colour)} />
        <Circle cx="50" cy="50" r="44" fill={colour} />
        <Circle cx="50" cy="50" r="37" fill="none" stroke={MEDAL_INK} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="3 3.2" />
        <Path d="M50 1.5 L52.6 7 L58.5 7.6 L54 11.5 L55.4 17.3 L50 14.3 L44.6 17.3 L46 11.5 L41.5 7.6 L47.4 7 Z" fill={MEDAL_INK} />
      </Svg>
      <View style={{ position: "absolute", left: width * 0.3, top: height * 0.254, width: width * 0.4, height: width * 0.4 }}>
        <Icon size={width * 0.4} strokeWidth={1.75} color={MEDAL_INK} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: "center", justifyContent: "center" },
});
