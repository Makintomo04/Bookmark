import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { ACHIEVEMENTS, milestoneKey } from "@/lib/achievements-catalog";
import { syncAchievements } from "@/lib/achievements";
import { questAchievementItems } from "@/lib/quests";
import { NextResponse } from "next/server";

export async function GET() {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  // Covers progress made before this feature existed, or any other gap
  // between a state change and its usual book-progress trigger.
  // fullStats: the page shows every ladder's real number, including the full streak length.
  const { stats } = await syncAchievements(currentUser.id, { trigger: "all", fullStats: true });

  const earned = await prisma.userAchievement.findMany({ where: { userId: currentUser.id } });
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
      current: stats[a.key] ?? 0,
      milestones,
    };
  });

  // Seasonal quest medals: one rung each, from the database. Earned ones stay for good; live ones show locked.
  const quests = await questAchievementItems(currentUser.id, earned);

  return NextResponse.json([...achievements, ...quests]);
}
