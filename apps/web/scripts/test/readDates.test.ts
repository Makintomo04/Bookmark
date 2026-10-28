// Read dates the reader picks, and keeping a book's own fields in step with its read history.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/readDates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookFieldsFromReads, dayInputSchema, readCreatedAt, readOrder, reshelvedFields } from "@/lib/readHistory";
import { cleanTags, tagsFromShelves } from "@/lib/shelfTags";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
const read = (status: "COMPLETED" | "DNF" | "STARTED", started: string | null, finished: string | null, created: string, rating: number | null = null) =>
  ({ status, startedAt: started ? d(started) : null, finishedAt: finished ? d(finished) : null, rating, createdAt: d(created) });

test("a picked day is stored at noon UTC, and future or malformed days are refused", () => {
  assert.equal(dayInputSchema.parse("2024-03-01").toISOString(), "2024-03-01T12:00:00.000Z");
  assert.equal(dayInputSchema.safeParse("2999-01-01").success, false);
  assert.equal(dayInputSchema.safeParse("1 March 2024").success, false);
  assert.equal(dayInputSchema.safeParse("1850-01-01").success, false);
});

test("reads are ordered by their dates, undated first and the open read last", () => {
  const reads = [
    read("STARTED", "2026-10-01", null, "2026-10-01"),
    read("COMPLETED", "2019-05-01", "2019-06-01", "2026-10-20"),
    read("COMPLETED", null, null, "2026-10-21"),
  ];
  assert.deepEqual(readOrder(reads).map((r) => r.status + (r.startedAt?.getUTCFullYear() ?? "")), ["COMPLETED", "COMPLETED2019", "STARTED2026"]);
});

test("a past read slots in at its dates, never after the read in progress", () => {
  const open = read("STARTED", "2026-10-01", null, "2026-10-01");
  assert.equal(readCreatedAt({ startedAt: d("2019-05-01"), finishedAt: null }, [open]).toISOString(), "2019-05-01T12:00:00.000Z");
  assert.ok(readCreatedAt({ startedAt: null, finishedAt: d("2026-10-20") }, [open]) < open.createdAt);
  assert.ok(readCreatedAt({ startedAt: null, finishedAt: null }, [open]) < open.createdAt);
});

test("the book follows its reads: count, last finish, and the dates and rating of the shelf's read", () => {
  const reads = [
    read("COMPLETED", "2019-05-01", "2019-06-01", "2019-05-01", 3),
    read("COMPLETED", "2024-01-02", "2024-01-20", "2024-01-02", 4.5),
  ];
  assert.deepEqual(bookFieldsFromReads({ status: "COMPLETED", rating: 4.5 }, reads), {
    timesRead: 2, completedAt: d("2024-01-20"), startedAt: d("2024-01-02"), rating: 4.5,
  });
  // Re-reading: the last finish stays, the open read's start is the book's.
  const rereading = [...reads, read("STARTED", "2026-10-01", null, "2026-10-01")];
  assert.deepEqual(bookFieldsFromReads({ status: "STARTED", rating: 4.5 }, rereading), {
    timesRead: 2, completedAt: d("2024-01-20"), startedAt: d("2026-10-01"),
  });
  // A read from before per-read ratings keeps the book's own.
  assert.equal(bookFieldsFromReads({ status: "COMPLETED", rating: 4 }, [read("COMPLETED", null, null, "2020-01-01")]).rating, 4);
});

test("moving to Finished takes the picked dates, and falls back to finished-this-year", () => {
  const now = d("2026-10-27");
  const wantToRead = { status: "NOT_STARTED" as const, pages: 320, completedAt: null, timesRead: 0, progressUnit: null, audioMinutes: null, currentMinute: null };
  const opts = { now, finishedThisYear: false, rating: undefined, earlierRating: null };
  const picked = reshelvedFields(wantToRead, "COMPLETED", { ...opts, finishedAt: d("2025-02-14"), startedAt: d("2025-02-01") });
  assert.equal(picked.completedAt?.toISOString(), d("2025-02-14").toISOString());
  assert.equal(picked.startedAt?.toISOString(), d("2025-02-01").toISOString());
  assert.equal(reshelvedFields(wantToRead, "COMPLETED", { ...opts, finishedAt: null }).completedAt, null);
  assert.equal(reshelvedFields(wantToRead, "COMPLETED", { ...opts, finishedThisYear: true }).completedAt, now);
});

test("tags: cleaned, de-duplicated ignoring case, and status shelves left out on import", () => {
  assert.deepEqual(cleanTags(["  owned ", "Owned", "", "book   club"]), ["owned", "book club"]);
  assert.deepEqual(tagsFromShelves(["read", "to-read", "owned", "kindle", "dnf", "favorites", "book-club-2023"], [/^dnf$/i]), ["owned", "kindle", "book-club-2023"]);
});
