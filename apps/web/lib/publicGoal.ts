import prisma from "@/lib/db";
import { getGoalProgress } from "@/lib/stats";

// This year's goal as a reader shows it on their profile, when they've chosen to (Settings, privacy:
// showGoal). Only the count and, when they're ahead of pace, by how much: a profile never says "behind".
export interface PublicGoal {
  year: number;
  target: number;
  books: number;
  // Books ahead of where the year's pace would have them; 0 when on pace or behind.
  ahead: number;
}

export async function publicGoal(userId: string, now = new Date()): Promise<PublicGoal | null> {
  const year = now.getFullYear();
  const goal = await prisma.readingGoal.findFirst({ where: { userId, year }, select: { targetBooks: true } });
  if (!goal?.targetBooks) return null;
  const { books } = await getGoalProgress(userId, year);
  const start = new Date(year, 0, 1).getTime();
  const through = (now.getTime() - start) / (new Date(year + 1, 0, 1).getTime() - start);
  const gap = Math.round(books - goal.targetBooks * through);
  return { year, target: goal.targetBooks, books, ahead: Math.max(0, gap) };
}
