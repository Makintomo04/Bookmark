// Renaming and merging authors in the catalogue (lib/catalogueAuthorRules.ts): which works change, how
// names and Open Library keys are rewritten, what's marked curated, and undoing a change. In memory.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/catalogueAuthors.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorCurated, authorHits, authorRevertPlan, changeWorkAuthors, parseAuthorChange, parseAuthorLog, type AuthorChange } from "../../lib/catalogueAuthorRules.ts";

const merge = (extra: Partial<Extract<AuthorChange, { kind: "merge" }>> = {}): AuthorChange => ({
  kind: "merge", names: ["J.K. Rowling", "J. K. Rowling", "Rowling, J.K."], keys: ["OL1A", "OL9A"], to: "J. K. Rowling", key: "OL1A", ...extra,
});

test("a change is parsed from the body, tidied, and refused when it can't mean anything", () => {
  assert.deepEqual(parseAuthorChange({ kind: "rename", from: " Iain Banks ", to: "Iain  M. Banks" }), { ok: true, change: { kind: "rename", from: "Iain Banks", to: "Iain M. Banks" } });
  assert.equal(parseAuthorChange({ kind: "rename", from: "A", to: "A" }).ok, false);
  assert.equal(parseAuthorChange({ kind: "rename", from: "A", to: " " }).ok, false);
  assert.equal(parseAuthorChange({ kind: "merge", names: ["A", "A"], to: "A" }).ok, false);
  assert.equal(parseAuthorChange({ kind: "merge", names: ["A", "B"], to: "A", key: "not-a-key" }).ok, false);
  assert.equal(parseAuthorChange({ kind: "delete", to: "A" }).ok, false);
  const parsed = parseAuthorChange({ kind: "merge", names: ["A", "B"], keys: ["OL1A", "junk", "OL1A"], to: "A", key: "" });
  assert.deepEqual(parsed, { ok: true, change: { kind: "merge", names: ["A", "B"], keys: ["OL1A"], to: "A", key: null } });
});

test("a rename changes the name where it stands and leaves keys alone", () => {
  const change: AuthorChange = { kind: "rename", from: "Iain Banks", to: "Iain M. Banks" };
  assert.deepEqual(changeWorkAuthors({ authors: ["Iain Banks", "Ken MacLeod"], authorKeys: ["OL5A", "OL6A"] }, change),
    { authors: ["Iain M. Banks", "Ken MacLeod"], authorKeys: ["OL5A", "OL6A"] });
  assert.equal(changeWorkAuthors({ authors: ["Ken MacLeod"], authorKeys: [] }, change), null);
});

test("a rename onto a co-author's name doesn't list them twice", () => {
  const change: AuthorChange = { kind: "rename", from: "Terry Pratchet", to: "Terry Pratchett" };
  assert.deepEqual(changeWorkAuthors({ authors: ["Terry Pratchett", "Terry Pratchet"], authorKeys: [] }, change), { authors: ["Terry Pratchett"], authorKeys: [] });
});

test("a merge swaps old keys for the kept one, adds it where missing, and keeps co-authors' keys", () => {
  assert.deepEqual(changeWorkAuthors({ authors: ["J.K. Rowling"], authorKeys: ["OL9A"] }, merge()), { authors: ["J. K. Rowling"], authorKeys: ["OL1A"] });
  assert.deepEqual(changeWorkAuthors({ authors: ["Rowling, J.K."], authorKeys: [] }, merge()), { authors: ["J. K. Rowling"], authorKeys: ["OL1A"] });
  // In step with the names: the key goes where the author is.
  assert.deepEqual(changeWorkAuthors({ authors: ["Jack Thorne", "J.K. Rowling"], authorKeys: ["OL7A", "OL9A"] }, merge()),
    { authors: ["Jack Thorne", "J. K. Rowling"], authorKeys: ["OL7A", "OL1A"] });
  assert.deepEqual(changeWorkAuthors({ authors: ["Jack Thorne", "Rowling, J.K."], authorKeys: ["OL7A"] }, merge()),
    { authors: ["Jack Thorne", "J. K. Rowling"], authorKeys: ["OL7A", "OL1A"] });
  // Already right: nothing to write.
  assert.equal(changeWorkAuthors({ authors: ["J. K. Rowling"], authorKeys: ["OL1A"] }, merge()), null);
  // A work with only the key (not the name) isn't one of the author's to rewrite.
  assert.equal(changeWorkAuthors({ authors: ["Somebody Else"], authorKeys: ["OL9A"] }, merge()), null);
});

