// A librarian's correction to the shared catalogue (lib/catalogueFixRules.ts): what a fix may change,
// which readers' copies follow it, and that the catalogue never refills a corrected field. In memory.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/catalogueFix.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EDITION_FIELDS, WORK_FIELDS, authorStrings, changedFields, closedReportIds, curatedAfterRevert, curatedWorkFields, editionCopyUpdates, fieldChanges, librarianCover, mergeCurated, normaliseIsbn,
  parseEditionFix, parseWorkFix, revertPlan, sameValue, workCopyUpdates, type WorkValues,
} from "../../lib/catalogueFixRules.ts";
import { resolveOne } from "../../lib/catalog/resolve.ts";
import { MemoryCatalogStore } from "../../lib/catalog/memoryStore.ts";
import { seriesFillSkips } from "../../lib/seriesFill.ts";

const work: WorkValues = { title: "Dune", authors: ["Frank Herbert"], description: null, coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg", seriesName: null, seriesPosition: null, firstPublishYear: 1965, releaseDate: null };

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
    { model: "circle", field: "title", from: ["Dune"], to: "Dune (40th anniversary)" },
    { model: "book", field: "author", from: ["Frank Herbert"], to: "Frank Herbert, Brian Herbert" },
    { model: "listItem", field: "author", from: ["Frank Herbert"], to: "Frank Herbert, Brian Herbert" },
    { model: "circle", field: "author", from: ["Frank Herbert"], to: "Frank Herbert, Brian Herbert" },
    // Any catalogue cover, since copies are mirrored under their own URL; the caller keeps readers' uploads.
    { model: "book", field: "coverImage", from: "catalogue", to: "https://utfs.io/f/new.jpg" },
    { model: "listItem", field: "coverUrl", from: "catalogue", to: "https://utfs.io/f/new.jpg" },
    { model: "circle", field: "coverImage", from: "catalogue", to: "https://utfs.io/f/new.jpg" },
  ]);
  assert.deepEqual(authorStrings(["A", "B"]), ["A, B", "A"]);
});

