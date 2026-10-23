import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { ArrowRight, Check, Lock } from "lucide-react-native";
import { questCountdown, questDates } from "@bookmark/shared/questRules";
import { READER_TIERS, tierProgress, type ReaderTier } from "@bookmark/shared/readerTier";
import { Medal, MEDAL_INK, QuestMedal, getMedalColour, tierPill } from "@/components/achievements/Medal";
import type { ProfileUser } from "@/components/profile/ProfileHeader";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// Achievements (the web's /achievements): the reading tier, then every ladder and quest medal by
// category. Select one to see its milestones.

type Milestone = { value: number; title: string; description: string; earned: boolean; earnedAt: string | null };
type QuestItem = { slug: string; colour: string; ribbon: string; icon: string; startsAt: string; endsAt: string; phase: "upcoming" | "live" | "ended" };
type Achievement = { key: string; title: string; category: string; current: number; milestones: Milestone[]; quest?: QuestItem };

const CATEGORY_LABELS: Record<string, string> = { quests: "Seasonal quests", reading: "Reading", consistency: "Consistency", engagement: "Engagement" };
// Quest medals lead: they're the limited ones, and the live quest is the one with a deadline.
const CATEGORY_ORDER = ["quests", "reading", "consistency", "engagement"];

// The Bookmark logo stood upright: every badge hangs on the brand's own shape.
const BACKING_PATH = "M14 0H86C93.7 0 100 6.3 100 14V106Q100 120 87 114.8L55.6 102.2Q50 100 44.4 102.2L13 114.8Q0 120 0 106V14C0 6.3 6.3 0 14 0Z";

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-GB");
// "100K" fits on a medal pill; "100,000" doesn't.
const formatPill = (n: number) => (n >= 10000 ? compact.format(n) : full.format(n));
const formatNumber = (n: number) => full.format(n);
const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();
const formatEarned = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear(d) ? {} : { year: "numeric" }) }); };
const monthYear = (iso: string | null) => (iso ? new Date(iso) : new Date()).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

function summarise(a: Achievement) {
  const earned = a.milestones.filter((m) => m.earned);
  const highest = earned[earned.length - 1] ?? null;
  const next = a.milestones.find((m) => !m.earned) ?? null;
  const percent = next ? Math.max(0, Math.min(100, Math.round((a.current / next.value) * 100))) : 100;
  return { earned, highest, next, percent, total: a.milestones.length };
}

export default function Achievements() {
  const { colors } = useTheme();
  const { data, error, isLoading } = useSWR<Achievement[]>("/api/achievements");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !Array.isArray(data)) return <Screen><Notice tone="error" message="We couldn't load your achievements. Try again in a moment." /></Screen>;

  // Quest medals are one-offs, not rungs of a ladder, so they're counted apart.
  const milestones = data.filter((a) => !a.quest).flatMap((a) => a.milestones);
  const earnedCount = milestones.filter((m) => m.earned).length;
  const selected = data.find((a) => a.key === selectedKey) ?? null;
  const close = () => setSelectedKey(null);

  return (
    <Screen edges={["left", "right"]}>
      <Text variant="display">Achievements</Text>
      <Text variant="muted">{earnedCount} of {milestones.length} milestones earned. Select an achievement to see each milestone.</Text>
      <ReaderTierCard />

      {CATEGORY_ORDER.map((category) => {
        const items = data.filter((a) => a.category === category);
        if (items.length === 0) return null;
        const inCategory = items.flatMap((a) => a.milestones);
        const earnedHere = inCategory.filter((m) => m.earned).length;
        return (
          <View key={category} style={{ gap: 14, marginTop: 8 }}>
            <View style={styles.headingRow}>
              <Text variant="title" accessibilityRole="header">{CATEGORY_LABELS[category] ?? category}</Text>
              <Text variant="small">{category === "quests" ? `${earnedHere} ${earnedHere === 1 ? "medal" : "medals"} earned` : `${earnedHere} of ${inCategory.length} milestones`}</Text>
            </View>
            <View style={styles.grid}>
              {items.map((a) => a.quest
                ? <QuestBadge key={a.key} achievement={a} onSelect={() => setSelectedKey(a.key)} />
                : <AchievementBadge key={a.key} achievement={a} onSelect={() => setSelectedKey(a.key)} />)}
            </View>
          </View>
        );
      })}

      {selected && (selected.quest ? <QuestDetail achievement={selected} onClose={close} /> : <AchievementDetail achievement={selected} onClose={close} />)}
    </Screen>
  );
}

