// Book descriptions' Markdown italics (BOO-92): shown as emphasis, never as asterisks. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/emphasis.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { emphasisParts, withoutEmphasis } from "@/lib/emphasis";

const piranesi = "From the *New York Times* bestselling author of *Jonathan Strange & Mr. Norrell*, an intoxicating novel.";

test("italic titles become emphasis", () => {
  assert.deepEqual(emphasisParts(piranesi), [
    { text: "From the ", em: false },
    { text: "New York Times", em: true },
    { text: " bestselling author of ", em: false },
    { text: "Jonathan Strange & Mr. Norrell", em: true },
    { text: ", an intoxicating novel.", em: false },
  ]);
});

test("plain text loses only the markers", () => {
  assert.equal(withoutEmphasis(piranesi), "From the New York Times bestselling author of Jonathan Strange & Mr. Norrell, an intoxicating novel.");
  assert.equal(withoutEmphasis("An _award-winning_ debut."), "An award-winning debut.");
});

test("stray asterisks and underscores inside words are left alone", () => {
  assert.equal(withoutEmphasis("Rated 5 * by readers, 4 * by critics"), "Rated 5 * by readers, 4 * by critics");
  assert.equal(withoutEmphasis("see snake_case_name here"), "see snake_case_name here");
  assert.deepEqual(emphasisParts("No markup at all."), [{ text: "No markup at all.", em: false }]);
});
