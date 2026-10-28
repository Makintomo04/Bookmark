// What readers can type into their profile and books: usernames, colours and image addresses, which
// all end up on public pages (the /u/ address, inline styles, <img> sources).
//
//   node --import ./scripts/test/register.mjs --test scripts/test/profileInput.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DISPLAY_NAME_MAX, USERNAME_MAX, displayNameProblem, isAllowedImageUrl, isHexColour, normaliseDisplayName, normaliseUsername, readerName, suggestUsername, usernameProblem } from "@/lib/profile";
import { bookFieldsProblem } from "@/lib/bookInput";
import { planLowercaseUsernames } from "@/lib/lowercaseUsernames";

test("usernames are plain, lowercase and can't pass for Bookmark", () => {
  for (const ok of ["reader1", "jane.doe", "book_worm-99", "abc"]) assert.equal(usernameProblem(ok), null, ok);
  for (const bad of ["a", "ab", "b🩶", "🩶🩶🩶", "x".repeat(USERNAME_MAX + 1), "../settings", "jane doe", "jane/doe", "jane?x", "jane#x", ".jane", "jane-", "Alice", "аlice", "📚reader"]) {
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
  // What a /u/ address or a username in a request body is lowercased to before it's looked up.
  assert.equal(normaliseUsername("Persona"), normaliseUsername("persona"));
  assert.equal(normaliseUsername("JANE.Doe"), "jane.doe");
  assert.equal(normaliseUsername(""), "");
});

test("the lowercase-usernames script changes capitalised names and refuses collisions", () => {
  const { changes, collisions } = planLowercaseUsernames([
    { id: "1", username: "Persona" },
    { id: "2", username: "already" },
    { id: "3", username: "Alice" },
    { id: "4", username: "alice" },
    { id: "5", username: "BOB" },
    { id: "6", username: "Bob" },
    { id: "7", username: null },
  ]);
  assert.deepEqual(changes, [{ id: "1", from: "Persona", to: "persona" }]);
  assert.deepEqual(collisions.map((c) => [c.username, c.accounts.map((a) => a.id)]), [["alice", ["3", "4"]], ["bob", ["5", "6"]]]);
  // Nothing to do leaves every list empty.
  assert.deepEqual(planLowercaseUsernames([{ id: "1", username: "fine" }]), { changes: [], collisions: [], outdated: [] });
});

test("the script lists names from before the rules, and renames none of them", () => {
  const { changes, outdated } = planLowercaseUsernames([
    { id: "1", username: "b🩶" },
    { id: "2", username: "jo" },
    { id: "3", username: "Jane Doe" },
    // A capital alone isn't a problem: lowercasing fixes it.
    { id: "4", username: "Persona" },
    { id: "5", username: "fine.reader" },
  ]);
  assert.deepEqual(outdated.map((o) => [o.id, o.username]), [["1", "b🩶"], ["2", "jo"], ["3", "Jane Doe"]]);
  for (const o of outdated) assert.ok(o.problem, o.username);
  // Only the capital is changed; "Jane Doe" -> "jane doe" would still break the rules, but lowering case is harmless.
  assert.deepEqual(changes.map((c) => c.to), ["jane doe", "persona"]);
});

test("display names are trimmed, bounded, visible and can't pass for Bookmark", () => {
  assert.equal(normaliseDisplayName("  Jane   Reader "), "Jane Reader");
  assert.equal(normaliseDisplayName("\n\tJane\n"), "Jane");
  for (const ok of ["Jane Reader", "李华", "Zoë O'Brien-Smith", "📚 Jane", "x".repeat(DISPLAY_NAME_MAX), "Modern Reader", "Team Lead Jane"]) {
    assert.equal(displayNameProblem(ok), null, ok);
  }
  // Optional: empty is "no display name", not a mistake.
  assert.equal(displayNameProblem(""), null);
  assert.ok(displayNameProblem("x".repeat(DISPLAY_NAME_MAX + 1)));
  for (const hidden of ["Jane​Reader", "Jane‮Reader", "Jane\u0000", "Jane Reader"]) {
    assert.ok(displayNameProblem(hidden), `should refuse ${JSON.stringify(hidden)}`);
  }
  // The same words a username may not contain, whatever the spacing, punctuation or case.
  for (const bad of ["Bookmark Support", "Book Mark", "The ADMIN", "Staff - Jane", "Official Reads", "Librarian Jo", "Moderator", "Mod", "Team", "Help"]) {
    assert.ok(displayNameProblem(bad), `should refuse ${JSON.stringify(bad)}`);
  }
});

test("a reader goes by their display name, or their username until they set one", () => {
  assert.equal(readerName({ username: "persona", displayName: "Persona Reads" }), "Persona Reads");
  assert.equal(readerName({ username: "persona", displayName: null }), "persona");
  assert.equal(readerName({ username: "persona" }), "persona");
  assert.equal(readerName({ username: "persona", displayName: "" }), "persona");
  assert.equal(readerName({ username: null }), "");
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
