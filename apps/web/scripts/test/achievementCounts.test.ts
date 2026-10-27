// The counts line on the reader tier card: medals earned, ladders in progress, ladders not started.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/achievementCounts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { achievementCounts, achievementCountsLine } from "@bookmark/shared/achievementCounts";

const ladder = (...earned: boolean[]) => ({ milestones: earned.map((e) => ({ earned: e })) });

test("rungs add up across ladders, and each ladder lands in one bucket", () => {
  const counts = achievementCounts([
    ladder(true, true, true), // complete: medals only
    ladder(true, false, false), // in progress
    ladder(true, true, false), // in progress
    ladder(false, false), // not started
  ]);
  assert.deepEqual(counts, { earned: 6, inProgress: 2, notStarted: 1 });
  assert.equal(achievementCountsLine(counts), "6 medals earned · 2 in progress · 1 not started");
});

test("a ladder with no rungs counts for nothing", () => {
  assert.deepEqual(achievementCounts([ladder()]), { earned: 0, inProgress: 0, notStarted: 0 });
});

test("before the first medal the line doesn't lead with a zero", () => {
  assert.equal(achievementCountsLine(achievementCounts([ladder(false), ladder(false, false)])), "No medals yet · 2 not started");
});

test("one medal is singular, and empty parts drop out", () => {
  assert.equal(achievementCountsLine({ earned: 1, inProgress: 1, notStarted: 0 }), "1 medal earned · 1 in progress");
  assert.equal(achievementCountsLine({ earned: 42, inProgress: 0, notStarted: 0 }), "42 medals earned");
  assert.equal(achievementCountsLine({ earned: 1200, inProgress: 0, notStarted: 3 }), "1,200 medals earned · 3 not started");
});
