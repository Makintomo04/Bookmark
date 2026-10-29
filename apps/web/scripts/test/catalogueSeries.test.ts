// The librarians' series editor (lib/catalogueSeriesRules.ts, packages/shared/src/series.ts): places as
// typed, duplicate places, spotting one series spelled two ways, what one Save writes, which follows move,
// and undoing a save. In memory.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/catalogueSeries.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanReason, duplicatePositions, GONE_TITLE, parsePosition, parseSeriesEdit, parseSeriesLog, seriesEditDiff, seriesKeyMoves, seriesRevertPlan, shownConflicts, uncurate,
  type SeriesEdit, type SeriesRow,
} from "../../lib/catalogueSeriesRules.ts";
import { possiblySameSeries, seriesKey, seriesLooseKey } from "../../lib/series.ts";

const id = (n: number) => n.toString(16).padStart(24, "0");

test("places are numbers, decimals allowed, blank for none", () => {
  assert.deepEqual(parsePosition("3"), { ok: true, value: 3 });
  assert.deepEqual(parsePosition(" 2.5 "), { ok: true, value: 2.5 });
  assert.deepEqual(parsePosition("2,5"), { ok: true, value: 2.5 });
  assert.deepEqual(parsePosition(2.5000001), { ok: true, value: 2.5 });
  assert.deepEqual(parsePosition(""), { ok: true, value: null });
  assert.deepEqual(parsePosition(null), { ok: true, value: null });
  assert.equal(parsePosition("-1").ok, false);
  assert.equal(parsePosition("two").ok, false);
  assert.equal(parsePosition("1e3").ok, false);
  assert.equal(parsePosition("5000").ok, false);
});

test("a place held twice is flagged, a blank one never", () => {
  assert.deepEqual(duplicatePositions([{ position: 1 }, { position: 2 }, { position: 2 }, { position: null }, { position: null }]), [2]);
  assert.deepEqual(duplicatePositions([{ position: 1 }, { position: 1.5 }]), []);
});

test("spellings that differ by case, punctuation, a 'The' or a closing 'Series' are possibly the same series", () => {
  assert.equal(seriesLooseKey("The Stormlight Archive"), "stormlight archive");
  assert.equal(seriesLooseKey("Stormlight Archive, The"), "stormlight archive");
  assert.equal(seriesLooseKey("Stormlight Archive Series"), "stormlight archive");
  assert.equal(seriesLooseKey("Rivers & Roads"), seriesLooseKey("Rivers and Roads"));
  assert.deepEqual(possiblySameSeries("The Stormlight Archive", ["The Stormlight Archive", "stormlight archive", "Stormlight", "The Expanse"]), ["stormlight archive"]);
  assert.deepEqual(possiblySameSeries("The Expanse", ["The Expanse", "Expanse Novellas"]), []);
});

test("an edit is parsed whole, and refuses bad places, unknown ids and a book both in and out", () => {
  const ok = parseSeriesEdit({ name: " Mistborn ", entries: [{ workId: id(1), position: "1" }, { workId: id(2), position: "" }], removed: [id(3)], merge: ["Mistborn", "mistborn"] });
  assert.deepEqual(ok, { ok: true, edit: { name: "Mistborn", rename: "Mistborn", merge: ["mistborn"], entries: [{ workId: id(1), position: 1 }, { workId: id(2), position: null }], removed: [id(3)] } });
  assert.equal(parseSeriesEdit({ entries: [] }).ok, false);
  assert.equal(parseSeriesEdit({ name: "M", entries: [{ workId: "nope", position: 1 }] }).ok, false);
  assert.equal(parseSeriesEdit({ name: "M", entries: [{ workId: id(1), position: "x" }] }).ok, false);
  assert.equal(parseSeriesEdit({ name: "M", entries: [{ workId: id(1), position: 1 }, { workId: id(1), position: 2 }] }).ok, false);
  assert.equal(parseSeriesEdit({ name: "M", entries: [{ workId: id(1), position: 1 }], removed: [id(1)] }).ok, false);
});

