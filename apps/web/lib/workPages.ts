import type { Prisma } from "@prisma/client"
import prisma from "./db"

// Which catalogue works have a book page (app/(main)/books/[slug]). An Open Library work always does. A
// work Open Library lacks does only when it came from Hardcover (Work.hardcoverId), and its page goes by
// the Work's id: a work filed from a hand-typed book may be someone's private note, so it never gets one.

// Catalogue works with a book page: an Open Library work, or one first added from a Hardcover hit.
export const hasPageWhere: Prisma.WorkWhereInput = {
  OR: [{ openLibraryKey: { not: null } }, { hardcoverId: { not: null } }],
}

// Of these catalogue works, the ones a book without a work key may link to (DiscoverBook.pageWorkId).
export async function workIdsWithPages(workIds: (string | null | undefined)[]): Promise<Set<string>> {
  const ids = Array.from(new Set(workIds.filter((id): id is string => !!id)))
  if (ids.length === 0) return new Set()
  const works = await prisma.work.findMany({ where: { id: { in: ids }, ...hasPageWhere }, select: { id: true } })
  return new Set(works.map((w) => w.id))
}
