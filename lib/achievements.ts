import prisma from "@/lib/db";
import { ACHIEVEMENTS, AchievementKey, AchievementDefinition, getAchievement } from "@/lib/achievements-catalog";

export { ACHIEVEMENTS, getAchievementTitle } from "@/lib/achievements-catalog";
export type { AchievementKey, AchievementDefinition } from "@/lib/achievements-catalog";

export interface AchievementStats {
  completedCount: number;
  reviewCount: number;
  ratingCount: number;
  streak: number;
  completedThisYear: number;
  goalTarget: number | null;
  hasBigBook: boolean;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

function computeStreak(activityDates: Date[]): number {
  if (activityDates.length === 0) return 0;
  const activeDays = new Set(activityDates.map((d) => d.toDateString()));
  let streak = 0;
  const cursor = new Date();
  while (activeDays.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function computeAchievementStats(userId: string): Promise<AchievementStats> {
  const books = await prisma.book.findMany({
    where: { userId },
    select: { status: true, pages: true, completedAt: true, review: true, rating: true },
  });

  const completedBooks = books.filter((b) => b.status === "COMPLETED");
  const reviewCount = books.filter((b) => typeof b.review === "string" && b.review.trim().length > 0).length;
  const ratingCount = books.filter((b) => typeof b.rating === "number" && b.rating > 0).length;
  const hasBigBook = completedBooks.some((b) => b.pages >= 500);

  const year = new Date().getFullYear();
  const goal = await prisma.readingGoal.findUnique({ where: { userId_year: { userId, year } } });
  const completedThisYear = completedBooks.filter(
    (b) => b.completedAt && b.completedAt.getFullYear() === year
  ).length;

  const activities = await prisma.activity.findMany({
    where: { userId },
    select: { createdAt: true },
  });
  const streak = computeStreak(activities.map((a) => a.createdAt));

  return {
    completedCount: completedBooks.length,
    reviewCount,
    ratingCount,
    streak,
    completedThisYear,
    goalTarget: goal?.targetBooks ?? null,
    hasBigBook,
  };
}

function evaluateFromStats(stats: AchievementStats): Set<AchievementKey> {
  const satisfied = new Set<AchievementKey>();
  if (stats.completedCount >= 1) satisfied.add("FIRST_BOOKMARK");
  if (stats.completedCount >= 10) satisfied.add("BOOKWORM");
  if (stats.completedCount >= 25) satisfied.add("BIBLIOPHILE");
  if (stats.hasBigBook) satisfied.add("PAGE_TURNER");
  if (stats.reviewCount >= 1) satisfied.add("FIRST_IMPRESSION");
  if (stats.ratingCount >= 10) satisfied.add("CRITIC");
  if (stats.goalTarget !== null && stats.completedThisYear >= stats.goalTarget) satisfied.add("GOAL_GETTER");
  if (stats.streak >= 3) satisfied.add("ON_A_ROLL");
  if (stats.streak >= 7) satisfied.add("DEDICATED_READER");
  return satisfied;
}

export function getAchievementProgress(key: AchievementKey, stats: AchievementStats): AchievementProgress | null {
  switch (key) {
    case "BOOKWORM": return { current: stats.completedCount, target: 10 };
    case "BIBLIOPHILE": return { current: stats.completedCount, target: 25 };
    case "ON_A_ROLL": return { current: stats.streak, target: 3 };
    case "DEDICATED_READER": return { current: stats.streak, target: 7 };
    case "CRITIC": return { current: stats.ratingCount, target: 10 };
    case "GOAL_GETTER": return stats.goalTarget !== null ? { current: stats.completedThisYear, target: stats.goalTarget } : null;
    default: return null;
  }
}

export async function awardNewAchievements(userId: string): Promise<AchievementDefinition[]> {
  const stats = await computeAchievementStats(userId);
  const satisfied = evaluateFromStats(stats);
  if (satisfied.size === 0) return [];

  const existing = await prisma.userAchievement.findMany({ where: { userId }, select: { key: true } });
  const existingKeys = new Set(existing.map((e) => e.key));
  const newKeys = Array.from(satisfied).filter((key) => !existingKeys.has(key));
  if (newKeys.length === 0) return [];

  for (const key of newKeys) {
    await prisma.userAchievement.create({ data: { userId, key } });
    await prisma.notification.create({
      data: { userId, actorId: userId, type: "ACHIEVEMENT_EARNED", achievementKey: key },
    });
  }

  return newKeys.map((key) => getAchievement(key)!);
}
