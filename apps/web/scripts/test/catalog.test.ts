// The shared catalog (lib/catalog/*): identifiers, find-or-create rules, and the backfill. In memory,
// no database, no network.
//
//   npm run test:catalog
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Book } from "@prisma/client";
import {
  formatFrom, isbn10To13, isbn13To10, normaliseIsbns, seriesFromOpenLibrary, seriesFromTitle, titleAuthorKey, yearFrom,
} from "../../lib/catalog/normalise.ts";
import { type CatalogLookup, resolveMany, resolveOne } from "../../lib/catalog/resolve.ts";
import { MemoryCatalogStore } from "../../lib/catalog/memoryStore.ts";
import { mergedKey } from "../../lib/catalogueMergeRules.ts";
import { type BackfillBook, backfillCatalog } from "../../lib/catalog/backfill.ts";
import { parseImport } from "../../lib/import/formats.ts";
import { buildRecords, newObjectId } from "../../lib/import/records.ts";
import { booksToCsv } from "../../lib/export.ts";
import { parseCsv } from "../../lib/import/csv.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

// ---- Identifiers -------------------------------------------------------------------------

test("ISBNs: both forms are cleaned, converted and swapped into the right field", () => {
  assert.equal(isbn10To13("054792822X"), "9780547928227");
  assert.equal(isbn13To10("9780547928227"), "054792822X");
  assert.equal(isbn13To10("9791234567896"), null, "979 ISBNs have no ISBN-10");
  assert.equal(isbn10To13("0547928220"), null, "a bad checksum isn't converted");
  assert.deepEqual(normaliseIsbns({ isbn13: "978-0-547-92822-7" }), { isbn13: "9780547928227", isbn10: "054792822X" });
  assert.deepEqual(normaliseIsbns({ isbn10: "054792822x" }), { isbn13: "9780547928227", isbn10: "054792822X" });
  assert.deepEqual(normaliseIsbns({ isbn10: "9780547928227", isbn13: "054792822X" }), { isbn13: "9780547928227", isbn10: "054792822X" }, "fields the wrong way round");
  assert.deepEqual(normaliseIsbns({ isbn10: "0547928220" }), { isbn13: null, isbn10: "0547928220" }, "kept as given when the checksum is off");
  assert.deepEqual(normaliseIsbns({ isbn13: '="9780547928227"' }), { isbn13: "9780547928227", isbn10: "054792822X" });
  assert.deepEqual(normaliseIsbns({ isbn13: "not an isbn" }), { isbn13: null, isbn10: null });
});

test("formats, series, years and the title-author key", () => {
  assert.equal(formatFrom("Paperback"), "PAPERBACK");
  assert.equal(formatFrom("Mass Market Paperback"), "PAPERBACK");
  assert.equal(formatFrom("Hardcover"), "HARDCOVER");
  assert.equal(formatFrom("Kindle Edition"), "EBOOK");
  assert.equal(formatFrom("digital"), "EBOOK");
  assert.equal(formatFrom("Audible Audio"), "AUDIOBOOK");
  assert.equal(formatFrom("audio"), "AUDIOBOOK");
  assert.equal(formatFrom("Unknown Binding"), null);
  assert.equal(formatFrom(""), null);
  assert.deepEqual(seriesFromTitle("Words of Radiance (The Stormlight Archive, #2)"), { name: "The Stormlight Archive", position: 2 });
  assert.deepEqual(seriesFromTitle("Dune (Dune, #1)"), { name: "Dune", position: 1 });
  assert.deepEqual(seriesFromTitle("Edgedancer (The Stormlight Archive #2.5)"), { name: "The Stormlight Archive", position: 2.5 });
  assert.equal(seriesFromTitle("Notes (on things)"), null);
  assert.deepEqual(seriesFromOpenLibrary(["The Stormlight Archive ;; 2"]), { name: "The Stormlight Archive", position: 2 });
  assert.deepEqual(seriesFromOpenLibrary(["Dune #1"]), { name: "Dune", position: 1 });
  assert.equal(yearFrom("June 1, 1990"), 1990);
  assert.equal(yearFrom("2012"), 2012);
  assert.equal(yearFrom(""), null);
  assert.equal(titleAuthorKey("The  Hobbit", "Tolkien, J.R.R."), titleAuthorKey("the hobbit", "tolkien jrr"));
});

