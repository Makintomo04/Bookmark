import { requireUser } from "@/lib/apiAuth";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { isReorderOf, storedFavouriteIds } from "@/lib/favourites";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).max(5000) });

// Saves the ranking of your favourites: every one of them, #1 first. It can only put the same books in a new
// order, so a favourite added or removed in another tab since the page loaded is refused rather than lost.
export async function PUT(request: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'ids must be a list of book ids' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { favouriteIds: true } });
  if (!user) {
    return NextResponse.json({ error: 'User Not Found' }, { status: 404 });
  }
  if (!isReorderOf(user.favouriteIds, parsed.data.ids)) {
    return NextResponse.json({ error: 'Your favourites changed. Refresh and try again.' }, { status: 409 });
  }
  const updated = await prisma.user.update({
    where: { id: currentUser.id },
    data: { favouriteIds: storedFavouriteIds(parsed.data.ids) },
  });
  return NextResponse.json(sanitizeUser(updated));
}
