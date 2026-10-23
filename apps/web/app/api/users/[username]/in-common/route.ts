import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { canView, getRelation, privacyOf, privacySelect, sharedBookWhere } from "@/lib/privacy";
import { isFinishedBook } from "@/lib/readerTier";

export interface InCommonBook {
  workKey: string;
  title: string;
  author: string;
  coverImage: string;
  cardColour: string | null;
  // The profile owner's rating, or null when they haven't rated it or their review of it is hidden from the viewer.
  rating: number | null;
}

export interface BooksInCommon {
  read: InCommonBook[];
  wantToRead: InCommonBook[];
}

const NOTHING: BooksInCommon = { read: [], wantToRead: [] };

const bookSelect = {
  workKey: true,
  title: true,
  author: true,
  coverImage: true,
  cardColour: true,
  status: true,
  timesRead: true,
  rating: true,
  reviewPrivate: true,
  createdAt: true,
  completedAt: true,
} as const;

type Row = { workKey: string | null; status: string; timesRead: number | null };

// Each work on a shelf as "read" (any copy finished, re-reads included) or "want" (only ever shelved
// as Want to read). Copies that are only being read, paused or dropped match neither group.
function shelfByWork<T extends Row>(books: T[]) {
  const read = new Map<string, T[]>();
  const want = new Map<string, T>();
  for (const book of books) {
    if (!book.workKey) continue;
    if (isFinishedBook(book)) read.set(book.workKey, [...(read.get(book.workKey) ?? []), book]);
    else if (book.status === "NOT_STARTED") want.set(book.workKey, book);
  }
  read.forEach((_, key) => want.delete(key));
  return { read, want };
}

const time = (date: Date | null) => (date ? date.getTime() : 0);

// Books the signed-in viewer and this profile's owner share by Open Library work: both read, and
// both want to read. Empty whenever the viewer couldn't see the owner's shelf on their profile.
export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  const { user: viewer, response } = await requireUser();
  if (response) return response;

  const owner = await prisma.user.findUnique({
    where: { username: params.username },
    select: { id: true, ...privacySelect },
  });
  if (!owner) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (owner.id === viewer.id) return NextResponse.json(NOTHING);

  const relation = await getRelation(viewer.id, owner.id);
  const privacy = privacyOf(owner);
  // A reader who blocked the viewer looks the same as one that doesn't exist, as on the profile itself.
  if (relation.blocked === "byOwner") return NextResponse.json({ error: "User not found" }, { status: 404 });
  // canView also says no to any block, so this covers the viewer's own blocks and hidden profiles.
  if (!canView(relation, privacy, "profile")) return NextResponse.json(NOTHING);
  const showWantToRead = canView(relation, privacy, "wantToRead");
  const showRatings = canView(relation, privacy, "reviews");

  const viewerBooks = await prisma.book.findMany({
    where: { userId: viewer.id, status: { in: ["COMPLETED", "NOT_STARTED", "STARTED"] } },
    select: { workKey: true, status: true, timesRead: true },
  });
  const mine = shelfByWork(viewerBooks);
  const keys = [...Array.from(mine.read.keys()), ...(showWantToRead ? Array.from(mine.want.keys()) : [])];
  if (keys.length === 0) return NextResponse.json(NOTHING);

  const ownerBooks = await prisma.book.findMany({
    where: { userId: owner.id, workKey: { in: keys }, ...sharedBookWhere },
    select: bookSelect,
  });
  const theirs = shelfByWork(ownerBooks);

  type OwnerBook = (typeof ownerBooks)[number];
  const toBook = (book: OwnerBook, rating: number | null): InCommonBook => ({
    workKey: book.workKey!,
    title: book.title,
    author: book.author,
    coverImage: book.coverImage,
    cardColour: book.cardColour,
    rating,
  });

  const read = Array.from(theirs.read.entries())
    .filter(([key]) => mine.read.has(key))
    .map(([, copies]) => {
      const sorted = [...copies].sort((a, b) => time(b.completedAt) - time(a.completedAt));
      // A rating from the copy that carries one, but only if that copy's review isn't private.
      const rated = sorted.find((b) => b.rating != null);
      const rating = showRatings && rated && !rated.reviewPrivate ? rated.rating : null;
      return { book: toBook(sorted[0], rating), at: time(sorted[0].completedAt) };
    })
    .sort((a, b) => b.at - a.at)
    .map((r) => r.book);

  const wantToRead = !showWantToRead ? [] : Array.from(theirs.want.entries())
    .filter(([key]) => mine.want.has(key))
    .sort(([, a], [, b]) => time(b.createdAt) - time(a.createdAt))
    .map(([, book]) => toBook(book, null));

  return NextResponse.json({ read, wantToRead } satisfies BooksInCommon);
}
