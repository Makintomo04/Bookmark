import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { buddyReadError, joinBuddyRead, parseBody } from "@/lib/buddyReadsServer";

const joinSchema = z.object({ code: z.string().trim().regex(/^[a-z0-9]{6,20}$/, "That invite link doesn't look right.") });

// Joins with an invite code (from /buddy-reads/join/[code] or an in-app invite). Adds the book to the
// reader's shelf as Currently reading unless it's already there.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser("Sign in to join this buddy read.");
  if (response) return response;

  const parsed = await parseBody(req, joinSchema);
  if (parsed.response) return parsed.response;

  // Also slows down guessing codes.
  const limit = rateLimit(`buddy-read-join:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const buddyRead = await prisma.buddyRead.findUnique({ where: { inviteCode: parsed.data.code } });
  if (!buddyRead) return buddyReadError("This invite link isn't valid any more.", 404);

  const result = await joinBuddyRead(buddyRead, currentUser.id);
  if (!result.ok) return buddyReadError(result.error, result.status);
  return NextResponse.json(result);
}
