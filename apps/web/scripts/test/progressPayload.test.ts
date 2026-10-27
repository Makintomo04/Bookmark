// What a POST /api/book-progress body does to the reader's place, logged as a page, a minute or a percent.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/progressPayload.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { positionFromBody } from "@/lib/progressPayload";

const paper = { status: "STARTED", currentPage: 75, pages: 300, progressUnit: null, currentMinute: null, audioMinutes: null };
const audio = { status: "STARTED", currentPage: 0, pages: 0, progressUnit: "MINUTES" as const, currentMinute: 181, audioMinutes: 724 };
const kindle = { status: "STARTED", currentPage: 0, pages: 0, progressUnit: null, currentMinute: null, audioMinutes: null, currentPercent: 10 };

test("a percent stores the matching page beside it", () => {
  assert.deepEqual(positionFromBody(paper, { currentPercent: 37 }), { position: 111, percent: 37 });
  assert.deepEqual(positionFromBody(audio, { currentPercent: 25 }), { position: 181, percent: 25 });
  // It wins over a page sent with it.
  assert.deepEqual(positionFromBody(paper, { currentPercent: 37, currentPage: 5 }), { position: 111, percent: 37 });
});

test("a book with no page count keeps page 0 and the percent carries the place", () => {
  assert.deepEqual(positionFromBody(kindle, { currentPercent: 25 }), { position: 0, percent: 25 });
  assert.deepEqual(positionFromBody(kindle, { currentPercent: 100 }), { position: 0, percent: 100 });
});

test("a page or minute clears the percent, so an old client stays correct", () => {
  assert.deepEqual(positionFromBody({ ...paper, currentPercent: 37 }, { currentPage: 150 }), { position: 150, percent: null });
  assert.deepEqual(positionFromBody(paper, { pagesUpdate: "25" }), { position: 100, percent: null });
  assert.deepEqual(positionFromBody(paper, { currentPage: 900 }), { position: 300, percent: null });
  assert.deepEqual(positionFromBody(audio, { currentMinute: 200, currentPage: 3 }), { position: 200, percent: null });
  assert.deepEqual(positionFromBody(audio, { minutesUpdate: 30 }), { position: 211, percent: null });
});

test("a body that doesn't move the reader has no position", () => {
  assert.deepEqual(positionFromBody(paper, {}), { position: undefined, percent: null });
  // An audiobook ignores a page sent by a client that only knows pages.
  assert.deepEqual(positionFromBody(audio, { currentPage: 50 }), { position: undefined, percent: null });
});
