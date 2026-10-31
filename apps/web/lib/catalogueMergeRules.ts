// The rules for merging two catalogue Works filed for one book, kept pure so scripts/test/catalogueMerge.test.ts
// can check them. lib/catalogueMerge.ts applies them.
//
// A merge moves everything on the duplicate (editions, readers' copies, list items, reading circles, tags,
// reports) to the survivor. The duplicate's row stays, so the merge can be undone, but its key is rewritten
// to "merged:<survivor id>:<its own id>": the catalogue then never files a new copy under it (lib/catalog
// resolves by key), search leaves it out, and its page can follow the key to the survivor (survivorOf).
import { workMatchKey } from "./catalog/normalise.ts"
import { WORK_FIELDS, sameValue, type WorkValues } from "./catalogueFixRules.ts"
import { releaseYear } from "@bookmark/shared/releases"

export const MERGED_PREFIX = "merged:"

export const mergedKey = (survivorId: string, duplicateId: string) => `${MERGED_PREFIX}${survivorId}:${duplicateId}`

// The survivor a merged work's key points at, or null for a work that hasn't been merged.
export function mergedInto(key: string | null | undefined): string | null {
  if (!key?.startsWith(MERGED_PREFIX)) return null
  return key.slice(MERGED_PREFIX.length).split(":")[0] || null
}

export const isMerged = (work: { key: string }) => !!mergedInto(work.key)

// ---- The survivor's details ---------------------------------------------------------------------

type CuratedWork = WorkValues & { curatedFields: string[] }

// What the survivor takes from the duplicate: only what it's missing (a description, a cover, a series, a
// first year). Its own title and authors always stand. curatedFields keeps the survivor's, plus the
// duplicate's for each field whose value now came from it or was the same on both: a librarian checked that
// value. A field the duplicate had corrected but the survivor shows differently stays uncorrected, since the
// survivor's value wins and nobody checked it.
export function mergeWorkValues(survivor: CuratedWork, duplicate: CuratedWork): { patch: Partial<WorkValues>; curatedFields: string[] } {
  const patch: Partial<WorkValues> = {}
  const empty = (v: unknown) => v === null || v === undefined || v === ""
  for (const field of ["description", "coverUrl"] as const) {
    if (empty(survivor[field]) && !empty(duplicate[field])) Object.assign(patch, { [field]: duplicate[field] })
  }
  // The release date and the first year go together too, or publication day takes the book for a reissue
  // (lib/releaseRules.ts isFirstRelease). The duplicate's date comes with its year when the survivor has no
  // year or the same one. A librarian's date (curated) wins over a year that disagrees, as on the staff form,
  // which sets the year from the date; any other date that disagrees is a reissue's, and stays behind.
  const date = survivor.releaseDate ? null : duplicate.releaseDate
  const dateYear = date ? releaseYear(date) : null
  const curatedDate = duplicate.curatedFields.includes("releaseDate")
  if (date && (survivor.firstPublishYear == null || survivor.firstPublishYear === dateYear || curatedDate)) {
    patch.releaseDate = date
    if (survivor.firstPublishYear !== dateYear) patch.firstPublishYear = dateYear
  } else if (survivor.firstPublishYear == null && duplicate.firstPublishYear != null && (!survivor.releaseDate || releaseYear(survivor.releaseDate) === duplicate.firstPublishYear)) {
    patch.firstPublishYear = duplicate.firstPublishYear
  }
  // A series is a pair: the name and the place in it come together, or not at all.
  if (empty(survivor.seriesName) && !empty(duplicate.seriesName)) {
    patch.seriesName = duplicate.seriesName
    patch.seriesPosition = duplicate.seriesPosition
  }
  const now = { ...survivor, ...patch }
  const fromDuplicate = duplicate.curatedFields.filter((f) => (WORK_FIELDS as readonly string[]).includes(f) && (f in patch || sameValue(now[f as keyof WorkValues], duplicate[f as keyof WorkValues])))
  // A year set to match a librarian's date was checked with it.
  const yearWithDate = patch.releaseDate && curatedDate && "firstPublishYear" in patch ? ["firstPublishYear"] : []
  return { patch, curatedFields: Array.from(new Set([...survivor.curatedFields, ...fromDuplicate, ...yearWithDate])) }
}

// ---- Readers with the book on both -------------------------------------------------------------

type When = Date | string | null

