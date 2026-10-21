// Parsing, mapping, matching and round-trip checks for the CSV importer. No database, no network.
//
//   npm run test:import
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Book, Status } from "@prisma/client";
import { parseCsv } from "../../lib/import/csv.ts";
import { cleanIsbn, parseDateRanges, parseImport, roundRating, stripSeries } from "../../lib/import/formats.ts";
import { matchRows, plausibleMatch } from "../../lib/import/match.ts";
import { REVIEW_MAX, buildRecords, findDuplicates, newObjectId } from "../../lib/import/records.ts";
import type { ImportMatch, ImportRow, ImportSource } from "../../lib/import/types.ts";
import { booksToCsv } from "../../lib/export.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const NOW = new Date("2026-10-21T12:00:00Z");
const build = (row: ImportRow, match: ImportMatch | null = null, source: ImportSource = "goodreads") =>
  buildRecords(row, match, { userId: "u".repeat(24), bookId: newObjectId(), now: NOW, source });

// The invariants Wave A's read history relies on (see prisma/schema.prisma, BookRead).
function assertInvariants({ book, reads }: ReturnType<typeof build>) {
  const completed = reads.filter((r) => r.status === "COMPLETED").length;
  assert.equal(book.timesRead, completed, `${book.title}: timesRead matches COMPLETED reads`);
  const open = reads.filter((r) => r.status === "STARTED" || r.status === "PAUSED");
  assert.ok(open.length <= 1, `${book.title}: at most one open read`);
  if (open.length) assert.ok(book.status === "STARTED" || book.status === "PAUSED", `${book.title}: open read only while reading`);
  if (book.status !== "NOT_STARTED") assert.equal(reads[reads.length - 1]?.status, book.status, `${book.title}: last read mirrors the book`);
  for (let i = 1; i < reads.length; i++) {
    assert.ok(reads[i].createdAt > reads[i - 1].createdAt, `${book.title}: reads in createdAt order`);
  }
  assert.ok(reads.every((r) => r.status !== "NOT_STARTED"));
  if (book.rating !== null) assert.equal(book.rating * 2, Math.round(book.rating * 2), "half-star rating");
}

// ---- CSV ---------------------------------------------------------------------------------

test("CSV: quotes, doubled quotes, multiline fields, CRLF/LF/CR, BOM, blank lines", () => {
  const text = '﻿a,b,c\r\n"1,2","say ""hi""","line one\nline two\r\nline three"\n\nx,,\rlast,row';
  assert.deepEqual(parseCsv(text), [
    ["a", "b", "c"],
    ["1,2", 'say "hi"', "line one\nline two\r\nline three"],
    ["x", "", ""],
    ["last", "row"],
  ]);
  assert.deepEqual(parseCsv('a,b\n1,"unterminated'), [["a", "b"], ["1", "unterminated"]]);
});

test("helpers: ratings, ISBNs, series, date ranges", () => {
  assert.equal(roundRating("0"), null);
  assert.equal(roundRating(""), null);
  assert.equal(roundRating("3.25"), 3.5);
  assert.equal(roundRating("3.2"), 3);
  assert.equal(roundRating("4.75"), 5);
  assert.equal(roundRating("0.25"), 0.5);
  assert.equal(roundRating(7), 5);
  assert.deepEqual(cleanIsbn('="0441013597"'), { isbn13: null, isbn10: "0441013597" });
  assert.deepEqual(cleanIsbn('="978-0-441-01359-3"'), { isbn13: "9780441013593", isbn10: null });
  assert.deepEqual(cleanIsbn('=""'), { isbn13: null, isbn10: null });
  assert.deepEqual(cleanIsbn("080442957X"), { isbn13: null, isbn10: "080442957X" });
  assert.equal(stripSeries("Dune (Dune, #1)"), "Dune");
  assert.equal(stripSeries("Words of Radiance (The Stormlight Archive #2.5)"), "Words of Radiance");
  assert.equal(stripSeries("Notes (on things)"), "Notes (on things)");
  assert.deepEqual(parseDateRanges("2025/02/14-2025/02/20, 2021/01/03-2021/01/10, 2026/10/02-, 2020/05/05").map((r) => [day(r.startedAt), day(r.finishedAt)]), [
    [null, "2020-05-05"],
    ["2021-01-03", "2021-01-10"],
    ["2025-02-14", "2025-02-20"],
    ["2026-10-02", null],
  ]);
});

