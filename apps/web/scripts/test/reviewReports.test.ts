// Reporting reviews (BOO-46): the reasons readers pick, what a hidden review looks like to whom, what staff
// can do to a review, and the alert email. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/reviewReports.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANONYMOUS, privacyOf, visibleReview, type Relation } from "@/lib/privacyRules";
import { REVIEW_REPORT_NOTE_MAX, REVIEW_REPORT_REASONS, reviewHiddenMessage, reviewReportSchema } from "@/lib/reviewReports";
import { actionAllowed } from "@/lib/staffReportRules";
import { reportAlertMessage } from "@/lib/reportAlerts";
import { pushContentFor, pushGroupOf } from "@bookmark/shared/push";

const SELF: Relation = { isSelf: true, isFollower: false, blocked: null };
const FOLLOWER: Relation = { isSelf: false, isFollower: true, blocked: null };
const PUBLIC = privacyOf({});
const REVIEW = { review: "Loved every page.", reviewSpoiler: false, reviewPrivate: false };

test("a report needs one of the fixed reasons, and a short note at most", () => {
  assert.ok(reviewReportSchema.safeParse({ reason: REVIEW_REPORT_REASONS[0] }).success);
  assert.ok(reviewReportSchema.safeParse({ reason: "Spoilers not marked", note: "Chapter 30 twist" }).success);
  assert.ok(!reviewReportSchema.safeParse({ reason: "I disagree" }).success);
  assert.ok(!reviewReportSchema.safeParse({}).success);
  assert.ok(!reviewReportSchema.safeParse({ reason: "Something else", note: "x".repeat(REVIEW_REPORT_NOTE_MAX + 1) }).success);
});

test("a review staff hid is the reviewer's alone, and they're told why", () => {
  const hidden = { ...REVIEW, reviewHiddenAt: new Date() };
  assert.deepEqual(visibleReview(hidden, SELF, PUBLIC), { review: REVIEW.review, reviewSpoiler: false, reviewHidden: true, reviewRemoved: true });
  assert.equal(visibleReview(hidden, FOLLOWER, PUBLIC).review, null);
  assert.equal(visibleReview(hidden, ANONYMOUS, PUBLIC).review, null);
  // An ISO string (a client's copy from the API) counts too.
  assert.equal(visibleReview({ ...REVIEW, reviewHiddenAt: new Date().toISOString() }, ANONYMOUS, PUBLIC).review, null);
});

test("a review nobody hid reads as before, and never says it was removed", () => {
  assert.deepEqual(visibleReview(REVIEW, FOLLOWER, PUBLIC), { review: REVIEW.review, reviewSpoiler: false, reviewHidden: false, reviewRemoved: false });
  assert.equal(visibleReview({ ...REVIEW, reviewHiddenAt: null }, ANONYMOUS, PUBLIC).review, REVIEW.review);
  assert.equal(visibleReview(REVIEW, SELF, PUBLIC).reviewRemoved, false);
});

test("hiding a review's rating is for reviews only; marking fixed is for books only", () => {
  assert.equal(actionAllowed("review", "hide"), true);
  assert.equal(actionAllowed("review", "hide_rating"), true);
  assert.equal(actionAllowed("review", "resolve"), false);
  assert.equal(actionAllowed("list", "hide_rating"), false);
  assert.equal(actionAllowed("comment", "hide_rating"), false);
  assert.equal(actionAllowed("book", "hide_rating"), false);
});

test("the report email says it's a review", () => {
  const message = reportAlertMessage({ kind: "review", id: "6560f1c2a1b2c3d4e5f6dddd", reason: "Abusive or harassing", reporterId: "r", authorId: "a", excerpt: "Rude words", path: "/books/OL1W-dune#reviews-heading" });
  assert.match(message.text, /^A reader reported a review\./);
  assert.match(message.subject, /review: Abusive or harassing/);
  assert.match(message.text, /\/books\/OL1W-dune#reviews-heading/);
});

test("the reviewer's notice names the book but nobody involved, and its push never quotes the review", () => {
  assert.match(reviewHiddenMessage("Dune"), /your review of Dune/);
  assert.match(reviewHiddenMessage(null), /your review of a book/);
  assert.equal(pushGroupOf("REVIEW_HIDDEN"), "account");
  const push = pushContentFor({ type: "REVIEW_HIDDEN", actorUsername: "ana", bookTitle: "Dune", buddyReadId: null, count: null })!;
  assert.ok(!push.body.includes("ana"));
  assert.match(push.body, /Dune/);
});
