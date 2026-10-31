import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { parseBody } from "@/lib/buddyReadsServer";
import { CLUB_REMOVED_MESSAGE, clubError, joinClub, loadClubInvite, wasRemovedFromClub } from "@/lib/clubsServer";
import getCurrentUser from "@/app/actions/getCurrentUser";

const joinSchema = z.object({ code: z.string().trim().regex(/^[a-z0-9]{6,20}$/, "That invite link doesn't look right.") });

// The club's invite, as /clubs/join/<code> shows it, for the mobile app: the club, its host, who's in, and
// the covers of what it's reading and what's next. Public, like that page. The club's id is only given to
// someone already in it, so the app can open it instead.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const viewer = await getCurrentUser();
  const invite = await loadClubInvite(code, viewer?.id);
  if (!invite) return clubError("This invite link isn't valid any more.", 404);
  const { club, host, members, memberCount, current, next, booksRead, full } = invite;
  const isMember = !!viewer && members.some((m) => m.userId === viewer.id);
  const removed = !!viewer && !isMember && (await wasRemovedFromClub(club.id, viewer.id));
  return NextResponse.json({
    club: { name: club.name, about: club.about },
    host: host && { username: host.username, displayName: host.displayName, staffBadge: host.staffBadge },
    members: members.map((m) => ({ username: m.username, displayName: m.displayName, image: m.image, favColour: m.favColour })),
    current,
    next,
    booksRead,
    // Members a stranger can't see (private or followers-only profiles, blocks) are only counted.
    memberCount,
    full,
    viewer: { isMember, clubId: isMember ? club.id : null, removed, removedMessage: removed ? CLUB_REMOVED_MESSAGE : null },
  });
}

// Joins with the club's invite code: the club, and with it the book it's reading and the next one (added to
// the reader's shelf unless they're there already).
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser("Sign in to join this club.");
  if (response) return response;

  const parsed = await parseBody(req, joinSchema);
  if (parsed.response) return parsed.response;

  // Also slows down guessing codes.
  const limit = rateLimit(`club-join:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  const club = await prisma.club.findUnique({ where: { inviteCode: parsed.data.code } });
  if (!club) return clubError("This invite link isn't valid any more.", 404);

  const result = await joinClub(club, currentUser.id);
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json(result);
}
