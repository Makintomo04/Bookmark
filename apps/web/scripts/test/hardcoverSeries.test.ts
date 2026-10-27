// lib/hardcover.ts's series lookups, against canned GraphQL answers shaped like Hardcover's (October 2026).
//   pnpm test
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { hardcoverSeriesBooks, hardcoverSeriesOf } from "@/lib/hardcover";

const realFetch = globalThis.fetch;
process.env.HARDCOVER_API_TOKEN = "test-token";

// Answers every GraphQL request with `data`.
function answer(data: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify({ data }), { status: 200 })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const stormlight = { id: 997, name: "The Stormlight Archive" };

const hits = (...documents: object[]) => ({ results: { hits: documents.map((document) => ({ document })) } });

test("hardcoverSeriesOf takes the series of the same book, passing over companions and box sets", async () => {
  answer({
    search: hits(
      { id: 505131, title: "Words of Radiance Sidekick", author_names: ["BookBuddy"], users_count: 40, featured_series: {} },
      { id: 3038216, title: "The Stormlight Archive Series. 4 Books Collection Set", author_names: ["Brandon Sanderson"], users_count: 90, featured_series: { position: 1, collection: true, series: stormlight } },
      { id: 374131, title: "Words of Radiance", author_names: ["Brandon Sanderson"], users_count: 9000, featured_series: { position: 2, collection: false, series: stormlight } },
    ),
    books: [],
  });
  assert.deepEqual(await hardcoverSeriesOf("Words of Radiance", "Brandon Sanderson"), { id: 997, name: "The Stormlight Archive", position: 2 });
});

test("hardcoverSeriesOf finds a short title search misses, and a book Hardcover titles longer", async () => {
  answer({
    search: hits({ id: 427363, title: "God Emperor of Dune", author_names: ["Frank Herbert"], users_count: 3000, featured_series: { position: 4, series: { id: 1150, name: "Dune" } } }),
    books: [
      { id: 312460, title: "Dune", users_count: 15098, contributions: [{ author: { name: "Frank Herbert" } }], featured_book_series: { position: 1, compilation: false, series: { id: 1150, name: "Dune" } } },
      { id: 987286, title: "Dune", users_count: 4, contributions: [{ author: { name: "Christian McCrea" } }], featured_book_series: null },
    ],
  });
  assert.deepEqual(await hardcoverSeriesOf("Dune", "Frank Herbert"), { id: 1150, name: "Dune", position: 1 });

  answer({
    search: hits(
      { id: 1289485, title: "Mistborn: The Wax & Wayne Series", author_names: ["Brandon Sanderson"], users_count: 200, featured_series: { position: 4, collection: true, series: { id: 5452, name: "The Mistborn Saga" } } },
      { id: 369692, title: "Mistborn: The Final Empire", author_names: ["Brandon Sanderson"], users_count: 12000, featured_series: { position: 1, collection: false, series: { id: 10001, name: "The Mistborn Saga: The Original Trilogy" } } },
    ),
    books: [],
  });
  assert.deepEqual(await hardcoverSeriesOf("Mistborn", "Brandon Sanderson"), { id: 10001, name: "The Mistborn Saga: The Original Trilogy", position: 1 });
});

test("hardcoverSeriesOf goes by the most-read match, so a stray record's series doesn't win", async () => {
  answer({
    search: hits({ id: 2459845, title: "The Hobbit, or There and Back Again", author_names: ["J.R.R. Tolkien"], users_count: 12702, featured_series: { position: 1, series: { id: 127396, name: "Middle Earth" } } }),
    books: [{ id: 3016332, title: "The Hobbit", users_count: 5, contributions: [{ author: { name: "J.R.R. Tolkien" } }], featured_book_series: { position: 1, compilation: false, series: { id: 1130, name: "The Lord of the Rings" } } }],
  });
  assert.deepEqual(await hardcoverSeriesOf("The Hobbit", "J.R.R. Tolkien"), { id: 127396, name: "Middle Earth", position: 1 });
});

test("hardcoverSeriesOf finds a book the title-and-author search misses through the title alone", async () => {
  answer({
    // "The Hobbit J. R. R. Tolkien": the spaced initials pull The Lord of the Rings ahead.
    search: hits({ id: 139773, title: "The Fellowship of the Ring", author_names: ["J.R.R. Tolkien"], users_count: 10479, featured_series: { position: 1, series: { id: 1130, name: "The Lord of the Rings" } } }),
    byTitle: hits({ id: 2459845, title: "The Hobbit, or There and Back Again", author_names: ["J.R.R. Tolkien"], users_count: 12702, featured_series: { position: 1, series: { id: 127396, name: "Middle Earth" } } }),
    books: [{ id: 3016332, title: "The Hobbit", users_count: 5, contributions: [{ author: { name: "J.R.R. Tolkien" } }], featured_book_series: { position: 1, compilation: false, series: { id: 1130, name: "The Lord of the Rings" } } }],
  });
  assert.deepEqual(await hardcoverSeriesOf("The Hobbit", "J. R. R. Tolkien"), { id: 127396, name: "Middle Earth", position: 1 });
});

