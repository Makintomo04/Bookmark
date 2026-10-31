// Community preferences: defaults for accounts made before they existed, and who can send a reading circle invite. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/preferences.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsBuddyReadInvite, preferencesOf } from "@/lib/preferences";

test("unset preferences read as the old behaviour, with AI off on free", () => {
  assert.deepEqual(preferencesOf({}), { buddyReadInvites: "EVERYONE", showSpoilers: false, defaultListVisibility: "PRIVATE", aiFeatures: false, suggestMe: true });
  assert.deepEqual(preferencesOf({ buddyReadInvites: null, showSpoilers: null, defaultListVisibility: null, aiFeatures: null, showRecaps: null, hideFromSuggestions: null }), preferencesOf({}));
});

test("stored preferences win over the defaults", () => {
  assert.deepEqual(
    preferencesOf({ buddyReadInvites: "NOBODY", showSpoilers: true, defaultListVisibility: "PUBLIC", aiFeatures: true, hideFromSuggestions: true }),
    { buddyReadInvites: "NOBODY", showSpoilers: true, defaultListVisibility: "PUBLIC", aiFeatures: true, suggestMe: false },
  );
});

test("AI features: opt-in on free, on by default on Plus, and a choice sticks", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const later = new Date("2026-11-23T12:00:00Z");
  const ai = (user: Parameters<typeof preferencesOf>[0]) => preferencesOf(user, now).aiFeatures;
  assert.equal(ai({ plan: "FREE" }), false);
  // Free accounts that never touched the old recaps switch, or switched it on, still start off.
  assert.equal(ai({ plan: "FREE", showRecaps: true }), false);
  assert.equal(ai({ plan: "FREE", aiFeatures: true }), true);
  assert.equal(ai({ plan: "PLUS" }), true);
  assert.equal(ai({ lifetime: true }), true);
  assert.equal(ai({ compPlusUntil: later }), true);
  assert.equal(ai({ plan: "PLUS", aiFeatures: false }), false);
  // A Plus reader who switched recaps off before this existed stays off.
  assert.equal(ai({ plan: "PLUS", showRecaps: false }), false);
});

test("reading circle invites follow the invitee's audience", () => {
  const as = (buddyReadInvites: "EVERYONE" | "FOLLOWING" | "FRIENDS" | "NOBODY") => preferencesOf({ buddyReadInvites });
  const stranger = { inviteeFollowsInviter: false, friends: false };
  const followed = { inviteeFollowsInviter: true, friends: false };
  // Friends follow each other, so a friend is also someone the invitee follows.
  const friend = { inviteeFollowsInviter: true, friends: true };
  assert.equal(acceptsBuddyReadInvite(as("EVERYONE"), stranger), true);
  assert.equal(acceptsBuddyReadInvite(as("FOLLOWING"), followed), true);
  assert.equal(acceptsBuddyReadInvite(as("FOLLOWING"), stranger), false);
  assert.equal(acceptsBuddyReadInvite(as("FRIENDS"), friend), true);
  // Following someone isn't being their friend: they have to follow back.
  assert.equal(acceptsBuddyReadInvite(as("FRIENDS"), followed), false);
  assert.equal(acceptsBuddyReadInvite(as("FRIENDS"), stranger), false);
  assert.equal(acceptsBuddyReadInvite(as("NOBODY"), friend), false);
});
