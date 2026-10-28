// Follow requests, report alerts and the reading-day triggers: the rules behind them, without a database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/social.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { followButtonLabel, needsFollowApproval } from "@/lib/followRules";
import { alertReport, reportAlertMessage, type ReportAlert } from "@/lib/reportAlerts";
import { progressTriggers } from "@/lib/achievementTriggers";

test("only public profiles can be followed without asking", () => {
  assert.equal(needsFollowApproval({ profileVisibility: "PUBLIC" }), false);
  // Accounts made before privacy settings existed read as public.
  assert.equal(needsFollowApproval({}), false);
  assert.equal(needsFollowApproval({ profileVisibility: null }), false);
  assert.equal(needsFollowApproval({ profileVisibility: "FOLLOWERS" }), true);
  assert.equal(needsFollowApproval({ profileVisibility: "PRIVATE" }), true);
});

test("the follow button says where the two stand", () => {
  assert.equal(followButtonLabel({ isFollowing: true, requested: false, needsApproval: true }), "Following");
  assert.equal(followButtonLabel({ isFollowing: false, requested: true, needsApproval: true }), "Requested");
  assert.equal(followButtonLabel({ isFollowing: false, requested: false, needsApproval: true }), "Ask to follow");
  assert.equal(followButtonLabel({ isFollowing: false, requested: false, needsApproval: false }), "Follow");
});

const ALERT: ReportAlert = {
  kind: "comment",
  id: "6560f1c2a1b2c3d4e5f60718",
  reason: "Spoiler posted too early",
  reporterId: "6560f1c2a1b2c3d4e5f6aaaa",
  authorId: "6560f1c2a1b2c3d4e5f6bbbb",
  excerpt: "Snape <b>kills</b> Dumbledore",
  path: "/circles/6560f1c2a1b2c3d4e5f6cccc",
};

test("a report alert keeps the text as it read when reported, escaped for the email", () => {
  const message = reportAlertMessage(ALERT);
  assert.match(message.subject, /comment: Spoiler posted too early/);
  assert.match(message.text, /Snape <b>kills<\/b> Dumbledore/);
  assert.match(message.text, /\/circles\/6560f1c2a1b2c3d4e5f6cccc/);
  assert.ok(!message.html.includes("<b>kills</b>"));
  assert.match(message.html, /&lt;b&gt;kills&lt;\/b&gt;/);
  assert.ok(reportAlertMessage({ ...ALERT, excerpt: "x".repeat(5000) }).text.length < 2600);
});

test("a report alert never fails the report", async () => {
  const sent: unknown[] = [];
  // SUPPORT_EMAIL isn't set in tests, so it's logged, not sent.
  await alertReport(ALERT, async (m) => { sent.push(m); return {} as never; });
  assert.equal(sent.length, 0);
});

test("only moving on in a book or finishing it counts as a reading day", () => {
  const base = { moved: true, rated: false, reviewed: false };
  assert.deepEqual(progressTriggers({ ...base, action: "progress" }), ["progress"]);
  assert.deepEqual(progressTriggers({ ...base, action: "complete" }), ["completion"]);
  assert.deepEqual(progressTriggers({ ...base, action: "complete", rated: true, reviewed: true }), ["completion", "rating", "review"]);
  // Saving the same page again isn't reading.
  assert.deepEqual(progressTriggers({ ...base, action: "progress", moved: false }), ["all"]);
  // Starting, pausing or shelving re-checks everything without a reading day.
  for (const action of ["start", "pause", "resume", "wantToRead", "dnf", "restart"]) {
    assert.deepEqual(progressTriggers({ ...base, action }), ["all"], action);
  }
  assert.deepEqual(progressTriggers({ ...base, action: "rate", rated: true }), ["rating"]);
});

test("favourites show to whoever can see the profile, unless the reader hides them", async () => {
  const { canView, privacyOf } = await import("@/lib/privacyRules");
  const stranger = { isSelf: false, isFollower: false, blocked: null };
  const self = { isSelf: true, isFollower: false, blocked: null };
  assert.equal(canView(stranger, privacyOf({}), "favourites"), true);
  assert.equal(canView(stranger, privacyOf({ hideFavourites: true }), "favourites"), false);
  assert.equal(canView(self, privacyOf({ hideFavourites: true }), "favourites"), true);
  assert.equal(canView(stranger, privacyOf({ profileVisibility: "PRIVATE" }), "favourites"), false);
  assert.equal(canView({ ...stranger, blocked: "byOwner" as const }, privacyOf({}), "favourites"), false);
});
