// Per-shelf privacy (BOO-92): Reading and Finished can be kept private like Want to read. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/shelfPrivacy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANONYMOUS, canView, privacyOf, visibleStatuses } from "@/lib/privacyRules";

const follower = { isSelf: false, isFollower: true, blocked: null };
const self = { isSelf: true, isFollower: false, blocked: null };

test("accounts from before the setting show both shelves", () => {
  assert.deepEqual(visibleStatuses(ANONYMOUS, privacyOf({})), ["STARTED", "PAUSED", "COMPLETED", "NOT_STARTED"]);
});

test("a hidden Reading shelf takes paused books with it", () => {
  const owner = privacyOf({ hideReading: true });
  assert.equal(canView(follower, owner, "reading"), false);
  assert.deepEqual(visibleStatuses(follower, owner), ["COMPLETED", "NOT_STARTED"]);
});

test("a hidden Finished shelf leaves the rest of the profile", () => {
  const owner = privacyOf({ hideFinished: true });
  assert.equal(canView(ANONYMOUS, owner, "finished"), false);
  assert.equal(canView(ANONYMOUS, owner, "profile"), true);
  assert.deepEqual(visibleStatuses(ANONYMOUS, owner), ["STARTED", "PAUSED", "NOT_STARTED"]);
});

test("the owner always sees every shelf", () => {
  const owner = privacyOf({ hideReading: true, hideFinished: true, hideWantToRead: true });
  assert.deepEqual(visibleStatuses(self, owner), ["STARTED", "PAUSED", "COMPLETED", "NOT_STARTED"]);
});

test("a followers-only profile shows nothing to strangers, whatever the shelves say", () => {
  assert.deepEqual(visibleStatuses(ANONYMOUS, privacyOf({ profileVisibility: "FOLLOWERS" })), []);
  assert.deepEqual(visibleStatuses(follower, privacyOf({ profileVisibility: "FOLLOWERS" })).length, 4);
});