function Backing({ tint }: { tint?: string }) {
  const { colors } = useTheme();
  return (
    <Svg viewBox="0 0 100 120" style={StyleSheet.absoluteFill}>
      <Path d={BACKING_PATH} fill={colors.muted} />
      {tint && <Path d={BACKING_PATH} fill={tint} fillOpacity={0.14} />}
    </Svg>
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

const BADGE = 104;

function AchievementBadge({ achievement: a, onSelect }: { achievement: Achievement; onSelect: () => void }) {
  const { colors } = useTheme();
  const { earned, highest, next, percent, total } = summarise(a);
  const pill = tierPill(earned.length, total);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}: ${earned.length} of ${total} milestones earned. View milestones`}
      onPress={onSelect}
      style={styles.badge}
    >
      <View style={{ width: BADGE, height: BADGE * 1.2 }}>
        <Backing />
        <View style={{ position: "absolute", top: BADGE * 0.13, alignSelf: "center" }}>
          <Medal achievementKey={a.key} earned={earned.length > 0} size={BADGE * 0.66} />
          <View style={[styles.pill, { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor ?? "transparent" }]}>
            <Text style={{ color: pill.color, fontSize: 12, fontWeight: "700" }}>{formatPill(highest?.value ?? a.milestones[0].value)}</Text>
          </View>
        </View>
      </View>
      <Text variant="label" numberOfLines={2} style={{ textAlign: "center", marginTop: 8 }}>{highest?.title ?? a.title}</Text>
      <Text variant="small" style={{ textAlign: "center" }}>{highest ? `${a.title} · ${earned.length} of ${total}` : `${earned.length} of ${total} milestones`}</Text>
      {next ? (
        <View style={styles.barRow}>
          <ProgressBar percent={percent} colour={colors.foreground} />
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{formatPill(Math.min(a.current, next.value))}/{formatPill(next.value)}</Text>
        </View>
      ) : (
        <Text variant="small" style={{ marginTop: 4 }}>All milestones earned</Text>
      )}
    </Pressable>
  );
}

function QuestBadge({ achievement: a, onSelect }: { achievement: Achievement; onSelect: () => void }) {
  const { colors } = useTheme();
  const quest = a.quest!;
  const rung = a.milestones[0];
  const towards = Math.min(a.current, rung.value);
  const percent = rung.earned ? 100 : Math.round((towards / rung.value) * 100);
  const status = rung.earned ? `Earned ${monthYear(rung.earnedAt)}` : questCountdown(quest);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}: ${rung.earned ? "earned" : `${towards} of ${rung.value} books`}. View quest medal`}
      onPress={onSelect}
      style={styles.badge}
    >
      <View style={{ width: BADGE, height: BADGE * 1.2 }}>
        <Backing tint={quest.ribbon} />
        <QuestMedal design={quest} earned={rung.earned} width={BADGE * 0.62} style={{ position: "absolute", top: BADGE * 0.1, alignSelf: "center" }} />
      </View>
      <Text variant="label" numberOfLines={2} style={{ textAlign: "center", marginTop: 8 }}>{a.title}</Text>
      <Text variant="small" style={{ textAlign: "center" }}>Limited edition · {status}</Text>
      {!rung.earned && (
        <View style={styles.barRow}>
          <ProgressBar percent={percent} colour={quest.colour} />
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{formatNumber(towards)}/{formatNumber(rung.value)}</Text>
        </View>
      )}
    </Pressable>
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

function QuestDetail({ achievement: a, onClose }: { achievement: Achievement; onClose: () => void }) {
  const { colors } = useTheme();
  const quest = a.quest!;
  const rung = a.milestones[0];
  const towards = Math.min(a.current, rung.value);
  const percent = rung.earned ? 100 : Math.round((towards / rung.value) * 100);
  return (
    <Sheet title={a.title} onClose={onClose}>
      <View style={styles.detailTop}>
        <QuestMedal design={quest} earned={rung.earned} width={80} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="small" style={{ letterSpacing: 1.5, fontWeight: "600" }}>LIMITED-EDITION QUEST MEDAL</Text>
          <Text variant="title">{rung.earned ? "Earned. It's yours for good." : rung.description}</Text>
          <Text variant="muted">
            {rung.earned && rung.earnedAt ? `Earned ${new Date(rung.earnedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ` : ""}{questDates(quest.startsAt, quest.endsAt)}
          </Text>
          {!rung.earned && (
            <View style={{ marginTop: 10, gap: 6 }}>
              <View style={styles.headingRow}>
                <Text variant="small">{questCountdown(quest)}</Text>
                <Text variant="small">{formatNumber(towards)} / {formatNumber(rung.value)}</Text>
              </View>
              <View accessibilityRole="progressbar" accessibilityLabel={`Progress on ${a.title}`} accessibilityValue={{ min: 0, max: rung.value, now: towards }} style={{ flexDirection: "row" }}>
                <ProgressBar percent={percent} colour={quest.colour} height={6} />
              </View>
            </View>
          )}
        </View>
      </View>
      {rung.earned && <Text variant="muted" style={{ marginTop: 16 }}>{rung.description}.</Text>}
      <Pressable
        accessibilityRole="link"
        onPress={() => { onClose(); router.push(`/quests/${quest.slug}` as never); }}
        style={[styles.headingRow, { justifyContent: "flex-start", gap: 6, marginTop: 20, paddingVertical: 4 }]}
      >
        <Text variant="label">See the quest</Text>
        <ArrowRight size={14} color={colors.foreground} />
      </Pressable>
    </Sheet>
  );
}

// Where the reader sits on the tier ladder, and what the next rung takes.
function ReaderTierCard() {
  const { colors } = useTheme();
  const { data: user } = useSWR<ProfileUser>("/api/user");
  if (!user) return null;
  const booksRead = user._count?.books ?? 0;
  const { tier, next, remaining, progress } = tierProgress(booksRead);
  const barTier = next ?? tier;

  return (
    <View style={[styles.tierCard, { borderColor: colors.border }]}>
      <View style={styles.tierTop}>
        {tier ? <Metal tier={tier} size={48} radius={12} /> : <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.muted }} />}
        <View style={{ flex: 1 }}>
          <Text variant="title">{tier ? `${tier.label} reader` : "Reading tier"}</Text>
          <Text variant="muted">
            {booksRead} {booksRead === 1 ? "book" : "books"} read{next ? ` · ${remaining} more to ${next.label}` : " · you've reached the top tier"}
          </Text>
        </View>
      </View>

      {barTier && (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={next ? `Progress to ${next.label}` : "Top tier reached"}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}
        >
          <View style={{ width: `${Math.max(progress * 100, 3)}%`, height: 8, borderRadius: 4, backgroundColor: barTier.colour }} />
        </View>
      )}

      <View style={styles.tiers}>
        {READER_TIERS.map((t) => {
          const reached = booksRead >= t.minBooks;
          const current = t.key === tier?.key;
          return (
            <View key={t.key} style={styles.tierStep} accessible accessibilityLabel={`${t.label}, ${t.minBooks} books, ${reached ? "reached" : "not reached yet"}`}>
              <View style={[{ borderRadius: 10, padding: 2 }, current && { borderWidth: 2, borderColor: colors.mutedForeground }]}>
                <View style={{ opacity: reached ? 1 : 0.35 }}>
                  <Metal tier={t} size={32} radius={8}>{reached && <Check size={14} strokeWidth={3} color="rgba(0,0,0,0.6)" />}</Metal>
                </View>
              </View>
              <Text variant="label" style={{ fontSize: 12, color: reached ? colors.foreground : colors.mutedForeground }}>{t.label}</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{t.minBooks}</Text>
            </View>
          );
        })}
      </View>

      <Text variant="muted">
        Your tier frames your avatar on your profile and wherever your name appears. Each tier lands with a Books read milestone, and Gold and above shimmer.
      </Text>
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
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 24, justifyContent: "space-between" },
  badge: { width: "48%", alignItems: "center" },
  pill: { position: "absolute", bottom: -10, alignSelf: "center", borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 1 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 6, width: BADGE, marginTop: 8 },
  detailTop: { flexDirection: "row", alignItems: "center", gap: 18 },
  rung: { flexDirection: "row", gap: 14, paddingBottom: 18 },
  rail: { position: "absolute", left: 15, top: 32, bottom: 0, width: 2 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 1 },
  tierCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 },
  tierTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  tiers: { flexDirection: "row", justifyContent: "space-between" },
  tierStep: { alignItems: "center", gap: 4, flex: 1 },
});
