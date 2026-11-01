import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { clubAbout, clubRole, clubShelf, createClubSchema } from "@/lib/clubs";
import { hostingRefusal, parseBody } from "@/lib/buddyReadsServer";
import { canHostAnotherClub, clubError, newClubInviteCode } from "@/lib/clubsServer";

// The reader's clubs (newest first, archived ones after): each one's name, their role, how many are in it,
// and the cover of what it's reading. Archived clubs stay listed, so a host can still reach Reopen and
// Unmute. And whether they may start another, so the list says so before the server has to.
export async function GET() {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  // Active clubs first, then archived ones in what room is left, so a long list never loses an active club.
  const LIMIT = 50;
  const active = await prisma.clubMember.findMany({
    where: { userId: currentUser.id, club: { status: "ACTIVE" } },
    orderBy: { joinedAt: "desc" },
    take: LIMIT,
    include: { club: true },
  });
  const archived = active.length < LIMIT ? await prisma.clubMember.findMany({
    where: { userId: currentUser.id, club: { status: "ARCHIVED" } },
    orderBy: { joinedAt: "desc" },
    take: LIMIT - active.length,
    include: { club: true },
  }) : [];
  const mine = [...active, ...archived];
  const clubIds = mine.map((m) => m.clubId);
  const [counts, circles, hosting] = await Promise.all([
    prisma.clubMember.groupBy({ by: ["clubId"], where: { clubId: { in: clubIds } }, _count: { _all: true } }),
    prisma.buddyRead.findMany({
      where: { clubId: { in: clubIds }, status: "ACTIVE" },
      select: { id: true, clubId: true, title: true, author: true, coverImage: true, cardColour: true, status: true, startsAt: true },
    }),
    canHostAnotherClub(currentUser.id),
  ]);
  const countById = new Map(counts.map((c) => [c.clubId, c._count._all]));

  return NextResponse.json({
    hosting,
    clubs: mine.map(({ club, ...m }) => {
      const shelf = clubShelf(circles.filter((c) => c.clubId === club.id));
      const book = shelf.reading[0] ?? shelf.upcoming[0] ?? null;
      return {
        id: club.id,
        name: club.name,
        about: club.about,
        role: clubRole(m, club.hostId),
        memberCount: countById.get(club.id) ?? 0,
        archived: club.status === "ARCHIVED",
        current: book && {
          id: book.id,
          title: book.title,
          author: book.author,
          coverImage: book.coverImage,
          cardColour: book.cardColour,
          startsAt: book.startsAt.toISOString(),
          upcoming: shelf.reading.length === 0,
        },
      };
    }),
  });
}

// Starts a club. The host is its first member; books come after, from the club page.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser("Sign in to start a club.");
  if (response) return response;

  const parsed = await parseBody(req, createClubSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`club-create:${currentUser.id}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  // Free accounts host one active club; Plus has no limit. Joining is never limited.
  const hosting = await canHostAnotherClub(currentUser.id);
  if (!hosting.allowed) return hostingRefusal(hosting);

  const club = await prisma.club.create({
    data: { name: parsed.data.name, about: clubAbout(parsed.data.about), hostId: currentUser.id, inviteCode: await newClubInviteCode() },
  });
  await prisma.clubMember.create({ data: { clubId: club.id, userId: currentUser.id } });
  return NextResponse.json({ id: club.id, inviteCode: club.inviteCode });
}
