import { requireUser } from "@/lib/apiAuth";
import { getGoalProgress } from "@/lib/stats";
import { NextResponse } from "next/server";

// The goal widget's progress for a year: finished reads, counted as /stats counts them.
export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "") || new Date().getFullYear();

  return NextResponse.json(await getGoalProgress(currentUser.id, year));
}
