import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { getGoalProgress } from "@/lib/stats";
import { NextResponse } from "next/server";

// The goal widget's one request: the year's goal and the progress toward it, fetched together so the
// profile waits on one HTTP request, not two. The app still reads them apart (/api/reading-goal, /progress).
export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "") || new Date().getFullYear();

  // The goal first: its pace starts when it was set, so progress counts the books from before then too.
  const goal = await prisma.readingGoal.findUnique({ where: { userId_year: { userId: currentUser.id, year } } });
  const progress = await getGoalProgress(currentUser.id, year, goal?.createdAt);

  return NextResponse.json({ goal, progress });
}
