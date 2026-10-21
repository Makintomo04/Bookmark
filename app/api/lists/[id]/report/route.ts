import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { findList } from "@/lib/lists";
import { REPORT_REASONS } from "@/lib/listRules";


export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser("Sign in to report a list.");
  if (response) return response;
  const list = await findList(params.id, currentUser);
  if (!list || list.isOwner) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const { reason } = await req.json();
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "Choose a reason." }, { status: 400 });
  }
  // Reporting twice is a no-op rather than an error: the reader's intent is already recorded.
  if (!list.hasReported) {
    await prisma.listReport.create({ data: { listId: list.id, reporterId: currentUser.id, reason } });
  }
  return NextResponse.json({ reported: true });
}
