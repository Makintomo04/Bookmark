import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { findList, parseListInput } from "@/lib/lists";

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
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Sign in to edit this list." }, { status: 401 });
  }
  const list = await findList(params.id, currentUser);
  if (!list || !list.canEdit) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const parsed = parseListInput(await req.json(), currentUser.isStaff);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Items are replaced wholesale: it keeps reordering, notes and removals to one request.
  await prisma.$transaction([
    prisma.listItem.deleteMany({ where: { listId: list.id } }),
    prisma.list.update({
      where: { id: list.id },
      data: { ...parsed.data, items: { createMany: { data: parsed.items } } },
    }),
  ]);
  return NextResponse.json({ id: list.id });
}

export async function DELETE(req: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Sign in to delete this list." }, { status: 401 });
  }
  const list = await findList(params.id, currentUser);
  if (!list || !list.canEdit) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  await prisma.listReport.deleteMany({ where: { listId: list.id } });
  await prisma.listItem.deleteMany({ where: { listId: list.id } });
  await prisma.list.delete({ where: { id: list.id } });
  return NextResponse.json({ deleted: true });
}
