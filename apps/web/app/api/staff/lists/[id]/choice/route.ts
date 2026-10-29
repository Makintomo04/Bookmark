import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePermission } from "@/lib/apiAuth";
import { logStaffAction } from "@/lib/staffLog";
import { isObjectId } from "@/lib/staffUsers";

type Params = { params: Promise<{ id: string }> };

// Editors' choice (lib/genreListRules.ts): puts a reader's public list at the front of its genres'
// pages on Discover. POST chooses it, DELETE takes it off. Not for Bookmark Picks, which are the team's own.
// Either can carry an optional { reason } for the staff log.
async function setChoice(req: Request, props: Params, chosen: boolean) {
  const params = await props.params;
  const { user, response } = await requirePermission("lists.curate");
  if (response) return response;
  const list = isObjectId(params.id)
    ? await prisma.list.findUnique({ where: { id: params.id }, select: { id: true, isPick: true, visibility: true, hidden: true, chosenAt: true, chosenById: true } })
    : null;
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (chosen && (list.isPick || list.visibility !== "PUBLIC" || list.hidden)) {
    return NextResponse.json({ error: "Only public, visible lists by readers can be an editors' choice." }, { status: 400 });
  }
  if (!!list.chosenAt === chosen) return NextResponse.json({ chosen });
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
  const after = chosen ? { chosenAt: new Date(), chosenById: user.id } : { chosenAt: null, chosenById: null };
  await prisma.list.update({ where: { id: list.id }, data: after });
  await logStaffAction({
    actorId: user.id, action: chosen ? "list.choose" : "list.unchoose", targetType: "list", targetId: list.id,
    before: { chosenAt: list.chosenAt?.toISOString() ?? null, chosenById: list.chosenById ?? null },
    after: { chosenAt: after.chosenAt?.toISOString() ?? null, chosenById: after.chosenById },
    reason,
  });
  return NextResponse.json({ chosen });
}

export const POST = (req: Request, ctx: Params) => setChoice(req, ctx, true);
export const DELETE = (req: Request, ctx: Params) => setChoice(req, ctx, false);