// A reader's copy (Book) as the merge sees it. `reads` is how many BookRead rows it has.
export interface CopyRow {
  id: string
  status: string
  rating: number | null
  review: string | null
  reviewSpoiler: boolean | null
  reviewPrivate: boolean | null
  reviewHiddenAt: When
  ratingHiddenAt: When
  isPrivate: boolean | null
  timesRead: number
  currentPage: number | null
  startedAt: When
  completedAt: When
  tags: string[]
  recommendedById: string | null
  recommendedByName: string | null
  reads: number
}

const UNREAD = new Set(["NOT_STARTED", "NOT_INTERESTED"])

// How much reading a copy holds, most telling first: been read at all, reads logged, completed reads, a
// review, a rating, progress, dates, the reader's own tags.
const richness = (c: CopyRow) => [
  UNREAD.has(c.status) ? 0 : 1, c.reads, c.timesRead, c.review ? 1 : 0, c.rating != null ? 1 : 0,
  (c.currentPage ?? 0) > 0 ? 1 : 0, [c.startedAt, c.completedAt].filter(Boolean).length, c.tags.length,
]

export type CopyField = "rating" | "ratingHiddenAt" | "review" | "reviewSpoiler" | "reviewPrivate" | "reviewHiddenAt" | "isPrivate" | "timesRead" | "tags" | "recommendedById" | "recommendedByName"
export type CopyPatch = Partial<Pick<CopyRow, CopyField>>

export interface CopyMerge {
  keep: CopyRow
  drop: CopyRow
  // Applied to the kept copy, and its values before, which an unmerge puts back.
  patch: CopyPatch
  before: CopyPatch
  // What the dropped copy holds that the kept one would lose (copyClashes). Folding is only safe when empty.
  lost: string[]
}

const plain = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
const set = (v: unknown) => v !== null && v !== undefined && v !== ""
// Both copies hold a value and they differ: one would have to go.
const clash = (a: unknown, b: unknown) => set(a) && set(b) && !sameValue(plain(a), plain(b))

// What folding `drop` into `keep` would lose, by the names the merge reports: a review or rating the kept
// copy has its own of, who recommended it when both say, and the dropped copy's reading itself (status,
// dates, progress), since the kept copy's mirror its own read and stay. A dropped copy still on "want to
// read" or "not interested" has no reading to lose. Its reads, notes, tags and completed reads always
// come over, so they never clash.
export function copyClashes(keep: CopyRow, drop: CopyRow): string[] {
  const out: string[] = []
  if (clash(keep.review, drop.review)) out.push("review")
  if (clash(keep.rating, drop.rating)) out.push("rating")
  if (clash(keep.recommendedById ?? keep.recommendedByName, drop.recommendedById ?? drop.recommendedByName)) out.push("recommendedBy")
  if (!UNREAD.has(drop.status) && drop.status !== keep.status) out.push("status")
  if (set(drop.startedAt) && !sameValue(plain(drop.startedAt), plain(keep.startedAt))) out.push("startedAt")
  if (set(drop.completedAt) && !sameValue(plain(drop.completedAt), plain(keep.completedAt))) out.push("completedAt")
  if ((drop.currentPage ?? 0) > 0 && drop.currentPage !== keep.currentPage) out.push("currentPage")
  return out
}

// A reader with the book on both works keeps one copy, the richer (the survivor's on a tie), but only when
// folding loses nothing: `lost` lists what it would (copyClashes), and the caller then keeps both copies
// on the survivor instead, so that reader has the book twice until they tidy it up themselves. When it
// folds, the dropped copy's reads, notes and activity move onto the kept one (by the caller), so its
// completed reads add to timesRead; the kept copy takes a review, a rating (each with its flags) and who
// recommended it where it has none, its tags join the kept copy's, and a copy the reader made private on
// either side stays private.
export function mergeCopies(survivorSide: CopyRow, duplicateSide: CopyRow): CopyMerge {
  const [a, b] = [richness(survivorSide), richness(duplicateSide)]
  const i = a.findIndex((v, n) => v !== b[n])
  const [keep, drop] = i >= 0 && b[i] > a[i] ? [duplicateSide, survivorSide] : [survivorSide, duplicateSide]
  const patch: CopyPatch = {}
  if (!keep.review && drop.review) {
    Object.assign(patch, { review: drop.review, reviewSpoiler: drop.reviewSpoiler, reviewPrivate: drop.reviewPrivate, reviewHiddenAt: drop.reviewHiddenAt })
  }
  if (keep.rating == null && drop.rating != null) Object.assign(patch, { rating: drop.rating, ratingHiddenAt: drop.ratingHiddenAt })
  if (!keep.recommendedById && !keep.recommendedByName && (drop.recommendedById || drop.recommendedByName)) {
    Object.assign(patch, { recommendedById: drop.recommendedById, recommendedByName: drop.recommendedByName })
  }
  const tags = Array.from(new Set([...keep.tags, ...drop.tags]))
  if (tags.length > keep.tags.length) patch.tags = tags
  if (drop.isPrivate && !keep.isPrivate) patch.isPrivate = true
  if (drop.timesRead > 0) patch.timesRead = keep.timesRead + drop.timesRead
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, keep[k as CopyField] ?? null])) as CopyPatch
  return { keep, drop, patch, before, lost: copyClashes(keep, drop) }
}

