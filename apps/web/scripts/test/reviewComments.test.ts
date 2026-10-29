// Who may comment on a review (packages/shared/src/privacyRules.ts canCommentOnReview): the reviewer's
// "anyone / friends / off" choice, on top of being able to read the review at all.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/reviewComments.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANONYMOUS, canCommentOnReview, privacyOf, type Relation } from "@bookmark/shared/privacyRules";
import { pushContentFor } from "@bookmark/shared/push";

const self: Relation = { isSelf: true, isFollower: false, blocked: null };
const follower: Relation = { isSelf: false, isFollower: true, blocked: null };
const blocked: Relation = { isSelf: false, isFollower: true, blocked: "byOwner" };
const owner = (reviewComments?: "EVERYONE" | "FRIENDS" | "OFF") => privacyOf({ reviewComments });

test("unset reads as anyone who can read the review", () => {
  assert.equal(privacyOf({}).reviewComments, "EVERYONE");
  assert.equal(canCommentOnReview(ANONYMOUS, owner(), false), true);
});

test("friends only needs a mutual follow", () => {
  assert.equal(canCommentOnReview(follower, owner("FRIENDS"), false), false);
  assert.equal(canCommentOnReview(follower, owner("FRIENDS"), true), true);
  assert.equal(canCommentOnReview(self, owner("FRIENDS"), false), true);
});

test("off closes the thread to everyone, the reviewer included", () => {
  for (const relation of [self, follower, ANONYMOUS]) assert.equal(canCommentOnReview(relation, owner("OFF"), true), false);
});

test("a block ends it whatever the setting", () => {
  assert.equal(canCommentOnReview(blocked, owner("EVERYONE"), true), false);
});

test("a review comment push says who and where, never what", () => {
  const push = pushContentFor({ type: "REVIEW_COMMENT", actorUsername: "ana", bookTitle: "Dune", buddyReadId: null, count: null, message: "SECRET" })!;
  assert.ok(push.body.includes("@ana") && push.body.includes("Dune"));
  assert.ok(!JSON.stringify(push).includes("SECRET"));
});
