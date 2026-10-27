// Book search rules: query tokens, ranking shelf copies, merging with Open Library, and the Hardcover
// fallback and top-up.
// No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/bookSearch.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeResults, needsFallback, needsTopUp, normaliseQuery, queryTokens, rankShelfRows, toppedUp, withFallback, type ShelfRow } from "@/lib/bookSearchRules";
import { hardcoverBook } from "@/lib/hardcover";
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

const hc = (title: string, author: string, extra: Partial<DiscoverBook> = {}): DiscoverBook =>
  ({ workKey: null, title, author, pages: null, coverUrl: null, source: "hardcover", ...extra });

test("needsFallback asks Hardcover when Open Library has nothing, or nothing matching every word", () => {
  assert.equal(needsFallback([], "caged blackthorn"), true);
  assert.equal(needsFallback([book("OL1W", "The Caged Bird")], "caged blackthorn"), true);
  assert.equal(needsFallback([{ ...book("OL1W", "Caged"), author: "Bernadette Blackthorn" }], "Caged, Blackthorn"), false);
  assert.equal(needsFallback([book("OL1W", "Dune")], "dune"), false);
  // An ISBN search's hit doesn't contain the number, and is still right.
  assert.equal(needsFallback([book("OL1W", "Dune")], "9780441172719"), false);
});

test("withFallback leads with Hardcover's books and drops ones Open Library already has", () => {
  const openLibrary = [
    { ...book("OL1W", "Dune"), author: "Frank Herbert", isbn13: "9780441172719" },
    { ...book("OL2W", "The Caged Bird"), author: "Someone Else" },
  ];
  const hardcover = [
    hc("Caged", "Bernadette Blackthorn"),
    hc("Dune (Deluxe Edition)", "Frank Herbert"),
    hc("Dune Messiah", "Frank Herbert", { isbn13: "9780441172719" }),
    hc("Caged", "Bernadette Blackthorn"),
  ];
  const merged = withFallback(openLibrary, hardcover, 6);
  assert.deepEqual(merged.map((b) => b.title), ["Caged", "Dune", "The Caged Bird"]);
  assert.equal(withFallback(openLibrary, hardcover, 1).length, 1);
});

test("mergeResults drops a Hardcover result for a book a shelf already shows", () => {
  const local = [{ ...book("OL1W", "Caged"), author: "Bernadette Blackthorn" }];
  const merged = mergeResults(local, [hc("Caged", "Bernadette Blackthorn"), hc("Awakened", "Bernadette Blackthorn")], 6);
  assert.deepEqual(merged.map((b) => b.title), ["Caged", "Awakened"]);
  assert.equal(merged[0].workKey, "OL1W");
});

test("hardcoverBook maps a search hit and skips ones without a title or author", () => {
  const mapped = hardcoverBook({
    id: 1, title: " Caged ", author_names: ["", "Bernadette Blackthorn"], image: { url: "https://assets.hardcover.app/c.jpg" },
    release_year: 2026, pages: 0, isbns: ["B0FNGK5YVP", "9781234567897", "123456789X"], description: "A blurb.",
  });
  assert.deepEqual(mapped, {
    workKey: null, title: "Caged", author: "Bernadette Blackthorn", pages: null, coverUrl: "https://assets.hardcover.app/c.jpg",
    year: 2026, editionKey: null, isbn13: "9781234567897", isbn10: "123456789X", authorKey: null, description: "A blurb.", source: "hardcover",
  });
  assert.equal(hardcoverBook({ title: "No author" }), null);
  assert.equal(hardcoverBook({ author_names: ["Someone"] }), null);
});

test("hardcoverBook tidies a doubled space in an author's name", () => {
  assert.equal(hardcoverBook({ title: "Serial Killer Games", author_names: ["Kate  Posey"] })?.author, "Kate Posey");
});

test("needsTopUp asks Hardcover when the book searched for has no cover or page count", () => {
  const thin = { ...book("OL42428428W", "Serial Killer Games"), author: "Kate Posey", pages: 384 };
  assert.equal(needsTopUp([thin], "serial killer games"), true);
  assert.equal(needsTopUp([{ ...thin, coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg" }], "serial killer games"), false);
  // A thin near miss isn't worth a request.
  assert.equal(needsTopUp([{ ...book("OL1W", "Serial Killers"), author: "Someone" }], "serial killer games"), false);
});

test("toppedUp fills a thin Open Library result from the same book on Hardcover, keeping Open Library's own facts", () => {
  const thin = { ...book("OL42428428W", "Serial Killer Games"), author: "Kate Posey", pages: 384, year: 2025 };
  const full = { ...book("OL2W", "Dune"), coverUrl: "https://covers.openlibrary.org/b/id/2-L.jpg", pages: 600 };
  const [filled, untouched] = toppedUp([thin, full], [
    hc("Dune", "Someone", { coverUrl: "https://assets.hardcover.app/dune.jpg" }),
    hc("Serial Killer Games", "Kate Posey", { coverUrl: "https://assets.hardcover.app/skg.jpg", pages: 380, year: 2024, description: "A blurb." }),
  ]);
  assert.deepEqual(filled, { ...thin, coverUrl: "https://assets.hardcover.app/skg.jpg", description: "A blurb." });
  assert.equal(untouched, full);
  // No match on Hardcover: left as it was.
  assert.deepEqual(toppedUp([thin], [hc("Other Book", "Kate Posey")]), [thin]);
});
