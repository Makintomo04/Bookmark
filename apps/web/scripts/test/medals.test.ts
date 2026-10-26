// The profile medal showcase and another reader's achievements page: which medals show, and that
// someone else's ladders carry nothing beyond the rungs they've earned.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/medals.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ladders, topMedals } from "@bookmark/shared/medals";
import { ANONYMOUS, canView, privacyOf } from "@/lib/privacyRules";

const EARNED = [
  { key: "BOOKS_READ:1", earnedAt: new Date("2026-01-02") },
  { key: "BOOKS_READ:5", earnedAt: new Date("2026-03-04") },
  { key: "STREAK:3", earnedAt: new Date("2026-02-01") },
  { key: "REVIEWS:1", earnedAt: new Date("2026-02-10") },
  { key: "GOALS:1", earnedAt: new Date("2026-05-01") },
];

test("the showcase picks each ladder's highest rung, furthest up first, three at most", () => {
  const medals = topMedals(EARNED);
  assert.equal(medals.length, 3);
  assert.equal(new Set(medals.map((m) => m.key)).size, 3);
  const books = topMedals([{ key: "BOOKS_READ:1" }, { key: "BOOKS_READ:5" }])[0];
  assert.equal(books.title, "Getting Hooked");
  for (let i = 1; i < medals.length; i++) assert.ok(medals[i - 1].progress >= medals[i].progress);
});

test("no medals, no showcase; unknown and quest keys are ignored", () => {
  assert.deepEqual(topMedals([]), []);
  assert.deepEqual(topMedals([{ key: "QUEST:spring" }, { key: "NOPE:1" }]), []);
});

test("someone else's ladders stop at the rungs they've earned", () => {
  const theirs = ladders(EARNED, null);
  const books = theirs.find((l) => l.key === "BOOKS_READ")!;
  // Their real count (which can include private books) isn't sent: just the highest rung's number.
  assert.equal(books.current, 5);
  assert.equal(books.milestones.filter((m) => m.earned).length, 2);
  assert.equal(books.milestones[1].earnedAt, "2026-03-04T00:00:00.000Z");
  // A ladder they haven't started reads as 0, not their actual progress.
  assert.equal(theirs.find((l) => l.key === "PAGES_READ")!.current, 0);
  // No ladder's number is more than its highest earned rung.
  for (const l of theirs) {
    const reached = l.milestones.filter((m) => m.earned).pop()?.value ?? 0;
    assert.equal(l.current, reached);
  }
});

test("the owner's ladders use their real numbers", () => {
  const mine = ladders(EARNED, { BOOKS_READ: 7, PAGES_READ: 1234 });
  assert.equal(mine.find((l) => l.key === "BOOKS_READ")!.current, 7);
  assert.equal(mine.find((l) => l.key === "PAGES_READ")!.current, 1234);
  assert.equal(mine.find((l) => l.key === "STREAK")!.current, 0);
});

test("pre-milestone keys still count towards their rung", () => {
  const theirs = ladders([{ key: "GOAL_GETTER", earnedAt: "2025-12-31T00:00:00.000Z" }], null);
  assert.equal(theirs.find((l) => l.key === "GOALS")!.milestones[0].earned, true);
});

test("the achievements page follows the profile rule", () => {
  const followersOnly = privacyOf({ profileVisibility: "FOLLOWERS" });
  assert.equal(canView(ANONYMOUS, followersOnly, "profile"), false);
  assert.equal(canView({ isSelf: false, isFollower: true, blocked: null }, followersOnly, "profile"), true);
  assert.equal(canView({ isSelf: false, isFollower: true, blocked: "byOwner" }, followersOnly, "profile"), false);
  assert.equal(canView(ANONYMOUS, privacyOf({ profileVisibility: "PRIVATE" }), "profile"), false);
  assert.equal(canView(ANONYMOUS, privacyOf({}), "profile"), true);
});