// Undoing mergeCopies on the kept copy as it is now: each field the merge set goes back while it still
// shows what the merge set. One the reader has changed since is theirs and stays. Completed reads and tags
// come off by what the merge added, so anything added since stays too.
export function unmergeCopyPatch(current: Partial<Record<CopyField, unknown>>, patch: CopyPatch, before: CopyPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of Object.keys(patch) as CopyField[]) {
    if (field === "timesRead") {
      const added = Number(patch.timesRead ?? 0) - Number(before.timesRead ?? 0)
      out.timesRead = Math.max(0, Number(current.timesRead ?? 0) - added)
    } else if (field === "tags") {
      const added = new Set((patch.tags ?? []).filter((t) => !(before.tags ?? []).includes(t)))
      out.tags = ((current.tags as string[] | undefined) ?? []).filter((t) => !added.has(t))
    } else if (sameValue(plain(current[field]), plain(patch[field]))) {
      out[field] = before[field] ?? null
    }
  }
  return out
}

// ---- Undoing a merge ----------------------------------------------------------------------------

export interface UnmergeState {
  // The duplicate's row is gone.
  duplicateMissing: boolean
  // Another work now holds the duplicate's old key, so it can't have it back.
  keyTaken: boolean
  // Moved editions and readers' copies now on some other book (merged on again, or moved by hand).
  editionsElsewhere: number
  copiesElsewhere: number
  // Readers who have removed the copy their duplicate copy was folded into: restoring theirs would put
  // back a book they took off their shelf.
  keptRemoved: number
  // The survivor's fields the merge filled in that someone has changed since.
  fieldConflicts: string[]
}

const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`

// Why a merge can't be undone safely, one sentence each; empty when it can.
export function unmergeConflicts(s: UnmergeState, labels: Record<string, string> = {}): string[] {
  if (s.duplicateMissing) return ["The duplicate book is no longer in the catalogue."]
  const out: string[] = []
  if (s.keyTaken) out.push("Another book has been filed under the duplicate's identity since.")
  if (s.editionsElsewhere) out.push(`${many(s.editionsElsewhere, "edition has", "editions have")} moved to another book since. Undo that first.`)
  if (s.copiesElsewhere) out.push(`${many(s.copiesElsewhere, "reader's copy has", "readers' copies have")} moved to another book since. Undo that first.`)
  if (s.keptRemoved) out.push(`${many(s.keptRemoved, "reader has", "readers have")} removed the copy their other copy was folded into.`)
  if (s.fieldConflicts.length) out.push(`Changed since on the book it was merged into: ${s.fieldConflicts.map((f) => labels[f] ?? f).join(", ")}.`)
  return out
}

// ---- Finding duplicates -------------------------------------------------------------------------

// Works are the same book when their first author and title match once case, series suffixes and edition
// tags are set aside: Work.matchKey, the key lib/catalog/resolve.ts files new copies by. scripts/report-duplicate-works.ts
// and the duplicates queue (/staff/catalogue/duplicates) both group by it.
export const duplicateKeyOf = (work: { title: string; authors: string[]; key?: string }) =>
  work.key && mergedInto(work.key) ? null : workMatchKey(work.title, work.authors[0])

export function duplicateGroups<T extends { title: string; authors: string[]; key?: string }>(works: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const w of works) {
    const key = duplicateKeyOf(w)
    if (key) groups.set(key, [...(groups.get(key) ?? []), w])
  }
  return Array.from(groups.values()).filter((g) => g.length > 1)
}

export interface PairCandidate {
  id: string
  openLibraryKey: string | null
  readers: number
}

// Each duplicate group as pairs to review: the likeliest survivor (most readers, then an Open Library work,
// then the oldest) against each of the others.
export function duplicatePairs<T extends PairCandidate>(group: T[]): [T, T][] {
  const sorted = [...group].sort((a, b) => b.readers - a.readers || Number(!!b.openLibraryKey) - Number(!!a.openLibraryKey) || (a.id < b.id ? -1 : 1))
  return sorted.slice(1).map((other) => [sorted[0], other])
}
