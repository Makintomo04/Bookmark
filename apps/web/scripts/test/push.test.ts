// Push notification wording and grouping (packages/shared/src/push.ts): only the social notifications
// are pushed, each lands on the right screen, and none carries anything a reader wrote.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/push.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { OPT_IN_PUSH_GROUPS, PUSH_GROUPS, pushContentFor, pushGroupOf, pushGroupsFor, type PushGroup } from "@bookmark/shared/push";

const base = { actorUsername: "ana", bookTitle: "The Hobbit", buddyReadId: "6560f1c2a1b2c3d4e5f60718", count: null };

test("achievements and quests stay in the bell", () => {
  for (const type of ["ACHIEVEMENT_EARNED", "QUEST_COMPLETED", "BUDDY_READ_HOST_INHERITED"]) {
    assert.equal(pushGroupOf(type), null);
    assert.equal(pushContentFor({ ...base, type }), null);
  }
});

test("every pushed type has words and a screen", () => {
  // Reminders are worded by the cron job that sends them (reminders.test.ts), not from a notification.
  for (const [group, types] of Object.entries(PUSH_GROUPS) as [PushGroup, readonly string[]][]) {
    if (OPT_IN_PUSH_GROUPS.includes(group)) continue;
    for (const type of types) {
      const content = pushContentFor({ ...base, type });
      assert.ok(content, type);
      assert.ok(content.title && content.body && content.path.startsWith("/"), type);
    }
  }
});

test("reminders are opt-in: never in the on-unless-off toggles, and never sent from a notification", () => {
  for (const group of OPT_IN_PUSH_GROUPS) {
    assert.ok(!pushGroupsFor(false).includes(group) && !pushGroupsFor(true).includes(group), group);
    for (const type of PUSH_GROUPS[group]) assert.equal(pushContentFor({ ...base, type }), null, type);
  }
  assert.equal(pushGroupOf("STREAK_ALERT"), "reminders");
  assert.equal(pushGroupOf("CHECKPOINT_DUE"), "checkpoints");
});

test("circle pushes open the circle; comments to read are counted, never quoted", () => {
  const one = pushContentFor({ ...base, type: "COMMENTS_UNLOCKED", count: 1 })!;
  assert.equal(one.path, `/circles/${base.buddyReadId}`);
  assert.equal(one.body, "A comment to read in your reading circle for The Hobbit.");
  const many = pushContentFor({ ...base, type: "COMMENTS_UNLOCKED", count: 4 })!;
  assert.equal(many.body, "4 comments to read in your reading circle for The Hobbit.");
  assert.equal(pushGroupOf("COMMENTS_UNLOCKED"), "circles");
});

test("a comment's words never reach a push, even when they're passed in", () => {
  const secret = "SECRET-BODY-snape-kills-dumbledore";
  const widened = { ...base, type: "COMMENTS_UNLOCKED", count: 1, body: secret, pageLabel: secret, chapterLabel: secret, message: secret };
  const content = pushContentFor(widened)!;
  assert.ok(!JSON.stringify(content).includes(secret));
});

test("a follow opens the follower's profile, and a missing name still reads well", () => {
  assert.equal(pushContentFor({ ...base, type: "NEW_FOLLOWER" })!.path, "/u/ana");
  assert.equal(pushContentFor({ ...base, type: "FOLLOW_REQUEST", actorUsername: null })!.body, "Someone asked to follow you.");
});
