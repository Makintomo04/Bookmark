// Who may see a list (lib/listRules.ts canSeeListOf): a reader's lists follow their profile's privacy
// and blocks, Bookmark Picks are the team's, and the owner and staff always see them.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/lists.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeListOf } from "@/lib/listRules";
import { listFlagChanges } from "@/lib/listStaffRules";
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

// Staff saving someone else's list (lib/listStaffRules.ts): one staff log entry per flag changed.
const stored = { hidden: false, isPick: false, featuredLabel: null, featuredFrom: null, featuredUntil: null };
const actions = (next: Parameters<typeof listFlagChanges>[1], from: Parameters<typeof listFlagChanges>[0] = stored) =>
  listFlagChanges(from, next).map((c) => c.action);

test("a reader's save sets none of the flags, so nothing is logged", () => {
  assert.deepEqual(actions({}), []);
});

test("an unchanged staff save logs nothing", () => {
  assert.deepEqual(actions({ hidden: false, isPick: false, featuredLabel: null, featuredFrom: null, featuredUntil: null }), []);
});

test("each changed flag gets its own entry, with before and after", () => {
  const changes = listFlagChanges(stored, { hidden: true, isPick: true, featuredFrom: null, featuredUntil: null, featuredLabel: null });
  assert.deepEqual(changes.map((c) => c.action), ["list.hide", "list.pick"]);
  assert.deepEqual(changes[0], { action: "list.hide", before: { hidden: false }, after: { hidden: true } });
  assert.deepEqual(actions({ hidden: false, isPick: false }, { ...stored, hidden: true, isPick: true }), ["list.unhide", "list.unpick"]);
});

test("setting or moving the spotlight dates puts the list in it; clearing them takes it out", () => {
  const from = new Date("2026-11-01T00:00:00.000Z");
  const until = new Date("2026-11-30T23:59:59.999Z");
  assert.deepEqual(actions({ featuredLabel: "November", featuredFrom: from, featuredUntil: until }), ["list.spotlight"]);
  const spotlit = { ...stored, featuredLabel: "November", featuredFrom: from, featuredUntil: until };
  assert.deepEqual(actions({ featuredLabel: "November", featuredFrom: new Date(from), featuredUntil: new Date(until) }, spotlit), []);
  assert.deepEqual(actions({ featuredLabel: "Autumn", featuredFrom: from, featuredUntil: until }, spotlit), ["list.spotlight"]);
  const off = listFlagChanges(spotlit, { featuredLabel: null, featuredFrom: null, featuredUntil: null });
  assert.deepEqual(off.map((c) => c.action), ["list.unspotlight"]);
  assert.equal(off[0].before.featuredFrom, from.toISOString());
});

test("a label with no dates isn't a spotlight", () => {
  assert.deepEqual(actions({ featuredLabel: "Someday", featuredFrom: null, featuredUntil: null }), []);
});
