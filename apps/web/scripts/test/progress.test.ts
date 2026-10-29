// Reading progress in pages and in minutes listened: the one place every surface takes its percent from.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/progress.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertPosition, entersPercent, formatLength, formatMinutes, formatPosition, formatStoppedAt, lengthSnapshot, percentToPosition, progressPercent,
  progressScale, readLength, readLengthsAfterEdit, unitOf,
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

// ---- A read's own length ---------------------------------------------------------------------

const hardback = { pages: 320, progressUnit: "PAGES" as const, audioMinutes: null };
const listen = { pages: 320, progressUnit: "MINUTES" as const, audioMinutes: 600 };

test("a finish counts pages or minutes, never both", () => {
  assert.deepEqual(readLength({}, hardback), { pages: 320, minutes: 0 });
  assert.deepEqual(readLength({}, listen), { pages: 0, minutes: 600 });
  // A stamped read keeps its own format whatever the book is now.
  assert.deepEqual(readLength(lengthSnapshot(hardback), listen), { pages: 320, minutes: 0 });
  assert.deepEqual(readLength(lengthSnapshot(listen), hardback), { pages: 0, minutes: 600 });
  // An unstamped read (ended before reads kept a length) follows the book.
  assert.deepEqual(readLength({ pages: null, progressUnit: null, audioMinutes: null }, listen), { pages: 0, minutes: 600 });
});

test("switching format freezes earlier reads as they were read", () => {
  const reads = [
    { id: "unstamped", pages: null, progressUnit: null, audioMinutes: null },
    { id: "stamped", ...lengthSnapshot(hardback) },
  ];
  // Print to audio: both earlier reads were print, and stay print.
  assert.deepEqual(readLengthsAfterEdit(reads, hardback, listen), [{ id: "unstamped", data: lengthSnapshot(hardback) }]);
});

test("fixing a length reaches reads of the same edition only", () => {
  const reads = [
    { id: "this-edition", ...lengthSnapshot(hardback) },
    { id: "unstamped", pages: null, progressUnit: null, audioMinutes: null },
    { id: "the-listen", ...lengthSnapshot(listen) },
    { id: "a-paperback", pages: 280, progressUnit: "PAGES" as const, audioMinutes: null },
  ];
  const fixed = { ...hardback, pages: 352 };
  assert.deepEqual(readLengthsAfterEdit(reads, hardback, fixed).map((u) => u.id), ["this-edition", "unstamped"]);
  assert.deepEqual(readLengthsAfterEdit(reads, hardback, fixed)[0].data, lengthSnapshot(fixed));
  // Nothing changed, nothing written.
  assert.deepEqual(readLengthsAfterEdit([{ id: "this-edition", ...lengthSnapshot(hardback) }], hardback, hardback), []);
});

// ---- Logging in percent (Kindle) --------------------------------------------------------------

const kindle = { status: "STARTED", currentPage: 0, pages: 0, progressUnit: null, currentMinute: null, audioMinutes: null, currentPercent: 25 };

test("a typed percent wins over current/total", () => {
  assert.equal(progressPercent(kindle), 25);
  // 37% of a 50-page book is page 19, which on its own would read as 38%.
  assert.equal(progressPercent({ ...paper, pages: 50, currentPage: 19, currentPercent: 37 }), 37);
  assert.equal(progressPercent({ ...kindle, currentPercent: 37.25 }), 37.3);
  // No percent and no length is still 0.
  assert.equal(progressPercent({ ...kindle, currentPercent: null }), 0);
  assert.equal(progressPercent({ ...paper, currentPercent: null }), 25);
  // Finished is 100 whatever was typed.
  assert.equal(progressPercent({ ...kindle, status: "COMPLETED" }), 100);
  assert.equal(progressPercent({ ...kindle, status: "COMPLETED", currentPercent: 97 }), 100);
});

test("a percent becomes the matching page, rounded and kept within the book", () => {
  assert.equal(percentToPosition(37, 300), 111);
  assert.equal(percentToPosition(37, 50), 19);
  assert.equal(percentToPosition(25, 724), 181);
  assert.equal(percentToPosition(100, 300), 300);
  assert.equal(percentToPosition(140, 300), 300);
  assert.equal(percentToPosition(-5, 300), 0);
  assert.equal(percentToPosition(40, 0), 0);
  assert.equal(percentToPosition(NaN, 300), 0);
});

