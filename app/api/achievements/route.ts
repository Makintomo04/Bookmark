import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { ACHIEVEMENTS, milestoneKey } from "@/lib/achievements-catalog";
import { awardNewAchievements, computeAchievementStats } from "@/lib/achievements";
import { NextResponse } from "next/server";

export async function GET() {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  // Covers progress made before this feature existed, or any other gap
  // between a state change and its usual book-progress trigger.
  await awardNewAchievements(currentUser.id);

  const [earned, stats] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId: currentUser.id } }),
    computeAchievementStats(currentUser.id),
  ]);
  const earnedByKey = new Map(earned.map((e) => [e.key, e.earnedAt]));

  const achievements = ACHIEVEMENTS.map((a) => {
    const milestones = a.milestones.map((m) => {
      const earnedAt = earnedByKey.get(milestoneKey(a.key, m.value)) ?? null;
      return { value: m.value, title: m.title, description: a.describe(m.value), earned: earnedAt !== null, earnedAt };
    });
    return {
      key: a.key,
      title: a.title,
      category: a.category,
      // Earned rungs stay earned even if the number later drops (a broken streak).
      current: stats[a.key],
      milestones,
    };
  });

  return NextResponse.json(achievements);
}
