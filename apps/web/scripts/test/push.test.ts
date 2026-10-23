// Push notification wording and grouping (packages/shared/src/push.ts): only the social notifications
// are pushed, each lands on the right screen, and none carries anything a reader wrote.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/push.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PUSH_GROUPS, pushContentFor, pushGroupOf } from "@bookmark/shared/push";

const base = { actorUsername: "ana", bookTitle: "The Hobbit", buddyReadId: "6560f1c2a1b2c3d4e5f60718", count: null };

test("achievements and quests stay in the bell", () => {
  for (const type of ["ACHIEVEMENT_EARNED", "QUEST_COMPLETED", "BUDDY_READ_HOST_INHERITED"]) {
    assert.equal(pushGroupOf(type), null);
    assert.equal(pushContentFor({ ...base, type }), null);
  }
});

test("every pushed type has words and a screen", () => {
  for (const types of Object.values(PUSH_GROUPS)) {
    for (const type of types) {
      const content = pushContentFor({ ...base, type });
      assert.ok(content, type);
      assert.ok(content.title && content.body && content.path.startsWith("/"), type);
    }
  }
});

test("circle pushes open the circle; unlocked comments are counted, never quoted", () => {
  const one = pushContentFor({ ...base, type: "COMMENTS_UNLOCKED", count: 1 })!;
  assert.equal(one.path, `/circles/${base.buddyReadId}`);
  assert.equal(one.body, "You've reached a comment in your reading circle for The Hobbit.");
  const many = pushContentFor({ ...base, type: "COMMENTS_UNLOCKED", count: 4 })!;
  assert.match(many.body, /4 comments/);
});

test("a follow opens the follower's profile, and a missing name still reads well", () => {
  assert.equal(pushContentFor({ ...base, type: "NEW_FOLLOWER" })!.path, "/u/ana");
  assert.equal(pushContentFor({ ...base, type: "FOLLOW_REQUEST", actorUsername: null })!.body, "Someone asked to follow you.");
});
