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
  const books = [b("Catch-22"), b("1984"), b("Fahrenheit 451"), b("The Hitchhiker's Guide to the Galaxy"), b("A Court of Thorns and Roses")];
  assert.equal(cleanBookList(books).length, books.length);
});

test("an author who writes in another language keeps every book", () => {
  const books = [b("La sombra del viento", ["spa"]), b("El juego del ángel", ["spa"])];
  assert.equal(cleanBookList(books).length, 2);
});

test("books with no language data aren't treated as translations", () => {
  assert.equal(cleanBookList([b("Fourth Wing"), b("Variation", [])]).length, 2);
});
