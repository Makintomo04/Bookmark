// Copies of one book in search results and genre lists collapsed into one card. The Lapsansky-Werner
// works are Open Library's, as search returned them in October 2026.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/workDuplicates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseDuplicates, duplicateGroups } from "@/lib/workDuplicates";
import type { DiscoverBook } from "@/lib/openLibrary";

const LW = "Emma J. Lapsansky-Werner";
const work = (workKey: string, title: string, extra: Partial<DiscoverBook> = {}): DiscoverBook =>
  ({ workKey, title, author: LW, pages: null, coverUrl: null, year: null, ...extra });

const SEARCH: DiscoverBook[] = [
  work("OL18630282W", "United States history", { coverUrl: "c1", year: 2010, isbn13: "9780133682168", editionCount: 2 }),
  work("OL18785956W", "United States history", { pages: 801, coverUrl: "c2", year: 2009, isbn13: "9780133189063", editionCount: 4 }),
  work("OL16344895W", "United States history", { year: 2008, isbn13: "9780132025591", editionCount: 1 }),
  work("OL16801379W", "United States History", { pages: 1264, coverUrl: "c4", year: 2011, isbn13: "9780133229745", editionCount: 2 }),
  work("OL28947684W", "Prentice Hall United States History", { author: "Lapsansky-Werner et al.", pages: 1004, year: 2013 }),
  work("OL1W", "United States History", { author: "Someone Else", pages: 300 }),
];

test("duplicateGroups finds copies by first author and title, not title alone", () => {
  assert.deepEqual(duplicateGroups(SEARCH), [["OL18630282W", "OL18785956W", "OL16344895W", "OL16801379W"]]);
  assert.deepEqual(duplicateGroups([work("OL1W", "Dune", { author: "Unknown" }), work("OL2W", "Dune", { author: "Unknown" })]), []);
});

test("collapseDuplicates keeps the described copy in the first copy's place", () => {
  const books = collapseDuplicates(SEARCH, new Set(["OL16801379W"]));
  assert.deepEqual(books.map((b) => b.workKey), ["OL16801379W", "OL28947684W", "OL1W"]);
  assert.equal(books[0].pages, 1264);
  assert.equal(books[0].isbn13, "9780133229745");
});

test("without descriptions it keeps the copy with the most data, then the most editions", () => {
  const books = collapseDuplicates(SEARCH);
  assert.equal(books[0].workKey, "OL18785956W");
  assert.equal(books.length, 3);
});

test("the kept copy borrows missing pages, year and cover, but not another work's ISBNs", () => {
  const [book] = collapseDuplicates(
    [work("OL1W", "Piranesi", { coverUrl: "a", year: 2020 }), work("OL2W", "Piranesi", { pages: 272, isbn13: "9781526622426" })],
    new Set(["OL1W"]),
  );
  assert.equal(book.workKey, "OL1W");
  assert.equal(book.pages, 272);
  assert.equal(book.coverUrl, "a");
  assert.equal(book.isbn13, undefined);
});

test("books without a work key and lists without copies are left as they are", () => {
  const list = [work("OL1W", "Dune"), { ...work("", "Dune"), workKey: null, source: "hardcover" as const }, work("OL2W", "Emma")];
  assert.deepEqual(collapseDuplicates(list), list);
});
