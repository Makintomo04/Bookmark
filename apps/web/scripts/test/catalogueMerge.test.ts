// Merging duplicate works (lib/catalogueMergeRules.ts): what the survivor takes, which copy a reader with
// both keeps, what an undo puts back and when it refuses, and how the duplicates queue pairs works. In memory.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/catalogueMerge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyClashes, duplicateGroups, duplicatePairs, isMerged, mergeCopies, mergeWorkValues, mergedInto, mergedKey, unmergeConflicts, unmergeCopyPatch, type CopyRow,
} from "../../lib/catalogueMergeRules.ts";

const work = { title: "Dune", authors: ["Frank Herbert"], description: null, coverUrl: "https://utfs.io/f/a.jpg", seriesName: null, seriesPosition: null, firstPublishYear: null, curatedFields: [] as string[] };

const copy = (over: Partial<CopyRow> = {}): CopyRow => ({
  id: "c", status: "NOT_STARTED", rating: null, review: null, reviewSpoiler: null, reviewPrivate: null, reviewHiddenAt: null, ratingHiddenAt: null,
  isPrivate: null, timesRead: 0, currentPage: 0, startedAt: null, completedAt: null, tags: [], recommendedById: null, recommendedByName: null, reads: 0, ...over,
});

test("a merged work's key points at the survivor, and only a merged key does", () => {
  const key = mergedKey("aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(mergedInto(key), "aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(isMerged({ key }), true);
  assert.equal(mergedInto("ol:OL45883W"), null);
  assert.equal(mergedInto(null), null);
});

test("the survivor keeps its own details and fills in only what it lacks", () => {
  const duplicate = { ...work, title: "Dune (Deluxe)", coverUrl: "https://utfs.io/f/b.jpg", description: "Spice.", seriesName: "Dune", seriesPosition: 1, firstPublishYear: 1965 };
  assert.deepEqual(mergeWorkValues(work, duplicate), {
    patch: { description: "Spice.", firstPublishYear: 1965, seriesName: "Dune", seriesPosition: 1 },
    curatedFields: [],
  });
  // A series comes as a pair: a survivor with a name keeps its own, place and all.
  assert.deepEqual(mergeWorkValues({ ...work, seriesName: "Dune Chronicles" }, duplicate).patch.seriesName, undefined);
});

test("curatedFields: the survivor's, plus the duplicate's where the value came from it or matches", () => {
  const duplicate = { ...work, description: "Spice.", coverUrl: "https://utfs.io/f/b.jpg", curatedFields: ["description", "coverUrl", "title"] };
  // Description came from the duplicate, title is the same on both, the cover differs and the survivor's wins unchecked.
  assert.deepEqual(mergeWorkValues({ ...work, curatedFields: ["authors"] }, duplicate).curatedFields, ["authors", "description", "title"]);
});

test("a reader with both keeps the richer copy, the survivor's on a tie", () => {
  const survivorSide = copy({ id: "s" });
  const read = copy({ id: "d", status: "COMPLETED", timesRead: 1, reads: 1, rating: 4 });
  assert.equal(mergeCopies(survivorSide, read).keep.id, "d");
  assert.equal(mergeCopies(read, survivorSide).keep.id, "d");
  assert.equal(mergeCopies(copy({ id: "s" }), copy({ id: "d" })).keep.id, "s", "a tie stays on the survivor");
  assert.equal(mergeCopies(copy({ id: "s", status: "STARTED", currentPage: 10 }), copy({ id: "d", status: "NOT_INTERESTED", tags: ["x"] })).keep.id, "s");
});

test("the kept copy takes what it lacks from the other", () => {
  const kept = copy({ id: "k", status: "STARTED", reads: 1, currentPage: 50, tags: ["kindle"], rating: 3 });
  const other = copy({ id: "o", status: "COMPLETED", timesRead: 1, reads: 0, review: "Loved it.", reviewSpoiler: true, rating: 5, tags: ["kindle", "owned"], isPrivate: true, recommendedByName: "Mum" });
  const m = mergeCopies(kept, other);
  assert.equal(m.keep.id, "k");
  assert.deepEqual(m.patch, {
    review: "Loved it.", reviewSpoiler: true, reviewPrivate: null, reviewHiddenAt: null,
    recommendedById: null, recommendedByName: "Mum", tags: ["kindle", "owned"], isPrivate: true, timesRead: 1,
  }, "its own rating stands; the other's review, recommender, tags, privacy and completed read come over");
  assert.deepEqual(m.before, { review: null, reviewSpoiler: null, reviewPrivate: null, reviewHiddenAt: null, recommendedById: null, recommendedByName: null, tags: ["kindle"], isPrivate: null, timesRead: 0 });
  // Both rated, and the other was finished while the kept one is mid-read: folding these would lose both.
  assert.deepEqual(m.lost, ["rating", "status"]);
});

test("a fold only goes ahead when the dropped copy holds nothing the kept one would lose", () => {
  const read = copy({ id: "k", status: "COMPLETED", reads: 1, timesRead: 1, rating: 4, review: "Good.", startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-02-01T00:00:00.000Z" });
  // Want to read, or the same values: nothing to lose.
  assert.deepEqual(mergeCopies(read, copy({ id: "d", tags: ["owned"] })).lost, []);
  assert.deepEqual(mergeCopies(read, copy({ id: "d", status: "COMPLETED", rating: 4, startedAt: new Date("2026-01-01T00:00:00Z"), completedAt: "2026-02-01T00:00:00.000Z" })).lost, [], "dates compare by value");
  // A review or rating on only one side moves across, so it isn't lost either.
  assert.deepEqual(mergeCopies(copy({ id: "s", status: "COMPLETED", reads: 1 }), copy({ id: "d", status: "COMPLETED", rating: 5, review: "Wow." })).lost, []);
  // Two reviews, two ratings, two recommenders: one of each would go.
  assert.deepEqual(copyClashes(read, copy({ id: "d", status: "COMPLETED", review: "Meh.", rating: 2, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-02-01T00:00:00.000Z" })), ["review", "rating"]);
  assert.deepEqual(copyClashes(copy({ recommendedByName: "Mum" }), copy({ recommendedById: "u1" })), ["recommendedBy"]);
  // The dropped copy's own reading: another status, dates or place in the book.
  assert.deepEqual(copyClashes(read, copy({ id: "d", status: "STARTED", startedAt: "2026-05-01", currentPage: 40 })), ["status", "startedAt", "currentPage"]);
  assert.deepEqual(copyClashes(read, copy({ id: "d", status: "COMPLETED", completedAt: "2025-12-01" })), ["completedAt"]);
});

test("undoing puts back what the merge set, but not what the reader has changed since", () => {
  const patch = { review: "Loved it.", rating: 5, tags: ["kindle", "owned"], timesRead: 2 };
  const before = { review: null, rating: null, tags: ["kindle"], timesRead: 1 };
  const now = { review: "Loved it. Rereading!", rating: 5, tags: ["kindle", "owned", "signed"], timesRead: 3 };
  assert.deepEqual(unmergeCopyPatch(now, patch, before), { rating: null, tags: ["kindle", "signed"], timesRead: 2 });
  // Dates compare as the log stores them.
  const hidden = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(unmergeCopyPatch({ reviewHiddenAt: hidden }, { reviewHiddenAt: hidden.toISOString() }, { reviewHiddenAt: null }), { reviewHiddenAt: null });
});

test("an undo is refused, saying why, when it's no longer safe", () => {
  const clear = { duplicateMissing: false, keyTaken: false, editionsElsewhere: 0, copiesElsewhere: 0, keptRemoved: 0, fieldConflicts: [] };
  assert.deepEqual(unmergeConflicts(clear), []);
  assert.deepEqual(unmergeConflicts({ ...clear, duplicateMissing: true, keyTaken: true }), ["The duplicate book is no longer in the catalogue."]);
  assert.deepEqual(unmergeConflicts({ ...clear, copiesElsewhere: 2, keptRemoved: 1, fieldConflicts: ["description"] }, { description: "Description" }), [
    "2 readers' copies have moved to another book since. Undo that first.",
    "1 reader has removed the copy their other copy was folded into.",
    "Changed since on the book it was merged into: Description.",
  ]);
});

test("duplicates group by first author and title, leaving merged works out", () => {
  const works = [
    { id: "1", key: "ol:OL1W", title: "Fourth Wing", authors: ["Rebecca Yarros"] },
    { id: "2", key: "ol:OL2W", title: "Fourth wing (Special Edition)", authors: ["Rebecca Yarros"] },
    { id: "3", key: mergedKey("1", "3"), title: "Fourth Wing", authors: ["Rebecca Yarros"] },
    { id: "4", key: "ol:OL4W", title: "Fourth Wing", authors: ["Someone Else"] },
  ];
  assert.deepEqual(duplicateGroups(works).map((g) => g.map((w) => w.id)), [["1", "2"]]);
});

test("each group pairs the likeliest keeper with each of the others", () => {
  const group = [
    { id: "b", openLibraryKey: null, readers: 3 },
    { id: "a", openLibraryKey: "OL1W", readers: 3 },
    { id: "c", openLibraryKey: "OL2W", readers: 9 },
  ];
  assert.deepEqual(duplicatePairs(group).map(([x, y]) => [x.id, y.id]), [["c", "a"], ["c", "b"]], "most readers, then an Open Library work");
  assert.deepEqual(duplicatePairs([group[0]]), []);
});
