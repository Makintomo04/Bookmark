import { percentToPosition, progressScale, roundPercent, type ProgressBook } from "./progress";

// Kept free of "@/" imports and the database so scripts/test/progressPayload.test.ts can load it.

export type PositionInput = {
  currentPage?: number
  pagesUpdate?: string | number
  currentMinute?: number
  minutesUpdate?: string | number
  currentPercent?: number
}

// Where a POST /api/book-progress body puts the reader, on the book's own scale. `position` is undefined
// when the body didn't move them. `percent` is the percent to store beside it: the one sent, or null when
// the place came as a page or minute (so an old client that only sends currentPage clears a stale percent).
// The position sent in the other unit is ignored, so an old client that only knows pages can't drag an
// audiobook back to page 0.
export function positionFromBody(book: ProgressBook, body: PositionInput): { position: number | undefined, percent: number | null } {
  const scale = progressScale(book)
  if (body.currentPercent !== undefined) {
    const percent = roundPercent(body.currentPercent)
    // With no length there's no page to match, so the page stays 0 and the percent carries the place.
    return { position: percentToPosition(percent, scale.total), percent }
  }
  const onMinutes = scale.unit === "MINUTES"
  const clampPos = (n: number) => Math.max(0, Math.min(scale.total, Math.round(n)))
  const absolute = onMinutes ? body.currentMinute : body.currentPage
  const rawIncrement = onMinutes ? body.minutesUpdate : body.pagesUpdate
  const increment = rawIncrement === undefined ? NaN : parseInt(String(rawIncrement))
  const position = absolute !== undefined ? clampPos(absolute)
    : !isNaN(increment) ? clampPos(scale.current + increment)
    : undefined
  return { position, percent: null }
}
