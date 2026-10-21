import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { privacyOf, privacySelect } from "@/lib/privacy";
import { NextResponse } from "next/server";
import { z } from "zod";

// Any subset of the settings; each one saves as soon as it's changed.
const bodySchema = z.object({
  profileVisibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]),
  reviewVisibility: z.enum(["EVERYONE", "FOLLOWERS", "ONLY_ME"]),
  hideWantToRead: z.boolean(),
  hideFollowCounts: z.boolean(),
}).partial().strict();

export async function GET() {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  return NextResponse.json(privacyOf(currentUser));
}

export async function PATCH(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid privacy settings" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: parsed.data,
    select: privacySelect,
  });
  return NextResponse.json(privacyOf(user));
}
