import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePermission } from "@/lib/apiAuth";
import { logStaffAction } from "@/lib/staffLog";
import { isObjectId } from "@/lib/staffUsers";

type Params = { params: { id: string } };

// Editors' choice (lib/genreListRules.ts): puts a reader's public list at the front of its genres'
// pages on Discover. POST chooses it, DELETE takes it off. Not for Bookmark Picks, which are the team's own.
async function setChoice(req: Request, { params }: Params, chosen: boolean) {
  const { user, response } = await requirePermission("lists.curate");
  if (response) return response;
  const list = isObjectId(params.id)
    ? await prisma.list.findUnique({ where: { id: params.id }, select: { id: true, isPick: true, visibility: true, hidden: true, chosenAt: true } })
    : null;
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (chosen && (list.isPick || list.visibility !== "PUBLIC" || list.hidden)) {
    return NextResponse.json({ error: "Only public, visible lists by readers can be an editors' choice." }, { status: 400 });
  }
  if (!!list.chosenAt === chosen) return NextResponse.json({ chosen });
  await prisma.list.update({ where: { id: list.id }, data: chosen ? { chosenAt: new Date(), chosenById: user.id } : { chosenAt: null, chosenById: null } });
  await logStaffAction({ actorId: user.id, action: chosen ? "list.choose" : "list.unchoose", targetType: "list", targetId: list.id });
  return NextResponse.json({ chosen });
}

export const POST = (req: Request, ctx: Params) => setChoice(req, ctx, true);
export const DELETE = (req: Request, ctx: Params) => setChoice(req, ctx, false);
