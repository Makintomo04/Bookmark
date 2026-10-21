import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { requireUser } from "@/lib/apiAuth";
import { carryOverItems, findList, parseListInput } from "@/lib/lists";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  const viewer = await getCurrentUser();
  const list = await findList(params.id, viewer);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  return NextResponse.json(list);
}

export async function PATCH(req: Request, { params }: Params) {
  const { user: currentUser, response } = await requireUser("Sign in to edit this list.");
  if (response) return response;
  const list = await findList(params.id, currentUser);
  if (!list || !list.canEdit) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const parsed = parseListInput(await req.json(), currentUser.isStaff);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Items are replaced wholesale: it keeps reordering, notes and removals to one request. When each
  // book was added, and who wrote a remixed note, carry over.
  await prisma.$transaction([
    prisma.listItem.deleteMany({ where: { listId: list.id } }),
    prisma.list.update({
      where: { id: list.id },
      data: { ...parsed.data, items: { createMany: { data: carryOverItems(list.items, parsed.items) } } },
    }),
  ]);
  return NextResponse.json({ id: list.id });
}

export async function DELETE(req: Request, { params }: Params) {
  const { user: currentUser, response } = await requireUser("Sign in to delete this list.");
  if (response) return response;
  const list = await findList(params.id, currentUser);
  if (!list || !list.canEdit) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  await prisma.listReport.deleteMany({ where: { listId: list.id } });
  await prisma.listItem.deleteMany({ where: { listId: list.id } });
  await prisma.list.delete({ where: { id: list.id } });
  return NextResponse.json({ deleted: true });
}