test("a merge with no key kept drops the old keys", () => {
  assert.deepEqual(changeWorkAuthors({ authors: ["J.K. Rowling", "Jack Thorne"], authorKeys: ["OL9A", "OL7A"] }, merge({ key: null })),
    { authors: ["J. K. Rowling", "Jack Thorne"], authorKeys: ["OL7A"] });
});

test("the work's authors (and a merge's keys) are marked curated so imports leave them", () => {
  assert.deepEqual(authorCurated(["title"], { kind: "rename", from: "A", to: "B" }), ["title", "authors"]);
  assert.deepEqual(authorCurated(["authors"], merge()), ["authors", "authorKeys"]);
  assert.deepEqual(authorCurated(null, merge()), ["authors", "authorKeys"]);
});

test("search hits keep real keys only and put the most books first", () => {
  assert.deepEqual(authorHits([{ name: "B", books: 1, keys: ["OL2A", null] }, { name: "A", books: 5, keys: ["OL1A", "OL1A", "x"] }]),
    [{ name: "A", books: 5, keys: ["OL1A"] }, { name: "B", books: 1, keys: ["OL2A"] }]);
});

const id = (n: number) => n.toString(16).padStart(24, "0");
const mergeLog = {
  before: {
    names: ["J.K. Rowling", "Rowling, J.K."],
    works: [
      { id: id(1), authors: ["J.K. Rowling"], authorKeys: ["OL9A"], curatedFields: ["title"] },
      { id: id(2), authors: ["Jack Thorne", "Rowling, J.K."], authorKeys: ["OL7A"], curatedFields: ["authors"] },
    ],
    follows: { moved: [{ id: id(9), authorKey: "OL9A", name: "J.K. Rowling", slug: "j-k-rowling" }], dropped: [] },
  },
  after: {
    name: "J. K. Rowling",
    works: [
      { id: id(1), authors: ["J. K. Rowling"], authorKeys: ["OL1A"] },
      { id: id(2), authors: ["Jack Thorne", "J. K. Rowling"], authorKeys: ["OL7A", "OL1A"] },
    ],
  },
};
const current = (n: number, authors: string[], authorKeys: string[], curatedFields = ["title", "authors", "authorKeys"]) =>
  ({ id: id(n), title: `Book ${n}`, authors, authorKeys, curatedFields });

test("a merge is undone work by work: names, keys, curated marks, and the copies' line", () => {
  const log = parseAuthorLog("author.merge", mergeLog.before, mergeLog.after)!;
  assert.equal(log.follows?.moved.length, 1);
  const plan = authorRevertPlan(log, [current(1, ["J. K. Rowling"], ["OL1A"]), current(2, ["Jack Thorne", "J. K. Rowling"], ["OL7A", "OL1A"])]);
  assert.deepEqual(plan, {
    ok: true,
    patches: [
      { id: id(1), authors: ["J.K. Rowling"], authorKeys: ["OL9A"], curatedFields: ["title"], refile: true, line: { from: "J. K. Rowling", to: "J.K. Rowling" } },
      // "authors" was curated before the merge, so it stays; the co-author stays first.
      { id: id(2), authors: ["Jack Thorne", "Rowling, J.K."], authorKeys: ["OL7A"], curatedFields: ["title", "authors"], refile: false, line: { from: "Jack Thorne, J. K. Rowling", to: "Jack Thorne, Rowling, J.K." } },
    ],
  });
});

test("an author undo is refused, naming the books, when any has changed since", () => {
  const log = parseAuthorLog("author.merge", mergeLog.before, mergeLog.after)!;
  assert.deepEqual(authorRevertPlan(log, [current(1, ["J. K. Rowling"], ["OL1A", "OL2A"]), current(2, ["Jack Thorne", "J. K. Rowling"], ["OL7A", "OL1A"])]),
    { ok: false, conflicts: ["Book 1"] });
});

test("a rename's undo takes off only the authors mark, and other actions aren't author logs", () => {
  const log = parseAuthorLog("author.rename", { works: [{ id: id(1), authors: ["Iain Banks"], authorKeys: ["OL5A"], curatedFields: [] }] }, { works: [{ id: id(1), authors: ["Iain M. Banks"], authorKeys: ["OL5A"] }] })!;
  const plan = authorRevertPlan(log, [current(1, ["Iain M. Banks"], ["OL5A"], ["authors", "authorKeys"])]);
  assert.ok(plan.ok);
  assert.deepEqual(plan.patches[0].curatedFields, ["authorKeys"]);
  assert.equal(parseAuthorLog("series.edit", mergeLog.before, mergeLog.after), null);
});
