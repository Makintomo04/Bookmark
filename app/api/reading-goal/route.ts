import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
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

export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const body = await req.json();
  const year = parseInt(body.year) || new Date().getFullYear();
  const targetBooks = parseInt(body.targetBooks);

  if (!targetBooks || targetBooks < 1 || targetBooks > 999) {
    return NextResponse.json({ error: "Goal must be between 1 and 999 books." }, { status: 400 });
  }

  const goal = await prisma.readingGoal.upsert({
    where: { userId_year: { userId: currentUser.id, year } },
    update: { targetBooks },
    create: { userId: currentUser.id, year, targetBooks },
  });

  return NextResponse.json(goal);
}
