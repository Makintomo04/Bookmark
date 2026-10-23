import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { guardEntitlement } from "@/lib/entitlementsServer";
import { goalInputSchema, setsExtraGoals } from "@/lib/goals";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "") || new Date().getFullYear();

  const goal = await prisma.readingGoal.findUnique({
    where: { userId_year: { userId: currentUser.id, year } },
  });

  return NextResponse.json(goal);
}

// Sets the year's goal. The book count is free; a page goal or a monthly pace needs Plus
// (lib/entitlements.ts extraGoalTypes), checked here and not only in the widget.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = goalInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "That goal doesn't look right." }, { status: 400 });
  }
  const { targetBooks, targetPages, targetBooksPerMonth } = parsed.data;
  const year = parsed.data.year ?? new Date().getFullYear();

  if (setsExtraGoals(parsed.data)) {
    const refused = await guardEntitlement(currentUser.id, "extraGoalTypes");
    if (refused) return refused;
  }

  const extras = {
    ...(targetPages !== undefined && { targetPages }),
    ...(targetBooksPerMonth !== undefined && { targetBooksPerMonth }),
  };
  const goal = await prisma.readingGoal.upsert({
    where: { userId_year: { userId: currentUser.id, year } },
    update: { targetBooks, ...extras },
    create: { userId: currentUser.id, year, targetBooks, ...extras },
  });

  return NextResponse.json(goal);
}
