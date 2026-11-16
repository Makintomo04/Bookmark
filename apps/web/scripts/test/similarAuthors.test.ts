// "Explore more from similar authors" on a book page: how authors are ranked. No database or network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/similarAuthors.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { closestFirst, genreSubjects, rankSimilarAuthors, toppedUpAuthors, type CoReadCopy, type GenreWork } from "@/lib/similarAuthorRules";

const copy = (userId: string, author: string, title: string, extra: Partial<CoReadCopy> = {}): CoReadCopy =>
  ({ userId, bookId: title, title, author, authorKey: null, coverUrl: `https://covers.example/${title}.jpg`, subjects: [], ...extra });
const work = (author: string, title: string, extra: Partial<GenreWork> = {}): GenreWork =>
  ({ bookId: title, title, authors: [author], authorKeys: [], coverUrl: `https://covers.example/${title}.jpg`, subjects: ["Fantasy fiction"], popularity: 0, ...extra });
const rank = (args: Partial<Parameters<typeof rankSimilarAuthors>[0]>) =>
  rankSimilarAuthors({ excludeAuthors: ["Rebecca Yarros"], mature: false, coRead: [], sameGenre: [], ...args });

test("authors this book's readers also shelved come first, most shared readers first", () => {
  const authors = rank({
    coRead: [
      copy("a", "Sarah J. Maas", "A Court of Thorns and Roses"),
      copy("b", "Sarah J. Maas", "Throne of Glass"),
      copy("c", "Sarah J. Maas", "A Court of Thorns and Roses"),
      copy("a", "Jennifer L. Armentrout", "From Blood and Ash"),
      copy("b", "Jennifer L. Armentrout", "From Blood and Ash"),
    ],
    sameGenre: [work("Brandon Sanderson", "Mistborn")],
  });
  assert.deepEqual(authors.map((a) => a.name), ["Sarah J. Maas", "Jennifer L. Armentrout", "Brandon Sanderson"]);
  assert.deepEqual(authors[0].books.map((b) => b.title), ["A Court of Thorns and Roses", "Throne of Glass"]);
});

test("an author only one reader shelved isn't shown from shelves, so no one's shelf is given away", () => {
  const authors = rank({ coRead: [copy("a", "Holly Black", "The Cruel Prince"), copy("a", "Holly Black", "The Wicked King")] });
  assert.deepEqual(authors, []);
});

test("the book's own authors, joint credits and placeholders are left out", () => {
  const authors = rank({
    excludeAuthors: ["Neil Gaiman & Terry Pratchett"],
    coRead: [copy("a", "Terry Pratchett", "Mort"), copy("b", "Terry Pratchett", "Mort")],
    sameGenre: [work("Unknown", "Untitled"), work("Neil Gaiman", "Coraline"), work("Ursula K. Le Guin", "A Wizard of Earthsea")],
  });
  assert.deepEqual(authors.map((a) => a.name), ["Ursula K. Le Guin"]);
});

test("one author appears once, with up to three books, covers first", () => {
  const authors = rank({
    sameGenre: [
      work("Brandon Sanderson", "Elantris", { coverUrl: null }),
      work("Brandon Sanderson", "Mistborn"),
      work("Brandon Sanderson", "Warbreaker"),
      work("Brandon Sanderson", "The Way of Kings"),
    ],
  });
  assert.equal(authors.length, 1);
  assert.deepEqual(authors[0].books.map((b) => b.title), ["Mistborn", "Warbreaker", "The Way of Kings"]);
});

test("mature books are only suggested from a mature book", () => {
  const sameGenre = [work("Dark Author", "Dark Book", { subjects: ["Dark romance", "Romance"] }), work("Emily Henry", "Beach Read", { subjects: ["Romance"] })];
  assert.deepEqual(rank({ sameGenre }).map((a) => a.name), ["Emily Henry"]);
  assert.deepEqual(rank({ sameGenre, mature: true }).map((a) => a.name), ["Dark Author", "Emily Henry"]);
});

test("an author's key comes from whichever of their books has one, for their photo", () => {
  const authors = rank({
    coRead: [copy("a", "Sarah J. Maas", "Throne of Glass"), copy("b", "Sarah J. Maas", "Heir of Fire", { authorKey: "OL7115219A" })],
    sameGenre: [work("Unknown", "Untitled"), work("Brandon Sanderson", "Mistborn", { authors: ["Unknown", "Brandon Sanderson"], authorKeys: ["OL1A", "OL1394865A"] })],
  });
  assert.deepEqual(authors.map((a) => [a.name, a.key]), [["Sarah J. Maas", "OL7115219A"], ["Brandon Sanderson", "OL1394865A"]]);
});

test("no more than four authors", () => {
  const sameGenre = ["A One", "B Two", "C Three", "D Four", "E Five"].map((name) => work(name, `${name} book`));
  assert.equal(rank({ sameGenre }).length, 4);
});

test("genre subjects are the ones that name a Bookmark genre, without mature ones", () => {
  assert.deepEqual(genreSubjects(["Fiction", "Dragons", "Fantasy fiction", "Dark romance", "Romance"]), ["Dragons", "Fantasy fiction", "Romance"]);
});

test("closest first: more subjects in common, then more widely read", () => {
  const subjects = ["Fantasy fiction", "Romance"];
  const works = [
    work("A One", "Popular", { subjects: ["Fantasy fiction"], popularity: 900 }),
    work("B Two", "Close", { subjects: ["Fantasy fiction", "Romance"], popularity: 10 }),
    work("C Three", "Quiet", { subjects: ["Fantasy fiction"], popularity: 5 }),
  ];
  assert.deepEqual([...works].sort(closestFirst(subjects)).map((w) => w.title), ["Close", "Popular", "Quiet"]);
});

test("a short stack is filled from the author's catalogue, most read first, without repeats", () => {
  const [rowling] = rank({ coRead: [copy("a", "J. K. Rowling", "Harry Potter and the Philosopher's Stone"), copy("b", "J. K. Rowling", "Harry Potter and the Philosopher's Stone")] });
  const catalogue = [
    work("J. K. Rowling", "Harry Potter and the Philosopher's Stone"),
    work("Someone Else", "Elsewhere"),
    work("J. K. Rowling", "Harry Potter and the Chamber of Secrets"),
    work("J. K. Rowling", "The Prisoner of Azkaban", { authors: ["J.K. Rowling"], authorKeys: ["OL23919A"] }),
    work("J. K. Rowling", "Harry Potter and the Goblet of Fire"),
  ];
  const [filled] = toppedUpAuthors([{ ...rowling, key: "OL23919A" }], catalogue, false);
  assert.deepEqual(filled.books.map((b) => b.title), ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets", "The Prisoner of Azkaban"]);
});

test("filling a stack leaves mature books out of a book that isn't", () => {
  const author = { name: "Some Author", slug: "some-author", key: null, books: [{ title: "Tame", author: "Some Author", coverUrl: null }] };
  const catalogue = [work("Some Author", "Explicit", { subjects: ["Erotica"] }), work("Some Author", "Gentle")];
  assert.deepEqual(toppedUpAuthors([author], catalogue, false)[0].books.map((b) => b.title), ["Tame", "Gentle"]);
});
