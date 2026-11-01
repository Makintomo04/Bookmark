import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { REMOVED_MESSAGE, buddyReadError, joinBuddyRead, loadInvite, parseBody, wasRemoved } from "@/lib/buddyReadsServer";
import { BUDDY_READ_MAX_MEMBERS } from "@/lib/buddyReads";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { joinClub } from "@/lib/clubsServer";
import { askOnJoin } from "@bookmark/shared/reminders";

const joinSchema = z.object({ code: z.string().trim().regex(/^[a-z0-9]{6,20}$/, "That invite link doesn't look right.") });

// The invite, as the /circles/join/<code> page shows it, for the mobile app: the book, the host, who's
// in. Public like that page, and like it nothing from behind the lock. The circle's id is only given to
// someone already in it, so the app can open it instead.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const viewer = await getCurrentUser();
  const invite = await loadInvite(code, viewer?.id);
  if (!invite) return buddyReadError("This invite link isn't valid any more.", 404);
  const { buddyRead, host, members, memberCount } = invite;
  // A club's circle is joined through its club: the app opens the club's invite instead.
  const club = buddyRead.clubId ? await prisma.club.findUnique({ where: { id: buddyRead.clubId }, select: { inviteCode: true, status: true } }) : null;
  const isMember = !!viewer && members.some((m) => m.userId === viewer.id);
  const removed = !!viewer && !isMember && (await wasRemoved(buddyRead.id, viewer.id));
  return NextResponse.json({
    buddyRead: { title: buddyRead.title, author: buddyRead.author, coverImage: buddyRead.coverImage, cardColour: buddyRead.cardColour },
    host: host && { username: host.username, displayName: host.displayName, staffBadge: host.staffBadge },
    members: members.map((m) => ({ username: m.username, displayName: m.displayName, image: m.image, favColour: m.favColour })),
    // Everyone counts, named or not.
    memberCount,
    full: memberCount >= BUDDY_READ_MAX_MEMBERS,
    viewer: { isMember, buddyReadId: isMember ? buddyRead.id : null, removed, removedMessage: removed ? REMOVED_MESSAGE : null },
    clubInviteCode: club?.status === "ACTIVE" ? club.inviteCode : null,
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

  // A club's circle (its link, or an in-app invite to it) joins the club, and with it this book and every
  // one after. Someone who left this book on purpose but is still in the club rejoins just the book.
  const club = buddyRead.clubId ? await prisma.club.findUnique({ where: { id: buddyRead.clubId } }) : null;
  if (club?.status === "ACTIVE") {
    const inClub = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: currentUser.id } }, select: { id: true } });
    if (!inClub) {
      const joined = await joinClub(club, currentUser.id);
      if (!joined.ok) return buddyReadError(joined.error, joined.status);
      const isMember = await prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: currentUser.id } }, select: { id: true } });
      if (isMember) return NextResponse.json({ ok: true, buddyReadId: buddyRead.id, clubId: club.id, alreadyMember: false, addedToShelf: false, askReminders: askOnJoin(joined, currentUser.remindersPromptedAt) });
    }
  }

  const result = await joinBuddyRead(buddyRead, currentUser.id);
  if (!result.ok) return buddyReadError(result.error, result.status);
  return NextResponse.json({ ...result, askReminders: askOnJoin(result, currentUser.remindersPromptedAt) });
}
