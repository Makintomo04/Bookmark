// Shelf search, sort and filter, and the "have I read…?" questions Ask the shelf hands over to it.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/shelfFilter.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTER, filterOptions, isNarrowed, matchesFilter, parseShelfParams, shelfFromSlug, shelfPageHref, shelfParams, shelfQuestion, sortBooks,
  type ShelfBook, type ShelfFilter,
} from "@/lib/shelfFilter";

const book = (over: Partial<ShelfBook>): ShelfBook => ({
  id: over.title ?? "x", title: "Untitled", author: "Anon", status: "COMPLETED", rating: null, pages: 300, genre: null, tags: [],
  createdAt: "2024-01-01T12:00:00Z", startedAt: null, completedAt: null, stoppedAt: null, ...over,
});

const books = [
  book({ title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", rating: 4.75, genre: "Sci-Fi", completedAt: "2021-03-10T12:00:00Z", pages: 304, tags: ["owned"] }),
  book({ title: "Jane Eyre", author: "Charlotte Brontë", rating: 4, genre: "Classics", completedAt: "2023-07-01T12:00:00Z", pages: 532 }),
  book({ title: "Mort", author: "Terry Pratchett", rating: 5, genre: "Fantasy", completedAt: "2021-11-02T12:00:00Z", pages: 288, tags: ["Kindle"] }),
  book({ title: "Dune", author: "Frank Herbert", status: "NOT_STARTED", createdAt: "2025-02-01T12:00:00Z", pages: 600 }),
  book({ title: "Project Hail Mary", author: "Andy Weir", status: "STARTED", startedAt: "2026-10-01T12:00:00Z", pages: 0, progressUnit: "MINUTES", audioMinutes: 970 }),
];

const f = (over: Partial<ShelfFilter>): ShelfFilter => ({ ...EMPTY_FILTER, ...over });
const titles = (list: ShelfBook[]) => list.map((b) => b.title);

test("search matches title, author and tags, ignoring case and accents, across every shelf", () => {
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ q: "le guin" })))), ["The Left Hand of Darkness"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ q: "bronte" })))), ["Jane Eyre"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ q: "kindle" })))), ["Mort"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ q: "dune herbert" })))), ["Dune"]);
  assert.equal(books.filter((b) => matchesFilter(b, f({ q: "dune weir" }))).length, 0);
});

test("filters by year and month finished, genre, rating bucket, format, tag, author and shelf", () => {
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ year: 2021 })))), ["The Left Hand of Darkness", "Mort"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ year: 2021, month: 11 })))), ["Mort"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ genre: "classics" })))), ["Jane Eyre"]);
  // 4¾ sits in the 4½ bucket, as /stats draws it.
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ rating: 4.5 })))), ["The Left Hand of Darkness"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ format: "AUDIOBOOK" })))), ["Project Hail Mary"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ tag: "OWNED" })))), ["The Left Hand of Darkness"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ author: "terry pratchett" })))), ["Mort"]);
  assert.deepEqual(titles(books.filter((b) => matchesFilter(b, f({ shelf: "want" })))), ["Dune"]);
});

test("sorts: most recent per shelf, then title, author by surname, rating and length", () => {
  const finished = books.filter((b) => b.status === "COMPLETED");
  assert.deepEqual(titles(sortBooks(finished, "recent")), ["Jane Eyre", "Mort", "The Left Hand of Darkness"]);
  assert.deepEqual(titles(sortBooks(finished, "title")), ["Jane Eyre", "Mort", "The Left Hand of Darkness"]);
  assert.deepEqual(titles(sortBooks(finished, "author")), ["Jane Eyre", "The Left Hand of Darkness", "Mort"]);
  assert.deepEqual(titles(sortBooks(finished, "rating")), ["Mort", "The Left Hand of Darkness", "Jane Eyre"]);
  assert.deepEqual(titles(sortBooks(books, "length")).slice(0, 2), ["Project Hail Mary", "Dune"]);
});

test("URL params round-trip, and junk is ignored", () => {
  const filter = f({ q: "le guin", shelf: "finished", sort: "rating", year: 2021, month: 3, genre: "Sci-Fi", rating: 4.5, format: "EBOOK", tag: "owned", author: "Ursula K. Le Guin" });
  assert.deepEqual(parseShelfParams(shelfParams(filter)), filter);
  assert.deepEqual(parseShelfParams(new URLSearchParams("shelf=nope&sort=x&year=abc&rating=7&format=SCROLL&month=4")), EMPTY_FILTER);
  assert.equal(shelfParams(EMPTY_FILTER).toString(), "");
  assert.equal(isNarrowed(f({ shelf: "finished" })), false);
  assert.equal(isNarrowed(f({ q: "x" })), true);
});

test("filter menus only offer what's on the shelf", () => {
  const options = filterOptions(books);
  assert.deepEqual(options.years, [2023, 2021]);
  assert.deepEqual(options.tags, ["Kindle", "owned"]);
  assert.deepEqual(options.formats, ["AUDIOBOOK"]);
  assert.deepEqual(options.ratings, [5, 4.5, 4]);
});

test("Ask the shelf questions about books already read become shelf searches", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const genres = ["Fantasy", "Sci-Fi", "Romance"];
  assert.deepEqual(shelfQuestion("what was that slow-burn fantasy I read in 2021?", genres, now), { shelf: "finished", year: 2021, genre: "Fantasy" });
  assert.deepEqual(shelfQuestion("Have I read anything by Ursula Le Guin?", genres, now), { shelf: "finished", q: "Ursula Le Guin" });
  assert.deepEqual(shelfQuestion("did I already read “Mort”", genres, now), { shelf: "finished", q: "Mort" });
  assert.deepEqual(shelfQuestion("books I've read last year", genres, now), { shelf: "finished", year: 2025 });
  // Questions for something new stay with Ask the shelf.
  assert.equal(shelfQuestion("a cosy fantasy with found family", genres, now), null);
  assert.equal(shelfQuestion("something like books I loved, but darker romantasy", genres, now), null);
});

test("each shelf has its own page, and the page link carries the filters but not the shelf", () => {
  assert.equal(shelfPageHref("persona", "finished"), "/u/persona/shelf/finished");
  assert.equal(shelfPageHref("a b", "want", { sort: "rating", shelf: "want", year: 2021 }), "/u/a%20b/shelf/want-to-read?sort=rating&year=2021");
  assert.equal(shelfFromSlug("did-not-finish"), "dnf");
  assert.equal(shelfFromSlug("nope"), null);
});