// ---- Resolution --------------------------------------------------------------------------

test("the same ISBN, in either form, from different readers, is one Edition", async () => {
  const store = new MemoryCatalogStore();
  // Reader one adds from search: a work key and the ISBN-13.
  const a = await resolveOne({ workKey: "OL27482W", isbn13: "9780547928227", title: "The Hobbit", author: "J.R.R. Tolkien", pages: 300 }, { store });
  // Reader two imports a Goodreads row carrying only the ISBN-10, with no work key.
  const b = await resolveOne({ isbn10: "054792822X", title: "The Hobbit, or There and Back Again", author: "Tolkien", pages: 310, format: "PAPERBACK" }, { store });
  assert.equal(b.edition.id, a.edition.id);
  assert.equal(b.work.id, a.work.id);
  assert.equal(store.works.size, 1);
  assert.equal(store.editions.size, 1);
  assert.equal(a.edition.key, "isbn:9780547928227");
  assert.equal(a.edition.isbn10, "054792822X", "the other form is filled in");
  assert.equal(b.edition.format, "PAPERBACK", "a null field is filled in by a later reader");
  assert.equal(b.edition.pages, 300, "but a set field is never overwritten");
  assert.equal(b.work.title, "The Hobbit", "the work keeps its first title");
});

test("an Open Library key whose work was merged files under the book it went into", async () => {
  const store = new MemoryCatalogStore();
  const survivor = await resolveOne({ workKey: "OL1W", title: "Fourth Wing", author: "Rebecca Yarros" }, { store });
  const duplicate = await resolveOne({ workKey: "OL2W", title: "Empyrean One", author: "Rebecca Yarros" }, { store });
  // What lib/catalogueMerge.ts mergeWorks leaves: the duplicate keeps its Open Library key under a merged key.
  store.works.delete(duplicate.work.key);
  store.works.set(mergedKey(survivor.work.id, duplicate.work.id), { ...duplicate.work, key: mergedKey(survivor.work.id, duplicate.work.id), matchKey: null, description: null });
  const later = await resolveOne({ workKey: "OL2W", isbn13: "9781649374042", title: "Empyrean One", author: "Rebecca Yarros", description: "Dragons." }, { store });
  assert.equal(later.work.id, survivor.work.id);
  assert.equal(Array.from(store.works.keys()).includes("ol:OL2W"), false, "no new work under the old key, so the merge can still be undone");
  assert.equal(later.edition.workId, survivor.work.id);
  assert.equal(store.works.get("ol:OL1W")!.description, null, "the survivor isn't filled in from the duplicate's key");
});

test("two editions of one book share one Work; a copy with no identifier gets a generic edition", async () => {
  const store = new MemoryCatalogStore();
  const paperback = await resolveOne({ workKey: "/works/OL893414W", isbn13: "9780441013593", title: "Dune", author: "Frank Herbert", pages: 412 }, { store });
  const hardback = await resolveOne({ workKey: "OL893414W", isbn13: "9780441172719", title: "Dune", author: "Frank Herbert", pages: 896, format: "HARDCOVER" }, { store });
  const noIsbn = await resolveOne({ workKey: "OL893414W", title: "Dune", author: "Frank Herbert", pages: 658 }, { store });
  const noIsbnAgain = await resolveOne({ workKey: "OL893414W", title: "Dune", author: "Frank Herbert", pages: 658 }, { store });
  const byEditionKey = await resolveOne({ workKey: "OL893414W", editionKey: "/books/OL7500941M", title: "Dune", author: "Frank Herbert" }, { store });
  assert.notEqual(paperback.edition.id, hardback.edition.id);
  assert.equal(paperback.work.id, hardback.work.id);
  assert.equal(noIsbn.work.id, paperback.work.id);
  assert.equal(noIsbn.edition.key, `generic:${paperback.work.id}:ANY:658`);
  assert.equal(noIsbnAgain.edition.id, noIsbn.edition.id, "the same guess twice is one edition");
  assert.equal(byEditionKey.edition.key, "ol:OL7500941M");
  assert.equal(byEditionKey.work.id, paperback.work.id);
  assert.equal(store.works.size, 1);
  assert.equal(store.editions.size, 4);
  assert.equal(paperback.work.key, "ol:OL893414W");
  assert.equal(paperback.work.openLibraryKey, "OL893414W");
});

