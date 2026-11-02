// Author lists tidied before readers see them: duplicates, translations, box sets and non-novels left out.
// The list below is Rebecca Yarros's from Open Library, as it came back in October 2026.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/bookListCleanup.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBookList, titleKey, type ListBook } from "@/lib/bookListCleanup";

const b = (title: string, languages: string[] = ["eng"], pages: number | null = 300): ListBook => ({ title, languages, pages, coverUrl: "x" });

const YARROS: ListBook[] = [
  b("Fourth Wing"), b("Iron Flame"), b("Onyx Storm"), b("The Things We Leave Unfinished"), b("The Last Letter"),
  b("Empyrean Series, 3 Books Collection Set, Fourth Wing, Iron Flame, Onyx Storm, by Rebecca Yarros"),
  b("Rebel - The Renegades #3"), b("Threshing Day"), b("In the Likely Event"), b("Wilder - The Renegades #1"),
  b("Full Measures - Flight & Glory #1"), b("Nightingale"), b("Great and Precious Things"),
  b("Iron Flame"), b("Hallowed Ground - Flight & Glory #4"), b("Fourth Wing", []),
  b("The Reality of Everything"), b("Hallowed ground"), b("Fourth Wing Tarot", []),
  b("Untitled Empyrean (Not Book Four)"), b("Fourth Wing (Special Edition)", []),
  b("Great and Precious Things The Last Letter", []), b("Onyx Storm"), b("Reality of Everything - Flight & Glory #5"),
  b("Alas de sangre (Empíreo 1)", ["spa"]), b("Alas de ónix (Empíreo 3)", ["spa"]), b("Fourth wing"),
  b("In the likely event"), b("El día de la Trilla", ["spa"]), { title: "The Empyrean 5", languages: [], pages: null, coverUrl: null },
];

test("Yarros's list keeps each of her books once and leaves out the rest", () => {
  assert.deepEqual(cleanBookList(YARROS).map((x) => x.title), [
    "Fourth Wing", "Iron Flame", "Onyx Storm", "The Things We Leave Unfinished", "The Last Letter",
    "Rebel - The Renegades #3", "Threshing Day", "In the Likely Event", "Wilder - The Renegades #1",
    "Full Measures - Flight & Glory #1", "Nightingale", "Great and Precious Things",
    "Hallowed Ground - Flight & Glory #4", "The Reality of Everything",
  ]);
});

