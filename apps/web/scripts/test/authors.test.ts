// About the author: Open Library bios cleaned into plain paragraphs. No database or network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/authors.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBio } from "@/lib/authors";

test("Markdown emphasis and links come out as plain text", () => {
  assert.deepEqual(
    cleanBio("Known for her **Crowns of Nyaxia** series, including ***The Serpent and the Wings of Night***. See [her site](https://example.com)."),
    ["Known for her Crowns of Nyaxia series, including The Serpent and the Wings of Night. See her site."],
  );
});

test("Windows line endings split into paragraphs, and footnotes and source lines go", () => {
  assert.deepEqual(
    cleanBio("First paragraph ([Source][1]).\r\n\r\nSecond   paragraph\r\nwraps.\r\n\r\nSource:\r\n\r\n[1]: https://en.wikipedia.org/wiki/Someone"),
    ["First paragraph.", "Second paragraph wraps."],
  );
});

test("no bio is no paragraphs", () => {
  assert.deepEqual(cleanBio(null), []);
  assert.deepEqual(cleanBio("   "), []);
});
