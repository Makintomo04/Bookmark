import prisma from "./db"
import { pickBuyIsbn } from "@bookmark/shared/affiliate"

// The ISBN a book page's shop links point at (packages/shared/src/affiliate.ts pickBuyIsbn): the print
// edition of the catalogue Work that most readers shelved. Null for a book with no Work (nobody has shelved
// it yet) or no edition with an ISBN, and the links fall back to a search.
export async function buyIsbnForWork(workId: string | null): Promise<string | null> {
  if (!workId) return null
  const editions = await prisma.edition.findMany({
    where: { workId, OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }] },
    select: { isbn13: true, isbn10: true, format: true, _count: { select: { books: true } } },
  })
  return pickBuyIsbn(editions.map((edition) => ({ ...edition, shelvedBy: edition._count.books })))
}
