// What a save just earned: medals, a tier-up, and after a finish the goal and the nearest next medal.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/earnMoment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEarnMoment, finishLine, hasEarnMoment } from "@bookmark/shared/earnMoment";

test("a new rung comes back with its names and what it asked", () => {
  const m = buildEarnMoment({ awarded: [{ achievementKey: "REVIEWS", value: 5 }], stats: { REVIEWS: 5 }, earnedKeys: ["REVIEWS:1", "REVIEWS:5"] });
  assert.deepEqual(m.medals, [{ achievementKey: "REVIEWS", key: "REVIEWS:5", title: "Opinionated", achievementTitle: "Reviews written", value: 5, description: "Write 5 reviews" }]);
  assert.equal(m.tier, null);
  // Not a finish, so no goal or next line.
  assert.equal(m.next, null);
  assert.equal(m.goal, null);
});

test("a Books read rung on a tier threshold is a tier-up; the highest tier wins", () => {
  const one = buildEarnMoment({ awarded: [{ achievementKey: "BOOKS_READ", value: 10 }], stats: {}, earnedKeys: [] });
  assert.deepEqual(one.tier, { key: "bronze", label: "Bronze" });
  const imported = buildEarnMoment({ awarded: [10, 25, 50].map((value) => ({ achievementKey: "BOOKS_READ", value })), stats: {}, earnedKeys: [] });
  assert.deepEqual(imported.tier, { key: "silver", label: "Silver" });
  const notATier = buildEarnMoment({ awarded: [{ achievementKey: "BOOKS_READ", value: 25 }], stats: {}, earnedKeys: [] });
  assert.equal(notATier.tier, null);
});

test("a finish reports the goal and the nearest medal still to earn", () => {
  const m = buildEarnMoment({
    awarded: [],
    stats: { BOOKS_READ: 44, PAGES_READ: 22369 },
    earnedKeys: ["BOOKS_READ:1", "BOOKS_READ:5", "BOOKS_READ:10", "BOOKS_READ:25", "PAGES_READ:1000", "PAGES_READ:5000", "PAGES_READ:10000"],
    goal: { year: 2026, books: 18, target: 52 },
    finished: true,
  });
  assert.deepEqual(m.next, { title: "Paper Mountain", achievementTitle: "Pages read", text: "2,631 more pages" });
  assert.equal(finishLine(m), "18 of 52 books in 2026 · 2,631 more pages to Paper Mountain");
  assert.equal(hasEarnMoment(m), true);
});

test("a medal that isn't counted up says what earns it", () => {
  const line = finishLine({ medals: [], tier: null, goal: null, next: { title: "Tome Raider", achievementTitle: "Big books", text: "Complete a book that's 1,000+ pages" } } as never);
  assert.equal(line, "Complete a book that's 1,000+ pages to earn Tome Raider");
});

test("a quiet save has nothing to show", () => {
  const m = buildEarnMoment({ awarded: [], stats: { PAGES_READ: 300 }, earnedKeys: [] });
  assert.equal(hasEarnMoment(m), false);
  assert.equal(finishLine(m), null);
});
