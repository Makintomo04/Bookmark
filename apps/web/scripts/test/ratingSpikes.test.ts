// Rating-spike checks (BOO-51): what flags a book, what doesn't, and that a reviewed burst isn't flagged again.
// No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/ratingSpikes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_ACCOUNT_DAYS, SPIKE_MIN_RATINGS, SPIKE_WINDOW_DAYS, findSpike, sideOf, type RatingRow } from "@/lib/ratingSpikeRules";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

// A reader who joined `age` days before rating it, `ago` days ago.
const row = (i: number, rating: number, { ago = 1, age = 1 }: { ago?: number; age?: number } = {}): RatingRow => ({
  bookId: `b${i}`, userId: `u${i}`, rating, ratedAt: daysAgo(ago), accountCreatedAt: daysAgo(ago + age),
});
const many = (n: number, rating: number, opts?: { ago?: number; age?: number }, from = 0) => Array.from({ length: n }, (_, i) => row(from + i, rating, opts));

test("only the extremes count as a side", () => {
  assert.equal(sideOf(1), "low");
  assert.equal(sideOf(1.5), "low");
  assert.equal(sideOf(2), null);
  assert.equal(sideOf(3), null);
  assert.equal(sideOf(4.25), null);
  assert.equal(sideOf(4.5), "high");
  assert.equal(sideOf(5), "high");
});

test("a burst of one-star ratings from new accounts flags the book", () => {
  const spike = findSpike(many(SPIKE_MIN_RATINGS, 1), NOW);
  assert.ok(spike);
  assert.equal(spike.side, "low");
  assert.equal(spike.count, SPIKE_MIN_RATINGS);
  assert.equal(spike.windowTotal, SPIKE_MIN_RATINGS);
  assert.deepEqual(spike.bookIds.sort(), ["b0", "b1", "b2", "b3", "b4"]);
  assert.equal(findSpike(many(SPIKE_MIN_RATINGS, 5), NOW)?.side, "high");
});

test("too few, mixed, or middling ratings don't flag", () => {
  assert.equal(findSpike(many(SPIKE_MIN_RATINGS - 1, 1), NOW), null);
  // Split both ways: neither side reaches the minimum.
  assert.equal(findSpike([...many(3, 1), ...many(3, 5, undefined, 3)], NOW), null);
  assert.equal(findSpike(many(8, 3), NOW), null);
  assert.equal(findSpike([], NOW), null);
});

test("established accounts, or old ratings, don't flag", () => {
  // Accounts older than NEW_ACCOUNT_DAYS when they rated.
  assert.equal(findSpike(many(8, 1, { age: NEW_ACCOUNT_DAYS + 1 }), NOW), null);
  assert.ok(findSpike(many(8, 1, { age: NEW_ACCOUNT_DAYS }), NOW));
  // Ratings from before the window.
  assert.equal(findSpike(many(8, 1, { ago: SPIKE_WINDOW_DAYS + 1 }), NOW), null);
});

test("a few new accounts among plenty of ordinary ratings is not a burst", () => {
  const ordinary = many(10, 4, { age: 400 }, 100);
  assert.equal(findSpike([...many(5, 5), ...ordinary], NOW), null);
  // But the same five carrying most of the week's ratings is.
  assert.ok(findSpike([...many(5, 5), ...ordinary.slice(0, 4)], NOW));
});

test("one reader counts once", () => {
  const repeated = many(SPIKE_MIN_RATINGS, 1).map((r) => ({ ...r, userId: "u0" }));
  assert.equal(findSpike(repeated, NOW), null);
});

test("a burst staff already looked at isn't flagged again, but a new one is", () => {
  const rows = many(6, 1, { ago: 3 });
  assert.ok(findSpike(rows, NOW));
  assert.equal(findSpike(rows, NOW, daysAgo(1)), null);
  // Fresh ratings after the review start a new count.
  assert.ok(findSpike([...rows, ...many(6, 1, { ago: 0.5 }, 50)], NOW, daysAgo(1)));
});
