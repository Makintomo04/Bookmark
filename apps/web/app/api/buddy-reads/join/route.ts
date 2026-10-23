import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { REMOVED_MESSAGE, buddyReadError, joinBuddyRead, loadInvite, parseBody, wasRemoved } from "@/lib/buddyReadsServer";
import { attachReferral } from "@/lib/referrals";
import { BUDDY_READ_MAX_MEMBERS } from "@/lib/buddyReads";
import getCurrentUser from "@/app/actions/getCurrentUser";

const joinSchema = z.object({ code: z.string().trim().regex(/^[a-z0-9]{6,20}$/, "That invite link doesn't look right.") });

// The invite, as the /circles/join/<code> page shows it, for the mobile app: the book, the host, who's
// in. Public like that page, and like it nothing from behind the lock. The circle's id is only given to
// someone already in it, so the app can open it instead.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const invite = await loadInvite(code);
  if (!invite) return buddyReadError("This invite link isn't valid any more.", 404);
  const { buddyRead, host, members } = invite;
  const viewer = await getCurrentUser();
  const isMember = !!viewer && members.some((m) => m.userId === viewer.id);
  const removed = !!viewer && !isMember && (await wasRemoved(buddyRead.id, viewer.id));
  return NextResponse.json({
    buddyRead: { title: buddyRead.title, author: buddyRead.author, coverImage: buddyRead.coverImage, cardColour: buddyRead.cardColour },
    host: host && { username: host.username },
    members: members.map((m) => ({ username: m.username, image: m.image, favColour: m.favColour })),
    full: members.length >= BUDDY_READ_MAX_MEMBERS,
    viewer: { isMember, buddyReadId: isMember ? buddyRead.id : null, removed, removedMessage: removed ? REMOVED_MESSAGE : null },
  });
}

// Joins with an invite code (from /buddy-reads/join/[code] or an in-app invite). Adds the book to the
// reader's shelf as Currently reading unless it's already there.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser("Sign in to join this reading circle.");
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
  // A new reader who came in through this circle's invite was brought by its host.
  await attachReferral(currentUser.id, buddyRead.hostId, "circle").catch((e) => console.error("[referrals]", e));
  return NextResponse.json(result);
}
