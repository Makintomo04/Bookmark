import { NextResponse } from "next/server";
import { Prisma, type Quest } from "@prisma/client";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { requireUser } from "@/lib/apiAuth";
import { parseQuestInput, questKey } from "@/lib/questRules";
import { earnedCounts, goalText, listQuests, listTitles, medalOf } from "@/lib/quests";

// Public: live, upcoming and ended quests (drafts only for staff), each with how many earned it, the
// goal in words and the medal design (what the /quests page shows), and whether the viewer holds it.
export async function GET() {
  const viewer = await getCurrentUser();
  const { live, upcoming, ended } = await listQuests(viewer);
  const all = [...live, ...upcoming, ...ended];
  const [counts, titles, mine] = await Promise.all([
    earnedCounts([...live, ...ended].map((q) => q.id)),
    listTitles(all),
    viewer && all.length
      ? prisma.userAchievement.findMany({ where: { userId: viewer.id, key: { in: all.map((q) => questKey(q.id)) } }, select: { key: true } })
      : Promise.resolve([]),
  ]);
  const earned = new Set(mine.map((m) => m.key));
  const withCount = (q: Quest) => ({
    ...q,
    earnedCount: counts.get(q.id) ?? 0,
    goalText: goalText(q, titles),
    design: medalOf(q),
    earned: earned.has(questKey(q.id)),
  });
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
