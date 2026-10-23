// Community preferences: defaults for accounts made before they existed, and who can send a reading circle invite. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/preferences.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsBuddyReadInvite, preferencesOf } from "@/lib/preferences";

test("unset preferences read as the old behaviour", () => {
  assert.deepEqual(preferencesOf({}), { buddyReadInvites: "EVERYONE", showSpoilers: false, defaultListVisibility: "PRIVATE", showRecaps: true });
  assert.deepEqual(preferencesOf({ buddyReadInvites: null, showSpoilers: null, defaultListVisibility: null, showRecaps: null }), preferencesOf({}));
});

test("stored preferences win over the defaults", () => {
  assert.deepEqual(
    preferencesOf({ buddyReadInvites: "NOBODY", showSpoilers: true, defaultListVisibility: "PUBLIC", showRecaps: false }),
    { buddyReadInvites: "NOBODY", showSpoilers: true, defaultListVisibility: "PUBLIC", showRecaps: false },
  );
});

test("reading circle invites follow the invitee's audience", () => {
  const as = (buddyReadInvites: "EVERYONE" | "FOLLOWING" | "NOBODY") => preferencesOf({ buddyReadInvites });
  assert.equal(acceptsBuddyReadInvite(as("EVERYONE"), false), true);
  assert.equal(acceptsBuddyReadInvite(as("FOLLOWING"), true), true);
  assert.equal(acceptsBuddyReadInvite(as("FOLLOWING"), false), false);
  assert.equal(acceptsBuddyReadInvite(as("NOBODY"), true), false);
});
