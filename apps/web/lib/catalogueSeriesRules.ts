import { curatedWorkFields, SERIES_NAME_MAX, SERIES_POSITION_MAX } from "@/lib/catalogueFixRules"
import { seriesKey } from "@/lib/series"

// The rules for the librarians' series editor (/staff/catalogue/series), kept pure so
// scripts/test/catalogueSeries.test.ts can check them. lib/catalogueSeries.ts applies them.
//
// A series is every work with the same Work.seriesName. One save sends the whole edit: the name (maybe
// new), other spellings merged in, each book's place, and books taken out. Only works whose series or
// place actually changes are written, marked curated, and logged.

export interface SeriesRow {
  id: string
  seriesName: string | null
  seriesPosition: number | null
}

export interface SeriesEdit {
  // The spelling being edited, and what it's called after the save (the same when not renamed).
  name: string
  rename: string
  // Other spellings whose books join it.
  merge: string[]
  // Every book in it after the save, with its place (null for none).
  entries: { workId: string; position: number | null }[]
  // Books taken out of it.
  removed: string[]
}

export const SERIES_BOOKS_MAX = 300
const isId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)
const cleanName = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "")

// A place typed in the editor: "3", "2.5", or blank for none. Commas count as decimal points.
export function parsePosition(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim().replace(",", ".") : null
  if (text === null) return { ok: false, error: "Places need to be numbers, like 1 or 2.5." }
  if (text === "") return { ok: true, value: null }
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: "Places need to be numbers, like 1 or 2.5." }
  const value = Number(text)
  if (value > SERIES_POSITION_MAX) return { ok: false, error: `Places go up to ${SERIES_POSITION_MAX}.` }
  // 2.5000001 from an import reads as 2.5 everywhere else (positionLabel), so it's saved that way.
  return { ok: true, value: Number(value.toFixed(3)) }
}

// Places held by more than one book, for the editor's warning. Two editions nobody merged can share one;
// it isn't refused.
export function duplicatePositions(entries: { position: number | null }[]): number[] {
  const seen = new Map<number, number>()
  for (const e of entries) if (e.position !== null) seen.set(e.position, (seen.get(e.position) ?? 0) + 1)
  return Array.from(seen.entries()).filter(([, n]) => n > 1).map(([p]) => p).sort((a, b) => a - b)
}

export function parseSeriesEdit(body: Record<string, unknown>): { ok: true; edit: SeriesEdit } | { ok: false; error: string } {
  const name = cleanName(body.name)
  if (!name) return { ok: false, error: "Pick a series first." }
  const rename = cleanName(body.rename) || name
  if (rename.length > SERIES_NAME_MAX) return { ok: false, error: `Series names can be up to ${SERIES_NAME_MAX} characters.` }
  const merge = Array.isArray(body.merge) ? Array.from(new Set(body.merge.map(cleanName).filter((n) => n && n !== name))) : []
  const rawEntries = Array.isArray(body.entries) ? body.entries : []
  if (rawEntries.length > SERIES_BOOKS_MAX) return { ok: false, error: `A series can have up to ${SERIES_BOOKS_MAX} books here.` }
  const entries: SeriesEdit["entries"] = []
  for (const raw of rawEntries) {
    const e = (raw ?? {}) as { workId?: unknown; position?: unknown }
    if (!isId(e.workId)) return { ok: false, error: "One of those books isn't in the catalogue." }
    if (entries.some((x) => x.workId === e.workId)) return { ok: false, error: "A book is in the list twice." }
    const position = parsePosition(e.position)
    if (!position.ok) return position
    entries.push({ workId: e.workId, position: position.value })
  }
  const removed = Array.isArray(body.removed) ? Array.from(new Set(body.removed.filter(isId))) : []
  if (removed.some((id) => entries.some((e) => e.workId === id))) return { ok: false, error: "A book can't be both in the series and taken out." }
  return { ok: true, edit: { name, rename, merge, entries, removed } }
}

export interface SeriesChange {
  id: string
  before: { seriesName: string | null; seriesPosition: number | null }
  after: { seriesName: string | null; seriesPosition: number | null }
}

