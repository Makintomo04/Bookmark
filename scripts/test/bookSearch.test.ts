// Book search rules: query tokens, ranking shelf copies and merging with Open Library. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/bookSearch.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeResults, normaliseQuery, queryTokens, rankShelfRows, type ShelfRow } from "@/lib/bookSearchRules";
import type { DiscoverBook } from "@/lib/openLibrary";

const row = (workKey: string | null, title: string, extra: Partial<ShelfRow> = {}): ShelfRow =>
  ({ workKey, title, author: "Someone", pages: 300, coverImage: `https://utfs.io/f/${workKey}`, ...extra });

const book = (workKey: string, title = workKey): DiscoverBook =>
  ({ workKey, title, author: "Someone", pages: null, coverUrl: null, year: 2020 });

test("normaliseQuery and queryTokens ignore case, spacing and stray punctuation", () => {
  assert.equal(normaliseQuery("  The   Hobbit "), "the hobbit");
  assert.deepEqual(queryTokens("Piranesi, - Clarke"), ["piranesi", "clarke"]);
  assert.deepEqual(queryTokens("a b c d e f g").length, 5);
  assert.deepEqual(queryTokens(" -- "), []);
});

test("rankShelfRows groups readers' copies, drops hand-typed books and ranks title matches first", () => {
  const rows = [
    row("OL2W", "Dune Messiah"), row("OL2W", "Dune Messiah"), row("OL2W", "Dune Messiah"),
    row("OL1W", "Dune", { pages: 0 }), row("OL1W", "Dune", { pages: 412 }),
    row(null, "Dune notes"),
    row("OL3W", "Children of Dune"),
  ];
  const ranked = rankShelfRows(rows, "dune", 6);
  assert.deepEqual(ranked.map((b) => b.workKey), ["OL1W", "OL2W", "OL3W"]);
  assert.equal(ranked[0].pages, 412);
});

test("mergeResults leads with shelf books, caps them at half and drops duplicates", () => {
  const local = [book("OL1W"), book("OL2W"), book("OL3W"), book("OL4W")].map((b) => ({ ...b, year: undefined }));
  const remote = [book("OL9W"), book("OL1W"), book("OL8W"), book("OL7W")];
  const merged = mergeResults(local, remote, 6);
  assert.deepEqual(merged.map((b) => b.workKey), ["OL1W", "OL2W", "OL3W", "OL9W", "OL8W", "OL7W"]);
  assert.equal(merged[0].year, 2020);
  assert.deepEqual(mergeResults([], remote, 2).map((b) => b.workKey), ["OL9W", "OL1W"]);
});
