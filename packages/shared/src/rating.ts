// Ratings run from a quarter star to five, in quarter steps. Quarters are exact in floating point.
export const RATING_STEP = 0.25;
export const MAX_RATING = 5;

// The nearest quarter, kept within a quarter and five.
export const snapRating = (n: number) => Math.max(RATING_STEP, Math.min(MAX_RATING, Math.round(n / RATING_STEP) * RATING_STEP));

// How far across a star (0 to 1 of its own width) to clip the fill so it covers that share of the star's
// area. A star is mostly middle, so a quarter of the width is only the left point: a quarter of the area
// is 35% across and three quarters is 65%. Measured on the five-point stars both apps draw.
const AREA_STOPS: [number, number][] = [[0, 0], [0.25, 0.35], [0.5, 0.5], [0.75, 0.65], [1, 1]];
export function starClip(fill: number) {
  const f = Math.max(0, Math.min(1, fill));
  const i = AREA_STOPS.findIndex(([at]) => at >= f);
  if (i <= 0) return AREA_STOPS[Math.max(i, 0)][1];
  const [[a, x0], [b, x1]] = [AREA_STOPS[i - 1], AREA_STOPS[i]];
  return x0 + ((f - a) / (b - a)) * (x1 - x0);
}

const FRACTIONS: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

// 4.75 → "4¾", 0.5 → "½", 3 → "3".
export const ratingGlyphs = (n: number) => `${Math.floor(n) || ""}${FRACTIONS[n % 1] ?? ""}`;

// ---- Averages -----------------------------------------------------------------------------

// One rule for "average rating" wherever it's shown: /stats, the stats explorer and the share cards. Each
// book counts once, with its latest rating among the reads counted (a re-read's rating replaces the
// first one's), so a book read three times doesn't weigh three times. `reads` in the order they ended.
export function latestRatingByBook(reads: { bookId: string, rating: number | null }[]): Map<string, number> {
  const latest = new Map<string, number>()
  for (const r of reads) if (r.rating && r.rating > 0) latest.set(r.bookId, r.rating)
  return latest
}

// Their mean, to one decimal place (what every screen shows), or null with nothing rated.
export function averageRating(ratings: Iterable<number>): number | null {
  const all = Array.from(ratings)
  return all.length ? Math.round((all.reduce((s, r) => s + r, 0) / all.length) * 10) / 10 : null
}
