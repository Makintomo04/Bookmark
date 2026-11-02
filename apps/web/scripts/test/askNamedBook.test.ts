// Ask the shelf leaves out the book the reader named as the yardstick (BOO-92). No AI, no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/askNamedBook.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { namedInQuery } from "@/lib/askShelf";

test("a multi-word title named anywhere is left out", () => {
  assert.equal(namedInQuery("something like fourth wing but spicier, enemies to lovers", "Fourth Wing"), true);
  assert.equal(namedInQuery("more like A Court of Thorns and Roses", "A Court of Thorns and Roses"), true);
  assert.equal(namedInQuery("Fourth Wing vibes", "Fourth Wing"), true);
});

test("a one-word title only after like, than, to or as", () => {
  assert.equal(namedInQuery("a slow, strange book like Piranesi", "Piranesi"), true);
  assert.equal(namedInQuery("spicier than dune", "Dune"), true);
  assert.equal(namedInQuery("a quiet book about grief", "Grief"), false);
});

test("other books are kept", () => {
  assert.equal(namedInQuery("something like fourth wing but spicier", "Iron Flame"), false);
  assert.equal(namedInQuery("something like fourth wing", "Wing"), false);
});
