// Someone else's profile as its page carries it: previews of each shelf and of their reviews, with the counts.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/profilePreview.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE_REVIEWS, PROFILE_SHELF_PREVIEW, profilePreview } from "@/lib/profilePreview";
import type { PublicProfileData } from "@/lib/publicProfile";

type Book = PublicProfileData["books"][number];
const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000);
let next = 0;
const book = (over: Partial<Book>): Book => ({
  id: `b${next++}`, title: `Book ${next}`, author: "Anon", coverImage: "", cardColour: null, status: "COMPLETED", genre: null,
  rating: null, timesRead: 0, pages: 300, currentPage: 0, progressUnit: null, audioMinutes: null, currentMinute: null,
  chapters: null, currentChapter: null, logsIn: null, createdAt: day(0), startedAt: null, completedAt: null, workKey: null,
  pageWorkId: null, isPrivate: false, review: null, reviewSpoiler: false, reviewHidden: false, reviewRemoved: false, ...over,
} as Book);
const profile = (books: Book[]) => ({ username: "ada", books } as unknown as PublicProfileData);

test("keeps the newest of each shelf and of the reviews, and counts every book", () => {
  const finished = Array.from({ length: 300 }, (_, i) => book({ completedAt: day(i), review: i % 2 ? `Review ${i}` : null }));
  const want = Array.from({ length: 100 }, (_, i) => book({ status: "NOT_STARTED", createdAt: day(i) }));
  const reading = [book({ status: "STARTED", startedAt: day(400) }), book({ status: "STARTED", startedAt: day(401), timesRead: 1 })];
  const preview = profilePreview(profile([...finished, ...want, ...reading]));

  assert.deepEqual(preview.shelfCounts, { finished: 300, want: 100 });
  // The re-read in progress counts as read, as the full profile says.
  assert.equal(preview.booksRead, 301);
  assert.equal(preview.reviewCount, 150);
  const on = (status: string) => preview.books.filter((b) => b.status === status);
  assert.equal(on("STARTED").length, 2);
  assert.equal(on("NOT_STARTED").length, PROFILE_SHELF_PREVIEW);
  assert.ok(on("NOT_STARTED").every((b) => b.createdAt >= day(100 - PROFILE_SHELF_PREVIEW)));
  // The newest finishes, and the newest reviews with their text; review text nowhere else.
  const withText = preview.books.filter((b) => b.review);
  assert.equal(withText.length, PROFILE_REVIEWS);
  assert.deepEqual(withText.map((b) => b.review).sort().reverse(), ["Review 299", "Review 297", "Review 295", "Review 293", "Review 291"]);
  assert.equal(on("COMPLETED").length, PROFILE_SHELF_PREVIEW);
});

test("brings an older finished copy of a book they're reading again, so it still shows as a re-read", () => {
  const old = book({ title: "Dune", author: "Frank Herbert", completedAt: day(0) });
  const newer = Array.from({ length: 40 }, (_, i) => book({ completedAt: day(10 + i) }));
  const again = book({ title: "dune ", author: "Frank Herbert", status: "STARTED", startedAt: day(100) });
  const preview = profilePreview(profile([old, ...newer, again]));
  assert.ok(preview.books.some((b) => b.id === old.id));
});

test("a small profile comes through whole", () => {
  const books = [book({ completedAt: day(1), review: "Loved it" }), book({ status: "NOT_STARTED" })];
  const preview = profilePreview(profile(books));
  assert.equal(preview.books.length, 2);
  assert.equal(preview.books[0].review, "Loved it");
});