test("hardcoverSeriesOf finds a book by its subtitle and never takes an audiobook part for it", async () => {
  const saga = { id: 5452, name: "The Mistborn Saga" };
  answer({
    search: hits(
      { id: 369692, title: "Mistborn: The Final Empire", author_names: ["Brandon Sanderson"], users_count: 11958, featured_series: { position: 1, series: { id: 10001, name: "The Mistborn Saga: The Original Trilogy" } } },
      { id: 2990250, title: "The Final Empire (2 of 3)", author_names: ["Brandon Sanderson"], users_count: 28, featured_series: { position: 1.2, series: saga } },
      { id: 2898212, title: "The Final Empire (Part 1 of 2) [Dramatized Adaptation]", author_names: ["Brandon Sanderson"], users_count: 30000, featured_series: { position: 1.1, series: saga } },
    ),
    books: [],
  });
  assert.deepEqual(await hardcoverSeriesOf("The Final Empire", "Brandon Sanderson"), { id: 10001, name: "The Mistborn Saga: The Original Trilogy", position: 1 });

  answer({ search: hits({ id: 2990250, title: "The Final Empire (2 of 3)", author_names: ["Brandon Sanderson"], users_count: 28, featured_series: { position: 1.2, series: saga } }), books: [] });
  assert.equal(await hardcoverSeriesOf("The Final Empire", "Brandon Sanderson"), null);
});

test("hardcoverSeriesOf is null for a standalone or a book Hardcover doesn't have", async () => {
  answer({ search: hits({ id: 432760, title: "Verity", author_names: ["Colleen Hoover"], users_count: 3003, featured_series: {} }), books: [] });
  assert.equal(await hardcoverSeriesOf("Verity", "Colleen Hoover"), null);
  answer({
    search: hits(),
    books: [{ id: 541549, title: "Verity", users_count: 30, contributions: [{ author: { name: "Claire Farrell" } }], featured_book_series: { position: 1, compilation: false, series: { id: 23515, name: "Cursed" } } }],
  });
  assert.equal(await hardcoverSeriesOf("Verity", "Colleen Hoover"), null);
});

test("hardcoverSeriesBooks keeps one most-read book per whole-numbered place, credited to the series' author", async () => {
  answer({
    series: [{
      book_series: [
        { position: 1, book: { id: 3033573, title: "Fourth Wing", users_count: 0 } },
        { position: 1, book: { id: 714600, title: "Fourth Wing", users_count: 8209, pages: 517, release_year: 2023, image: { url: "https://assets.hardcover.app/fw.jpg" } } },
        { position: 1.1, book: { id: 2898212, title: "Fourth Wing (Part 1 of 2) [Dramatized Adaptation]", users_count: 73 } },
        { position: 3, book: { id: 3, title: "Onyx Storm", users_count: 4000 } },
        { position: 2, book: { id: 2, title: "Iron Flame", users_count: 5000 } },
        { position: 0, book: { id: 9, title: "Prequel guide", users_count: 10 } },
      ],
    }],
  });
  const books = await hardcoverSeriesBooks(41764, "Rebecca Yarros");
  assert.deepEqual(books.map((b) => [b.position, b.title, b.hardcoverId, b.author]), [
    [1, "Fourth Wing", "714600", "Rebecca Yarros"],
    [2, "Iron Flame", "2", "Rebecca Yarros"],
    [3, "Onyx Storm", "3", "Rebecca Yarros"],
  ]);
  assert.equal(books[0].coverUrl, "https://assets.hardcover.app/fw.jpg");
  assert.equal(books[0].pages, 517);
});

test("hardcoverSeriesBooks leaves out books announced but not out yet", async () => {
  answer({
    series: [{
      book_series: [
        { position: 7, book: { id: 7, title: "The Lost Metal", users_count: 3378, release_date: "2022-01-01" } },
        { position: 8, book: { id: 8, title: "Ghostbloods 1", users_count: 157, release_date: "2028-12-01" } },
        { position: 9, book: { id: 9, title: "Undated", users_count: 5, release_date: null } },
      ],
    }],
  });
  const books = await hardcoverSeriesBooks(5452, "Brandon Sanderson", new Date("2026-10-27"));
  assert.deepEqual(books.map((b) => b.title), ["The Lost Metal", "Undated"]);
});
