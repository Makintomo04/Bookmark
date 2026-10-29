import { NextResponse } from "next/server";
import { can, roleOf } from "@/lib/roles";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { requireUser } from "@/lib/apiAuth";
import { carryOverItems, findList, listFlagChanges, parseListInput, recordListFlagChanges } from "@/lib/lists";
import { withoutUploadedCovers } from "@/lib/uploads";
import { reverseTakedownRefusal } from "@/lib/staffReports";
import { listContentChange } from "@/lib/listEditRules";
import { logStaffAction } from "@/lib/staffLog";
import { refreshStaffReportNotices } from "@/lib/staffNotify";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, props: Params) {
  const params = await props.params;
  const viewer = await getCurrentUser();
  const list = await findList(params.id, viewer);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  return NextResponse.json(list);
}

export async function PATCH(req: Request, props: Params) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to edit this list.");
  if (response) return response;
  const list = await findList(params.id, currentUser);
  if (!list || !list.canEdit) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseListInput(body, can(currentUser, "lists.curate"));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  // Un-hiding is an admin's call once an admin has been involved (lib/staffReportRules.ts mayReverseTakedown).
  if (list.hidden && parsed.data.hidden === false) {
    const refusal = await reverseTakedownRefusal(currentUser, "list", list.id);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }
  // Staff changing someone else's Pick, spotlight or hidden flag goes in the staff log, and so does a
  // change to its title, description or books. Owners' own edits don't. A hide keeps the role the
  // hider had then (lib/staffReports.ts takedownTrail).
  const changes = list.isOwner ? [] : listFlagChanges(list, parsed.data).map((c) =>
    c.action === "list.hide" ? { ...c, after: { ...c.after, byRole: roleOf(currentUser) } } : c);
  const edit = list.isOwner ? null : listContentChange(list, { ...parsed.data, items: parsed.items });

  // Items are replaced wholesale: it keeps reordering, notes and removals to one request. When each
  // book was added, and who wrote a remixed note, carry over.
  await prisma.$transaction([
    prisma.listItem.deleteMany({ where: { listId: list.id } }),
    prisma.list.update({
      where: { id: list.id },
      data: { ...parsed.data, items: { createMany: { data: carryOverItems(list.items, await withoutUploadedCovers(parsed.items)) } } },
    }),
  ]);
  await recordListFlagChanges(currentUser.id, list.id, changes, body?.reason);
  if (edit) {
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;
    await logStaffAction({ actorId: currentUser.id, action: "list.edit", targetType: "list", targetId: list.id, before: edit.before, after: edit.after, reason });
  }
  // A hide closes the list's open reports: the bell's "reports waiting" follows.
  if (changes.some((c) => c.action === "list.hide")) await refreshStaffReportNotices();
  return NextResponse.json({ id: list.id });
}

export async function DELETE(req: Request, props: Params) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to delete this list.");
  if (response) return response;
  const list = await findList(params.id, currentUser);
  if (!list || !list.canEdit) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  // Staff can edit anyone's list but not delete it: deleting takes its reports with it.
  if (!list.isOwner) {
    return NextResponse.json({ error: "Only the list's owner can delete it. Hide it instead, so the reports stay on record." }, { status: 403 });
  }
  await prisma.listReport.deleteMany({ where: { listId: list.id } });
  await prisma.listItem.deleteMany({ where: { listId: list.id } });
  await prisma.list.delete({ where: { id: list.id } });
  return NextResponse.json({ deleted: true });
}
