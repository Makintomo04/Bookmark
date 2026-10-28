// Who may see a list (lib/listRules.ts canSeeListOf): a reader's lists follow their profile's privacy
// and blocks, Bookmark Picks are the team's, and the owner and staff always see them.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/lists.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeListOf } from "@/lib/listRules";
import { ANONYMOUS, privacyOf, type Relation } from "@/lib/privacyRules";

const list = { isPick: false };
const pick = { isPick: true };
const STRANGER: Relation = { isSelf: false, isFollower: false, blocked: null };
const FOLLOWER: Relation = { isSelf: false, isFollower: true, blocked: null };
const SELF: Relation = { isSelf: true, isFollower: false, blocked: null };
const BLOCKED_BY_OWNER: Relation = { isSelf: false, isFollower: true, blocked: "byOwner" };
const BLOCKED_BY_VIEWER: Relation = { isSelf: false, isFollower: false, blocked: "byViewer" };

const owner = (profileVisibility?: "PUBLIC" | "FOLLOWERS" | "PRIVATE") => privacyOf({ profileVisibility });

test("a public profile's lists are visible to everyone, signed out included", () => {
  assert.equal(canSeeListOf(list, ANONYMOUS, owner("PUBLIC")), true);
  assert.equal(canSeeListOf(list, STRANGER, owner("PUBLIC")), true);
  // Accounts from before privacy settings read as public.
  assert.equal(canSeeListOf(list, ANONYMOUS, owner()), true);
});

test("a private profile's lists are for approved followers, the owner and staff", () => {
  // Private is followers-only plus hidden from search and feeds (lib/privacyRules.ts).
  for (const viewer of [ANONYMOUS, STRANGER]) assert.equal(canSeeListOf(list, viewer, owner("PRIVATE")), false);
  assert.equal(canSeeListOf(list, FOLLOWER, owner("PRIVATE")), true);
  assert.equal(canSeeListOf(list, SELF, owner("PRIVATE")), true);
  assert.equal(canSeeListOf(list, STRANGER, owner("PRIVATE"), true), true);
});

test("a followers-only profile's lists are visible to followers only", () => {
  assert.equal(canSeeListOf(list, ANONYMOUS, owner("FOLLOWERS")), false);
  assert.equal(canSeeListOf(list, STRANGER, owner("FOLLOWERS")), false);
  assert.equal(canSeeListOf(list, FOLLOWER, owner("FOLLOWERS")), true);
});

test("a block in either direction hides a public profile's lists", () => {
  assert.equal(canSeeListOf(list, BLOCKED_BY_OWNER, owner("PUBLIC")), false);
  assert.equal(canSeeListOf(list, BLOCKED_BY_VIEWER, owner("PUBLIC")), false);
});

test("Bookmark Picks stay visible whatever the curating account's own settings", () => {
  assert.equal(canSeeListOf(pick, ANONYMOUS, owner("PRIVATE")), true);
  assert.equal(canSeeListOf(pick, STRANGER, owner("FOLLOWERS")), true);
});
