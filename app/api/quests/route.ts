import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { requireUser } from "@/lib/apiAuth";
import { parseQuestInput } from "@/lib/questRules";
import { earnedCounts, listQuests } from "@/lib/quests";

// Public: live, upcoming and ended quests (drafts only for staff), each with how many earned it.
export async function GET() {
  const viewer = await getCurrentUser();
  const { live, upcoming, ended } = await listQuests(viewer);
  const counts = await earnedCounts([...live, ...ended].map((q) => q.id));
  const withCount = (q: { id: string }) => ({ ...q, earnedCount: counts.get(q.id) ?? 0 });
  return NextResponse.json({ live: live.map(withCount), upcoming: upcoming.map(withCount), ended: ended.map(withCount) });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!user.isStaff) return NextResponse.json({ error: "Only the Bookmark team can set quests." }, { status: 403 });

  const parsed = parseQuestInput(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const quest = await prisma.quest.create({ data: { ...parsed.data, createdById: user.id } });
    return NextResponse.json({ id: quest.id, slug: quest.slug });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Another quest already uses that address." }, { status: 400 });
    }
    throw e;
  }
}
