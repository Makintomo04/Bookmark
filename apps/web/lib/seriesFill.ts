import prisma from "@/lib/db"
import { resolveCatalogMany } from "@/lib/catalog"
import { workMatchKey } from "@/lib/catalog/normalise"
import { hardcoverConfigured, hardcoverSeriesBooks, hardcoverSeriesOf } from "@/lib/hardcover"

// Gives catalogue works their series, from Hardcover. Open Library's search results carry no series, so a
// book added from search was filed without one, and the series tracker, Follow series and Catch me up had
// nothing to go on. When a work is in a series, the series' other main books are filed too (Hardcover
// works, with book pages), so the tracker can show the next one before anyone on Bookmark has shelved it.
//
// Each work is asked about once (Work.seriesCheckedAt). Hardcover counts each top-level query field as a
// request: four for a work in a series, three for a standalone. A failed request leaves the work unchecked,
// so the next add or the backfill tries again.

export type SeriesFillResult = "series" | "none" | "skipped"

// What one fill costs against Hardcover's allowance, by result (scripts/backfill-series.ts budgets by it).
// A failure may have spent up to the series figure before it threw.
export const SERIES_FILL_REQUESTS: Record<SeriesFillResult, number> = { series: 4, none: 3, skipped: 0 }

// A series a librarian set or cleared (curatedFields, lib/catalogueFix.ts) is theirs: Hardcover never
// fills or changes it, on the work or as a companion of another.
export const SERIES_CURATED = "seriesName"
const seriesCurated = (w: { curatedFields: string[] }) => w.curatedFields.includes(SERIES_CURATED)

// One work. Throws when Hardcover fails, like lib/hardcover.ts.
export async function fillWorkSeries(workId: string): Promise<SeriesFillResult> {
  const work = await prisma.work.findUnique({
    where: { id: workId },
    select: { id: true, title: true, authors: true, seriesName: true, seriesPosition: true, seriesCheckedAt: true, curatedFields: true },
  })
  const author = work?.authors[0]
  if (!work || !author || work.seriesCheckedAt || seriesCurated(work) || !hardcoverConfigured()) return "skipped"

  const found = await hardcoverSeriesOf(work.title, author)
  if (!found) {
    await prisma.work.update({ where: { id: work.id }, data: { seriesCheckedAt: new Date() } })
    return "none"
  }
  // A series the work already had (from a Goodreads title, say) keeps its spelling, so its books stay together.
  const name = work.seriesName ?? found.name
  const companions = await hardcoverSeriesBooks(found.id, author)

  // Works already in the catalogue under a companion's title and author take the series; the rest are filed.
  const keyed = companions.flatMap((b) => {
    const matchKey = workMatchKey(b.title, author)
    return matchKey ? [{ book: b, matchKey }] : []
  })
  // Older rows may not have a match key stored (scripts/backfill-work-match-keys.ts), so the author's works
  // are keyed here too.
  const existing = keyed.length
    ? await prisma.work.findMany({
      where: { OR: [{ matchKey: { in: keyed.map((k) => k.matchKey) } }, { authors: { has: author } }] },
      select: { id: true, title: true, authors: true, matchKey: true, seriesName: true, curatedFields: true },
      take: 1000,
    })
    : []
  const byMatch = new Map<string, typeof existing>()
  for (const w of existing) {
    const key = w.matchKey ?? workMatchKey(w.title, w.authors[0])
    if (key) byMatch.set(key, [...(byMatch.get(key) ?? []), w])
  }
  // A companion's series is now known, so it counts as checked and isn't asked about again.
  const checkedAt = new Date()
  for (const { book, matchKey } of keyed) {
    for (const had of byMatch.get(matchKey) ?? []) {
      if (!had.seriesName && !seriesCurated(had)) await prisma.work.update({ where: { id: had.id }, data: { seriesName: name, seriesPosition: book.position, seriesCheckedAt: checkedAt } })
    }
  }
  // The work's own place is taken by the work, whatever Hardcover titles it ("Mistborn: The Final Empire").
  const missing = keyed.filter((k) => !byMatch.has(k.matchKey) && k.book.position !== found.position).map((k) => k.book)
  if (missing.length) {
    const filed = await resolveCatalogMany(missing.map((b) => ({
      hardcoverId: b.hardcoverId ?? null,
      title: b.title,
      author,
      coverUrl: b.coverUrl,
      description: b.description ?? null,
      year: b.year ?? null,
      pages: b.pages,
      series: { name, position: b.position },
    })))
    const ids = filed.filter((r) => r.work.seriesName === name).map((r) => r.work.id)
    if (ids.length) await prisma.work.updateMany({ where: { id: { in: ids } }, data: { seriesCheckedAt: checkedAt } })
  }

  await prisma.work.update({
    where: { id: work.id },
    data: {
      seriesCheckedAt: new Date(),
      ...(!work.seriesName && { seriesName: name }),
      ...(work.seriesPosition == null && found.position != null && { seriesPosition: found.position }),
    },
  })
  return "series"
}

// For write paths that must not fail over it (adding a book): false and a warning instead of a throw.
export async function fillWorkSeriesQuietly(workId: string | null | undefined): Promise<boolean> {
  if (!workId) return false
  try {
    return (await fillWorkSeries(workId)) === "series"
  } catch (err) {
    console.warn(`series: couldn't fill work ${workId}:`, err instanceof Error ? err.message : err)
    return false
  }
}