test("a translated or split copy after a dash goes when the plain title is on the list", () => {
  const books = [b("Catwoman"), b("A Court of Mist and Fury"), b("Catwoman - Diebin von Gotham City", []),
    b("A Court of Mist and Fury - Köd és harag udvara", []), b("A Court of Thorns and Roses - Part 2"), b("Rebel - The Renegades #3")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Catwoman", "A Court of Mist and Fury", "A Court of Thorns and Roses - Part 2", "Rebel - The Renegades #3"]);
});

test("titles that only differ by case, series suffix, edition tag or a leading article share a key", () => {
  assert.equal(titleKey("Reality of Everything - Flight & Glory #5"), titleKey("The Reality of Everything"));
  assert.equal(titleKey("Hallowed Ground - Flight & Glory #4"), titleKey("Hallowed ground"));
  assert.equal(titleKey("Fourth Wing (Special Edition)"), titleKey("fourth wing"));
  assert.equal(titleKey("Circe: A Novel"), titleKey("Circe"));
  // A bracket that's part of the title stays.
  assert.notEqual(titleKey("Alas de sangre (Empíreo 1)"), titleKey("Alas de sangre"));
});

test("shop displays and fan summaries aren't books", () => {
  const books = [b("Beach Read"), b("Emily Henry 9-Copy Mixed Floor Display W/ RISER"), b("Emily Henry 24-Copy Mixed Floor Display W/Riser"), b("Summary of Beach Read")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Beach Read"]);
});

test("real books that look odd are kept", () => {
  const books = [b("Catch-22"), b("1984"), b("Fahrenheit 451"), b("The Hitchhiker's Guide to the Galaxy"), b("A Court of Thorns and Roses"),
    b("The Notebook"), b("Calendar Girl"), b("The Journal of Mrs. Pepperpot"), b("The Planner")];
  assert.equal(cleanBookList(books).length, books.length);
});

test("an author who writes in another language keeps every book", () => {
  const books = [b("La sombra del viento", ["spa"]), b("El juego del ángel", ["spa"])];
  assert.equal(cleanBookList(books).length, 2);
});

test("books with no language data aren't treated as translations when they read as English", () => {
  assert.equal(cleanBookList([b("Fourth Wing"), b("Variation", [])]).length, 2);
});

// Rowling's list from Open Library, November 2026: three records are titled just "Harry Potter", and
// counting each of them once per novel made every "Harry Potter and the…" look like a bundle.
test("a series name on the list several times doesn't turn the series' novels into box sets", () => {
  const books = [b("Harry Potter and the Philosopher's Stone"), b("Harry Potter and the Chamber of Secrets"), b("Harry Potter"), b("Harry Potter", []), b("Harry Potter")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets", "Harry Potter"]);
});

test("series ranges, sets and boxes are box sets", () => {
  const books = [b("Fourth Wing"), b("Harry Potter (series) 1-7"), b("Harry Potter Set"), b("Harry Potter Illustrated Paperback Starter Set", []),
    b("The Harry Potter trilogy", []), b("Box Harry Potter Tradicional", []), b("Harry Potter 1- 7 Audio Collection")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Fourth Wing"]);
});

test("on an English author's list, a foreign title with no language data is a translation", () => {
  const books = [b("The Cuckoo's Calling"), b("Harry Potter y las reliquias de la muerte", []), b("Der Seidenspinner", []), b("Une place à prendre", []),
    b("Las pequeñas grandes cosas", []), b("دودة الحرير", []), b("吟遊詩人ビードルの物語", []), b("Variation", []), b("Die Hard", []), b("The Van", [])];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["The Cuckoo's Calling", "Variation", "Die Hard", "The Van"]);
});

test("shop bookmarks and dumpbins aren't books", () => {
  const books = [b("Harry Potter and the Chamber of Secrets"), b("Chamber of Secrets Movie Bookmarks"), b("Hp and Pris of Azkaban Celebr Dumpbin"), b("Harry Potter 4 Display Cut Out")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Harry Potter and the Chamber of Secrets"]);
});

// Ann M. Martin's and Jeff Kinney's lists, November 2026: "baby sitters" sits inside "baby sitters club", so one
// series name counted as two titles and the novels looked like bundles.
test("a series name and a shorter piece of it count as one title, so the series' books stay", () => {
  const books = [b("The Baby-Sitters Club"), b("Baby-Sitters"), b("Kristy's worst idea. (Baby-Sitters Club no.100)"),
    b("Diary of a Wimpy Kid"), b("Wimpy Kid"), b("Diary of a Wimpy Kid Party Pooper")];
  assert.equal(cleanBookList(books).length, books.length);
});

test("two different titles strung together are still a bundle", () => {
  const books = [b("Dune"), b("Dune Messiah"), b("Children of Dune"), b("Dune messiah & Children of Dune")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Dune", "Dune Messiah", "Children of Dune"]);
});

test("collections, volume sets and slashed lists of titles are box sets; a story collection's contents in brackets aren't", () => {
  const books = [b("Murder in the Mews (Incredible Theft / Murder in the Mews / Triangle at Rhodes)"), b("The Collection"),
    b("The Twilight Saga Collection"), b("Diary of a Wimpy Kid Box of Books 5-8"), b("Diary of a Wimpy Kid, 10 Vols."), b("The Baby-Sitters Club Set #6"),
    b("Harry Potter and the Half-Blood Prince / The Order Of The Pheonix / Chamber of Secrets"), b("Twilight Saga Hardcover Series")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Murder in the Mews (Incredible Theft / Murder in the Mews / Triangle at Rhodes)", "The Collection"]);
});

test("half of a book sold as its own volume isn't a book", () => {
  const books = [b("The Stand"), b("The Stand [1/2]"), b("The Final Empire (2 of 3)"), b("Harry Potter and the Half Blood Prince, Vol. 1")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["The Stand"]);
});

test("study guides, activity books, journals and shop stock aren't books", () => {
  const books = [b("Holes"), b("Harry Potter and the Deathly Hallows (SparkNotes Literature Guide)"), b("Lemony Snicket Activity Book"),
    b("The Notorious Notations (A Series of Unfortunate Events - Blank Journal)"), b("Diary of a Wimpy Kid 5 X18 Backlst Stckp"), b("Harry Potter and the Philosopher's Stone 3-D Movie Book")];
  assert.deepEqual(cleanBookList(books).map((x) => x.title), ["Holes"]);
});
