import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ACHIEVEMENTS, AchievementKey, AchievementDefinition, LEGACY_KEYS, Milestone, milestoneKey } from "@/lib/achievements-catalog";

export { ACHIEVEMENTS, getAchievementTitle } from "@/lib/achievements-catalog";
export type { AchievementKey, AchievementDefinition } from "@/lib/achievements-catalog";

// The number each achievement's milestones are measured against.
export type AchievementStats = Record<AchievementKey, number>;

export interface EarnedMilestone {
  achievement: AchievementDefinition;
  milestone: Milestone;
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
  const [books, goals, activities] = await Promise.all([
    prisma.book.findMany({
      where: { userId },
      select: { status: true, pages: true, currentPage: true, completedAt: true, review: true, rating: true },
    }),
    prisma.readingGoal.findMany({ where: { userId }, select: { year: true, targetBooks: true } }),
    prisma.activity.findMany({ where: { userId }, select: { createdAt: true } }),
  ]);

  const completedBooks = books.filter((b) => b.status === "COMPLETED");
  // Pages in a book still being read count too: they've been read.
  const pagesRead = books.reduce((sum, b) => sum + (b.status === "COMPLETED" ? b.pages : b.status === "STARTED" ? (b.currentPage ?? 0) : 0), 0);

  const completedByYear = new Map<number, number>();
  for (const b of completedBooks) {
    if (!b.completedAt) continue;
    const year = b.completedAt.getFullYear();
    completedByYear.set(year, (completedByYear.get(year) ?? 0) + 1);
  }
  const goalsMet = goals.filter((g) => g.targetBooks > 0 && (completedByYear.get(g.year) ?? 0) >= g.targetBooks).length;

  return {
    BOOKS_READ: completedBooks.length,
    PAGES_READ: pagesRead,
    BIG_BOOKS: completedBooks.reduce((max, b) => Math.max(max, b.pages), 0),
    STREAK: computeStreak(activities.map((a) => a.createdAt)),
    GOALS: goalsMet,
    REVIEWS: books.filter((b) => typeof b.review === "string" && b.review.trim().length > 0).length,
    RATINGS: books.filter((b) => typeof b.rating === "number" && b.rating > 0).length,
  };
}

// Renames pre-milestone badges to the rung they became, keeping their earned date.
// Returns whether there was anything to move, i.e. this is the user's first run on milestones.
async function migrateLegacyAchievements(userId: string, existing: { id: string; key: string }[]): Promise<boolean> {
  const legacy = existing.filter((e) => e.key in LEGACY_KEYS);
  if (legacy.length === 0) return false;
  const keys = new Set(existing.map((e) => e.key));
  for (const record of legacy) {
    const next = LEGACY_KEYS[record.key];
    if (keys.has(next)) {
      await prisma.userAchievement.delete({ where: { id: record.id } });
    } else {
      await prisma.userAchievement.update({ where: { id: record.id }, data: { key: next } });
      keys.add(next);
    }
  }
  return true;
}

export async function awardNewAchievements(userId: string): Promise<EarnedMilestone[]> {
  const [stats, existing] = await Promise.all([
    computeAchievementStats(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { id: true, key: true } }),
  ]);
  const migrated = await migrateLegacyAchievements(userId, existing);
  const earnedKeys = new Set(existing.map((e) => LEGACY_KEYS[e.key] ?? e.key));

  const awarded: EarnedMilestone[] = [];
  for (const achievement of ACHIEVEMENTS) {
    const fresh = achievement.milestones.filter(
      (m) => stats[achievement.key] >= m.value && !earnedKeys.has(milestoneKey(achievement.key, m.value))
    );
    let highest: Milestone | null = null;
    for (const milestone of fresh) {
      try {
        await prisma.userAchievement.create({ data: { userId, key: milestoneKey(achievement.key, milestone.value) } });
      } catch (e) {
        // A concurrent request awarded it first.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
      awarded.push({ achievement, milestone });
      highest = milestone;
    }
    // One notification per achievement, for the highest rung reached, so finishing a
    // 1,000-page book doesn't announce 300, 500 and 750 too. Moving an existing user onto
    // milestones backfills rungs they passed long ago, which isn't news, so stay quiet then.
    if (highest && !migrated) {
      await prisma.notification.create({
        data: { userId, actorId: userId, type: "ACHIEVEMENT_EARNED", achievementKey: milestoneKey(achievement.key, highest.value) },
      });
    }
  }

  return awarded;
}
