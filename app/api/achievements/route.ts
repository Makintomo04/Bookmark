import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { ACHIEVEMENTS } from "@/lib/achievements-catalog";
import { awardNewAchievements, computeAchievementStats, getAchievementProgress } from "@/lib/achievements";
import { NextResponse } from "next/server";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.error();
  }

  // Covers progress made before this feature existed, or any other gap
  // between a state change and its usual book-progress trigger.
  await awardNewAchievements(currentUser.id);

  const [earned, stats] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId: currentUser.id } }),
    computeAchievementStats(currentUser.id),
  ]);
  const earnedByKey = new Map(earned.map((e) => [e.key, e.earnedAt]));

  const achievements = ACHIEVEMENTS.map((a) => {
    const isEarned = earnedByKey.has(a.key);
    const progress = isEarned ? null : getAchievementProgress(a.key, stats);
    return {
      ...a,
      earned: isEarned,
      earnedAt: earnedByKey.get(a.key) ?? null,
      progress: progress ? { current: Math.min(progress.current, progress.target), target: progress.target } : null,
    };
  });

  return NextResponse.json(achievements);
}