test("a book nobody could match is filed by title and author, the way sameBook() compares", async () => {
  const store = new MemoryCatalogStore();
  const a = await resolveOne({ title: "My Nan's Recipes", author: "Nan", pages: 40 }, { store });
  const b = await resolveOne({ title: "my nans recipes", author: "NAN", pages: 40 }, { store });
  const c = await resolveOne({ title: "My Nan's Recipes", author: "Someone Else", pages: 40 }, { store });
  assert.equal(a.work.id, b.work.id);
  assert.equal(a.edition.id, b.edition.id);
  assert.notEqual(a.work.id, c.work.id);
  assert.equal(a.matched, false);
  assert.equal(a.work.openLibraryKey, null);
  assert.ok(a.work.key.startsWith("title:"));
  assert.equal(a.work.hardcoverId, null, "a hand-typed book has no Hardcover id, so no book page");
});

test("a Hardcover hit keeps its Hardcover id on the work, filling in one a hand-typed copy filed first", async () => {
  const store = new MemoryCatalogStore();
  const typed = await resolveOne({ title: "Gilded Rose", author: "Emma Hamm", pages: 300 }, { store });
  assert.equal(typed.work.hardcoverId, null);
  const hit = await resolveOne({ title: "Gilded Rose", author: "Emma Hamm", pages: 300, hardcoverId: "123" }, { store });
  assert.equal(hit.work.id, typed.work.id);
  assert.equal(hit.work.hardcoverId, "123");
  const fresh = await resolveOne({ title: "Another Hit", author: "Someone", hardcoverId: "456" }, { store });
  assert.equal(fresh.work.hardcoverId, "456");
  assert.equal(fresh.work.openLibraryKey, null);
});

test("a batch with repeats creates each work and edition once", async () => {
  const store = new MemoryCatalogStore();
  const rows = Array.from({ length: 5 }, (_, i) => ({ workKey: "OL27482W", isbn13: i % 2 ? "9780547928227" : null, title: "The Hobbit", author: "Tolkien", pages: 300 }));
  const out = await resolveMany(rows, { store });
  assert.equal(new Set(out.map((r) => r.work.id)).size, 1);
  assert.equal(store.works.size, 1);
  assert.equal(store.editions.size, 2, "one by ISBN, one generic");
});

