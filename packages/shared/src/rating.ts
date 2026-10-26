// Ratings run from a quarter star to five, in quarter steps. Quarters are exact in floating point.
export const RATING_STEP = 0.25;
export const MAX_RATING = 5;

// The nearest quarter, kept within a quarter and five.
export const snapRating = (n: number) => Math.max(RATING_STEP, Math.min(MAX_RATING, Math.round(n / RATING_STEP) * RATING_STEP));

const FRACTIONS: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

// 4.75 → "4¾", 0.5 → "½", 3 → "3".
export const ratingGlyphs = (n: number) => `${Math.floor(n) || ""}${FRACTIONS[n % 1] ?? ""}`;
