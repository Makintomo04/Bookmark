// Book pages: the rating summary, the order reviews are listed in, and book page addresses. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/workReviews.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReviews, summariseRatings } from "@/lib/workReviewRules";
import { bookHref, bookSlug, normaliseWorkKey } from "@/lib/workKey";
import { genresFromSubjects } from "@/lib/import/genre";

test("nobody's rated it: no summary", () => {
  assert.equal(summariseRatings([]), null);
  assert.equal(summariseRatings([{ userId: "a", rating: null }, { userId: "b", rating: 0 }]), null);
});

test("one rating per reader, the newest, averaged to one decimal place", () => {
  const summary = summariseRatings([
    { userId: "a", rating: 5 },
    // An older copy of a's: ignored.
    { userId: "a", rating: 1 },
    { userId: "b", rating: 4 },
    { userId: "c", rating: 3.75 },
  ]);
  assert.equal(summary?.count, 3);
  assert.equal(summary?.average, 4.3);
});

test("quarter stars fall into the nearest whole star", () => {
  const summary = summariseRatings([
    { userId: "a", rating: 4.75 },
    { userId: "b", rating: 4.25 },
    { userId: "c", rating: 0.25 },
    { userId: "d", rating: 2.5 },
  ]);
  assert.deepEqual(summary?.stars, [1, 0, 1, 1, 1]);
});

test("reviews: the viewer's own, then people they follow, then newest", () => {
  const at = (day: number) => new Date(2026, 0, day);
  const reviews = [
    { userId: "stranger-old", at: at(1) },
    { userId: "friend-old", at: at(2) },
    { userId: "stranger-new", at: at(9) },
    { userId: "me", at: at(3) },
    { userId: "friend-new", at: at(8) },
  ];
  assert.deepEqual(
    orderReviews(reviews, "me", new Set(["friend-old", "friend-new"])).map((r) => r.userId),
    ["me", "friend-new", "friend-old", "stranger-new", "stranger-old"],
  );
  // Signed out: newest first.
  assert.deepEqual(orderReviews(reviews, null, new Set()).map((r) => r.userId)[0], "stranger-new");
});

test("book page addresses lead with the work key, which is all that identifies the book", () => {
  assert.equal(bookSlug("OL29226517W", "Fourth Wing"), "OL29226517W-fourth-wing");
  assert.equal(bookHref({ workKey: "OL29226517W", title: "Fourth Wing" }), "/books/OL29226517W-fourth-wing");
  assert.equal(bookHref({ workKey: "/works/OL27482W", title: "The Hobbit, or There and Back Again" }), "/books/OL27482W-the-hobbit-or-there-and-back-again");
  assert.equal(bookSlug("OL1W", "Cién años de soledad"), "OL1W-cien-anos-de-soledad");
  assert.equal(bookSlug("OL1W", "!!!"), "OL1W");
  assert.equal(bookHref({ workKey: null, title: "A book added by hand" }), null);
  // The key comes back out of any slug, stale title or not.
  assert.equal(normaliseWorkKey("OL29226517W-old-title"), "OL29226517W");
});

test("a book page's genres come from its subjects, most specific first, in any language's noise", () => {
  assert.deepEqual(genresFromSubjects(["Fantasía", "ficciones", "Fantasy", "Romance", "Young adult fiction", "nyt:hardcover-fiction=2023-05-21"]), ["Fantasy", "Romance", "Young Adult"]);
  assert.deepEqual(genresFromSubjects([]), []);
});
