// Re-filing a book that went on the wrong shelf: it ends up as if it had been added to the right one.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/reshelve.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFromBook, reshelvedFields } from "@/lib/readHistory";

const now = new Date("2026-10-26T12:00:00Z");
const earlier = new Date("2024-03-01T12:00:00Z");
const opts = { now, finishedThisYear: false, rating: undefined, earlierRating: null };
const wantToRead = { status: "NOT_STARTED" as const, pages: 320, completedAt: null, timesRead: 0, progressUnit: null, audioMinutes: null, currentMinute: null };

test("Want to read to Finished is an undated past read unless finished this year", () => {
  const past = reshelvedFields(wantToRead, "COMPLETED", { ...opts, rating: 4.5 });
  assert.equal(past.status, "COMPLETED");
  assert.equal(past.completedAt, null);
  assert.equal(past.currentPage, 320);
  assert.equal(past.timesRead, 1);
  assert.equal(past.rating, 4.5);
  assert.equal(reshelvedFields(wantToRead, "COMPLETED", { ...opts, finishedThisYear: true }).completedAt, now);
});

test("undoing a mistaken Finished takes the read back off the count", () => {
  const finished = { ...wantToRead, status: "COMPLETED" as const, completedAt: now, timesRead: 1 };
  const back = reshelvedFields(finished, "NOT_STARTED", opts);
  assert.equal(back.timesRead, 0);
  assert.equal(back.currentPage, 0);
  assert.equal(back.rating, null);
  // A book read before keeps that read's count and rating.
  const reread = reshelvedFields({ ...finished, timesRead: 2 }, "NOT_STARTED", { ...opts, earlierRating: 4 });
  assert.equal(reread.timesRead, 1);
  assert.equal(reread.rating, 4);
});

test("Finished to Did not finish keeps the count right and stops today", () => {
  const finished = { ...wantToRead, status: "COMPLETED" as const, completedAt: earlier, timesRead: 1 };
  const dnf = reshelvedFields(finished, "DNF", opts);
  assert.equal(dnf.timesRead, 0);
  assert.equal(dnf.stoppedAt, now);
  assert.equal(dnf.currentPage, 0);
});

test("Reading starts today at the beginning", () => {
  const reading = reshelvedFields(wantToRead, "STARTED", opts);
  assert.equal(reading.startedAt, now);
  assert.equal(reading.currentPage, 0);
  assert.equal(reading.rating, null);
});

test("an audiobook finishes at its running time", () => {
  const audio = { ...wantToRead, progressUnit: "MINUTES" as const, audioMinutes: 600, currentMinute: 0 };
  assert.equal(reshelvedFields(audio, "COMPLETED", opts).currentMinute, 600);
  assert.equal(reshelvedFields({ ...audio, status: "COMPLETED", currentMinute: 600, timesRead: 1 }, "NOT_STARTED", opts).currentMinute, 0);
});

test("the new shelf makes the read adding the book there would", () => {
  const book = { id: "b", userId: "u", startedAt: null, stoppedAt: null, rating: null, currentPage: 0, ...wantToRead };
  const read = readFromBook({ ...book, ...reshelvedFields(wantToRead, "COMPLETED", { ...opts, rating: 3 }) });
  assert.equal(read?.status, "COMPLETED");
  assert.equal(read?.finishedAt, null);
  assert.equal(read?.rating, 3);
  assert.equal(readFromBook({ ...book, ...reshelvedFields({ ...wantToRead, status: "COMPLETED", timesRead: 1 }, "NOT_STARTED", opts) }), null);
});
