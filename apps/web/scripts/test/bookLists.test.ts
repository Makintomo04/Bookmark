// Which readers' lists show on a book's page (lib/bookListRules.ts): editors' choices first, then the
// most remixed, then the longest, then the newest. Pure: no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/bookLists.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankBookLists, type RankableBookList } from "../../lib/bookListRules.ts";

const list = (id: string, over: Partial<RankableBookList> = {}) => ({
  id, updatedAt: "2026-10-01", chosenAt: null, itemCount: 6, ...over,
});

test("editors' choices lead, most recently chosen first, then the most remixed", () => {
  const lists = [
    list("plain"),
    list("remixed", { updatedAt: "2026-01-01" }),
    list("old-choice", { chosenAt: "2026-09-01" }),
    list("new-choice", { chosenAt: "2026-10-20" }),
  ];
  const ranked = rankBookLists(lists, new Map([["remixed", 3]]));
  assert.deepEqual(ranked.map((l) => l.id), ["new-choice", "old-choice", "remixed", "plain"]);
});

test("with no remixes between them, the longer list wins, then the newer", () => {
  const lists = [list("short", { itemCount: 3 }), list("older", { updatedAt: "2026-09-01" }), list("newer", { updatedAt: "2026-10-15" })];
  assert.deepEqual(rankBookLists(lists, new Map()).map((l) => l.id), ["newer", "older", "short"]);
});

test("a limit keeps the best few", () => {
  const lists = ["a", "b", "c", "d", "e"].map((id, i) => list(id, { itemCount: 10 - i }));
  assert.deepEqual(rankBookLists(lists, new Map(), 4).map((l) => l.id), ["a", "b", "c", "d"]);
});