test("a cleared field is not carried over, and text fields need the old value to match", () => {
  assert.deepEqual(workCopyUpdates(work, { coverUrl: null }), []);
  assert.equal(workCopyUpdates({ ...work, coverUrl: null }, { coverUrl: "https://utfs.io/f/new.jpg" }).length, 3, "a missing cover is filled in everywhere");
  assert.deepEqual(workCopyUpdates(work, { description: "Spice." }), [{ model: "book", field: "description", from: "any", to: "Spice." }], "a librarian's blurb replaces the one copies were shelved with");
  assert.deepEqual(workCopyUpdates({ ...work, description: "Spice." }, { description: null }), [], "a cleared blurb leaves copies theirs");
  assert.deepEqual(workCopyUpdates({ ...work, coverUrl: "https://utfs.io/f/wrong.jpg" }, { coverUrl: null }, { revert: true }), [
    { model: "book", field: "coverImage", from: ["https://utfs.io/f/wrong.jpg"], to: "" },
    { model: "listItem", field: "coverUrl", from: ["https://utfs.io/f/wrong.jpg"], to: null },
    { model: "circle", field: "coverImage", from: ["https://utfs.io/f/wrong.jpg"], to: null },
  ], "reverting a cover to none takes the undone cover off copies still showing it");
  assert.deepEqual(workCopyUpdates({ ...work, description: "Spice." }, { description: null }, { revert: true }), [{ model: "book", field: "description", from: ["Spice."], to: null }]);
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

test("a librarian's cover beats every other cover", () => {
  const hardcover = { coverUrl: "https://assets.hardcover.app/x.jpg", curatedFields: [] };
  const fixed = { coverUrl: "https://utfs.io/f/fixed.jpg", curatedFields: ["coverUrl", "pages"] };
  assert.equal(librarianCover(hardcover, [fixed]), fixed.coverUrl, "an edition's fix beats a filled-in work cover");
  assert.equal(librarianCover({ ...fixed, coverUrl: "https://utfs.io/f/work.jpg" }, [fixed]), "https://utfs.io/f/work.jpg", "the work's own fix comes first");
  assert.equal(librarianCover(hardcover, [{ coverUrl: null, curatedFields: ["coverUrl"] }]), null, "a cleared cover isn't one");
  assert.equal(librarianCover(hardcover, []), null);
});

test("a librarian's series: name and place cleaned, a cleared name clears the place, and either half keeps the fill off", () => {
  assert.deepEqual(parseWorkFix({ seriesName: " Dune Chronicles ", seriesPosition: "2" }, 3000), { ok: true, patch: { seriesName: "Dune Chronicles", seriesPosition: 2 } });
  assert.deepEqual(parseWorkFix({ seriesPosition: "2.5" }, 3000), { ok: true, patch: { seriesPosition: 2.5 } });
  assert.deepEqual(parseWorkFix({ seriesName: "" }, 3000), { ok: true, patch: { seriesName: null, seriesPosition: null } });
  assert.equal(parseWorkFix({ seriesPosition: "first" }, 3000).ok, false);
  assert.equal(parseWorkFix({ seriesPosition: -1 }, 3000).ok, false);
  assert.deepEqual(curatedWorkFields(["seriesPosition"]), ["seriesPosition", "seriesName"]);
  assert.deepEqual(curatedWorkFields(["seriesName"]), ["seriesName", "seriesPosition"], "either half marks both");
  assert.deepEqual(curatedWorkFields(["title"]), ["title"]);
});

test("a work's first publication year: a whole year, BC allowed, empty clears it", () => {
  assert.deepEqual(parseWorkFix({ firstPublishYear: "1965" }, 3000), { ok: true, patch: { firstPublishYear: 1965 } });
  assert.deepEqual(parseWorkFix({ firstPublishYear: -750 }, 3000), { ok: true, patch: { firstPublishYear: -750 } });
  assert.deepEqual(parseWorkFix({ firstPublishYear: "" }, 3000), { ok: true, patch: { firstPublishYear: null } });
  assert.equal(parseWorkFix({ firstPublishYear: "1965.5" }, 3000).ok, false);
  assert.equal(parseWorkFix({ firstPublishYear: "nineteen" }, 3000).ok, false);
  assert.equal(parseWorkFix({ firstPublishYear: 99999 }, 3000).ok, false);
});

test("ISBNs lose their hyphens and spaces, and the check digit has to add up", () => {
  assert.deepEqual(normaliseIsbn("978-0-441-17271-9", 13), { ok: true, value: "9780441172719" });
  assert.deepEqual(normaliseIsbn(" 0-441-17271-7 ", 10), { ok: true, value: "0441172717" });
  assert.deepEqual(normaliseIsbn("0-8044-2957-x", 10), { ok: true, value: "080442957X" }, "a lower-case X check digit");
  assert.deepEqual(normaliseIsbn("", 13), { ok: true, value: null });
  assert.equal(normaliseIsbn("9780441172718", 13).ok, false, "wrong check digit");
  assert.equal(normaliseIsbn("0441172718", 10).ok, false, "wrong check digit");
  assert.equal(normaliseIsbn("0441172717", 13).ok, false, "an ISBN-10 in the ISBN-13 box");
  assert.equal(normaliseIsbn("97804411727X9", 13).ok, false);
});

test("an edition fix takes ISBNs, publisher, year and format, cleaned", () => {
  assert.deepEqual(parseEditionFix({ isbn13: "978-0-441-17271-9", isbn10: "", publisher: "  Ace ", publishedYear: "1990", format: "paperback" }), {
    ok: true, patch: { isbn13: "9780441172719", isbn10: null, publisher: "Ace", publishedYear: 1990, format: "PAPERBACK" },
  });
  assert.deepEqual(parseEditionFix({ format: "" }), { ok: true, patch: { format: null } });
  assert.equal(parseEditionFix({ format: "scroll" }).ok, false);
  assert.equal(parseEditionFix({ isbn13: "9780441172718" }).ok, false);
  assert.equal(parseEditionFix({ publishedYear: "1990s" }).ok, false);
  // New fields don't touch readers' copies: Book has no ISBN or publisher of its own.
  assert.deepEqual(editionCopyUpdates({ pages: 412, coverUrl: null }, { isbn13: "9780441172719", publisher: "Ace" }), []);
});

test("a revert puts back the old values while every field still shows what the edit set", () => {
  const before = { title: "Dune", seriesPosition: null };
  const after = { title: "Dune (40th anniversary)", seriesPosition: 1, copies: { books: 3, listItems: 0, circles: 0 }, reports: 2 };
  const now = { ...work, title: "Dune (40th anniversary)", seriesPosition: 1 };
  assert.deepEqual(revertPlan(now, before, after, WORK_FIELDS), { ok: true, patch: { title: "Dune", seriesPosition: null } }, "bookkeeping isn't a field");
  assert.deepEqual(revertPlan({ ...now, title: "Dune: Deluxe" }, before, after, WORK_FIELDS), { ok: false, conflicts: ["title"] }, "a later change blocks the whole revert");
  assert.deepEqual(revertPlan({ ...now, seriesPosition: undefined, title: "X" }, before, after, WORK_FIELDS), { ok: false, conflicts: ["title", "seriesPosition"] });
  // Lists compare item by item, and unset is null.
  assert.deepEqual(
    revertPlan({ ...work, authors: ["Frank Herbert", "Brian Herbert"], description: undefined }, { authors: ["Frank Herbert"], description: "Spice." }, { authors: ["Frank Herbert", "Brian Herbert"], description: null }, WORK_FIELDS),
    { ok: true, patch: { authors: ["Frank Herbert"], description: "Spice." } },
  );
  assert.deepEqual(revertPlan(now, { pageApprovedAt: null }, { title: "Dune" }, WORK_FIELDS), { ok: true, patch: {} }, "nothing editable to put back");
  assert.deepEqual(
    revertPlan({ pages: 896, coverUrl: null, isbn13: "9780441172719" }, { pages: 412, isbn13: null }, { pages: 896, isbn13: "9780441172719", copies: {} }, EDITION_FIELDS),
    { ok: true, patch: { pages: 412, isbn13: null } },
  );
  assert.equal(sameValue(["a"], ["a", "b"]), false);
  assert.equal(sameValue(undefined, null), true);
});

test("a logged edit reads field by field for the history, without bookkeeping", () => {
  assert.deepEqual(fieldChanges({ title: "Dune" }, { title: "Dune Messiah", copies: { books: 1 }, reports: 1, reverts: "abc" }), [{ field: "title", from: "Dune", to: "Dune Messiah" }]);
  assert.deepEqual(fieldChanges(null, { title: "Dune" }), [{ field: "title", from: null, to: "Dune" }]);
});

test("a revert drops the fields it put back from curatedFields, unless they were corrected before the edit", () => {
  assert.deepEqual(curatedAfterRevert(["title", "coverUrl"], ["coverUrl"], ["title"]), ["title"], "the cover was first corrected by the edit being undone");
  assert.deepEqual(curatedAfterRevert(["title", "coverUrl"], ["coverUrl"], ["coverUrl"]), ["title", "coverUrl"], "corrected before, so still a correction");
  assert.deepEqual(curatedAfterRevert(["title"], ["coverUrl"], undefined), ["title", "coverUrl"], "an older entry didn't log it: stays marked");
});

test("a revert reopens exactly the reports its edit closed", () => {
  assert.deepEqual(closedReportIds({ title: "Dune", reports: 2, reportIds: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(closedReportIds({ title: "Dune", reports: 2 }), [], "older entries only counted them");
  assert.deepEqual(fieldChanges({ title: "Dune" }, { title: "Dune Messiah", reportIds: ["a"], wasCurated: [], reopened: 1 }), [{ field: "title", from: "Dune", to: "Dune Messiah" }]);
});

test("a librarian's series survives a re-import, even when they cleared it", async () => {
  const store = new MemoryCatalogStore();
  const first = await resolveOne({ workKey: "OL2W", title: "A Book", author: "Someone", series: { name: "Wrong Saga", position: 9 } }, { store });
  // A librarian files it under the right series, marking both halves.
  await store.updateWork(first.work.id, { seriesName: "Right Saga", seriesPosition: 2.5, curatedFields: curatedWorkFields(["seriesPosition"]) });
  const again = await resolveOne({ workKey: "OL2W", title: "A Book", author: "Someone", series: { name: "Wrong Saga", position: 9 } }, { store });
  assert.equal(again.work.seriesName, "Right Saga");
  assert.equal(again.work.seriesPosition, 2.5);

  // Cleared, it stays cleared when a Goodreads title or Open Library edition names a series again.
  await store.updateWork(first.work.id, { seriesName: null, seriesPosition: null, curatedFields: curatedWorkFields(["seriesName"]) });
  const cleared = await resolveOne({ workKey: "OL2W", title: "A Book", author: "Someone", series: { name: "Wrong Saga", position: 9 } }, { store });
  assert.equal(cleared.work.seriesName, null);
  assert.equal(cleared.work.seriesPosition, null);
});

test("a librarian's series is never refilled from Hardcover, however often the fill re-runs", () => {
  const unchecked = { authors: ["Someone"], seriesCheckedAt: null, curatedFields: [] as string[] };
  assert.equal(seriesFillSkips(unchecked), false, "an ordinary unchecked work is asked about");
  assert.equal(seriesFillSkips({ ...unchecked, seriesCheckedAt: new Date() }), true, "and only once");
  assert.equal(seriesFillSkips({ ...unchecked, authors: [] }), true, "a work with no author can't be asked about");

  // The backfill picks every unchecked work, and a curated one is never marked checked, so it comes round on
  // every run. Set, renumbered or cleared, it's skipped each time.
  for (const fixed of [["seriesName"], ["seriesPosition"]]) {
    assert.equal(seriesFillSkips({ ...unchecked, curatedFields: curatedWorkFields(fixed) }), true, `fixed ${fixed[0]}`);
  }
  // A series saved on the librarians' series page (lib/catalogueSeries.ts) marks the same fields.
  assert.equal(seriesFillSkips({ ...unchecked, curatedFields: mergeCurated(["title"], curatedWorkFields(["seriesName", "seriesPosition"])) }), true);
  assert.equal(seriesFillSkips({ ...unchecked, curatedFields: ["title", "coverUrl"] }), false, "other corrections don't keep the fill off");
});
