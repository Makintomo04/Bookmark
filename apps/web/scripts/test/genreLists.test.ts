// Which readers' lists lead a genre's page on Discover (lib/genreListRules.ts): editors' choices first,
// then lists that clear the quality bar, ranked by remixes. Pure: no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/genreLists.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allGenreListsOrder, qualifies, rankGenreLists, type RankableList } from "../../lib/genreListRules.ts";

const list = (id: string, over: Partial<RankableList & { updatedAt: string }> = {}) => ({
  id, createdAt: "2026-10-01", updatedAt: "2026-10-01", chosenAt: null, itemCount: 6, description: "Why these.", ...over,
});

test("a list qualifies with at least five books and a description", () => {
  assert.equal(qualifies(list("a")), true);
  assert.equal(qualifies(list("a", { itemCount: 4 })), false);
  assert.equal(qualifies(list("a", { description: null })), false);
  assert.equal(qualifies(list("a", { description: "   " })), false);
});

test("editors' choices lead, most recently chosen first, then the most remixed, then the newest", () => {
  const chosen = [list("old-choice", { chosenAt: "2026-09-01" }), list("new-choice", { chosenAt: "2026-10-20" })];
  const candidates = [
    list("new-choice", { chosenAt: "2026-10-20" }),
    list("newer", { createdAt: "2026-10-15" }),
    list("remixed", { createdAt: "2026-01-01" }),
    list("older", { createdAt: "2026-10-02" }),
    list("thin", { itemCount: 2, createdAt: "2026-10-25" }),
  ];
  const ranked = rankGenreLists(chosen, candidates, new Map([["remixed", 3]]));
  assert.deepEqual(ranked.map((l) => l.id), ["new-choice", "old-choice", "remixed", "newer", "older"]);
});

test("editors' choices aren't held to the quality bar, and the row is capped", () => {
  const chosen = [list("short-choice", { chosenAt: "2026-10-01", itemCount: 2, description: null })];
  const candidates = Array.from({ length: 12 }, (_, i) => list(`c${i}`, { createdAt: `2026-10-${String(10 + i).padStart(2, "0")}` }));
  const ranked = rankGenreLists(chosen, candidates, new Map(), 8);
  assert.equal(ranked.length, 8);
  assert.equal(ranked[0].id, "short-choice");
  assert.equal(ranked[1].id, "c11", "then the newest");
});

test("the all-lists page puts editors' choices first, then the most recently updated", () => {
  const ordered = allGenreListsOrder([
    list("a", { updatedAt: "2026-10-20" }),
    list("chosen", { chosenAt: "2026-10-01", updatedAt: "2026-01-01" }),
    list("b", { updatedAt: "2026-10-25", itemCount: 1, description: null }),
  ]);
  assert.deepEqual(ordered.map((l) => l.id), ["chosen", "b", "a"]);
});
