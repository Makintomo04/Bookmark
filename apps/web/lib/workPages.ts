import type { Prisma } from "@prisma/client"
import prisma from "./db"

// Which catalogue works have a book page (app/(main)/books/[slug]). An Open Library work always does. A
// work Open Library lacks does when it came from Hardcover (Work.hardcoverId), or when a librarian approved
// it (Work.pageApprovedAt), and its page goes by the Work's id. A work filed from a hand-typed book may be
// someone's private note, so it gets one only once a librarian has checked it's a real book.

// Catalogue works with a book page: an Open Library work, one first added from a Hardcover hit, or a
// hand-typed one a librarian approved.
export const hasPageWhere: Prisma.WorkWhereInput = {
  OR: [{ openLibraryKey: { not: null } }, { hardcoverId: { not: null } }, { pageApprovedAt: { not: null } }],
}

// The same rule for a work already loaded.
export const hasPage = (work: { openLibraryKey: string | null, hardcoverId: string | null, pageApprovedAt: Date | null }) =>
  !!(work.openLibraryKey || work.hardcoverId || work.pageApprovedAt)

// Of these catalogue works, the ones a book without a work key may link to (DiscoverBook.pageWorkId).
export async function workIdsWithPages(workIds: (string | null | undefined)[]): Promise<Set<string>> {
  const ids = Array.from(new Set(workIds.filter((id): id is string => !!id)))
  if (ids.length === 0) return new Set()
  const works = await prisma.work.findMany({ where: { id: { in: ids }, ...hasPageWhere }, select: { id: true } })
  return new Set(works.map((w) => w.id))
}
