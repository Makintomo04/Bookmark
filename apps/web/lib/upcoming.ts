import prisma from "@/lib/db"
import type { DiscoverBook } from "@/lib/openLibrary"
import { authorSlug } from "@/lib/authorNames"
import { MERGED_PREFIX } from "@/lib/catalogueMergeRules"
import { seriesKey } from "@/lib/series"
import { hasPage, hasPageWhere } from "@/lib/workPages"

// Upcoming in Discover (BOO-7): catalogue books with a release date still ahead, soonest first, with the
// ones by authors the reader follows, or in series they follow, ahead of the rest. Only books with a page,
// so each one opens. The catalogue learns of books coming out from Hardcover, when an author someone follows
// announces one (lib/authorNews.ts), and from Open Library editions dated ahead.

export interface UpcomingBook extends DiscoverBook {
  releaseDate: string
  // By an author the reader follows, or in a series they follow.
  followed: boolean
}

// Works read to rank, soonest first; far more than a page shows. Books the reader follows are read on their
// own as well (FOLLOWED_CANDIDATES), so one a year off still comes first however full the catalogue gets.
const CANDIDATES = 300
const FOLLOWED_CANDIDATES = 120

export interface UpcomingWork {
  id: string
  openLibraryKey: string | null
  hardcoverId: string | null
  pageApprovedAt: Date | null
  title: string
  authors: string[]
  authorKeys: string[]
  seriesName: string | null
  coverUrl: string | null
  firstPublishYear: number | null
  releaseDate: string | null
}

export interface ReaderFollows {
  authorKeys: Set<string>
  authorSlugs: Set<string>
  seriesKeys: Set<string>
  // As followed, for finding their books in the catalogue: author names and series names.
  authorNames?: string[]
  seriesNames?: string[]
}

export const followsWork = (w: Pick<UpcomingWork, "authors" | "authorKeys" | "seriesName">, f: ReaderFollows) =>
  w.authorKeys.some((k) => f.authorKeys.has(k)) ||
  w.authors.some((a) => f.authorSlugs.has(authorSlug(a))) ||
  // Under any of its authors: a co-written series is followed under whichever author the catalogue lists first.
  (!!w.seriesName && w.authors.some((a) => f.seriesKeys.has(seriesKey(w.seriesName!, a))))

// Only books still to come on `today`, followed ones first, each group soonest first. No database.
export function rankUpcoming(works: UpcomingWork[], follows: ReaderFollows | null, today: string): UpcomingBook[] {
  return works
    .filter((w): w is UpcomingWork & { releaseDate: string } => !!w.releaseDate && w.releaseDate > today)
    .map((w) => ({
      workKey: w.openLibraryKey,
      pageWorkId: hasPage(w) ? w.id : null,
      hardcoverId: w.hardcoverId,
      title: w.title,
      author: w.authors[0] ?? "Unknown",
      pages: null,
      coverUrl: w.coverUrl,
      year: w.firstPublishYear,
      releaseDate: w.releaseDate,
      followed: !!follows && followsWork(w, follows),
    }))
    .sort((a, b) => Number(b.followed) - Number(a.followed) || a.releaseDate.localeCompare(b.releaseDate) || a.title.localeCompare(b.title))
}

async function readerFollows(userId: string): Promise<ReaderFollows> {
  const [authors, series] = await Promise.all([
    prisma.authorFollow.findMany({ where: { userId }, select: { authorKey: true, slug: true, name: true } }),
    prisma.seriesFollow.findMany({ where: { userId }, select: { seriesKey: true, name: true } }),
  ])
  return {
    authorKeys: new Set(authors.map((a) => a.authorKey)),
    authorSlugs: new Set(authors.map((a) => a.slug)),
    seriesKeys: new Set(series.map((s) => s.seriesKey)),
    authorNames: authors.map((a) => a.name),
    seriesNames: series.map((s) => s.name),
  }
}

const upcomingSelect = { id: true, openLibraryKey: true, hardcoverId: true, pageApprovedAt: true, title: true, authors: true, authorKeys: true, seriesName: true, coverUrl: true, firstPublishYear: true, releaseDate: true } as const

// `today` is the reader's day, "YYYY-MM-DD". Books the reader marked Not interested are left out.
export async function upcomingBooks(viewerId: string | null, { today, limit = 48 }: { today: string, limit?: number }): Promise<UpcomingBook[]> {
  const ahead = { releaseDate: { gt: today }, AND: [hasPageWhere, { NOT: { key: { startsWith: MERGED_PREFIX } } }] }
  const follows = viewerId ? await readerFollows(viewerId) : null
  // Names as followed; followsWork below has the final say, with keys and slugs.
  const followedWhere = follows && [
    ...(follows.authorKeys.size ? [{ authorKeys: { hasSome: Array.from(follows.authorKeys) } }] : []),
    ...(follows.authorNames?.length ? [{ authors: { hasSome: follows.authorNames } }] : []),
    ...(follows.seriesNames?.length ? [{ seriesName: { in: follows.seriesNames } }] : []),
  ]
  const [soonest, followed, notInterested] = await Promise.all([
    prisma.work.findMany({ where: ahead, orderBy: { releaseDate: "asc" }, take: CANDIDATES, select: upcomingSelect }),
    followedWhere?.length
      ? prisma.work.findMany({ where: { ...ahead, OR: followedWhere }, orderBy: { releaseDate: "asc" }, take: FOLLOWED_CANDIDATES, select: upcomingSelect })
      : [],
    viewerId ? prisma.book.findMany({ where: { userId: viewerId, status: "NOT_INTERESTED", workId: { not: null } }, select: { workId: true } }) : [],
  ])
  const hidden = new Set(notInterested.map((b) => b.workId))
  const works = Array.from(new Map([...followed, ...soonest].map((w) => [w.id, w])).values())
  return rankUpcoming(works.filter((w) => !hidden.has(w.id)), follows, today).slice(0, limit)
}
