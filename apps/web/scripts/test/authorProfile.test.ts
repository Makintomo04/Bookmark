// A librarian's author bio and photo (BOO-51): what they may set and how the bio is split into paragraphs.
// No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/authorProfile.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BIO_MAX, bioParagraphs, parseProfileFix } from "@/lib/authorProfileRules";

test("a bio is tidied into paragraphs", () => {
  assert.deepEqual(bioParagraphs("First  line\r\nsecond.\r\n\r\n\r\nNext   paragraph."), ["First line second.", "Next paragraph."]);
  assert.deepEqual(bioParagraphs("  \n\n "), []);
});

test("only the fields sent change, and empty ones clear", () => {
  assert.deepEqual(parseProfileFix({ bio: "  Hello.  " }), { ok: true, patch: { bio: "Hello." } });
  assert.deepEqual(parseProfileFix({ photoUrl: "https://example.com/a.jpg", ignored: 1 }), { ok: true, patch: { photoUrl: "https://example.com/a.jpg" } });
  assert.deepEqual(parseProfileFix({ bio: "", photoUrl: "  " }), { ok: true, patch: { bio: null, photoUrl: null } });
  assert.deepEqual(parseProfileFix({ bio: 5 }), { ok: true, patch: { bio: null } });
});

test("a photo must be an https link, and a bio has a length cap", () => {
  for (const bad of ["http://example.com/a.jpg", "javascript:alert(1)", "not a url", "//example.com/a.jpg"]) {
    assert.equal(parseProfileFix({ photoUrl: bad }).ok, false, bad);
  }
  assert.equal(parseProfileFix({ bio: "x".repeat(BIO_MAX + 1) }).ok, false);
  assert.equal(parseProfileFix({ bio: "x".repeat(BIO_MAX) }).ok, true);
});

test("nothing to change is refused", () => {
  assert.deepEqual(parseProfileFix({}), { ok: false, error: "Nothing to change." });
});
