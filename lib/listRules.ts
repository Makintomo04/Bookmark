// List limits and report reasons, shared by the API (lib/lists.ts) and the client. No database imports here.
import { canView, type PrivacySettings, type Relation } from "./privacyRules"

export const LIST_TITLE_MAX = 80
export const LIST_DESCRIPTION_MAX = 500
export const LIST_NOTE_MAX = 280
export const LIST_ITEMS_MAX = 100
export const LIST_TAGS_MAX = 10
export const OWN_LISTS_MAX = 50

// A reader shown next to a recommendation: avatar, accent colour and tier ring.
export interface Curator {
  username: string | null
  image: string | null
  favColour: string | null
  _count?: { books?: number }
}

// "Why you'd like this": a person's reason for a book, from a list note or their review.
export interface Reason {
  text: string
  by: Curator
}

export const REPORT_REASONS = ["Spam or advertising", "Hateful or harassing", "Sexual or graphic", "Something else"] as const

// Who may see a list beyond its own visibility and `hidden` flag. A reader's list is part of their profile
// (lib/privacyRules.ts "profile"), so a viewer who can't see the profile (private, followers only without
// following, or a block either way) can't see its lists. Bookmark Picks are the team's, not a profile's.
// The owner and staff always can.
export function canSeeListOf(list: { isPick: boolean }, relation: Relation, owner: PrivacySettings, viewerIsStaff = false): boolean {
  if (viewerIsStaff || relation.isSelf) return true
  if (list.isPick) return true
  return canView(relation, owner, "profile")
}
