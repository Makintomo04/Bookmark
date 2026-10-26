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
