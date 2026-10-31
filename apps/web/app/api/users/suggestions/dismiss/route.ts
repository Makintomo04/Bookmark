import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { handleOf } from "@/lib/handle";
import { findUserByUsername } from "@/lib/userLookup";
import { NextResponse } from "next/server";
import { z } from "zod";

// Dismissing someone from People you may know, for good (BOO-81). DELETE is the toast's Undo.
//   POST   /api/users/suggestions/dismiss  { username }
//   DELETE /api/users/suggestions/dismiss  { username }
// Nothing is said either way about whether the reader exists or could have been suggested.
const bodySchema = z.object({ username: z.string().min(1).max(60) }).strict();

async function target(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return null;
  return findUserByUsername(handleOf(parsed.data.username), { id: true });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const other = await target(req);
  if (other && other.id !== user.id) {
    await prisma.suggestionDismissal.upsert({
      where: { userId_dismissedId: { userId: user.id, dismissedId: other.id } },
      create: { userId: user.id, dismissedId: other.id },
      update: {},
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const other = await target(req);
  if (other) await prisma.suggestionDismissal.deleteMany({ where: { userId: user.id, dismissedId: other.id } });
  return NextResponse.json({ ok: true });
}
