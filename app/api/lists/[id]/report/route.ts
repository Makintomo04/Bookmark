import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { findList } from "@/lib/lists";
import { REPORT_REASONS } from "@/lib/listRules";


export async function POST(req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Sign in to report a list." }, { status: 401 });
  }
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