test("the update form opens in percent for a book with no length, or when the reader chose it", () => {
  assert.equal(entersPercent(kindle), true);
  assert.equal(entersPercent({ ...kindle, currentPercent: null }), true);
  assert.equal(entersPercent(paper), false);
  assert.equal(entersPercent({ ...paper, logsPercent: true }), true);
  assert.equal(entersPercent({ ...paper, logsPercent: false }), false);
  // An audiobook with a running time can be logged either way too.
  assert.equal(entersPercent(audio), false);
  assert.equal(entersPercent({ ...audio, logsPercent: true }), true);
  assert.equal(entersPercent(null), false);
});

test("a place logged in percent reads as one", () => {
  assert.equal(formatPosition(kindle), "25%");
  assert.equal(formatPosition(kindle, { paused: true }), "Paused at 25%");
  assert.equal(formatPosition({ ...paper, currentPage: 111, currentPercent: 37 }), "37% · page 111 of 300");
  assert.equal(formatPosition({ ...audio, currentPercent: 25 }), "25% · 3h 1m of 12h 4m");
  // Cards that show the percent beside it get the page, or say there's no count.
  assert.equal(formatPosition({ ...paper, currentPage: 111, currentPercent: 37 }, { percent: false }), "Page 111 of 300");
  assert.equal(formatPosition(kindle, { percent: false }), "No page count");
  assert.equal(formatPosition({ ...kindle, currentPercent: null }), "0%");
  assert.equal(formatPosition({ ...kindle, currentPercent: null }, { percent: false }), "No page count");
  // A place logged in pages reads as before.
  assert.equal(formatPosition({ ...paper, currentPercent: null }), "Page 75 of 300");
  assert.equal(formatStoppedAt({ ...kindle, status: "DNF", currentPercent: 42 }), "Stopped at 42%");
  assert.equal(formatStoppedAt({ ...paper, status: "DNF", currentPercent: 25 }), "Stopped at page 75");
});

test("adding a page count later stamps a percent-only finish, so pages read catch up", () => {
  const noCount = { pages: 0, progressUnit: null, audioMinutes: null };
  const counted = { pages: 320, progressUnit: null, audioMinutes: null };
  const finish = { id: "kindle-finish", ...lengthSnapshot(noCount) };
  assert.deepEqual(readLength(finish, noCount), { pages: 0, minutes: 0 });
  const stamps = readLengthsAfterEdit([finish], noCount, counted);
  assert.deepEqual(stamps, [{ id: "kindle-finish", data: lengthSnapshot(counted) }]);
  assert.deepEqual(readLength(stamps[0].data, counted), { pages: 320, minutes: 0 });
});

// ---- Chapters and Kindle locations: ways of entering a place, stored as a percent ----------------

test("a book logs in chapters or locations only with their totals", async () => {
  const { entryOf } = await import("@/lib/progress");
  assert.equal(entryOf({ ...paper, logsIn: "CHAPTERS", chapters: 14 }), "CHAPTERS");
  assert.equal(entryOf({ ...paper, logsIn: "CHAPTERS", chapters: null }), "PAGES");
  assert.equal(entryOf({ ...paper, logsIn: "LOCATION", locations: 5120 }), "LOCATION");
  assert.equal(entryOf({ ...paper, logsPercent: true }), "PERCENT");
  assert.equal(entryOf(paper), "PAGES");
});

test("chapter N means chapter N has begun, and a percent falls in a chapter", async () => {
  const { chapterAt, chapterPercent, locationPercent } = await import("@/lib/progress");
  assert.equal(chapterPercent(1, 14), 0);
  assert.equal(chapterPercent(9, 14), 57.1);
  assert.equal(chapterPercent(20, 14), 92.9);
  assert.equal(chapterAt(0, 14), 1);
  assert.equal(chapterAt(57.1, 14), 8);
  assert.equal(chapterAt(57.2, 14), 9);
  assert.equal(chapterAt(100, 14), 14);
  assert.equal(chapterAt(50, 0), 0);
  assert.equal(locationPercent(2310, 5120), 45.1);
});

test("a place logged in chapters or locations is said that way", async () => {
  const { formatEntry } = await import("@/lib/progress");
  assert.equal(formatEntry({ ...paper, logsIn: "CHAPTERS", chapters: 14, currentChapter: 9 }), "Ch 9 of 14");
  assert.equal(formatEntry({ ...paper, logsIn: "LOCATION", locations: 5120, currentLocation: 2310 }), "Loc 2,310 of 5,120");
  assert.equal(formatEntry(paper), null);
  assert.equal(formatEntry({ ...paper, status: "COMPLETED", logsIn: "CHAPTERS", chapters: 14, currentChapter: 9 }), null);
});
