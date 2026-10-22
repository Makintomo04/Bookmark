// Reading progress in pages and in minutes listened: the one place every surface takes its percent from.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/progress.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertPosition, formatLength, formatMinutes, formatPosition, formatStoppedAt, progressPercent, progressScale, unitOf,
} from "@/lib/progress";

const paper = { status: "STARTED", currentPage: 75, pages: 300, progressUnit: null, currentMinute: null, audioMinutes: null };
const audio = { status: "STARTED", currentPage: 0, pages: 0, progressUnit: "MINUTES" as const, currentMinute: 181, audioMinutes: 724 };

test("a book runs on minutes only when it says so and has a running time", () => {
  assert.equal(unitOf(paper), "PAGES");
  assert.equal(unitOf(audio), "MINUTES");
  assert.equal(unitOf({ ...audio, audioMinutes: null }), "PAGES");
  assert.equal(unitOf({ ...audio, progressUnit: null }), "PAGES");
  assert.equal(unitOf(null), "PAGES");
});

test("the scale is the book's own: page of pages, or minute of running time", () => {
  assert.deepEqual(progressScale(paper), { unit: "PAGES", current: 75, total: 300 });
  assert.deepEqual(progressScale(audio), { unit: "MINUTES", current: 181, total: 724 });
  // An audiobook with a print page count still runs on minutes.
  assert.deepEqual(progressScale({ ...audio, pages: 400, currentPage: 10 }), { unit: "MINUTES", current: 181, total: 724 });
  // Clamped to the total; no total means nothing to clamp against.
  assert.deepEqual(progressScale({ ...audio, currentMinute: 900 }), { unit: "MINUTES", current: 724, total: 724 });
  assert.deepEqual(progressScale({ status: "STARTED", currentPage: 20, pages: 0 }), { unit: "PAGES", current: 20, total: 0 });
});

test("percent is the same maths in both units", () => {
  assert.equal(progressPercent(paper), 25);
  assert.equal(progressPercent(audio), 25);
  assert.equal(progressPercent({ ...audio, currentMinute: 0 }), 0);
  assert.equal(progressPercent({ ...audio, status: "COMPLETED", currentMinute: 3 }), 100);
  assert.equal(progressPercent({ ...audio, audioMinutes: 0 }), 0);
  // One decimal place.
  assert.equal(progressPercent({ ...audio, currentMinute: 100 }), 13.8);
});

test("durations and positions read as hours and minutes", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(724), "12h 4m");
  assert.equal(formatPosition(paper), "Page 75 of 300");
  assert.equal(formatPosition(paper, { paused: true }), "Paused on page 75 of 300");
  assert.equal(formatPosition(audio), "3h 1m of 12h 4m");
  assert.equal(formatStoppedAt({ ...audio, status: "DNF" }), "Stopped at 3h 1m");
  assert.equal(formatStoppedAt({ ...paper, status: "DNF" }), "Stopped at page 75");
  assert.equal(formatLength(audio), "12h 4m");
  assert.equal(formatLength(paper), "300 pages");
  assert.equal(formatLength({ pages: 0, progressUnit: null, audioMinutes: null }), null);
});

test("switching unit keeps the reader's place as a percent", () => {
  assert.equal(convertPosition(75, 300, 724), 181);
  assert.equal(convertPosition(181, 724, 300), 75);
  assert.equal(convertPosition(50, 0, 300), 0);
  assert.equal(convertPosition(400, 300, 100), 100);
});
