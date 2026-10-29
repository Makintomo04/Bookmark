// The staff log entry for staff editing someone else's list (lib/listEditRules.ts): what changed, kept
// compact (titles and counts), and nothing when only flags or settings changed. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/listEdit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { listContentChange } from "@/lib/listEditRules";

const dune = { workKey: "OL1W", title: "Dune", author: "Frank Herbert", note: null };
const hobbit = { workKey: "OL2W", title: "The Hobbit", author: "J.R.R. Tolkien", note: "A gentle start" };
const typed = { workKey: null, title: "My Zine", author: "Sam", note: null };
const stored = { title: "Comfort reads", description: "Books to curl up with", items: [dune, hobbit, typed] };

test("a save that changes nothing in the content logs nothing", () => {
  assert.equal(listContentChange(stored, { ...stored, items: [...stored.items] }), null);
  // Matched by work key, or title and author for a hand-typed book.
  assert.equal(listContentChange(stored, { ...stored, items: [{ ...dune }, { ...hobbit }, { ...typed, title: "my zine" }] }), null);
});

test("a new title and description are logged before and after", () => {
  const change = listContentChange(stored, { ...stored, title: "Cosy reads", description: null })!;
  assert.deepEqual(change.before, { title: "Comfort reads", description: "Books to curl up with" });
  assert.deepEqual(change.after, { title: "Cosy reads", description: null });
});

test("books added and removed are named, with counts, never whole items", () => {
  const added = { workKey: "OL3W", title: "Piranesi", author: "Susanna Clarke", note: "secret note" };
  const change = listContentChange(stored, { ...stored, items: [dune, added, typed] })!;
  assert.deepEqual(change.before, { items: 3 });
  assert.deepEqual(change.after, { items: 3, added: ["Piranesi"], removed: ["The Hobbit"] });
  assert.ok(!JSON.stringify(change).includes("secret note"));
});

test("reordering and changed notes are noted, not spelt out", () => {
  assert.deepEqual(listContentChange(stored, { ...stored, items: [hobbit, dune, typed] })!.after, { items: 3, reordered: true });
  assert.deepEqual(listContentChange(stored, { ...stored, items: [dune, { ...hobbit, note: "Changed" }, typed] })!.after, { items: 3, notesChanged: 1 });
  // A removal alone isn't a reorder.
  assert.deepEqual(listContentChange(stored, { ...stored, items: [dune, typed] })!.after, { items: 2, removed: ["The Hobbit"] });
});

test("a long description is cut short in the log", () => {
  const change = listContentChange(stored, { ...stored, description: "x".repeat(500) })!;
  assert.equal((change.after.description as string).length, 201);
});
