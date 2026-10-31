// The weekly email (packages/shared/src/digest.ts): empty sections are left out, an empty week sends
// nothing, nobody's words get in, and the unsubscribe link is always there. Plus the signed unsubscribe
// token (lib/unsubscribeToken.ts) and the cron's secret check (lib/cronAuth.ts).
//
//   node --import ./scripts/test/register.mjs --test scripts/test/digest.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyDigest, goalLine, type DigestData } from "@bookmark/shared/digest";
import { unsubscribeToken, verifyUnsubscribeToken } from "@/lib/unsubscribeToken";
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
