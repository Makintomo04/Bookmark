// The weekly email's circle counts (BOO-48): which comments a member unlocked this week. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/unlockedComments.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { unlockedCommentsWhere } from "@/lib/jobs/unlockedComments";

const since = new Date("2026-10-25T09:00:00Z");

test("the weekly email counts the comments a member reached this week, however old", () => {
  // Read from 20% to 45% since last Sunday's email: everything between counts, posted when it may, and
  // anything posted this week within the first 20% too. Nothing past 45%.
  assert.deepEqual(unlockedCommentsWhere(45, 20, since), {
    position: { lte: 45 },
    OR: [{ position: { gt: 20 } }, { createdAt: { gte: since } }],
  });
});

test("before a member's first weekly email, it's the comments posted this week that they reach", () => {
  assert.deepEqual(unlockedCommentsWhere(45, null, since), { createdAt: { gte: since }, position: { lte: 45 } });
  assert.deepEqual(unlockedCommentsWhere(45, undefined, since), { createdAt: { gte: since }, position: { lte: 45 } });
});