// What the save writes, work by work. `rows` are the works with the series' spellings plus any listed by
// id. A book of the series the editor didn't list (shelved since the page loaded) keeps its place and
// takes the new name; one taken out leaves the series and its place. Removing a book that has since moved
// to another series leaves it there.
export function seriesEditDiff(rows: SeriesRow[], edit: SeriesEdit): SeriesChange[] {
  const names = new Set([edit.name, ...edit.merge])
  const placed = new Map(edit.entries.map((e) => [e.workId, e.position]))
  const removed = new Set(edit.removed)
  const out: SeriesChange[] = []
  for (const row of rows) {
    const before = { seriesName: row.seriesName, seriesPosition: row.seriesPosition }
    const inSeries = row.seriesName !== null && names.has(row.seriesName)
    let after: SeriesChange["after"]
    if (removed.has(row.id)) {
      if (!inSeries) continue
      after = { seriesName: null, seriesPosition: null }
    } else if (placed.has(row.id)) {
      after = { seriesName: edit.rename, seriesPosition: placed.get(row.id) ?? null }
    } else if (inSeries) {
      after = { seriesName: edit.rename, seriesPosition: row.seriesPosition }
    } else {
      continue
    }
    if (after.seriesName !== before.seriesName || after.seriesPosition !== before.seriesPosition) out.push({ id: row.id, before, after })
  }
  return out
}

// ---- Undo ---------------------------------------------------------------------------------------
//
// Author changes (lib/catalogueAuthorRules.ts) and series saves are undone from the log: each work goes
// back to its logged `before`, but only if it still has the logged `after`. If any book has changed since,
// nothing is undone and the librarian is shown which.

// Every catalogue change and undo needs a reason for the log.
export const REASON_MAX = 500
export const cleanReason = (raw: unknown) => (typeof raw === "string" ? raw.trim().slice(0, REASON_MAX) : "")
export const REASON_NEEDED = "Say why, for the log."

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export const CONFLICTS_SHOWN = 10
export const GONE_TITLE = "A book no longer in the catalogue"

// The books whose `fields` no longer hold the logged values, by title, in log order.
export function revertConflicts<F extends string>(
  logged: { id: string; after: Partial<Record<F, unknown>> }[],
  current: Map<string, { title: string } & Partial<Record<F, unknown>>>,
  fields: F[],
): string[] {
  return logged.flatMap((w) => {
    const now = current.get(w.id)
    if (!now) return [GONE_TITLE]
    return fields.some((f) => !sameValue(now[f], w.after[f])) ? [now.title] : []
  })
}

// "Changed since, so nothing was undone": the first ten, and how many more.
export const conflictMessage = (titles: string[]) => {
  const n = titles.length
  return `${n} ${n === 1 ? "book has" : "books have"} changed since, so nothing was undone. Fix ${n === 1 ? "it" : "them"} by hand instead.`
}
export const shownConflicts = (titles: string[]) =>
  titles.length > CONFLICTS_SHOWN ? [...titles.slice(0, CONFLICTS_SHOWN), `and ${titles.length - CONFLICTS_SHOWN} more`] : titles

// curatedFields after an undo: what the change marked comes off again, unless the work had it already.
// Anything marked since (another field fixed by hand) stays.
export const uncurate = (current: string[], before: string[], marked: string[]) =>
  current.filter((f) => !marked.includes(f) || before.includes(f))

// A follow or Hardcover check moving from one series key to another, because the series' name or first
// author changed. `was` is the old series name; `name` and `author` are the new spellings.
export interface SeriesKeyMove {
  from: string
  was: string
  to: string
  name: string
  author: string
}

// What a move did, logged so an undo can put it back: rows re-keyed (with their old name and author) and
// rows dropped because the reader already followed (or Hardcover already checked) the new key.
export interface SeriesMoveLog {
  follows: { moved: { id: string; from: string; to: string; name: string; author: string }[]; dropped: { userId: string; seriesKey: string; name: string; author: string; createdAt: string }[] }
  checks: {
    moved: { id: string; from: string; to: string; name: string; author: string }[]
    dropped: { seriesKey: string; name: string; author: string; hardcoverSeriesId: number | null; highestPosition: number | null; announceAfter: number | null; checkedAt: string; createdAt: string }[]
  }
}

