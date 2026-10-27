import type { Prisma } from "@prisma/client"
import prisma from "./db"
import { booksReadCount } from "./readerTier"
import { blockedUserIds, canView, privacyOf, privacySelect, sharedBookWhere, type Viewable } from "./privacy"
import { hasPageWhere } from "./workPages"
import { normaliseWorkKey } from "./workKey"
import type { Curator } from "./listRules"
import { FACES_SHOWN, followedFirst, tallyReaders, type ReaderCounts } from "./readerCountRules"

export * from "./readerCountRules"

// How many readers have a book on Currently reading and on Want to read, for book details. Counts
// take in every shared copy (private copies never count); the faces beside them are only readers
// whose shelf the viewer could open anyway, people they follow first.

// Enough candidates to find FACES_SHOWN visible profiles among mostly private ones.
const FACE_CANDIDATES = 40
// A ceiling on rows read per request. Past it the count is a floor, which is fine for a social signal.
const ROWS_MAX = 20000

const emptyCounts = (): ReaderCounts => ({ reading: { count: 0, people: [] }, wantToRead: { count: 0, people: [] } })

// Every reader's copy of a work: filed under it in the catalog, or not yet filed but carrying its
// Open Library key. Shared with the book page's ratings and reviews (lib/workReviews.ts). `bookKey` is
// the Open Library work key or, for a book Open Library lacks, the catalogue Work id (normaliseBookKey);
// only a work with a book page counts, so a hand-typed book's id finds nothing.
export async function copiesOfWork(bookKey: string): Promise<Prisma.BookWhereInput> {
  const olKey = normaliseWorkKey(bookKey)
  const work = await prisma.work.findFirst({
    where: olKey ? { openLibraryKey: olKey } : { id: bookKey, ...hasPageWhere },
    select: { id: true, openLibraryKey: true },
  })
  const workKey = olKey ?? work?.openLibraryKey
  const or: Prisma.BookWhereInput[] = []
  if (work) or.push({ workId: work.id })
  if (workKey) or.push({ workKey })
  // No work and no key: match nothing.
  return or.length ? { OR: or } : { id: { in: [] } }
}

export async function readerCountsForWork(bookKey: string, viewerId: string | null): Promise<ReaderCounts> {
  const rows = await prisma.book.findMany({
    where: { status: { in: ["STARTED", "NOT_STARTED"] }, AND: [await copiesOfWork(bookKey), sharedBookWhere] },
    orderBy: { createdAt: "desc" },
    take: ROWS_MAX,
    select: { userId: true, status: true },
  })
  if (rows.length === 0) return emptyCounts()
  const { reading, wantToRead } = tallyReaders(rows)

  const [blocked, follows] = await Promise.all([
    viewerId ? blockedUserIds(viewerId) : [],
    viewerId
      ? prisma.follow.findMany({
          where: { followerId: viewerId, followingId: { in: [...reading, ...wantToRead] } },
          select: { followingId: true },
        })
      : [],
  ])
  const blockedIds = new Set(blocked)
  const followed = new Set(follows.map((f) => f.followingId))
  const candidatesOf = (ids: string[]) => followedFirst(ids.filter((id) => !blockedIds.has(id)), followed).slice(0, FACE_CANDIDATES)
  const candidates = { reading: candidatesOf(reading), wantToRead: candidatesOf(wantToRead) }

  const users = await prisma.user.findMany({
    where: { id: { in: [...candidates.reading, ...candidates.wantToRead] } },
    select: { id: true, username: true, image: true, favColour: true, ...booksReadCount, ...privacySelect },
  })
  const usersById = new Map(users.map((u) => [u.id, u]))

  const facesOf = (ids: string[], what: Viewable): Curator[] => {
    const faces: Curator[] = []
    for (const id of ids) {
      const user = usersById.get(id)
      if (!user) continue
      const relation = { isSelf: id === viewerId, isFollower: followed.has(id), blocked: null }
      if (!canView(relation, privacyOf(user), what)) continue
      faces.push({ username: user.username, image: user.image, favColour: user.favColour, _count: user._count })
      if (faces.length === FACES_SHOWN) break
    }
    return faces
  }

  return {
    reading: { count: reading.length, people: facesOf(candidates.reading, "profile") },
    wantToRead: { count: wantToRead.length, people: facesOf(candidates.wantToRead, "wantToRead") },
  }
}
