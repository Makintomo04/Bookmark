import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { removeFollower } from "@/lib/followRequests";

// Removes `username` from the signed-in reader's followers. They aren't told; following again needs
// approval if the profile isn't public.
export async function DELETE(_req: Request, { params }: { params: { username: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  const follower = await prisma.user.findUnique({ where: { username: params.username }, select: { id: true } });
  if (!follower) return NextResponse.json({ error: "User not found" }, { status: 404 });
  await removeFollower(user.id, follower.id);
  return NextResponse.json({ removed: true });
}