export const emptyMoveLog = (): SeriesMoveLog => ({ follows: { moved: [], dropped: [] }, checks: { moved: [], dropped: [] } })
export const movedAnything = (log: SeriesMoveLog) =>
  log.follows.moved.length + log.follows.dropped.length + log.checks.moved.length + log.checks.dropped.length > 0

// The series keys a change could move, one per old key: a work's series and first author before and after.
// Whether the old key is really left empty (no other book still files under it) is the caller's to check.
export function seriesKeyMoves(changes: { before: { seriesName: string | null; author?: string }; after: { seriesName: string | null; author?: string } }[]): SeriesKeyMove[] {
  const out = new Map<string, SeriesKeyMove>()
  for (const { before, after } of changes) {
    if (!before.seriesName || !before.author || !after.seriesName || !after.author) continue
    const from = seriesKey(before.seriesName, before.author)
    const to = seriesKey(after.seriesName, after.author)
    if (from === to || out.has(from)) continue
    out.set(from, { from, was: before.seriesName, to, name: after.seriesName, author: after.author })
  }
  return Array.from(out.values())
}

export const asMoveLog = (raw: unknown): SeriesMoveLog | null => {
  const log = raw as SeriesMoveLog | null | undefined
  return log && Array.isArray(log.follows?.moved) && Array.isArray(log.checks?.moved) ? log : null
}

type Place = { seriesName: string | null; seriesPosition: number | null }

// One series.edit as logged (lib/catalogueSeries.ts saveSeries). curatedFields before the save was logged
// from October 2026 on; older saves leave curatedFields as they are when undone.
export interface SeriesLog {
  works: { id: string; before: Place & { curatedFields?: string[] }; after: Place }[]
  moves: SeriesMoveLog | null
}

const isPlace = (w: unknown): w is Place & { id: string } =>
  !!w && typeof (w as { id?: unknown }).id === "string" && "seriesName" in (w as object) && "seriesPosition" in (w as object)

export function parseSeriesLog(before: unknown, after: unknown): SeriesLog | null {
  const was = (before as { works?: unknown[]; moves?: unknown } | null)?.works
  const now = (after as { works?: unknown[] } | null)?.works
  if (!Array.isArray(was) || !Array.isArray(now) || !was.every(isPlace) || !now.every(isPlace)) return null
  const afterOf = new Map(now.map((w) => [w.id, w]))
  const works = was.flatMap((w) => {
    const a = afterOf.get(w.id)
    if (!a) return []
    const curated = (w as { curatedFields?: unknown }).curatedFields
    return [{
      id: w.id,
      before: { seriesName: w.seriesName, seriesPosition: w.seriesPosition, ...(Array.isArray(curated) && { curatedFields: curated as string[] }) },
      after: { seriesName: a.seriesName, seriesPosition: a.seriesPosition },
    }]
  })
  return works.length ? { works, moves: asMoveLog((before as { moves?: unknown }).moves) } : null
}

export type SeriesRevertWork = Place & { id: string; title: string; curatedFields: string[] }
export type SeriesRevertPatch = { id: string; data: Place & { curatedFields?: string[] } }

// The undo, work by work, or the titles of the books changed since.
export function seriesRevertPlan(log: SeriesLog, current: SeriesRevertWork[]): { ok: true; patches: SeriesRevertPatch[] } | { ok: false; conflicts: string[] } {
  const byId = new Map(current.map((w) => [w.id, w]))
  const conflicts = revertConflicts(log.works, byId, ["seriesName", "seriesPosition"])
  if (conflicts.length) return { ok: false, conflicts }
  const marked = curatedWorkFields(["seriesName", "seriesPosition"])
  return {
    ok: true,
    patches: log.works.map((w) => {
      const now = byId.get(w.id)!
      const was = w.before.curatedFields
      const curated = was ? uncurate(now.curatedFields, was, marked) : null
      return { id: w.id, data: { seriesName: w.before.seriesName, seriesPosition: w.before.seriesPosition, ...(curated && { curatedFields: curated }) } }
    }),
  }
}