test("rejects files that aren't a known export", () => {
  assert.throws(() => parseImport("name,email\nAda,ada@example.com\n"), /doesn't look like/);
});

// ---- Goodreads ---------------------------------------------------------------------------

test("Goodreads: detection and mapping", () => {
  const { source, rows, skippedLines } = parseImport(fixture("goodreads.csv"));
  assert.equal(source, "goodreads");
  assert.deepEqual(skippedLines, [7]);
  const by = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.deepEqual(Object.keys(by), [
    "The Hobbit, or There and Back Again", "Dune", "Infinite Jest", "Project Hail Mary", "The Name of the Wind", "Middlemarch",
  ]);

  const hobbit = by["The Hobbit, or There and Back Again"];
  assert.equal(hobbit.isbn13, "9780547928227");
  assert.equal(hobbit.isbn10, "0547928220");
  assert.equal(hobbit.status, "COMPLETED");
  assert.equal(hobbit.rating, 5);
  assert.equal(hobbit.pages, 300);
  assert.equal(hobbit.review, 'A cosy, perfect book.\n\nRead it to my kids, who said "again!"');
  assert.equal(hobbit.favourite, true);
  assert.equal(hobbit.genre, "Fantasy");
  assert.equal(day(hobbit.addedAt), "2019-06-02");
  assert.equal(day(hobbit.completedAt), "2024-03-14");
  assert.deepEqual(hobbit.completedReads.map((r) => day(r.finishedAt)), [null, null, "2024-03-14"]);

  const dune = by["Dune"];
  assert.equal(dune.isbn13, null);
  assert.equal(dune.isbn10, null);
  assert.equal(dune.genre, "Sci-Fi");
  assert.equal(dune.completedAt, null, "an undated finish stays undated");
  assert.equal(dune.completedReads.length, 1);

  const jest = by["Infinite Jest"];
  assert.equal(jest.status, "DNF", "a custom dnf shelf means DNF");
  assert.equal(jest.rating, null, "0 stars is unrated");
  assert.equal(jest.privateNotes, "Gave up at page 200");
  assert.equal(jest.genre, "Literary Fiction");

  assert.equal(by["Project Hail Mary"].status, "STARTED");
  assert.equal(by["The Name of the Wind"].status, "PAUSED");

  const middlemarch = by["Middlemarch"];
  assert.equal(middlemarch.status, "DNF", "did-not-finish outranks the read shelf");
  assert.equal(middlemarch.completedReads.length, 0, "the read Goodreads counted for the DNF isn't a finish");
  assert.equal(middlemarch.review, 'Multi-line review:\nline two, with a comma\nand "quotes"');
  assert.equal(middlemarch.genre, "Classics");

  for (const row of rows) assertInvariants(build(row));
});

test("Goodreads: records, reads and the honest goal", () => {
  const { rows } = parseImport(fixture("goodreads.csv"));
  const hobbitRow = rows[0];
  const match: ImportMatch = { workKey: "OL27482W", coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg", pages: 310, genre: "Fantasy", by: "isbn13" };
  const hobbit = build(hobbitRow, match);
  assert.equal(hobbit.book.workKey, "OL27482W");
  assert.equal(hobbit.book.coverImage, match.coverUrl);
  assert.equal(hobbit.book.pages, 300, "the file's page count wins");
  assert.equal(hobbit.book.currentPage, 300);
  assert.equal(hobbit.book.timesRead, 3);
  assert.equal(hobbit.reads.length, 3);
  assert.equal(hobbit.reads[2].rating, 5, "the rating goes on the latest read");
  assert.equal(hobbit.reads[0].rating, null);
  assert.equal(hobbit.book.createdAt.toISOString().slice(0, 10), "2019-06-02");

  const dnf = build(rows[2]);
  assert.equal(dnf.book.stoppedAt, null, "an undated DNF stays undated, so it doesn't count as put down this year");
  assert.equal(dnf.reads[0].finishedAt, null);
  assert.equal(dnf.reads[0].status, "DNF");
  assert.equal(dnf.reads[0].stoppedAtPage, 0);
  assert.equal(dnf.notes.length, 1);

  const reading = build(rows[3]);
  assert.deepEqual(reading.reads.map((r) => [r.status, r.finishedAt]), [["STARTED", null]]);
  assert.equal(build(rows[4]).reads[0].status, "PAUSED");

  // Goal maths: only finishes dated in the goal year count (books with completedAt in it).
  const csv = [
    "Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review,Read Count",
    "This Year,A Author,,,4,100,2026/02/01,2026/01/01,,read,,1",
    "Long Ago,B Author,,,4,100,2015/02/01,2015/01/01,,read,,1",
    "Undated,C Author,,,4,100,,2026/03/01,,read,,1",
  ].join("\n");
  const year = NOW.getUTCFullYear();
  const counted = parseImport(csv).rows.map((r) => build(r).book).filter(
    (b) => b.status === "COMPLETED" && b.completedAt && b.completedAt.getUTCFullYear() === year
  );
  assert.deepEqual(counted.map((b) => b.title), ["This Year"]);
});

test("long reviews keep every word in a note", () => {
  const long = "word ".repeat(1000).trim();
  const row = { ...parseImport(fixture("goodreads.csv")).rows[0], review: long };
  const { book, notes } = build(row);
  assert.ok(book.review!.length <= REVIEW_MAX);
  assert.ok(book.review!.endsWith("…"));
  assert.equal(notes[0].content, long);
});

// ---- StoryGraph --------------------------------------------------------------------------

test("StoryGraph: detection, quarter stars, multiple reads, DNF and paused", () => {
  const { source, rows } = parseImport(fixture("storygraph.csv"));
  assert.equal(source, "storygraph");
  const [piranesi, babel, tomorrow, zine, klara] = rows;

  assert.equal(piranesi.rating, 5, "4.75 rounds to 5");
  assert.equal(piranesi.isbn13, "9781635575996");
  assert.equal(piranesi.genre, "Fantasy");
  assert.equal(piranesi.favourite, true);
  assert.equal(piranesi.review, "Haunting.\n\nSecond paragraph.");
  assert.deepEqual(piranesi.completedReads.map((r) => [day(r.startedAt), day(r.finishedAt)]), [
    ["2021-01-03", "2021-01-10"],
    ["2025-02-14", "2025-02-20"],
  ]);
  assert.equal(day(piranesi.startedAt), "2025-02-14");
  assert.equal(day(piranesi.completedAt), "2025-02-20");

  assert.equal(babel.status, "DNF");
  assert.equal(babel.author, "R.F. Kuang");
  assert.equal(babel.rating, 2.5);
  assert.equal(babel.genre, "Historical Fiction");
  assert.equal(day(babel.startedAt), "2023-04-20");
  assert.equal(day(babel.stoppedAt), "2023-05-01");
  const babelRecords = build(babel, null, "storygraph");
  assert.equal(day(babelRecords.reads[0].finishedAt?.toISOString()), "2023-05-01");

  assert.equal(tomorrow.status, "STARTED");
  assert.equal(tomorrow.completedReads.length, 1, "an earlier finished read");
  assert.equal(day(tomorrow.startedAt), "2026-10-02", "the open read's start");
  const tomorrowRecords = build(tomorrow, null, "storygraph");
  assert.deepEqual(tomorrowRecords.reads.map((r) => r.status), ["COMPLETED", "STARTED"]);
  assert.equal(day(tomorrowRecords.book.completedAt?.toISOString()), "2024-01-09", "the last finish survives the re-read");

  assert.equal(zine.isbn13, null, "a StoryGraph uid isn't an ISBN");
  assert.equal(zine.status, "NOT_STARTED");
  assert.equal(build(zine, null, "storygraph").reads.length, 0);

  assert.equal(klara.status, "PAUSED");
  assert.equal(day(klara.startedAt), "2026-06-02");

  for (const row of rows) assertInvariants(build(row, null, "storygraph"));
});

// ---- Bookmark round trip -----------------------------------------------------------------

type ExportBook = Parameters<typeof booksToCsv>[0][number];

const sample = (over: Partial<ExportBook>): ExportBook => ({
  id: newObjectId(),
  title: "Untitled",
  author: "Someone",
  pages: 200,
  currentPage: 0,
  rating: null,
  review: null,
  timesRead: 0,
  status: "NOT_STARTED" as Status,
  genre: null,
  createdAt: new Date("2024-01-01T09:30:00Z"),
  startedAt: null,
  completedAt: null,
  workKey: null,
  coverImage: "",
  ...over,
});

test("Bookmark: its own CSV export imports and re-exports byte for byte", () => {
  const books: ExportBook[] = [
    sample({ title: "Re-read, with \"quotes\"", author: "Ursula K. Le Guin", status: "COMPLETED", rating: 4.5, timesRead: 3, pages: 250, currentPage: 250,
      review: "Line one\nline two, with commas\r\nand a CRLF", startedAt: new Date("2025-05-01T10:00:00Z"), completedAt: new Date("2025-05-20T22:15:00Z"),
      genre: "Fantasy", workKey: "OL59795W", coverImage: "https://utfs.io/f/abc.jpg" }),
    sample({ title: "Reading again", status: "STARTED", timesRead: 1, currentPage: 42, startedAt: new Date("2026-10-01T08:00:00Z"),
      completedAt: new Date("2020-03-03T00:00:00Z"), rating: 3, workKey: "OL1W", coverImage: "https://covers.openlibrary.org/b/id/9-L.jpg" }),
    sample({ title: "Put down", status: "DNF", currentPage: 87, rating: 1.5, startedAt: new Date("2026-02-02T00:00:00Z") }),
    sample({ title: "On hold", status: "PAUSED", currentPage: 10, startedAt: new Date("2026-04-04T00:00:00Z") }),
    sample({ title: "Someday", genre: "Sci-Fi" }),
    sample({ title: "No pages known", status: "COMPLETED", timesRead: 1, pages: 0, currentPage: 0 }),
  ];
  const favouriteIds = [books[0].id, books[4].id];
  const original = booksToCsv(books, favouriteIds);

  const { source, rows } = parseImport(original);
  assert.equal(source, "bookmark");
  const rebuilt = rows.map((row) => build(row, null, "bookmark"));
  rebuilt.forEach(assertInvariants);
  const again = booksToCsv(rebuilt.map((r) => r.book as unknown as Book), rebuilt.filter((_, i) => rows[i].favourite).map((r) => r.book.id));

  // Every column but "Bookmark Id" (the last), which is new on the new shelf.
  const strip = (csv: string) => parseCsv(csv).map((cells) => cells.slice(0, -1));
  assert.deepEqual(strip(again), strip(original));
});

// ---- Matching ----------------------------------------------------------------------------

test("matching: ISBN-13, then ISBN-10 in one batched request, then title + author", async () => {
  const rows = parseImport(fixture("goodreads.csv")).rows;
  const urls: string[] = [];
  const fakeFetch = async (url: string) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    let docs: unknown[] = [];
    if (q.get("q")?.includes("isbn:")) {
      docs = [
        { key: "/works/OL27482W", title: "The Hobbit", author_name: ["J.R.R. Tolkien"], cover_i: 1, number_of_pages_median: 310, isbn: ["9780547928227", "0547928220"], subject: ["Fantasy fiction"] },
        { key: "/works/OL5W", title: "Infinite Jest", author_name: ["David Foster Wallace"], isbn: ["0316066524"], subject: ["Fiction"] },
      ];
    } else if (q.get("title") === "Dune") {
      docs = [{ key: "/works/OL893414W", title: "Dune", author_name: ["Frank Herbert"], cover_i: 2, subject: ["Science fiction"] }];
    } else if (q.get("title") === "The Name of the Wind") {
      docs = [{ key: "/works/OL9W", title: "A Totally Different Book", author_name: ["Patrick Rothfuss"] }];
    }
    return { ok: true, json: async () => ({ docs }) };
  };

  const { matches } = await matchRows(rows, rows.map((_, i) => i), { deadline: Date.now() + 5000, fetchImpl: fakeFetch });
  assert.equal(urls.filter((u) => u.includes("isbn%3A")).length, 1, "all ISBNs share one request");
  assert.equal(matches.get(0)?.by, "isbn13");
  assert.equal(matches.get(0)?.coverUrl, "https://covers.openlibrary.org/b/id/1-L.jpg");
  assert.equal(matches.get(0)?.genre, "Fantasy");
  assert.equal(matches.get(1)?.workKey, "OL893414W");
  assert.equal(matches.get(1)?.by, "title");
  assert.equal(matches.get(2)?.by, "isbn", "found by its ISBN-10 when the ISBN-13 isn't listed");
  assert.equal(matches.get(4), null, "an implausible top hit is rejected");
  assert.equal(matches.size, rows.length);
});

test("matching: plausibility check", () => {
  assert.ok(plausibleMatch({ title: "Dune: Deluxe Edition", author: "Frank Herbert" }, { title: "Dune", author_name: ["Frank Herbert"] }));
  assert.ok(plausibleMatch({ title: "Hobbit", author: "J. R. R. Tolkien" }, { title: "The Hobbit", author_name: ["J.R.R. Tolkien"] }));
  assert.ok(!plausibleMatch({ title: "Dune", author: "Frank Herbert" }, { title: "Dune Messiah", author_name: ["Brian Herbert"] }));
  assert.ok(!plausibleMatch({ title: "It", author: "Stephen King" }, { title: "Italy", author_name: ["Stephen King"] }));
  assert.ok(plausibleMatch({ title: "The Hobbit, or There and Back Again", author: "J.R.R. Tolkien" }, { title: "The Hobbit", author_name: ["J.R.R. Tolkien"] }));
  assert.ok(plausibleMatch({ title: "Les Misérables", author: "Victor Hugo" }, { title: "Les Miserables", author_name: ["Victor Hugo"] }));
});

// ---- Duplicates --------------------------------------------------------------------------

test("duplicates: against the shelf (sameBook) and within the file", () => {
  const rows = parseImport(fixture("goodreads.csv")).rows;
  const twice = [...rows, { ...rows[3], line: 99 }];
  const matches = twice.map((_, i) => (i === 0 ? { workKey: "OL27482W", coverUrl: null, pages: null, genre: null, by: "isbn13" as const } : null));
  const shelf = [
    { title: "DUNE", author: "frank herbert", workKey: null },
    { title: "Some other title", author: "Tolkien", workKey: "OL27482W" },
  ];
  assert.deepEqual(findDuplicates(twice, matches, shelf), ["shelf", "shelf", null, null, null, null, "file"]);
});