test("with a lookup: an ISBN names the edition and its work, and later adds by edition key land on it", async () => {
  const calls: string[] = [];
  const lookup: CatalogLookup = {
    async works(keys) {
      calls.push(`works:${keys.join(",")}`);
      return new Map(keys.map((k) => [k, { workKey: k, title: "The Hobbit", authors: ["J.R.R. Tolkien"], subjects: ["Fantasy", "Dragons"], year: 1937, coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg" }]));
    },
    async work(key) {
      calls.push(`work:${key}`);
      return { workKey: key, description: "A hobbit goes there and back again." };
    },
    async isbn(isbn) {
      calls.push(`isbn:${isbn}`);
      return { editionKey: "/books/OL33891995M", workKey: "/works/OL27482W", isbn13: "9780547928227", isbn10: "054792822X", pages: 300, format: "PAPERBACK", publisher: "Mariner Books", publishedYear: 2012 };
    },
    async title(title) {
      calls.push(`title:${title}`);
      return null;
    },
  };
  const store = new MemoryCatalogStore();
  const a = await resolveOne({ isbn13: "9780547928227", title: "The Hobbit", author: "Tolkien" }, { store, lookup, describe: true });
  assert.deepEqual(calls, ["isbn:9780547928227", "works:OL27482W", "work:OL27482W"]);
  assert.equal(a.edition.key, "ol:OL33891995M");
  assert.equal(a.edition.publisher, "Mariner Books");
  assert.equal(a.edition.publishedYear, 2012);
  assert.equal(a.edition.pages, 300);
  assert.equal(a.work.key, "ol:OL27482W");
  assert.deepEqual(a.work.authors, ["J.R.R. Tolkien"]);
  assert.deepEqual(a.work.subjects, ["Fantasy", "Dragons"]);
  assert.equal(a.work.firstPublishYear, 1937);
  assert.equal(a.work.description, "A hobbit goes there and back again.");

  // Another reader picks the same edition from search: nothing is looked up.
  calls.length = 0;
  const b = await resolveOne({ workKey: "OL27482W", editionKey: "OL33891995M", title: "The Hobbit", author: "Tolkien", pages: 300 }, { store, lookup });
  assert.deepEqual(calls, []);
  assert.equal(b.edition.id, a.edition.id);

  // A third adds by work key alone: the work exists, so no lookup; the edition is a generic one.
  const c = await resolveOne({ workKey: "OL27482W", title: "The Hobbit", author: "Tolkien", pages: 310 }, { store, lookup });
  assert.deepEqual(calls, []);
  assert.equal(c.work.id, a.work.id);
  assert.notEqual(c.edition.id, a.edition.id);

  // A lookup failure files the book from what the caller gave, without throwing.
  const broken: CatalogLookup = { ...lookup, works: async () => { throw new Error("down"); }, isbn: async () => { throw new Error("down"); } };
  const d = await resolveOne({ workKey: "OL1W", isbn13: "9780441013593", title: "Dune", author: "Frank Herbert", pages: 412 }, { store, lookup: broken });
  assert.equal(d.work.title, "Dune");
  assert.equal(d.edition.key, "isbn:9780441013593");
});

test("existing rows are filled in, never overwritten", async () => {
  const store = new MemoryCatalogStore();
  const first = await resolveOne({ workKey: "OL1W", title: "A Book", author: "Someone", pages: 100 }, { store });
  assert.equal(first.work.description, null);
  const second = await resolveOne({ workKey: "OL1W", title: "A Book: Special Edition", author: "Someone Else", description: "About a book.", coverUrl: "https://utfs.io/f/x.jpg", pages: 100 }, { store });
  assert.equal(second.work.id, first.work.id);
  assert.equal(second.work.description, "About a book.");
  assert.equal(second.work.coverUrl, "https://utfs.io/f/x.jpg");
  assert.equal(second.work.title, "A Book");
  assert.deepEqual(second.work.authors, ["Someone"]);
  const third = await resolveOne({ workKey: "OL1W", title: "A Book", author: "Someone", description: "A different blurb.", pages: 100 }, { store });
  assert.equal(third.work.description, "About a book.");
});

test("the same book under another key goes on the work already there, not a duplicate", async () => {
  const store = new MemoryCatalogStore();
  // A second Open Library record for a book the catalog has.
  const first = await resolveOne({ workKey: "OL17533717W", title: "Lover Reborn", author: "J. R. Ward", pages: 500 }, { store });
  const second = await resolveOne({ workKey: "OL16342673W", title: "Lover reborn", author: "J.R. Ward", pages: 500 }, { store });
  assert.equal(second.work.id, first.work.id);
  // A manual copy with a series suffix, and one with a leading article.
  const manual = await resolveOne({ title: "Lover Reborn (Black Dagger Brotherhood #10)", author: "J. R. Ward", pages: 500 }, { store });
  assert.equal(manual.work.id, first.work.id);
  const gatsby = await resolveOne({ workKey: "OL468431W", title: "The Great Gatsby", author: "F. Scott Fitzgerald" }, { store });
  assert.equal((await resolveOne({ workKey: "OL34381078W", title: "Great Gatsby", author: "F. Scott Fitzgerald" }, { store })).work.id, gatsby.work.id);
  assert.equal(store.works.size, 2);
});

test("a match prefers the Open Library work over a manual entry", async () => {
  const store = new MemoryCatalogStore();
  const manual = await resolveOne({ title: "Poison Study", author: "Maria V. Snyder", pages: 400 }, { store });
  const opened = await resolveOne({ workKey: "OL8032275W", title: "Poison Study", author: "Maria V. Snyder", pages: 400 }, { store });
  // The manual entry was there first, so the Open Library copy joins it and fills in its key.
  assert.equal(opened.work.id, manual.work.id);
  assert.equal(opened.work.openLibraryKey, "OL8032275W");
  // With both kinds already filed separately, a new copy goes to the Open Library one.
  const store2 = new MemoryCatalogStore();
  await store2.createWorks([
    { ...manual.work, id: "000000000000000000000001", key: "title:poisonstudy|mariavsnyder", openLibraryKey: null },
    { ...manual.work, id: "000000000000000000000002", key: "ol:OL8032287W", openLibraryKey: "OL8032287W" },
  ]);
  const third = await resolveOne({ workKey: "OL21435660W", title: "Poison Study", author: "Maria V. Snyder" }, { store: store2 });
  assert.equal(third.work.id, "000000000000000000000002");
});

test("the same title by another author, or a different book by the same author, stays separate", async () => {
  const store = new MemoryCatalogStore();
  const a = await resolveOne({ workKey: "OL20942031W", title: "Asylum", author: "Madeleine Roux" }, { store });
  const b = await resolveOne({ workKey: "OL1W", title: "Asylum", author: "Patrick McGrath" }, { store });
  const c = await resolveOne({ workKey: "OL2W", title: "Sanctum", author: "Madeleine Roux" }, { store });
  assert.equal(new Set([a.work.id, b.work.id, c.work.id]).size, 3);
});

// ---- Backfill ----------------------------------------------------------------------------

function memorySource(books: BackfillBook[]) {
  const links: Record<string, { workId: string; editionId: string }> = {};
  return {
    links,
    source: {
      async unlinked(afterId: string | null, take: number) {
        return books
          .filter((b) => (!b.workId || !b.editionId) && (!afterId || b.id > afterId))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, take)
          .map((b) => ({ ...b }));
      },
      async link(bookId: string, ids: { workId: string; editionId: string }) {
        const book = books.find((b) => b.id === bookId)!;
        Object.assign(book, ids);
        links[bookId] = ids;
      },
    },
  };
}

const shelfBook = (id: string, over: Partial<BackfillBook>): BackfillBook => ({
  id, title: "Untitled", author: "Unknown", pages: 0, coverImage: "", description: null, workKey: null, workId: null, editionId: null, ...over,
});

test("backfill: idempotent, links every book, touches nothing else, and logs the unmatched", async () => {
  const books = [
    shelfBook("b1", { title: "The Hobbit", author: "J.R.R. Tolkien", pages: 300, workKey: "OL27482W", coverImage: "https://utfs.io/f/hobbit.jpg", description: "A hobbit." }),
    shelfBook("b2", { title: "The Hobbit", author: "Tolkien", pages: 300, workKey: "OL27482W", coverImage: "https://covers.openlibrary.org/b/id/1-L.jpg" }),
    shelfBook("b3", { title: "The Hobbit", author: "Tolkien", pages: 350, workKey: "OL27482W" }),
    shelfBook("b4", { title: "Dune", author: "Frank Herbert", pages: 412 }),
    shelfBook("b5", { title: "My Nan's Recipes", author: "Nan", pages: 40 }),
    shelfBook("b6", { title: "Already filed", author: "X", pages: 1, workId: "w", editionId: "e" }),
  ];
  const before = JSON.stringify(books.map(({ workId: _w, editionId: _e, ...rest }) => rest));
  const lookups: string[] = [];
  const lookup: CatalogLookup = {
    async works(keys) {
      lookups.push(`works:${keys.join(",")}`);
      return new Map(keys.map((k) => [k, { workKey: k, title: "The Hobbit", authors: ["J.R.R. Tolkien"], year: 1937, subjects: ["Fantasy"] }]));
    },
    async work() { throw new Error("not used by the backfill"); },
    async isbn() { throw new Error("no ISBNs on shelf books"); },
    async title(title) {
      lookups.push(`title:${title}`);
      return title === "Dune" ? { workKey: "OL893414W", title: "Dune", authors: ["Frank Herbert"], year: 1965 } : null;
    },
  };
  const store = new MemoryCatalogStore();
  const lines: string[] = [];

  const dry = await backfillCatalog({ source: memorySource(books).source, store, lookup, dryRun: true, batch: 2 });
  assert.equal(dry.seen, 5);
  assert.equal(dry.linked, 0);
  assert.ok(books.slice(0, 5).every((b) => !b.workId), "a dry run links nothing");
  assert.equal(store.works.size, 0, "and writes nothing to the catalog either");
  assert.deepEqual(dry.unmatched.map((u) => u.id), ["b5"]);

  const { source, links } = memorySource(books);
  const first = await backfillCatalog({ source, store, lookup, batch: 2, log: (l) => lines.push(l) });
  assert.equal(first.seen, 5);
  assert.equal(first.linked, 5);
  assert.equal(first.matched, 4);
  assert.deepEqual(first.unmatched.map((u) => u.id), ["b5"]);
  assert.ok(lines.some((l) => l.startsWith("unmatched: b5")));
  assert.equal(links.b1.workId, links.b2.workId);
  assert.equal(links.b1.editionId, links.b2.editionId, "same work and page count: same best-guess edition");
  assert.notEqual(links.b3.editionId, links.b1.editionId, "a different page count is another edition");
  assert.equal(links.b3.workId, links.b1.workId);
  assert.equal(store.works.size, 3);
  assert.equal(store.editions.size, 4);
  const hobbit = Array.from(store.works.values()).find((w) => w.key === "ol:OL27482W")!;
  assert.equal(hobbit.coverUrl, "https://utfs.io/f/hobbit.jpg", "a reader's copied cover is used; a hotlink isn't");
  assert.equal(hobbit.description, "A hobbit.");
  assert.equal(hobbit.firstPublishYear, 1937);
  assert.equal(JSON.stringify(books.map(({ workId: _w, editionId: _e, ...rest }) => rest)), before, "nothing but the links changed");

  const again = await backfillCatalog({ source, store, lookup, batch: 2 });
  assert.equal(again.seen, 0, "a second run finds nothing to do");
  assert.equal(store.works.size, 3);
  assert.equal(store.editions.size, 4);

  // Unlink one and re-run: it lands back on the same rows.
  books[1].workId = null;
  books[1].editionId = null;
  const third = await backfillCatalog({ source, store, lookup: null });
  assert.equal(third.seen, 1);
  assert.equal(books[1].workId, links.b1.workId);
  assert.equal(books[1].editionId, links.b1.editionId);
  assert.equal(store.editions.size, 4);
});

// ---- Import and export -------------------------------------------------------------------

test("import rows carry binding, publisher, year and series; records carry the catalog ids; export fills ISBNs", () => {
  const { rows } = parseImport(fixture("goodreads.csv"));
  const hobbit = rows[0];
  assert.equal(hobbit.format, "PAPERBACK");
  assert.equal(hobbit.publisher, "Mariner Books");
  assert.equal(hobbit.publishedYear, 2012);
  assert.equal(hobbit.series, null);
  const dune = rows[1];
  assert.equal(dune.format, "EBOOK");
  assert.deepEqual(dune.series, { name: "Dune", position: 1 });
  assert.equal(dune.title, "Dune");

  const sg = parseImport(fixture("storygraph.csv")).rows[0];
  assert.equal(sg.format, "HARDCOVER");

  const ctx = { userId: "u".repeat(24), bookId: newObjectId(), now: new Date(), source: "goodreads" as const };
  const plain = buildRecords(hobbit, null, ctx);
  assert.equal(plain.book.workId, null);
  assert.equal(plain.book.editionId, null);
  const filed = buildRecords(hobbit, null, { ...ctx, catalog: { workId: "w".repeat(24), editionId: "e".repeat(24) } });
  assert.equal(filed.book.workId, "w".repeat(24));
  assert.equal(filed.book.editionId, "e".repeat(24));

  const book = { ...filed.book, edition: { isbn10: "054792822X", isbn13: "9780547928227" } } as unknown as Book & { edition: { isbn10: string; isbn13: string } };
  const csv = parseCsv(booksToCsv([book, { ...plain.book, edition: null } as unknown as Book], []));
  const header = csv[0];
  assert.equal(csv[1][header.indexOf("ISBN")], "054792822X");
  assert.equal(csv[1][header.indexOf("ISBN13")], "9780547928227");
  assert.equal(csv[2][header.indexOf("ISBN")], "", "no edition yet: blank, as before");

  // A Bookmark export with ISBNs re-imports with them, so the edition is found again.
  const reimported = parseImport(booksToCsv([book], [])).rows[0];
  assert.equal(reimported.isbn13, "9780547928227");
  assert.equal(reimported.isbn10, "054792822X");
});