const row = (n: number, seriesName: string | null, seriesPosition: number | null): SeriesRow => ({ id: id(n), seriesName, seriesPosition });
const edit = (extra: Partial<SeriesEdit>): SeriesEdit => ({ name: "Mistborn", rename: "Mistborn", merge: [], entries: [], removed: [], ...extra });

test("one save writes only what changed: renumbered, renamed, merged, added and taken out", () => {
  const rows = [
    row(1, "Mistborn", 1),
    row(2, "Mistborn", 2),
    // Another spelling, merged in.
    row(3, "mistborn", 3),
    // Taken out.
    row(4, "Mistborn", 4),
    // Added from another series.
    row(5, "Elantris", null),
    // Shelved since the editor loaded: keeps its place, takes the new name.
    row(6, "Mistborn", 7),
  ];
  const changes = seriesEditDiff(rows, edit({
    rename: "Mistborn Saga",
    merge: ["mistborn"],
    entries: [{ workId: id(1), position: 1 }, { workId: id(2), position: 2.5 }, { workId: id(3), position: 3 }, { workId: id(5), position: 5 }],
    removed: [id(4)],
  }));
  assert.deepEqual(changes, [
    { id: id(1), before: { seriesName: "Mistborn", seriesPosition: 1 }, after: { seriesName: "Mistborn Saga", seriesPosition: 1 } },
    { id: id(2), before: { seriesName: "Mistborn", seriesPosition: 2 }, after: { seriesName: "Mistborn Saga", seriesPosition: 2.5 } },
    { id: id(3), before: { seriesName: "mistborn", seriesPosition: 3 }, after: { seriesName: "Mistborn Saga", seriesPosition: 3 } },
    { id: id(4), before: { seriesName: "Mistborn", seriesPosition: 4 }, after: { seriesName: null, seriesPosition: null } },
    { id: id(5), before: { seriesName: "Elantris", seriesPosition: null }, after: { seriesName: "Mistborn Saga", seriesPosition: 5 } },
    { id: id(6), before: { seriesName: "Mistborn", seriesPosition: 7 }, after: { seriesName: "Mistborn Saga", seriesPosition: 7 } },
  ]);
});

test("renumbering without a rename touches only the books that moved", () => {
  const rows = [row(1, "Mistborn", 1), row(2, "Mistborn", 3), row(3, "Mistborn", 2)];
  const changes = seriesEditDiff(rows, edit({ entries: [{ workId: id(1), position: 1 }, { workId: id(3), position: 2 }, { workId: id(2), position: 2.5 }] }));
  assert.deepEqual(changes.map((c) => [c.id, c.after.seriesPosition]), [[id(2), 2.5]]);
});

test("taking out a book that has since moved to another series leaves it there", () => {
  assert.deepEqual(seriesEditDiff([row(1, "Elantris", 1)], edit({ removed: [id(1)] })), []);
});

test("a change needs a reason, trimmed and capped", () => {
  assert.equal(cleanReason("  "), "");
  assert.equal(cleanReason(undefined), "");
  assert.equal(cleanReason(" Typo "), "Typo");
  assert.equal(cleanReason("x".repeat(600)).length, 500);
});

test("follows move once per old key, and only when the series' name or first author really changes", () => {
  const moves = seriesKeyMoves([
    { before: { seriesName: "Mistborn", author: "Brandon Sanderson" }, after: { seriesName: "Mistborn Saga", author: "Brandon Sanderson" } },
    { before: { seriesName: "Mistborn", author: "Brandon Sanderson" }, after: { seriesName: "Mistborn Saga", author: "Brandon Sanderson" } },
    // Same key either way: case only.
    { before: { seriesName: "Elantris", author: "Brandon Sanderson" }, after: { seriesName: "elantris", author: "Brandon Sanderson" } },
    // Taken out of a series: nothing to move to.
    { before: { seriesName: "Warbreaker", author: "Brandon Sanderson" }, after: { seriesName: null, author: "Brandon Sanderson" } },
    // A new first author.
    { before: { seriesName: "Discworld", author: "Terry Pratchet" }, after: { seriesName: "Discworld", author: "Terry Pratchett" } },
  ]);
  assert.deepEqual(moves, [
    { from: seriesKey("Mistborn", "Brandon Sanderson"), was: "Mistborn", to: seriesKey("Mistborn Saga", "Brandon Sanderson"), name: "Mistborn Saga", author: "Brandon Sanderson" },
    { from: seriesKey("Discworld", "Terry Pratchet"), was: "Discworld", to: seriesKey("Discworld", "Terry Pratchett"), name: "Discworld", author: "Terry Pratchett" },
  ]);
});

