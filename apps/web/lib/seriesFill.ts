import prisma from "@/lib/db"
import { resolveCatalogMany } from "@/lib/catalog"
import { workMatchKey } from "@/lib/catalog/normalise"
import { hardcoverConfigured, hardcoverSeriesBooks, hardcoverSeriesOf, type HardcoverSeriesBook } from "@/lib/hardcover"
import { seriesKey } from "@/lib/series"
import { recordSeriesCheck } from "@/lib/seriesNews"
import { companionPlace, placeWhileUpcoming, placedPositions } from "@/lib/releaseRules"

// Gives catalogue works their series, from Hardcover. Open Library's search results carry no series, so a
// book added from search was filed without one, and the series tracker, Follow series and Catch me up had
// nothing to go on. When a work is in a series, the series' other main books are filed too (Hardcover
// works, with book pages), so the tracker can show the next one before anyone on Bookmark has shelved it.
//
// Each work is asked about once (Work.seriesCheckedAt). Hardcover counts each top-level query field as a
// request: four for a work in a series, three for a standalone. A failed request leaves the work unchecked,
// so the next add or the backfill tries again.
//
// The series is remembered too (SeriesCheck), so the weekly re-check can spot books released later, and a
// fill that finds books past what was known tells the series' readers (lib/seriesNews.ts).

export type SeriesFillResult = "series" | "none" | "skipped"

// What one fill costs against Hardcover's allowance, by result (scripts/backfill-series.ts budgets by it).
// A failure may have spent up to the series figure before it threw.
export const SERIES_FILL_REQUESTS: Record<SeriesFillResult, number> = { series: 4, none: 3, skipped: 0 }

// A series a librarian set or cleared (curatedFields, lib/catalogueFix.ts) is theirs: Hardcover never
// fills or changes it, on the work or as a companion of another.
export const SERIES_CURATED = "seriesName"
const seriesCurated = (w: { curatedFields: string[] }) => w.curatedFields.includes(SERIES_CURATED)

// Whether a fill leaves a work alone without asking Hardcover: it has no first author to ask with, it was
// asked already, or its series is a librarian's. The backfill picks every unchecked work, so a curated one
// comes round on each run, and this is what keeps it from being refilled.
export const seriesFillSkips = (work: { authors: string[]; seriesCheckedAt: Date | null; curatedFields: string[] }) =>
  !work.authors[0] || work.seriesCheckedAt != null || seriesCurated(work)

// One work. Throws when Hardcover fails, like lib/hardcover.ts.
export async function fillWorkSeries(workId: string): Promise<SeriesFillResult> {
  const work = await prisma.work.findUnique({
    where: { id: workId },
    select: { id: true, title: true, authors: true, seriesName: true, seriesPosition: true, seriesCheckedAt: true, curatedFields: true, releaseDate: true },
  })
  if (!work || seriesFillSkips(work) || !hardcoverConfigured()) return "skipped"
  const author = work.authors[0]

  const found = await hardcoverSeriesOf(work.title, author)
  if (!found) {
    await prisma.work.update({ where: { id: work.id }, data: { seriesCheckedAt: new Date() } })
    return "none"
  }
  // A series the work already had (from a Goodreads title, say) keeps its spelling, so its books stay together.
  const name = work.seriesName ?? found.name
  const companions = await hardcoverSeriesBooks(found.id, author)
  const checkedAt = new Date()
  // A book not out yet (shelved from Upcoming, say) takes its series but not its place: the tracker's "next"
  // is a book you can read, and counting its place would tell the series' readers it's out
  // (lib/seriesNews.ts). The weekly re-check gives it its place once Hardcover lists it as released.
  const position = placeWhileUpcoming(found.position, work.releaseDate, checkedAt.toISOString().slice(0, 10))
  // The work's own place is taken by the work, whatever Hardcover titles it ("Mistborn: The Final Empire").
  const { held } = await fileSeriesBooks(name, author, companions.filter((b) => b.position !== found.position), checkedAt)

  await prisma.work.update({
    where: { id: work.id },
    data: {
      seriesCheckedAt: checkedAt,
      ...(!work.seriesName && { seriesName: name }),
      ...(work.seriesPosition == null && position != null && { seriesPosition: position }),
    },
  })
  try {
    await recordSeriesCheck({ key: seriesKey(name, author), name, author }, found.id, [...placedPositions(companions, held), position], { checkedAt })
  } catch (err) {
    // The work has its series either way; the next fill or re-check of the series records it.
    console.warn(`series: couldn't record series "${name}":`, err instanceof Error ? err.message : err)
  }
  return "series"
}

// Gives a series' books their place: works already in the catalogue under a book's title and author take
// the series, and the rest are filed (Hardcover works, with book pages). Used by the fill and by the weekly
// re-check (lib/seriesRecheck.ts) for books released since.
//
// Hardcover leaves out books it dates ahead (lib/hardcover.ts), but not ones it hasn't dated, so a book the
// catalogue knows is still to come (a librarian's release date, or one an author check found) takes its
// series but not yet its place (lib/releaseRules.ts placeWhileUpcoming), as in fillWorkSeries. Its place is
// returned in `held`, for the caller to leave out of the series' highest book, so nobody is told it's new in
// the series before it's out; the next re-check after its release gives it its place.
export async function fileSeriesBooks(name: string, author: string, companions: HardcoverSeriesBook[], checkedAt = new Date()): Promise<{ held: Set<number> }> {
  const today = checkedAt.toISOString().slice(0, 10)
  const held = new Set<number>()
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
      select: { id: true, title: true, authors: true, matchKey: true, seriesName: true, seriesPosition: true, curatedFields: true, releaseDate: true },
      take: 1000,
    })
    : []
  const byMatch = new Map<string, typeof existing>()
  for (const w of existing) {
    const key = w.matchKey ?? workMatchKey(w.title, w.authors[0])
    if (key) byMatch.set(key, [...(byMatch.get(key) ?? []), w])
  }
  // A companion's series is now known, so it counts as checked and isn't asked about again. A work filed in
  // this series without a place (announced before it was out, lib/authorNews.ts) takes its place now.
  for (const { book, matchKey } of keyed) {
    for (const had of byMatch.get(matchKey) ?? []) {
      // A librarian's series (lib/catalogueFix.ts createWorkByHand) is left as it is, but its place is held back too.
      const { takes, position, held: notOut } = companionPlace(had, book, name, author, today)
      if (notOut) held.add(book.position)
      if (!takes) continue
      await prisma.work.update({ where: { id: had.id }, data: { seriesName: had.seriesName ?? name, seriesPosition: position, seriesCheckedAt: checkedAt } })
    }
  }
  const missing = keyed.filter((k) => !byMatch.has(k.matchKey)).map((k) => k.book)
  if (missing.length) {
    for (const b of missing) if (placeWhileUpcoming(b.position, b.releaseDate, today) == null) held.add(b.position)
    const filed = await resolveCatalogMany(missing.map((b) => ({
      hardcoverId: b.hardcoverId ?? null,
      title: b.title,
      author,
      coverUrl: b.coverUrl,
      description: b.description ?? null,
      year: b.year ?? null,
      releaseDate: b.releaseDate ?? null,
      pages: b.pages,
      series: { name, position: placeWhileUpcoming(b.position, b.releaseDate, today) },
    })))
    const ids = filed.filter((r) => r.work.seriesName === name).map((r) => r.work.id)
    if (ids.length) await prisma.work.updateMany({ where: { id: { in: ids } }, data: { seriesCheckedAt: checkedAt } })
  }
  return { held }
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
