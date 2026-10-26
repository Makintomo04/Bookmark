// A librarian's correction to the shared catalogue (lib/catalogueFixRules.ts): what a fix may change,
// which readers' copies follow it, and that the catalogue never refills a corrected field. In memory.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/catalogueFix.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorStrings, changedFields, editionCopyUpdates, mergeCurated, parseEditionFix, parseWorkFix, workCopyUpdates, type WorkValues,
} from "../../lib/catalogueFixRules.ts";
import { resolveOne } from "../../lib/catalog/resolve.ts";
import { MemoryCatalogStore } from "../../lib/catalog/memoryStore.ts";

const work: WorkValues = { title: "Dune", authors: ["Frank Herbert"], description: null, coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg" };

test("a work fix takes only the fields sent, cleaned, and refuses empty titles, authors and non-https covers", () => {
  assert.deepEqual(parseWorkFix({ title: "  Dune Messiah ", other: "ignored" }, 3000), { ok: true, patch: { title: "Dune Messiah" } });
  assert.deepEqual(parseWorkFix({ authors: "Frank Herbert,  Brian Herbert ," }, 3000), { ok: true, patch: { authors: ["Frank Herbert", "Brian Herbert"] } });
  assert.deepEqual(parseWorkFix({ description: "" }, 3000), { ok: true, patch: { description: null } });
  assert.deepEqual(parseWorkFix({ coverUrl: "" }, 3000), { ok: true, patch: { coverUrl: null } });
  assert.equal(parseWorkFix({ title: " " }, 3000).ok, false);
  assert.equal(parseWorkFix({ authors: [] }, 3000).ok, false);
  assert.equal(parseWorkFix({ coverUrl: "http://example.com/x.jpg" }, 3000).ok, false);
  assert.equal(parseWorkFix({ coverUrl: "javascript:alert(1)" }, 3000).ok, false);
  assert.equal(parseWorkFix({}, 3000).ok, false);
  assert.deepEqual(parseEditionFix({ pages: "412" }), { ok: true, patch: { pages: 412 } });
  assert.equal(parseEditionFix({ pages: "4.5" }).ok, false);
  assert.equal(parseEditionFix({ pages: 0 }).ok, false);
});

test("only fields that really change count, so an untouched field isn't marked corrected", () => {
  assert.deepEqual(changedFields(work, { title: "Dune", authors: ["Frank Herbert"] }), []);
  assert.deepEqual(changedFields(work, { title: "Dune", description: "Spice." }), ["description"]);
  assert.deepEqual(mergeCurated(["title"], ["title", "coverUrl"]), ["title", "coverUrl"]);
  assert.deepEqual(mergeCurated(undefined, ["pages"]), ["pages"]);
});

test("readers' copies follow a fix only where they still show the old value", () => {
  const updates = workCopyUpdates(work, { title: "Dune (40th anniversary)", authors: ["Frank Herbert", "Brian Herbert"], coverUrl: "https://utfs.io/f/new.jpg" });
  assert.deepEqual(updates, [
    { model: "book", field: "title", from: ["Dune"], to: "Dune (40th anniversary)" },
    { model: "listItem", field: "title", from: ["Dune"], to: "Dune (40th anniversary)" },
    { model: "book", field: "author", from: ["Frank Herbert"], to: "Frank Herbert, Brian Herbert" },
    { model: "listItem", field: "author", from: ["Frank Herbert"], to: "Frank Herbert, Brian Herbert" },
    // Any catalogue cover, since copies are mirrored under their own URL; the caller keeps readers' uploads.
    { model: "book", field: "coverImage", from: "catalogue", to: "https://utfs.io/f/new.jpg" },
    { model: "listItem", field: "coverUrl", from: "catalogue", to: "https://utfs.io/f/new.jpg" },
  ]);
  assert.deepEqual(authorStrings(["A", "B"]), ["A, B", "A"]);
});

test("a cleared field is not carried over, and text fields need the old value to match", () => {
  assert.deepEqual(workCopyUpdates(work, { coverUrl: null }), []);
  assert.equal(workCopyUpdates({ ...work, coverUrl: null }, { coverUrl: "https://utfs.io/f/new.jpg" }).length, 2, "a missing cover is filled in everywhere");
  assert.deepEqual(workCopyUpdates(work, { description: "Spice." }), [], "readers' copies keep their own descriptions");
  assert.deepEqual(editionCopyUpdates({ pages: 412, coverUrl: null }, { pages: 896 }), [{ model: "book", field: "pages", from: [412], to: 896 }]);
  assert.deepEqual(editionCopyUpdates({ pages: 412, coverUrl: null }, { pages: null }), []);
});

test("the catalogue never refills a field a librarian corrected, even when it's empty", async () => {
  const store = new MemoryCatalogStore();
  const first = await resolveOne({ workKey: "OL1W", title: "A Book", author: "Someone", pages: 100 }, { store });
  // A librarian cleared a wrong cover and description.
  await store.updateWork(first.work.id, { coverUrl: null, description: null, curatedFields: ["coverUrl", "description"] });
  const again = await resolveOne({ workKey: "OL1W", title: "A Book", author: "Someone", description: "A wrong blurb.", coverUrl: "https://covers.openlibrary.org/b/id/9-L.jpg", subjects: ["Fiction"], pages: 100 }, { store });
  assert.equal(again.work.coverUrl, null);
  assert.equal(again.work.description, null);
  assert.deepEqual(again.work.subjects, ["Fiction"], "fields nobody corrected still fill in");
});
