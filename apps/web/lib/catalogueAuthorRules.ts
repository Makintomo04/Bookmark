import { AUTHOR_MAX } from "@/lib/catalogueFixRules"
import { asMoveLog, revertConflicts, uncurate, type SeriesMoveLog } from "@/lib/catalogueSeriesRules"

// The rules for renaming and merging authors in the shared catalogue, kept pure so
// scripts/test/catalogueAuthors.test.ts can check them. lib/catalogueAuthors.ts applies them.
//
// An author is a name on Work.authors, with the Open Library key (Work.authorKeys) that author pages
// (lib/authors.ts) also match on. Fixing only the name would leave a book on the wrong author's page, so a
// merge rewrites both. Only works carrying one of the old names are touched: authorKeys isn't always in
// step with authors, so a key alone could belong to a co-author.

// "OL7315784A".
export const isAuthorKey = (key: unknown): key is string => typeof key === "string" && /^OL\d+A$/.test(key)

export type AuthorChange =
  | { kind: "rename"; from: string; to: string }
  | { kind: "merge"; names: string[]; keys: string[]; to: string; key: string | null }

export const MERGE_MAX = 10

const cleanName = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "")

// From the request body: { kind: "rename", from, to } or { kind: "merge", names, keys, to, key }.
export function parseAuthorChange(body: Record<string, unknown>): { ok: true; change: AuthorChange } | { ok: false; error: string } {
  const to = cleanName(body.to)
  if (!to) return { ok: false, error: "Type the name to use." }
  if (to.length > AUTHOR_MAX) return { ok: false, error: `Names can be up to ${AUTHOR_MAX} characters.` }
  if (body.kind === "rename") {
    const from = cleanName(body.from)
    if (!from) return { ok: false, error: "Pick the author to rename." }
    if (from === to) return { ok: false, error: "That's the name it has already." }
    return { ok: true, change: { kind: "rename", from, to } }
  }
  if (body.kind === "merge") {
    const names = Array.isArray(body.names) ? Array.from(new Set(body.names.map(cleanName).filter(Boolean))) : []
    if (names.length < 2) return { ok: false, error: "Pick two or more names to merge." }
    if (names.length > MERGE_MAX) return { ok: false, error: `Merge up to ${MERGE_MAX} names at a time.` }
    const keys = Array.isArray(body.keys) ? Array.from(new Set(body.keys.filter(isAuthorKey))) : []
    const key = body.key === null || body.key === undefined || body.key === "" ? null : body.key
    if (key !== null && !isAuthorKey(key)) return { ok: false, error: "That isn't an Open Library author id (OL7315784A)." }
    return { ok: true, change: { kind: "merge", names, keys, to, key } }
  }
  return { ok: false, error: "Rename or merge?" }
}

export interface AuthorFields {
  authors: string[]
  authorKeys: string[]
}

// The names a change takes off works.
export const namesOf = (change: AuthorChange) => (change.kind === "rename" ? [change.from] : change.names)

const dedupe = (list: string[]) => Array.from(new Set(list))

// One work after the change. Old names become the new one where they stood, so the first author stays
// first. A merge's old keys become its key (or go, with none chosen), and the key is added when the work
// had none of them. A rename leaves keys alone: it's the same person. Null when nothing changes.
export function changeWorkAuthors(work: AuthorFields, change: AuthorChange): AuthorFields | null {
  const names = new Set(namesOf(change))
  if (!work.authors.some((a) => names.has(a))) return null
  const authors = dedupe(work.authors.map((a) => (names.has(a) ? change.to : a)))
  let authorKeys = work.authorKeys
  if (change.kind === "merge") {
    const old = new Set(change.keys)
    authorKeys = work.authorKeys.flatMap((k) => (old.has(k) ? (change.key ? [change.key] : []) : [k]))
    if (change.key && !authorKeys.includes(change.key)) {
      // Where the author sits in the list, when the keys are in step with the names.
      const at = authors.indexOf(change.to)
      authorKeys = work.authorKeys.length === work.authors.length && at <= authorKeys.length
        ? [...authorKeys.slice(0, at), change.key, ...authorKeys.slice(at)]
        : [...authorKeys, change.key]
    }
    authorKeys = dedupe(authorKeys)
  }
  const same = authors.join("\u0000") === work.authors.join("\u0000") && authorKeys.join("\u0000") === work.authorKeys.join("\u0000")
  return same ? null : { authors, authorKeys }
}

