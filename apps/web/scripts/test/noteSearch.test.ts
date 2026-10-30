// Filtering /notes (BOO-13): ranking over a reader's own notes. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/noteSearch.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryTerms, searchNotes, type SearchableNote } from "@/lib/noteSearch";

const note = (id: string, content: string, over: Partial<SearchableNote> = {}): SearchableNote => ({
  id,
  bookId: "book",
  title: null,
  content,
  createdAt: new Date("2026-03-10T00:00:00Z"),
  ...over,
});

const notes = [
  note("grief", "Grief is just love with nowhere to go."),
  note("grieving", "She keeps grieving the house, not the person."),
  note("love", "A line about love and spring."),
  note("old", "Grief again, in the last chapter.", { createdAt: new Date("2026-01-01T00:00:00Z") }),
];

test("stop words are dropped and terms are lower-cased and de-duplicated", () => {
  assert.deepEqual(queryTerms("That quote about GRIEF, grief"), ["quote", "grief"]);
  assert.deepEqual(queryTerms("the"), []);
});

test("matches the start of a word, never the middle", () => {
  const ids = searchNotes(notes, "griev").map((m) => m.note.id);
  assert.deepEqual(ids, ["grieving"]);
  assert.deepEqual(searchNotes(notes, "rief"), []);
});

test("newer notes come first when scores tie", () => {
  const ids = searchNotes(notes, "grief").map((m) => m.note.id);
  assert.deepEqual(ids, ["grief", "old"]);
});

test("a note with every word beats one with some", () => {
  const found = searchNotes([note("a", "love only"), note("b", "grief and love together")], "grief love");
  assert.equal(found[0].note.id, "b");
});

test("returns nothing invented: every result is a note that was passed in, with its own words", () => {
  for (const m of searchNotes(notes, "love")) {
    assert.ok(notes.includes(m.note));
    assert.ok(m.note.content.includes(m.snippet.replace(/…/g, "").trim()));
  }
  assert.deepEqual(searchNotes(notes, "xylophone"), []);
});

test("long notes get a snippet around the match", () => {
  const long = note("long", `${"filler ".repeat(60)}the quarrel at the lighthouse${" filler".repeat(60)}`);
  const [match] = searchNotes([long], "lighthouse");
  assert.match(match.snippet, /lighthouse/);
  assert.ok(match.snippet.startsWith("…") && match.snippet.endsWith("…"));
  assert.ok(match.snippet.length < long.content.length);
});

test("accents and case don't get in the way", () => {
  assert.equal(searchNotes([note("a", "Café au lait")], "cafe").length, 1);
});

test("with no limit, every match comes back for the API to page through", () => {
  const many = Array.from({ length: 45 }, (_, i) => note(`n${i}`, `grief, note ${i}`));
  assert.equal(searchNotes(many, "grief").length, 30);
  assert.equal(searchNotes(many, "grief", Infinity).length, 45);
});
