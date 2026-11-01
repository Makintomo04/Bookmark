import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { listStatViews } from "@/lib/statViews";

// Delete a saved stat view. Not gated: a reader whose Plus has lapsed can still clear out their own views.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id } = await props.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "That view doesn't exist." }, { status: 404 });
  await prisma.statView.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ views: await listStatViews(user.id) });
}
