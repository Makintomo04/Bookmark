// The series tracker: which book is next, series order with novellas, and the three shelf groups. No
// database or network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/series.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrack, comparePositions, positionLabel, seriesKey, trackerGroups, type SeriesShelfBook, type SeriesWork } from "@/lib/series";

const SERIES = { name: "The Murderbot Diaries", author: "Martha Wells" };

const work = (id: string, position: number | null, extra: Partial<SeriesWork> = {}): SeriesWork => ({
  id, workKey: `OL${id}W`, title: `Book ${id}`, authors: ["Martha Wells"], coverUrl: null,
  seriesName: "The Murderbot Diaries", seriesPosition: position, ...extra,
});

const shelved = (workId: string, status: SeriesShelfBook["status"], activeAt = "2026-10-01T00:00:00.000Z"): SeriesShelfBook => ({
  bookId: `b-${workId}`, workId, status, timesRead: status === "COMPLETED" ? 1 : 0, coverImage: null, activeAt,
});

const WORKS = [work("3", 3), work("1", 1), work("2.5", 2.5), work("2", 2), work("4", 4)];

test("having read books 1 and 2, book 3 is next, with the 2.5 novella in order but not ahead of it", () => {
  const track = buildTrack(SERIES, WORKS, [shelved("1", "COMPLETED"), shelved("2", "COMPLETED")], false);
  assert.deepEqual(track.entries.map((e) => e.position), [1, 2, 2.5, 3, 4]);
  assert.equal(track.next?.workId, "3");
  assert.equal(track.readCount, 2);
  assert.equal(track.total, 5);
  assert.ok(track.started);
  assert.ok(!track.finished);
});

test("a skipped book comes up once the main books after the furthest read are done, a novella last", () => {
  const skipped = buildTrack(SERIES, WORKS, [shelved("1", "COMPLETED"), shelved("3", "COMPLETED")], false);
  assert.equal(skipped.next?.workId, "4");
  const allButTwo = buildTrack(SERIES, WORKS, ["1", "2.5", "3", "4"].map((id) => shelved(id, "COMPLETED")), false);
  assert.equal(allButTwo.next?.workId, "2");
  const novellaLeft = buildTrack(SERIES, WORKS, ["1", "2", "3", "4"].map((id) => shelved(id, "COMPLETED")), false);
  assert.equal(novellaLeft.next?.workId, "2.5");
  assert.ok(!novellaLeft.finished);
});

test("the book being read is next, and Will not read counts as done", () => {
  const reading = buildTrack(SERIES, WORKS, [shelved("1", "COMPLETED"), shelved("2", "STARTED")], false);
  assert.equal(reading.next?.workId, "2");
  assert.equal(reading.next?.status, "STARTED");

  const done = buildTrack(SERIES, WORKS, [...["1", "2", "3", "4"].map((id) => shelved(id, "COMPLETED")), shelved("2.5", "NOT_INTERESTED")], false);
  assert.equal(done.next, null);
  assert.ok(done.finished);
});

test("a book filed in its place before it's out is listed, but never next", () => {
  const works = [...WORKS, work("5", 5, { releaseDate: "2027-06-01" })];
  const caughtUp = buildTrack(SERIES, works, ["1", "2", "2.5", "3", "4"].map((id) => shelved(id, "COMPLETED")), false, "2026-10-31");
  assert.deepEqual(caughtUp.entries.map((e) => e.workId), ["1", "2", "2.5", "3", "4", "5"]);
  assert.equal(caughtUp.next, null);
  // Once it's out it's next.
  assert.equal(buildTrack(SERIES, works, ["1", "2", "2.5", "3", "4"].map((id) => shelved(id, "COMPLETED")), false, "2027-06-01").next?.workId, "5");
  // And it's never next ahead of a skipped book that is out.
  assert.equal(buildTrack(SERIES, works, ["1", "3", "4"].map((id) => shelved(id, "COMPLETED")), false, "2026-10-31").next?.workId, "2");
});

test("want to read alone doesn't start a series", () => {
  const track = buildTrack(SERIES, WORKS, [shelved("1", "NOT_STARTED")], true);
  assert.ok(!track.started);
  assert.equal(track.next?.workId, "1");
});

test("other series, and the same name by another author, stay out", () => {
  const works = [...WORKS, work("x", 5, { authors: ["Someone Else"] }), work("y", 6, { seriesName: "Other" })];
  const track = buildTrack(SERIES, works, [], false);
  assert.deepEqual(track.entries.map((e) => e.workId), ["1", "2", "2.5", "3", "4"]);
});

test("two works at one position keep the reader's copy", () => {
  const works = [work("1", 1), work("1b", 1, { workKey: null, coverUrl: "c.jpg" }), work("2", 2)];
  assert.equal(buildTrack(SERIES, works, [], false).entries[0].workId, "1");
  assert.equal(buildTrack(SERIES, works, [shelved("1b", "COMPLETED")], false).entries[0].workId, "1b");
});

test("groups: started, next up and not finished", () => {
  const finished = buildTrack({ name: "Done", author: "A" }, [work("d1", 1, { seriesName: "Done", authors: ["A"] })], [shelved("d1", "COMPLETED", "2026-09-01T00:00:00.000Z")], false);
  const going = buildTrack(SERIES, WORKS, [shelved("1", "COMPLETED", "2026-10-20T00:00:00.000Z")], false);
  const followed = buildTrack({ name: "New", author: "B" }, [work("n1", 1, { seriesName: "New", authors: ["B"] })], [], true);
  const groups = trackerGroups([finished, followed, going]);
  assert.deepEqual(groups.started.map((t) => t.name), ["The Murderbot Diaries", "Done"]);
  assert.deepEqual(groups.nextUp.map((t) => t.name), ["The Murderbot Diaries", "New"]);
  assert.deepEqual(groups.unfinished.map((t) => t.name), ["The Murderbot Diaries"]);
});

test("keys, order and labels", () => {
  assert.equal(seriesKey("The Stormlight Archive", "Sanderson, Brandon"), "the-stormlight-archive|brandon-sanderson");
  assert.equal(seriesKey("the stormlight  archive!", "Brandon Sanderson"), seriesKey("The Stormlight Archive", "Brandon Sanderson"));
  assert.deepEqual([3, null, 2.5, 1, 2].sort(comparePositions), [1, 2, 2.5, 3, null]);
  assert.equal(positionLabel(2.5), "Book 2.5");
  assert.equal(positionLabel(3), "Book 3");
  assert.equal(positionLabel(null), null);
});

test("a work with no key links to its page by id only from Hardcover or a librarian's approval", () => {
  const works = [
    work("1", 1, { workKey: null }),
    work("2", 2, { workKey: null, hardcoverId: "123" }),
    work("3", 3, { workKey: null, pageApproved: true }),
  ];
  const track = buildTrack(SERIES, works, [], false);
  assert.deepEqual(track.entries.map((e) => e.pageWorkId), [null, "2", "3"]);
});
