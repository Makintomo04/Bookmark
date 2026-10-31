// "Help me pick my first book" (BOO-52): the picker's sections, and the goal pace the app's goal card now shows.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/firstBook.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_LIMITS, starterSections, starterWhy, type StarterBook, type StarterInput } from "@bookmark/shared/firstBook";
import { expectedBooks, goalPace } from "@bookmark/shared/goals";

const book = (key: string, author = `Author ${key}`, extra: Partial<StarterBook> = {}): StarterBook =>
  ({ key, workKey: `OL${key}W`, title: `Title ${key}`, author, coverUrl: null, pages: null, ...extra });

const empty: StarterInput = { wantToRead: [], friends: [], team: [], genres: [], genreLabels: [], shelf: [] };

test("sections come in order, and empty ones are left out", () => {
  const sections = starterSections({ ...empty, genres: [book("1")], friends: [book("2")], genreLabels: ["Fantasy", "Horror"] });
  assert.deepEqual(sections.map((s) => s.source), ["friends", "genres"]);
  assert.equal(sections[1].blurb, "What readers shelve most in Fantasy and Horror.");
});

test("a book shows once, in the first section that has it", () => {
  const shared = book("1");
  const sections = starterSections({ ...empty, friends: [shared], team: [shared, book("2")], genres: [shared] });
  assert.deepEqual(sections.map((s) => [s.source, s.books.map((b) => b.key)]), [["friends", ["1"]], ["team", ["2"]]]);
});

test("Want to read comes back from the shelf; everything else on the shelf is left out", () => {
  const saved = book("1", "Le Guin", { bookId: "b1" });
  const sections = starterSections({ ...empty, wantToRead: [saved], genres: [book("1"), book("3")], shelf: [saved, book("3")] });
  assert.deepEqual(sections.map((s) => [s.source, s.books.map((b) => b.key)]), [["wantToRead", ["1"]]]);
});

test("one book per author past Want to read, which is the reader's own choice", () => {
  const sections = starterSections({
    ...empty,
    wantToRead: [book("1", "King", { bookId: "a" }), book("2", "King", { bookId: "b" })],
    team: [book("3", " king "), book("4", "Atwood")],
  });
  assert.deepEqual(sections.map((s) => s.books.map((b) => b.key)), [["1", "2"], ["4"]]);
});

test("each section stops at its limit", () => {
  const many = Array.from({ length: 20 }, (_, i) => book(String(i)));
  const [genres] = starterSections({ ...empty, genres: many });
  assert.equal(genres.books.length, STARTER_LIMITS.genres);
});

test("why a book is there", () => {
  assert.equal(starterWhy({ name: "Sam", rating: 5, listTitle: "Cosy" }), "Sam rated it 5 stars");
  assert.equal(starterWhy({ name: "Sam", rating: 1 }), "Sam rated it 1 star");
  assert.equal(starterWhy({ name: "Sam", listTitle: "Cosy" }), "Sam put it on Cosy");
  assert.equal(starterWhy({ listTitle: "Cosy" }), "On Cosy");
  assert.equal(starterWhy({}), null);
});

test("the pace starts from when the goal was set, with the books read by then", () => {
  const year = 2026;
  const midYear = new Date(year, 6, 2).getTime();
  // Set on 1 January: about half the goal by early July.
  assert.equal(Math.round(expectedBooks(year, 24, null, 0, midYear)), 12);
  // Set that same day with 10 read: nothing more expected yet.
  assert.equal(expectedBooks(year, 24, new Date(midYear), 10, midYear), 10);
});

test("the pace in words", () => {
  assert.deepEqual(goalPace(14, 24, 12), { text: "2 ahead of pace", toGo: "10 to go", tone: "good" });
  assert.deepEqual(goalPace(10, 24, 12.4), { text: "2 behind pace", toGo: "14 to go", tone: "behind" });
  assert.deepEqual(goalPace(12, 24, 12.3), { text: "On pace", toGo: "12 to go", tone: "neutral" });
  assert.deepEqual(goalPace(24, 24, 20), { text: "Goal reached", toGo: null, tone: "good" });
  assert.deepEqual(goalPace(26, 24, 20), { text: "Goal smashed · 2 over", toGo: null, tone: "good" });
});
