import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import useSWR from "swr";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Check, Lock } from "lucide-react-native";
import { closestMilestones, countsUp, toNextText } from "@bookmark/shared/achievements-catalog";
import { READER_TIERS, tierProgress, type ReaderTier } from "@bookmark/shared/readerTier";
import { Medal, MedalRing, MEDAL_INK, getMedalColour, tierPill } from "@/components/achievements/Medal";
import type { ProfileUser } from "@/components/profile/ProfileHeader";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// Achievements (the web's /achievements): the reading tier, the three rungs the reader is closest to,
// then every medal. Select one to see its milestones.

type Milestone = { value: number; title: string; description: string; earned: boolean; earnedAt: string | null };
type Achievement = { key: string; title: string; category: string; current: number; milestones: Milestone[] };

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-GB");
// "100K" fits on a medal pill; "100,000" doesn't.
const formatPill = (n: number) => (n >= 10000 ? compact.format(n) : full.format(n));
const formatNumber = (n: number) => full.format(n);
const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();
const formatEarned = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear(d) ? {} : { year: "numeric" }) }); };

function summarise(a: Achievement) {
  const earned = a.milestones.filter((m) => m.earned);
  const highest = earned[earned.length - 1] ?? null;
  const next = a.milestones.find((m) => !m.earned) ?? null;
  const percent = next ? Math.max(0, Math.min(100, Math.round((a.current / next.value) * 100))) : 100;
  return { earned, highest, next, percent, total: a.milestones.length };
}

// One line on where a ladder stands: the rung reached and what the next takes, or how to start it.
function standing(a: Achievement): string {
  const { highest, next } = summarise(a);
  if (!next) return `${highest!.title} · every milestone earned`;
  if (!highest) return `${toNextText(a.key, a.current, next.value)} to earn ${next.title}`;
  return countsUp(a.key) ? `${highest.title} · ${next.title} in ${toNextText(a.key, a.current, next.value)}` : `${highest.title} · next, ${next.title}`;
}

export default function Achievements() {
  const { colors } = useTheme();
  const { data, error, isLoading } = useSWR<Achievement[]>("/api/achievements");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !Array.isArray(data)) return <Screen><Notice tone="error" message="We couldn't load your achievements. Try again in a moment." /></Screen>;

  const selected = data.find((a) => a.key === selectedKey) ?? null;
  const close = () => setSelectedKey(null);

  return (
    <Screen edges={["left", "right"]}>
      <Text variant="display">Achievements</Text>
      <ReaderTierCard />
      <UpNext achievements={data} onSelect={setSelectedKey} />
      <MedalList achievements={data} onSelect={setSelectedKey} />
      {selected && <AchievementDetail achievement={selected} onClose={close} />}
    </Screen>
  );
}

function ProgressBar({ percent, colour, height = 4 }: { percent: number; colour: string; height?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, height, borderRadius: height, backgroundColor: colors.border, overflow: "hidden" }}>
      <View style={{ width: `${percent}%`, height, borderRadius: height, backgroundColor: colour }} />
    </View>
  );
}

