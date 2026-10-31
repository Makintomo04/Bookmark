import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { findList } from "@/lib/lists";
import { REPORT_REASONS } from "@/lib/listRules";
import { alertReport } from "@/lib/reportAlerts";
import { notifyStaffOfReport } from "@/lib/staffNotify";
import { Prisma } from "@prisma/client";


export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to report a list.");
  if (response) return response;
  const list = await findList(params.id, currentUser);
  if (!list || list.isOwner) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const { reason } = (await req.json().catch(() => null)) ?? {};
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "Choose a reason." }, { status: 400 });
  }
  // Reporting twice is a no-op rather than an error: the reader's intent is already recorded.
  if (!list.hasReported) {
    try {
      await prisma.listReport.create({ data: { listId: list.id, reporterId: currentUser.id, reason } });
    } catch (err) {
      // A double submit: the first one already recorded it (and sent the alert).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return NextResponse.json({ reported: true });
      throw err;
    }
    await alertReport({
      kind: "list",
      id: list.id,
      reason,
      reporterId: currentUser.id,
      authorId: list.ownerId,
      excerpt: [list.title, list.description].filter(Boolean).join("\n\n"),
      path: `/lists/${list.id}`,
    });
    await notifyStaffOfReport("list", list.id);
  }
  return NextResponse.json({ reported: true });
}
