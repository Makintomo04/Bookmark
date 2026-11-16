// Offline shelves (BOO-105): the waiting progress queue, the saved copy's limits and how a late update is dated.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/offlineShelf.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOGGED_AT_MAX_AGE_MS, isSavedKey, isStaleProgress, progressMoment, pruneSaved, queueProgress, withQueuedPlace, type SavedEntry,
} from "@bookmark/shared/offlineShelf";

const at = (iso: string) => ({ bookId: "", place: {}, loggedAt: iso });

test("one waiting update per book; the newest place wins and moves to the back", () => {
  let queue = queueProgress([], { ...at("2026-11-16T08:00:00Z"), bookId: "a", place: { currentPage: 40 } });
  queue = queueProgress(queue, { ...at("2026-11-16T08:05:00Z"), bookId: "b", place: { currentPage: 10 } });
  queue = queueProgress(queue, { ...at("2026-11-16T08:10:00Z"), bookId: "a", place: { currentPage: 55 } });
  assert.deepEqual(queue.map((q) => [q.bookId, q.place.currentPage]), [["b", 10], ["a", 55]]);
});

test("a waiting page shows on the book and clears a logged percent", () => {
  const book = { currentPage: 10, currentMinute: null, currentPercent: 12, logsPercent: true };
  assert.deepEqual(withQueuedPlace(book, { currentPage: 140, logsPercent: false }), { currentPage: 140, currentMinute: null, currentPercent: null, logsPercent: false });
});

test("a waiting percent wins over the page and leaves it alone", () => {
  const book = { currentPage: 10, currentPercent: null };
  assert.deepEqual(withQueuedPlace(book, { currentPercent: 37, logsPercent: true }), { currentPage: 10, currentPercent: 37, logsPercent: true });
});

test("a waiting minute moves an audiobook", () => {
  assert.deepEqual(withQueuedPlace({ currentMinute: 30, currentPercent: 5 }, { currentMinute: 95 }), { currentMinute: 95, currentPercent: null });
});

test("only the shelf screens' answers are kept, and a searched shelf isn't", () => {
  assert.ok(isSavedKey("/api/user"));
  assert.ok(isSavedKey("/api/books?shelves=20"));
  assert.ok(isSavedKey("/api/reading-goal/summary?year=2026"));
  assert.ok(isSavedKey("/api/books/abc123"));
  assert.ok(isSavedKey("/api/books/abc123/reads"));
  assert.ok(isSavedKey("/api/books?shelf=finished&take=60&facets=1"));
  assert.ok(!isSavedKey("/api/books?shelf=finished&take=60&cursor=x"));
  assert.ok(isSavedKey("/api/books?shelf=want&sort=title&take=60&facets=1"));
  assert.ok(!isSavedKey("/api/books?q=dune&take=60&facets=1"));
  assert.ok(!isSavedKey("/api/books?shelf=finished&year=2025&take=60&facets=1"));
  assert.ok(!isSavedKey("/api/books"));
  assert.ok(!isSavedKey("/api/notifications"));
});

test("the saved copy keeps the most recently opened books, a page and its reads together", () => {
  const entries: Record<string, SavedEntry> = {
    "/api/user": { data: 1, savedAt: 1 },
    "/api/books/old": { data: 1, savedAt: 10 },
    "/api/books/old/reads": { data: 1, savedAt: 11 },
    "/api/books/mid": { data: 1, savedAt: 20 },
    "/api/books/new": { data: 1, savedAt: 30 },
    "/api/books/new/reads": { data: 1, savedAt: 5 },
    "/api/notifications": { data: 1, savedAt: 40 },
  };
  assert.deepEqual(Object.keys(pruneSaved(entries, 2)).sort(), ["/api/books/mid", "/api/books/new", "/api/books/new/reads", "/api/user"]);
});

test("a late update counts on the day it was logged, up to a week back", () => {
  const now = new Date("2026-11-16T09:00:00Z");
  const yesterday = new Date("2026-11-15T21:30:00Z");
  assert.deepEqual(progressMoment(yesterday, now), { at: yesterday, readingDay: true });
  assert.deepEqual(progressMoment(undefined, now), { at: now, readingDay: true });
  // A phone clock running ahead is now.
  assert.deepEqual(progressMoment(new Date("2026-11-16T09:10:00Z"), now), { at: now, readingDay: true });
  // Older than a week: the place is saved now, without a reading day.
  assert.deepEqual(progressMoment(new Date(now.getTime() - LOGGED_AT_MAX_AGE_MS - 1), now), { at: now, readingDay: false });
});

test("an update older than the book's last progress is stale", () => {
  const logged = new Date("2026-11-15T21:30:00Z");
  assert.equal(isStaleProgress(logged, new Date("2026-11-16T07:00:00Z")), true);
  assert.equal(isStaleProgress(logged, new Date("2026-11-15T20:00:00Z")), false);
  assert.equal(isStaleProgress(logged, null), false);
  assert.equal(isStaleProgress(undefined, new Date()), false);
});