test("undoing takes off only the curated marks the change added", () => {
  assert.deepEqual(uncurate(["title", "seriesName", "seriesPosition"], ["title"], ["seriesName", "seriesPosition"]), ["title"]);
  // Already curated before: stays.
  assert.deepEqual(uncurate(["seriesName", "seriesPosition"], ["seriesName"], ["seriesName", "seriesPosition"]), ["seriesName"]);
  // Marked since, by another fix: stays.
  assert.deepEqual(uncurate(["seriesName", "seriesPosition", "coverUrl"], [], ["seriesName", "seriesPosition"]), ["coverUrl"]);
});

const logged = {
  before: { name: "Mistborn", works: [{ id: id(1), seriesName: "Mistborn", seriesPosition: 1, curatedFields: [] }, { id: id(2), seriesName: "mistborn", seriesPosition: 2, curatedFields: ["seriesName"] }] },
  after: { name: "Mistborn Saga", works: [{ id: id(1), seriesName: "Mistborn Saga", seriesPosition: 1 }, { id: id(2), seriesName: "Mistborn Saga", seriesPosition: 2.5 }] },
};
const now = (n: number, seriesName: string | null, seriesPosition: number | null, curatedFields: string[] = ["seriesName", "seriesPosition"]) =>
  ({ id: id(n), title: `Book ${n}`, seriesName, seriesPosition, curatedFields });

test("a save is undone work by work when every book still has what it saved", () => {
  const log = parseSeriesLog(logged.before, logged.after)!;
  assert.deepEqual(seriesRevertPlan(log, [now(1, "Mistborn Saga", 1), now(2, "Mistborn Saga", 2.5)]), {
    ok: true,
    patches: [
      { id: id(1), data: { seriesName: "Mistborn", seriesPosition: 1, curatedFields: [] } },
      { id: id(2), data: { seriesName: "mistborn", seriesPosition: 2, curatedFields: ["seriesName"] } },
    ],
  });
});

test("an undo is refused, naming the books, when any has changed since or gone", () => {
  const log = parseSeriesLog(logged.before, logged.after)!;
  assert.deepEqual(seriesRevertPlan(log, [now(1, "Mistborn Saga", 1), now(2, "Mistborn Saga", 3)]), { ok: false, conflicts: ["Book 2"] });
  assert.deepEqual(seriesRevertPlan(log, [now(2, "Mistborn Saga", 2.5)]), { ok: false, conflicts: [GONE_TITLE] });
  assert.deepEqual(shownConflicts(Array.from({ length: 12 }, (_, i) => `T${i}`)).slice(-2), ["T9", "and 2 more"]);
});

test("a save logged before curated fields were leaves them alone when undone, and junk isn't a log", () => {
  const old = { works: logged.before.works.map((w) => ({ id: w.id, seriesName: w.seriesName, seriesPosition: w.seriesPosition })) };
  const plan = seriesRevertPlan(parseSeriesLog(old, logged.after)!, [now(1, "Mistborn Saga", 1), now(2, "Mistborn Saga", 2.5)]);
  assert.ok(plan.ok && plan.patches.every((p) => !("curatedFields" in p.data)));
  assert.equal(parseSeriesLog(null, logged.after), null);
  assert.equal(parseSeriesLog({ works: [{ id: id(1) }] }, logged.after), null);
});
