// The weekly email (packages/shared/src/digest.ts): empty sections are left out, an empty week sends
// nothing, nobody's words get in, and the unsubscribe link is always there. Plus the signed unsubscribe
// token (lib/unsubscribeToken.ts) and the cron's secret check (lib/cronAuth.ts).
//
//   node --import ./scripts/test/register.mjs --test scripts/test/digest.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckpointEmail, buildWeeklyDigest, goalLine, goalPace, type DigestData } from "@bookmark/shared/digest";
import { streakText } from "@bookmark/shared/goals";
import { unsubscribeKindOf, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/unsubscribeToken";
import { isCronAuthorised } from "@/lib/cronAuth";

const empty: DigestData = {
  name: "Sam",
  readingDays: 0,
  finished: 0,
  streak: 0,
  goal: null,
  checkpoints: [],
  circles: [],
  friends: [],
  series: [],
  logUrl: "https://bookmark.test/",
  settingsUrl: "https://bookmark.test/settings#notifications",
  unsubscribeUrl: "https://bookmark.test/email/unsubscribe?t=abc",
};

test("an empty week sends nothing", () => {
  assert.equal(buildWeeklyDigest(empty), null);
  // A goal and an old streak aren't news on their own: a quiet reader isn't told "30 behind" each Sunday.
  assert.equal(buildWeeklyDigest({ ...empty, streak: 4, goal: { year: 2026, books: 10, target: 40, pace: 33 } }), null);
  // Once something happened, the goal line comes along.
  assert.match(buildWeeklyDigest({ ...empty, readingDays: 1, goal: { year: 2026, books: 10, target: 40, pace: 33 } })!.text, /23 behind pace/);
  // A circle with nothing new is no news either.
  assert.equal(buildWeeklyDigest({ ...empty, circles: [{ title: "Dune", newComments: 0, finished: 0 }] }), null);
});

test("only the sections with something in them are shown", () => {
  const email = buildWeeklyDigest({ ...empty, readingDays: 4, streak: 6 })!;
  assert.equal(email.subject, "Your week in books");
  assert.match(email.text, /You read on 4 days this week/);
  assert.match(email.text, /6 days in a row/);
  assert.doesNotMatch(email.text, /From friends|In your circles|Due in your circles|New in your series/);
  assert.match(email.html, /Log today's reading/);
});

test("circles, checkpoints, friends and series", () => {
  const email = buildWeeklyDigest({
    ...empty,
    checkpoints: [{ circleTitle: "Dune", label: "Part 2", due: "2026-11-01" }],
    circles: [{ title: "Dune", newComments: 3, finished: 1 }],
    friends: Array.from({ length: 7 }, (_, i) => ({ username: `friend${i}`, kind: "finished" as const, bookTitle: "Piranesi" })),
    series: [{ title: "Book Two", seriesName: "The Saga" }],
  })!;
  assert.match(email.text, /Part 2 in Dune, due Sunday/);
  assert.match(email.text, /Dune: 3 new comments you can read, 1 member finished/);
  assert.match(email.text, /Book Two, new in The Saga/);
  // At most five friends.
  assert.equal((email.text.match(/finished Piranesi/g) ?? []).length, 5);
});

test("pace counts from when the goal was set, not 1 January", () => {
  // Half way through the year: 12 books should be about 6.
  assert.equal(goalPace(12, "2026-07-02"), 6);
  // Set on 1 November, on 1 November nobody is behind yet.
  assert.equal(goalPace(12, "2026-11-01", "2026-11-01"), 0);
  // A goal set last year counts from this January.
  assert.equal(goalPace(12, "2026-07-02", "2025-12-01"), 6);
});

test("goal pace says ahead, behind or reached", () => {
  assert.equal(goalLine({ year: 2026, books: 23, target: 40, pace: 21 }), "23 of 40 books in 2026, 2 ahead of pace");
  assert.equal(goalLine({ year: 2026, books: 20, target: 40, pace: 33 }), "20 of 40 books in 2026, 13 behind pace");
  assert.equal(goalLine({ year: 2026, books: 41, target: 40, pace: 33 }), "41 of 40 books in 2026, goal reached");
});

test("titles are escaped, and the unsubscribe link is always there", () => {
  const email = buildWeeklyDigest({ ...empty, series: [{ title: "<script>x</script>", seriesName: null }] })!;
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /href="https:\/\/bookmark\.test\/email\/unsubscribe\?t=abc"/);
  assert.match(email.text, /Stop the weekly email: https:\/\/bookmark\.test\/email\/unsubscribe\?t=abc/);
});

test("the input has nowhere to put what someone wrote", () => {
  // A comment body passed in by mistake isn't read: the type has no such field.
  const withBody = { ...empty, circles: [{ title: "Dune", newComments: 2, finished: 0, body: "SPOILER: he dies" }] } as unknown as DigestData;
  const email = buildWeeklyDigest(withBody)!;
  assert.doesNotMatch(email.html + email.text, /SPOILER/);
});

const SECRET = "test-unsubscribe-secret";
const USER = "6560f1c2a1b2c3d4e5f60718";

test("unsubscribe tokens round-trip and can't be forged or reused for something else", () => {
  const token = unsubscribeToken(USER, "weekly", SECRET);
  assert.equal(verifyUnsubscribeToken(token, "weekly", SECRET), USER);
  // Someone else's id with this signature.
  assert.equal(verifyUnsubscribeToken(token.replace(USER, "6560f1c2a1b2c3d4e5f60719"), "weekly", SECRET), null);
  assert.equal(verifyUnsubscribeToken(token.slice(0, -2) + "xx", "weekly", SECRET), null);
  assert.equal(verifyUnsubscribeToken(token, "weekly", "another-secret"), null);
  assert.equal(verifyUnsubscribeToken(`${USER}.marketing.${token.split(".")[2]}`, "weekly", SECRET), null);
  assert.equal(verifyUnsubscribeToken(undefined, "weekly", SECRET), null);
  assert.equal(verifyUnsubscribeToken("", "weekly", SECRET), null);
});

test("cron routes need the exact bearer secret", () => {
  assert.equal(isCronAuthorised("Bearer s3cret", "s3cret"), true);
  assert.equal(isCronAuthorised("Bearer wrong", "s3cret"), false);
  assert.equal(isCronAuthorised("s3cret", "s3cret"), false);
  assert.equal(isCronAuthorised(null, "s3cret"), false);
  // No secret set refuses everyone, even a matching empty bearer.
  assert.equal(isCronAuthorised("Bearer ", ""), false);
  assert.equal(isCronAuthorised("Bearer undefined", undefined), false);
});

test("checkpoint emails for members without the app: counts only, and a way out", () => {
  const email = buildCheckpointEmail({
    circleTitle: "Dune", label: "Part 2", due: "2026-11-01", progress: 41.2, until: 55, waiting: 3,
    circleUrl: "https://bookmark.test/circles/c1", settingsUrl: "https://bookmark.test/settings#notifications", unsubscribeUrl: "https://bookmark.test/email/unsubscribe?t=x",
  });
  assert.equal(email.subject, "Part 2 of Dune is due Sunday");
  assert.ok(email.text.includes("You're at 41% and Part 2 ends at 55%. 3 comments are waiting there."));
  assert.match(email.html, /Open the circle/);
  assert.ok(email.text.includes("Stop checkpoint emails: https://bookmark.test/email/unsubscribe?t=x"));
});

test("an unsubscribe token says what it stops, and can't stop something else", () => {
  const token = unsubscribeToken(USER, "checkpoints", SECRET);
  assert.equal(unsubscribeKindOf(token), "checkpoints");
  assert.equal(verifyUnsubscribeToken(token, "checkpoints", SECRET), USER);
  assert.equal(verifyUnsubscribeToken(token.replace(".checkpoints.", ".weekly."), "weekly", SECRET), null);
  assert.equal(unsubscribeKindOf("6560f1c2a1b2c3d4e5f60718.marketing.sig"), null);
});

test("the goal card's streak line", () => {
  assert.equal(streakText({ days: 6, readToday: false }), "6-day streak · read today to keep it");
  assert.equal(streakText({ days: 6, readToday: true }), "6-day streak");
  assert.equal(streakText({ days: 1, readToday: true }), null);
  assert.equal(streakText(undefined), null);
});
