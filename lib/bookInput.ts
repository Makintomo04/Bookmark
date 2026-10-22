// Field parsing shared by the add-book and edit-book routes.

import { isAllowedImageUrl, isHexColour } from "@/lib/profile"

// A running time as sent by the forms: minutes as a number or numeric string ("724"), or an object
// { hours, minutes }. Null when missing or not positive.
export function parseAudioMinutes(raw: unknown): number | null {
  if (raw && typeof raw === "object") {
    const o = raw as { hours?: unknown, minutes?: unknown }
    const total = (parseInt(String(o.hours ?? 0)) || 0) * 60 + (parseInt(String(o.minutes ?? 0)) || 0)
    return total > 0 ? Math.min(total, 100_000) : null
  }
  const n = parseInt(String(raw ?? ""))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : null
}

export const BOOK_TITLE_MAX = 300
export const BOOK_AUTHOR_MAX = 200
export const BOOK_GENRE_MAX = 60

// What's wrong with a book's typed fields, or null. Covers and colours reach other readers (shelf search,
// circles, recommendations) and are written into inline styles, so they're held to the same rules as
// profile pictures and colours. Undefined fields aren't being changed and pass.
export function bookFieldsProblem(fields: { title?: unknown, author?: unknown, genre?: unknown, coverImgSrc?: unknown, cardColour?: unknown }): string | null {
  const { title, author, genre, coverImgSrc, cardColour } = fields
  if (title !== undefined && (typeof title !== "string" || title.length > BOOK_TITLE_MAX)) return `Titles are up to ${BOOK_TITLE_MAX} characters`
  if (author !== undefined && (typeof author !== "string" || author.length > BOOK_AUTHOR_MAX)) return `Author names are up to ${BOOK_AUTHOR_MAX} characters`
  if (genre != null && genre !== "" && (typeof genre !== "string" || genre.length > BOOK_GENRE_MAX)) return `Genres are up to ${BOOK_GENRE_MAX} characters`
  if (coverImgSrc != null && coverImgSrc !== "" && !isAllowedImageUrl(coverImgSrc)) return "That cover can't be used. Upload it instead"
  if (cardColour != null && cardColour !== "" && !isHexColour(cardColour)) return "That colour can't be used"
  return null
}
