// Which staff log entries a list save writes (lib/staffLog.ts). Pure, so it can be tested without a database.

export type ListFlags = {
  hidden?: boolean
  isPick?: boolean
  featuredLabel?: string | null
  featuredFrom?: Date | null
  featuredUntil?: Date | null
}

export type ListFlagAction = "list.hide" | "list.unhide" | "list.pick" | "list.unpick" | "list.spotlight" | "list.unspotlight"

export interface ListFlagChange {
  action: ListFlagAction
  before: Record<string, string | boolean | null>
  after: Record<string, string | boolean | null>
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const spotlightOf = (f: ListFlags) => ({ featuredLabel: f.featuredLabel || null, featuredFrom: iso(f.featuredFrom), featuredUntil: iso(f.featuredUntil) })

// One entry per flag that changed. `next` only has the fields the save sets: a reader's save has none of
// them (parseListInput drops them), so it never logs anything.
export function listFlagChanges(stored: ListFlags, next: ListFlags): ListFlagChange[] {
  const changes: ListFlagChange[] = []
  if (next.hidden !== undefined && next.hidden !== !!stored.hidden) {
    changes.push({ action: next.hidden ? "list.hide" : "list.unhide", before: { hidden: !!stored.hidden }, after: { hidden: next.hidden } })
  }
  if (next.isPick !== undefined && next.isPick !== !!stored.isPick) {
    changes.push({ action: next.isPick ? "list.pick" : "list.unpick", before: { isPick: !!stored.isPick }, after: { isPick: next.isPick } })
  }
  if ("featuredFrom" in next || "featuredUntil" in next || "featuredLabel" in next) {
    const before = spotlightOf(stored)
    const after = spotlightOf({ ...stored, ...next })
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      // Clearing both dates takes it out; anything else (new dates, a new label) is putting it in.
      const off = !after.featuredFrom && !after.featuredUntil
      if (!(off && !before.featuredFrom && !before.featuredUntil)) {
        changes.push({ action: off ? "list.unspotlight" : "list.spotlight", before, after })
      }
    }
  }
  return changes
}