// The three rungs the reader is closest to, each with what's left in plain words.
function UpNext({ achievements, onSelect }: { achievements: Achievement[]; onSelect: (key: string) => void }) {
  const { colors } = useTheme();
  const closest = closestMilestones(achievements);
  if (closest.length === 0) return null;
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <Text variant="title" accessibilityRole="header">Up next</Text>
      {closest.map(({ ladder, next, progress }) => (
        <Pressable
          key={ladder.key}
          accessibilityRole="button"
          accessibilityLabel={`${next.title}, ${ladder.title}: ${toNextText(ladder.key, ladder.current, next.value)}. View milestones`}
          onPress={() => onSelect(ladder.key)}
          style={[styles.card, { borderColor: colors.border }]}
        >
          <View style={styles.row}>
            <View accessibilityRole="progressbar" accessibilityLabel={`Progress to ${next.title}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
              <MedalRing achievementKey={ladder.key} earned={ladder.milestones.some((m) => m.earned)} percent={progress * 100} size={52} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label">{next.title}</Text>
              <Text variant="small">{ladder.title}</Text>
            </View>
          </View>
          <Text variant="muted">{toNextText(ladder.key, ladder.current, next.value)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const CATEGORIES = [
  { key: "reading", title: "Reading" },
  { key: "consistency", title: "Consistency" },
  { key: "engagement", title: "Engagement" },
];

// Every achievement as a tile in a grid, grouped by category: the ring medal, the rung reached and how
// many of the ladder's rungs are earned.
function MedalList({ achievements, onSelect }: { achievements: Achievement[]; onSelect: (key: string) => void }) {
  const { colors } = useTheme();
  const earnedCount = achievements.reduce((n, a) => n + a.milestones.filter((m) => m.earned).length, 0);
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <View style={styles.headingRow}>
        <Text variant="title" accessibilityRole="header">Your medals</Text>
        <Text variant="small">{earnedCount} earned</Text>
      </View>
      {CATEGORIES.map((category) => {
        const ladders = achievements.filter((a) => a.category === category.key);
        if (ladders.length === 0) return null;
        return (
          <View key={category.key} style={{ gap: 8 }}>
            <Text variant="small" accessibilityRole="header">{category.title}</Text>
            <View style={styles.grid}>
              {ladders.map((a) => {
                const { earned, highest, percent, total } = summarise(a);
                return (
                  <Pressable
                    key={a.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.title}: ${earned.length} of ${total} milestones earned. ${standing(a)}. View milestones`}
                    onPress={() => onSelect(a.key)}
                    style={[styles.tile, { borderColor: colors.border }]}
                  >
                    <MedalRing achievementKey={a.key} earned={earned.length > 0} percent={percent} size={72} />
                    <Text variant="label" style={{ textAlign: "center", marginTop: 6 }}>{highest ? highest.title : "Not started"}</Text>
                    <Text variant="small" style={{ textAlign: "center" }}>{a.title}</Text>
                    <Text variant="small" style={{ marginTop: "auto", paddingTop: 4, fontVariant: ["tabular-nums"] }}>{earned.length}/{total}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AchievementDetail({ achievement: a, onClose }: { achievement: Achievement; onClose: () => void }) {
  const { colors } = useTheme();
  const { earned, highest, next, percent, total } = summarise(a);
  const colour = getMedalColour(a.key);
  const towardsNext = next ? Math.min(a.current, next.value) : 0;
  const pill = tierPill(earned.length, total);

  return (
    <Sheet title={a.title} onClose={onClose}>
      <View style={styles.detailTop}>
        <View>
          <Medal achievementKey={a.key} earned={earned.length > 0} size={80} />
          <View style={[styles.pill, { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor ?? "transparent" }]}>
            <Text style={{ color: pill.color, fontSize: 12, fontWeight: "700" }}>{formatPill(highest?.value ?? a.milestones[0].value)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{highest ? highest.title : "Not started yet"}</Text>
          <Text variant="muted">{earned.length} of {total} milestones earned</Text>
          {next ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <View style={styles.headingRow}>
                <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>Next: {next.title}</Text>
                <Text variant="small">{formatNumber(towardsNext)} / {formatNumber(next.value)}</Text>
              </View>
              <View accessibilityRole="progressbar" accessibilityLabel={`Progress to ${next.title}`} accessibilityValue={{ min: 0, max: next.value, now: towardsNext }} style={{ flexDirection: "row" }}>
                <ProgressBar percent={percent} colour={colors.foreground} height={6} />
              </View>
            </View>
          ) : (
            <Text variant="label" style={{ marginTop: 8 }}>Every milestone earned. Wonderful.</Text>
          )}
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        {a.milestones.map((m, i) => {
          const isNext = next?.value === m.value;
          const isLast = i === a.milestones.length - 1;
          return (
            <View key={m.value} style={styles.rung} accessible accessibilityLabel={`${m.title}. ${m.description}. ${m.earned ? "Earned" : isNext ? "In progress" : "Locked"}`}>
              {/* The rail between rungs fills in with the medal colour as they're earned. */}
              {!isLast && <View style={[styles.rail, { backgroundColor: m.earned ? colour : colors.border }]} />}
              <View
                style={[
                  styles.dot,
                  m.earned ? { backgroundColor: colour } : { borderWidth: 2, borderColor: isNext ? colors.foreground : colors.border, backgroundColor: colors.background },
                ]}
              >
                {m.earned ? <Check size={16} strokeWidth={3} color={MEDAL_INK} />
                  : isNext ? <Text style={{ fontSize: 10, fontWeight: "700" }}>{formatPill(m.value)}</Text>
                  : <Lock size={13} color={colors.mutedForeground} />}
              </View>
              <View style={{ flex: 1, paddingTop: 4, opacity: !m.earned && !isNext ? 0.6 : 1 }}>
                <View style={styles.headingRow}>
                  <Text variant="label" style={{ flex: 1 }}>{m.title}</Text>
                  <Text variant="small">
                    {m.earned ? (m.earnedAt ? `Earned ${formatEarned(m.earnedAt)}` : "Earned") : isNext ? `${formatNumber(towardsNext)} / ${formatNumber(m.value)}` : ""}
                  </Text>
                </View>
                <Text variant="muted">{m.description}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

// Where the reader sits on the tier ladder, and what the next rung takes. Before Bronze there's no metal
// to show, so the swatch is the next tier's outline with the books still to go.
function ReaderTierCard() {
  const { colors } = useTheme();
  const { data: user } = useSWR<ProfileUser>("/api/user");
  if (!user) return null;
  const booksRead = user._count?.books ?? 0;
  const { tier, next, remaining } = tierProgress(booksRead);
  const heading = tier ? `${tier.label} reader` : `On your way to ${next!.label}`;
  const detail = !tier
    ? `${formatNumber(booksRead)} of ${formatNumber(next!.minBooks)} books read. Your tier frames your avatar wherever your name appears.`
    : next ? `${formatNumber(booksRead)} books read · ${formatNumber(remaining)} more to ${next.label}` : `${formatNumber(booksRead)} books read · you've reached the top tier`;

  return (
    <View style={[styles.tierCard, { borderColor: colors.border }]}>
      <View style={styles.row}>
        {tier ? <Metal tier={tier} size={52} radius={12} /> : (
          <View style={[styles.toGo, { borderColor: next!.colour }]}>
            <Text style={{ color: next!.colour, fontSize: 18, fontWeight: "700" }}>{formatNumber(remaining)}</Text>
            <Text style={{ color: next!.colour, fontSize: 11, fontWeight: "600" }}>to go</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text variant="title">{heading}</Text>
          <Text variant="muted">{detail}</Text>
        </View>
      </View>

      {/* One segment per tier, each filling from the tier before it. */}
      <View style={styles.tiers}>
        {READER_TIERS.map((t, i) => {
          const from = i === 0 ? 0 : READER_TIERS[i - 1].minBooks;
          const fill = Math.max(0, Math.min(1, (booksRead - from) / (t.minBooks - from)));
          const reached = booksRead >= t.minBooks;
          return (
            <View key={t.key} style={{ flex: 1, gap: 4 }} accessible accessibilityLabel={`${t.label}, ${t.minBooks} books, ${reached ? "reached" : "not reached yet"}`}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
                {fill > 0 && <View style={{ width: `${fill * 100}%`, height: 8, borderRadius: 4, backgroundColor: t.colour }} />}
              </View>
              <Text style={{ fontSize: 12, fontWeight: "600", color: reached ? colors.foreground : colors.mutedForeground }}>{t.label}</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{formatNumber(t.minBooks)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// A tier's metal: highlight, body and shadow, as the web's gradient.
function Metal({ tier, size, radius, children }: { tier: ReaderTier; size: number; radius: number; children?: ReactNode }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <Svg viewBox="0 0 10 10" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`metal-${tier.key}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tier.light} />
            <Stop offset="0.45" stopColor={tier.colour} />
            <Stop offset="1" stopColor={tier.shade} />
          </LinearGradient>
        </Defs>
        <Rect width="10" height="10" fill={`url(#metal-${tier.key})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10, alignItems: "center" },
  pill: { position: "absolute", bottom: -10, alignSelf: "center", borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 1 },
  detailTop: { flexDirection: "row", alignItems: "center", gap: 18 },
  rung: { flexDirection: "row", gap: 14, paddingBottom: 18 },
  rail: { position: "absolute", left: 15, top: 32, bottom: 0, width: 2 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 1 },
  tierCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 },
  tiers: { flexDirection: "row", gap: 6 },
  toGo: { width: 52, height: 52, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
});
