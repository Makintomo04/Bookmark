// Shelf search, sort and filter, and the "have I read…?" questions Ask the shelf hands over to it.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/shelfFilter.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTER, SHELF_PAGE_MAX, SHELF_SORTS, filterOptions, finishedIn, isNarrowed, matchesFilter, pageShelf, pageStart, pagedBooks, parseShelfParams, shelfFromSlug, shelfPageHref, shelfParams, shelfQuestion, sortBooks,
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

test("pageShelf pages the matching books in order, with a cursor until the last page", () => {
  const finished = f({ shelf: "finished", sort: "title" });
  const first = pageShelf(books, finished, { take: 2 });
  assert.deepEqual(titles(first.books), ["Jane Eyre", "Mort"]);
  assert.equal(first.total, 3);
  assert.equal(first.nextCursor, `2.${first.books[1].id}`);
  const last = pageShelf(books, finished, { take: 2, cursor: first.nextCursor });
  assert.deepEqual(titles(last.books), ["The Left Hand of Darkness"]);
  assert.equal(last.nextCursor, null);
  // Search runs before paging, across every shelf when none is asked for.
  assert.deepEqual(titles(pageShelf(books, f({ q: "weir" }), { take: 10 }).books), ["Project Hail Mary"]);
});

test("pageShelf keeps take and cursor in range", () => {
  const many = Array.from({ length: 250 }, (_, i) => book({ id: `b${i}`, title: `Book ${i}`, completedAt: "2024-01-01T12:00:00Z" }));
  assert.equal(pageShelf(many, EMPTY_FILTER, { take: 1000 }).books.length, SHELF_PAGE_MAX);
  assert.equal(pageShelf(many, EMPTY_FILTER, { take: 0 }).books.length, 1);
  assert.equal(pageShelf(many, EMPTY_FILTER, { take: 10, cursor: "-5" }).books[0].id, pageShelf(many, EMPTY_FILTER, { take: 10 }).books[0].id);
  assert.equal(pageShelf(many, EMPTY_FILTER, { take: 10, cursor: "nonsense" }).nextCursor?.split(".")[0], "10");
  assert.deepEqual(pageShelf(many, EMPTY_FILTER, { take: 10, cursor: "900" }), { books: [], total: 250, nextCursor: null });
});

test("books that sort as equal keep one order whatever order they arrive in, so paging never repeats or skips", () => {
  // An import's undated finishes: same status, no dates, no rating, same length, and a few same-name authors.
  const tied = Array.from({ length: 37 }, (_, i) => book({ id: `id${String(i).padStart(3, "0")}`, title: i % 3 ? "Same" : `Title ${i}`, author: i % 2 ? "A. Writer" : "B. Writer" }));
  const shuffled = (seed: number) => tied.map((b, i) => [((i + 1) * seed) % 97, b] as const).sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  for (const sort of SHELF_SORTS) {
    const orders = [1, 7, 31, 53].map((seed) => sortBooks(shuffled(seed), sort).map((b) => b.id));
    for (const order of orders) assert.deepEqual(order, orders[0], `${sort} depends on arrival order`);
    // Page through, with each request seeing the shelf in a different arrival order.
    const seen: string[] = [];
    let cursor: string | null = null;
    let seed = 2;
    do {
      const page: ReturnType<typeof pageShelf<ShelfBook>> = pageShelf(shuffled(seed++), f({ sort }), { take: 10, cursor });
      seen.push(...page.books.map((b) => b.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(seen).size, tied.length, `${sort} repeated or skipped a book`);
    assert.equal(seen.length, tied.length);
  }
});

test("a book leaving the shelf mid-scroll skips nothing: the next page starts after the last book shown", () => {
  const shelf = Array.from({ length: 6 }, (_, i) => book({ id: `b${i}`, title: `Book ${i}`, completedAt: "2024-01-01T12:00:00Z" }));
  const sorted = f({ sort: "title" });
  const first = pageShelf(shelf, sorted, { take: 3 });
  assert.deepEqual(first.books.map((b) => b.id), ["b0", "b1", "b2"]);
  // b1 is finished elsewhere and leaves this shelf: the second page still starts at b3.
  const second = pageShelf(shelf.filter((b) => b.id !== "b1"), sorted, { take: 3, cursor: first.nextCursor });
  assert.deepEqual(second.books.map((b) => b.id), ["b3", "b4", "b5"]);
  // The last book shown left: one place back, so b2 may come again (pagedBooks drops it), but b3 isn't lost.
  assert.equal(pageStart([{ id: "b0" }, { id: "b2" }, { id: "b3" }], "3.b1"), 2);
  // An older app's plain offset still works.
  assert.equal(pageStart([{ id: "b0" }, { id: "b2" }], "1"), 1);
});

test("pages loaded by offset show each book once when the shelf shifts between them", () => {
  // A book finished mid-scroll moves every later offset by one, so the second page repeats "b".
  const pages = [{ books: [{ id: "a" }, { id: "b" }] }, { books: [{ id: "b" }, { id: "c" }] }, { books: [] }];
  assert.deepEqual(pagedBooks(pages).map((b) => b.id), ["a", "b", "c"]);
  assert.deepEqual(pagedBooks([]), []);
  // A page useSWRInfinite hasn't filled yet is skipped, not read (the phone's shelf screen crashed on it).
  assert.deepEqual(pagedBooks([undefined, { books: [{ id: "a" }] }, null]).map((b) => b.id), ["a"]);
  assert.deepEqual(pagedBooks(undefined), []);
});

test("Finished in counts on the reader's calendar, not the server's", () => {
  // 23:30 on 31 December in London is already 1 January in Sydney.
  const book = { completedAt: "2026-12-31T23:30:00.000Z" };
  assert.deepEqual(finishedIn(book.completedAt, "Europe/London"), { year: 2026, month: 12 });
  assert.deepEqual(finishedIn(book.completedAt, "Australia/Sydney"), { year: 2027, month: 1 });
  // A day picked on the date picker (noon UTC) is that day wherever the reader is.
  assert.deepEqual(finishedIn("2026-03-01T12:00:00.000Z", "Pacific/Kiritimati"), { year: 2026, month: 3 });
});