// curatedFields after the change, so a later import or Open Library refresh doesn't put the old names back.
const markedBy = (kind: AuthorChange["kind"]) => (kind === "merge" ? ["authors", "authorKeys"] : ["authors"])
export const authorCurated = (current: string[] | null | undefined, change: AuthorChange) =>
  dedupe([...(current ?? []), ...markedBy(change.kind)])

// A distinct author name across the catalogue, with how many works carry it and the Open Library keys
// seen beside it.
export interface AuthorHit {
  name: string
  books: number
  keys: string[]
}

// The search's aggregate rows, tidied: keys checked, most books first.
export const authorHits = (rows: { name: string; books: number; keys?: unknown[] }[]): AuthorHit[] =>
  rows
    .map((r) => ({ name: r.name, books: r.books, keys: dedupe((r.keys ?? []).filter(isAuthorKey)) }))
    .sort((a, b) => b.books - a.books || a.name.localeCompare(b.name))

// ---- Undo (the shared rules are in lib/catalogueSeriesRules.ts) ----------------------------------

// Author follows a merge moved onto the kept key, with what they were; and those dropped because the reader
// already followed the kept key, whole, so an undo can recreate them. Logged from October 2026 on.
export interface AuthorFollowLog {
  moved: { id: string; authorKey: string; name: string; slug: string }[]
  dropped: { userId: string; authorKey: string; name: string; slug: string; createdAt: string }[]
}

type Names = { authors: string[]; authorKeys: string[] }

// One author.rename or author.merge as logged (lib/catalogueAuthors.ts applyAuthorChange).
export interface AuthorLog {
  kind: AuthorChange["kind"]
  works: { id: string; before: Names & { curatedFields: string[] }; after: Names }[]
  follows: AuthorFollowLog | null
  moves: SeriesMoveLog | null
}

const isNames = (w: unknown): w is Names & { id: string } => {
  const x = w as { id?: unknown; authors?: unknown; authorKeys?: unknown } | null
  return !!x && typeof x.id === "string" && Array.isArray(x.authors) && Array.isArray(x.authorKeys)
}

export function parseAuthorLog(action: string, before: unknown, after: unknown): AuthorLog | null {
  const kind = action === "author.rename" ? "rename" : action === "author.merge" ? "merge" : null
  const was = (before as { works?: unknown[] } | null)?.works
  const now = (after as { works?: unknown[] } | null)?.works
  if (!kind || !Array.isArray(was) || !Array.isArray(now) || !was.every(isNames) || !now.every(isNames)) return null
  const afterOf = new Map(now.map((w) => [w.id, w]))
  const works = was.flatMap((w) => {
    const a = afterOf.get(w.id)
    const curated = (w as { curatedFields?: unknown }).curatedFields
    return a ? [{ id: w.id, before: { authors: w.authors, authorKeys: w.authorKeys, curatedFields: Array.isArray(curated) ? curated as string[] : [] }, after: { authors: a.authors, authorKeys: a.authorKeys } }] : []
  })
  if (!works.length) return null
  const follows = (before as { follows?: AuthorFollowLog }).follows
  return {
    kind,
    works,
    follows: follows && Array.isArray(follows.moved) && Array.isArray(follows.dropped) ? follows : null,
    moves: asMoveLog((before as { moves?: unknown }).moves),
  }
}

export type AuthorRevertWork = Names & { id: string; title: string; curatedFields: string[] }
export interface AuthorRevertPatch extends Names {
  id: string
  curatedFields: string[]
  // The first author goes back, so the work is filed under its old match key again.
  refile: boolean
  // Readers' copies showing `from` (the change's line) go back to `to`; null when the line didn't change.
  line: { from: string; to: string } | null
}

// The undo, work by work, or the titles of the books changed since.
export function authorRevertPlan(log: AuthorLog, current: AuthorRevertWork[]): { ok: true; patches: AuthorRevertPatch[] } | { ok: false; conflicts: string[] } {
  const byId = new Map(current.map((w) => [w.id, w]))
  const conflicts = revertConflicts(log.works, byId, ["authors", "authorKeys"])
  if (conflicts.length) return { ok: false, conflicts }
  return {
    ok: true,
    patches: log.works.map(({ id, before, after }) => {
      const from = after.authors.join(", ")
      const to = before.authors.join(", ")
      return {
        id,
        authors: before.authors,
        authorKeys: before.authorKeys,
        curatedFields: uncurate(byId.get(id)!.curatedFields, before.curatedFields, markedBy(log.kind)),
        refile: before.authors[0] !== after.authors[0],
        line: from === to ? null : { from, to },
      }
    }),
  }
}
