import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Award, Crown, Flame, Library, Mountain, Quote, ScrollText, Star, Target, Users } from "lucide-react-native";
import { useTheme } from "@/lib/theme";

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

// A medal at list size: the real medal once a rung is earned, otherwise a dashed outline of it, so
// what's still to earn reads as a goal rather than a greyed-out mistake (the web's MedalMark).
export function MedalMark({ achievementKey, earned, size }: { achievementKey: string; earned: boolean; size: number }) {
  const { colors } = useTheme();
  if (earned) return <Medal achievementKey={achievementKey} earned size={size} />;
  const Icon = ICONS[achievementKey] ?? Award;
  return (
    <View style={[styles.centre, { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border }]}>
      <Icon size={size * 0.45} strokeWidth={1.75} color={colors.mutedForeground} />
    </View>
  );
}

const RING_R = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// The medal inside a ring in its own colour that fills towards the next rung (the web's MedalRing). Not
// started yet, it's the dashed outline inside an empty ring: a goal, never a padlock.
export function MedalRing({ achievementKey, earned, percent, size }: { achievementKey: string; earned: boolean; percent: number; size: number }) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  // A sliver of ring for any progress at all, so "started" never looks like "not started".
  const shown = clamped > 0 ? Math.max(clamped, 4) : 0;
  const inner = Math.round(size * 0.76);
  return (
    <View style={[styles.centre, { width: size, height: size }]}>
      <Svg viewBox="0 0 100 100" width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: "-90deg" }] }]}>
        <Circle cx="50" cy="50" r={RING_R} fill="none" strokeWidth={4} stroke={colors.border} />
        {shown > 0 && (
          <Circle cx="50" cy="50" r={RING_R} fill="none" strokeWidth={4} strokeLinecap="round" stroke={getMedalColour(achievementKey)}
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`} strokeDashoffset={RING_CIRCUMFERENCE * (1 - shown / 100)} />
        )}
      </Svg>
      <MedalMark achievementKey={achievementKey} earned={earned} size={inner} />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: "center", justifyContent: "center" },
});
