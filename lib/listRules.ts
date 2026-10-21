// List limits and report reasons, shared by the API (lib/lists.ts) and the client. No database imports here.
export const LIST_TITLE_MAX = 80
export const LIST_DESCRIPTION_MAX = 500
export const LIST_NOTE_MAX = 280
export const LIST_ITEMS_MAX = 100
export const LIST_TAGS_MAX = 10
export const OWN_LISTS_MAX = 50

export const REPORT_REASONS = ["Spam or advertising", "Hateful or harassing", "Sexual or graphic", "Something else"] as const
