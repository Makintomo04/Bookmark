import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { parseQuestInput, questKey } from "@/lib/questRules";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { goalText, questDetail } from "@/lib/quests";

interface Params {
  params: { id: string };
}

async function requireStaff() {
  const { user, response } = await requireUser();
  if (response) return { response };
  if (!user.isStaff) return { response: NextResponse.json({ error: "Only the Bookmark team can change quests." }, { status: 403 }) };
  return { response: null };
}

const validId = (id: string) => /^[a-f0-9]{24}$/.test(id);

// One quest as its page shows it, for the mobile app. Reads take the quest's slug in this segment (the
// address /quests/<slug> uses); edits and deletes take its id.
export async function GET(_req: Request, { params }: Params) {
  const viewer = await getCurrentUser();
  const detail = await questDetail(params.id, viewer);
  if (!detail) return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  const { quest, goal, phase, design, titles, standing, earnedAt, earnedCount } = detail;
  return NextResponse.json({
    quest: { id: quest.id, slug: quest.slug, title: quest.title, description: quest.description, startsAt: quest.startsAt, endsAt: quest.endsAt, hidden: quest.hidden },
    goal,
    goalText: goalText(quest, titles),
    phase,
    design,
    standing,
    earnedAt,
    earnedCount,
  });
}

// Edits apply from the next check on. Medals already earned are kept whatever changes.
export async function PATCH(req: Request, { params }: Params) {
  const { response } = await requireStaff();
  if (response) return response;
  if (!validId(params.id)) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  const parsed = parseQuestInput(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const quest = await prisma.quest.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json({ id: quest.id, slug: quest.slug });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Another quest already uses that address." }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Quest not found." }, { status: 404 });
    }
    throw e;
  }
}

// Only a quest nobody has earned can be deleted: an earned medal needs its quest to draw it.
// Hide it instead.
export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireStaff();
  if (response) return response;
  if (!validId(params.id)) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  const [earned, anyMedal] = await Promise.all([
    prisma.questProgress.count({ where: { questId: params.id, completedAt: { not: null } } }),
    // A rare staff action, so a scan of the medals is fine.
    prisma.userAchievement.findFirst({ where: { key: questKey(params.id) }, select: { id: true } }),
  ]);
  if (earned > 0 || anyMedal) {
    return NextResponse.json({ error: `${Math.max(earned, 1)} ${earned > 1 ? "readers have" : "reader has"} earned this medal, so it can't be deleted. Hide it instead.` }, { status: 400 });
  }
  // delete (not deleteMany) so Prisma cascades to QuestProgress.
  await prisma.quest.delete({ where: { id: params.id } }).catch((e) => {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) throw e;
  });
  return NextResponse.json({ ok: true });
}
