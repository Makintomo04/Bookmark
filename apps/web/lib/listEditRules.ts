import { sameBook } from "@/lib/workKey"

// The staff log entry for staff editing what's in someone else's list (list.edit): title, description,
// and books added, removed, reordered or re-noted. Kept compact (titles and counts, never whole items):
// the list itself is the record, the log says what changed. Pure, so it can be tested without a database.

type Item = { workKey?: string | null, title: string, author: string, note?: string | null }
type Content = { title: string, description?: string | null, items: Item[] }

// How many book titles each side names before it's just a count.
const NAMED = 10
const DESCRIPTION_MAX = 200

const short = (text: string | null | undefined) => (text ? (text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX)}…` : text) : null)

export interface ListContentChange {
  before: Record<string, string | number | string[] | null>
  after: Record<string, string | number | string[] | boolean | null>
}

// Null when nothing in the content changed (a save that only touched flags, genres or visibility).
export function listContentChange(stored: Content, next: Content): ListContentChange | null {
  const before: ListContentChange["before"] = {}
  const after: ListContentChange["after"] = {}
  if (stored.title !== next.title) {
    before.title = stored.title
    after.title = next.title
  }
  if ((stored.description ?? null) !== (next.description ?? null)) {
    before.description = short(stored.description)
    after.description = short(next.description)
  }

  const removed = stored.items.filter((a) => !next.items.some((b) => sameBook(a, b)))
  const added = next.items.filter((b) => !stored.items.some((a) => sameBook(a, b)))
  const kept = next.items.filter((b) => !added.includes(b))
  const keptBefore = stored.items.filter((a) => !removed.includes(a))
  const reordered = kept.some((b, i) => !sameBook(b, keptBefore[i]))
  const notes = kept.filter((b) => (keptBefore.find((a) => sameBook(a, b))?.note ?? null) !== (b.note ?? null)).length

  if (added.length || removed.length || reordered || notes) {
    before.items = stored.items.length
    after.items = next.items.length
    if (added.length) after.added = added.slice(0, NAMED).map((b) => b.title)
    if (removed.length) after.removed = removed.slice(0, NAMED).map((b) => b.title)
    if (reordered) after.reordered = true
    if (notes) after.notesChanged = notes
  }
  return Object.keys(after).length ? { before, after } : null
}
