import prisma from "@/lib/db";
import { getGoalProgress } from "@/lib/stats";
import { DEFAULT_TIME_ZONE, isValidTimeZone, localDay } from "@/lib/timeZone";
import { buildEarnMoment, type EarnMoment } from "@bookmark/shared/earnMoment";
import type { EarnedMilestone } from "@/lib/achievements";

// The database side of packages/shared/src/earnMoment.ts: what a save just earned, ready to send back
// with the save's own response so the app can celebrate it straight away.
export async function earnMomentFor(
  user: { id: string; timeZone?: string | null },
  synced: { awarded: EarnedMilestone[]; stats: Partial<Record<string, number>> },
  { finished = false }: { finished?: boolean } = {},
): Promise<EarnMoment> {
  const awarded = synced.awarded.map((a) => ({ achievementKey: a.achievement.key, value: a.milestone.value }));

  let goal: EarnMoment["goal"] = null;
  let earnedKeys: string[] = [];
  if (finished) {
    const year = Number(localDay(new Date(), user.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE).slice(0, 4));
    const [target, progress, held] = await Promise.all([
      prisma.readingGoal.findFirst({ where: { userId: user.id, year, targetBooks: { gt: 0 } }, select: { targetBooks: true } }),
      getGoalProgress(user.id, year),
      prisma.userAchievement.findMany({ where: { userId: user.id }, select: { key: true } }),
    ]);
    if (target) goal = { year, books: progress.books, target: target.targetBooks };
    earnedKeys = held.map((h) => h.key);
  }

  return buildEarnMoment({ awarded, stats: synced.stats, earnedKeys, goal, finished });
}
