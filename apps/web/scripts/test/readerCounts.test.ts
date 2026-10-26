// Currently reading / Want to read counts on book details: the tally and who's shown first. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/readerCounts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { followedFirst, tallyReaders } from "@/lib/readerCountRules";

test("a reader counts once per shelf, however many editions they own", () => {
  const { reading, wantToRead } = tallyReaders([
    { userId: "a", status: "STARTED" },
    { userId: "a", status: "STARTED" },
    { userId: "b", status: "NOT_STARTED" },
    { userId: "c", status: "STARTED" },
    { userId: "b", status: "NOT_STARTED" },
  ]);
  assert.deepEqual(reading, ["a", "c"]);
  assert.deepEqual(wantToRead, ["b"]);
});

test("other shelves don't count", () => {
  const { reading, wantToRead } = tallyReaders([
    { userId: "a", status: "COMPLETED" },
    { userId: "b", status: "DNF" },
    { userId: "c", status: "PAUSED" },
    { userId: "d", status: "NOT_INTERESTED" },
  ]);
  assert.deepEqual(reading, []);
  assert.deepEqual(wantToRead, []);
});

test("people the viewer follows come first, otherwise newest first", () => {
  assert.deepEqual(followedFirst(["a", "b", "c", "d"], new Set(["c", "a"])), ["a", "c", "b", "d"]);
  assert.deepEqual(followedFirst(["a", "b"], new Set()), ["a", "b"]);
});
