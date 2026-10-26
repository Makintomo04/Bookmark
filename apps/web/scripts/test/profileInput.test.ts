// What readers can type into their profile and books: usernames, colours and image addresses, which
// all end up on public pages (the /u/ address, inline styles, <img> sources).
//
//   node --import ./scripts/test/register.mjs --test scripts/test/profileInput.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { USERNAME_MAX, isAllowedImageUrl, isHexColour, normaliseUsername, suggestUsername, usernameProblem } from "@/lib/profile";
import { bookFieldsProblem } from "@/lib/bookInput";

test("usernames are plain, lowercase and can't pass for Bookmark", () => {
  for (const ok of ["reader1", "jane.doe", "book_worm-99", "ab"]) assert.equal(usernameProblem(ok), null, ok);
  for (const bad of ["a", "x".repeat(USERNAME_MAX + 1), "../settings", "jane doe", "jane/doe", "jane?x", "jane#x", ".jane", "jane-", "Alice", "аlice", "📚reader"]) {
    assert.ok(usernameProblem(bad), `should refuse ${JSON.stringify(bad)}`);
  }
  assert.ok(usernameProblem("support"));
  assert.ok(usernameProblem("bookmark"));
  for (const bad of ["bookmark_support", "staff.jane", "the.admin", "book.mark.team", "ad_min99", "official-reads", "librarianjo"]) {
    assert.ok(usernameProblem(bad), `should refuse ${JSON.stringify(bad)}`);
  }
  // Only whole names for the short words, so ordinary ones get through.
  for (const ok of ["modern.reader", "steam_reads", "teamwork"]) assert.equal(usernameProblem(ok), null, ok);
});

test("usernames are compared and stored lowercase", () => {
  assert.equal(normaliseUsername("  Alice "), "alice");
  assert.equal(usernameProblem(normaliseUsername("Alice")), null);
});

test("onboarding suggestions always meet the rules", () => {
  assert.equal(suggestUsername({ name: "Jane Doe" }), "janedoe");
  assert.equal(suggestUsername({ email: "-jane.reader-@x.com" }), "jane.reader");
  assert.equal(suggestUsername({ name: "Support" }), "");
  assert.equal(suggestUsername({ name: "李" }), "");
});

test("colours must be hex, so nothing else lands in an inline style", () => {
  for (const ok of ["#fff", "#D92D2D", "#0c8599"]) assert.ok(isHexColour(ok), ok);
  for (const bad of ["red", "#12345", "#d92d2d;position:fixed", "url(https://x)", "", null, 42]) assert.ok(!isHexColour(bad), String(bad));
});

test("pictures and covers come only from known image hosts, over https", () => {
  assert.ok(isAllowedImageUrl("https://utfs.io/f/abc.jpg"));
  assert.ok(isAllowedImageUrl("https://covers.openlibrary.org/b/id/1-L.jpg"));
  assert.ok(isAllowedImageUrl("https://lh3.googleusercontent.com/a/x"));
  for (const bad of ["http://utfs.io/f/abc.jpg", "https://evil.example/pixel.gif", "https://utfs.io.evil.example/x", "javascript:alert(1)", "not a url", 7]) {
    assert.ok(!isAllowedImageUrl(bad), String(bad));
  }
});

test("book fields are capped and checked like profile fields", () => {
  assert.equal(bookFieldsProblem({ title: "Dune", author: "Frank Herbert", genre: "Sci-fi", coverImgSrc: "https://covers.openlibrary.org/b/id/1-L.jpg", cardColour: "#123456" }), null);
  // Not being changed: nothing to check.
  assert.equal(bookFieldsProblem({}), null);
  assert.equal(bookFieldsProblem({ coverImgSrc: "", cardColour: "" }), null);
  assert.ok(bookFieldsProblem({ title: "x".repeat(301) }));
  assert.ok(bookFieldsProblem({ genre: { $ne: null } }));
  assert.ok(bookFieldsProblem({ coverImgSrc: "https://evil.example/x.png" }));
  assert.ok(bookFieldsProblem({ cardColour: "red;background:url(x)" }));
});
