// Book clubs (BOO-49): who can do what, the club's books in order, and the hosting limits.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/clubs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_CLUB_LIMIT,
  CLUB_COPY_STATUS,
  CLUB_MAX_MEMBERS,
  CLUB_OPEN_CIRCLES_MAX,
  canEditClubSettings,
  canManageClub,
  admittedWithinCap,
  canRemoveFromClub,
  canRemoveFromClubBook,
  circleSlotsLeft,
  clubAbout,
  clubAllowance,
  clubRole,
  clubShelf,
  createClubSchema,
  inviteFaces,
  updateClubSchema,
} from "@bookmark/shared/clubs";
import { BUDDY_READ_MAX_MEMBERS } from "@bookmark/shared/buddyReads";

test("a club can't outgrow a circle, since everyone is added to each book", () => {
  assert.equal(CLUB_MAX_MEMBERS, BUDDY_READ_MAX_MEMBERS);
});

test("roles: the host is Club.hostId, a co-host is flagged, everyone else is a member", () => {
  assert.equal(clubRole({ userId: "h", coHost: false }, "h"), "host");
  // The host is the host even if a stale co-host flag is left on their row.
  assert.equal(clubRole({ userId: "h", coHost: true }, "h"), "host");
  assert.equal(clubRole({ userId: "c", coHost: true }, "h"), "cohost");
  assert.equal(clubRole({ userId: "m" }, "h"), "member");
});

test("the host and co-hosts run the club; only the host changes its settings", () => {
  assert.equal(canManageClub("host"), true);
  assert.equal(canManageClub("cohost"), true);
  assert.equal(canManageClub("member"), false);
  assert.equal(canManageClub(null), false);
  assert.equal(canEditClubSettings("host"), true);
  assert.equal(canEditClubSettings("cohost"), false);
});

test("removing: the host removes anyone else, a co-host only members, nobody removes the host", () => {
  assert.equal(canRemoveFromClub("host", "cohost"), true);
  assert.equal(canRemoveFromClub("host", "member"), true);
  assert.equal(canRemoveFromClub("cohost", "member"), true);
  assert.equal(canRemoveFromClub("cohost", "cohost"), false);
  assert.equal(canRemoveFromClub("cohost", "host"), false);
  assert.equal(canRemoveFromClub("member", "member"), false);
  assert.equal(canRemoveFromClub("host", "host"), false);
});

test("the club page: reading now, up next and past reads, each in its own order", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const circles = [
    { id: "oct", status: "FINISHED" as const, startsAt: "2026-10-01T00:00:00Z" },
    { id: "sep", status: "ARCHIVED" as const, startsAt: "2026-09-01T00:00:00Z" },
    { id: "nov", status: "ACTIVE" as const, startsAt: "2026-11-01T00:00:00Z" },
    { id: "jan", status: "ACTIVE" as const, startsAt: "2027-01-01T00:00:00Z" },
    { id: "dec", status: "ACTIVE" as const, startsAt: "2026-12-01T00:00:00Z" },
  ];
  const shelf = clubShelf(circles, now);
  assert.deepEqual(shelf.reading.map((c) => c.id), ["nov"]);
  assert.deepEqual(shelf.upcoming.map((c) => c.id), ["dec", "jan"]);
  assert.deepEqual(shelf.past.map((c) => c.id), ["oct", "sep"]);
});

test("a club has room for the book it's reading and the next one", () => {
  assert.equal(CLUB_OPEN_CIRCLES_MAX, 2);
  assert.equal(circleSlotsLeft(0), 2);
  assert.equal(circleSlotsLeft(1), 1);
  assert.equal(circleSlotsLeft(2), 0);
  assert.equal(circleSlotsLeft(5), 0);
});

test("gate hosts, not guests: one active club free, any number on Plus", () => {
  assert.equal(ACTIVE_CLUB_LIMIT.free, 1);
  const first = clubAllowance(0, "free");
  assert.equal(first.allowed, true);
  assert.equal(first.message, null);
  const second = clubAllowance(1, "free");
  assert.equal(second.allowed, false);
  assert.equal(second.upgrade, true);
  assert.match(second.message ?? "", /Joining clubs is never limited/);
  const plus = clubAllowance(40, "plus");
  assert.equal(plus.allowed, true);
  assert.equal(plus.limit, null);
});

test("input: a club needs a name; about is optional and clears when emptied", () => {
  assert.equal(createClubSchema.safeParse({ name: "  " }).success, false);
  assert.equal(createClubSchema.safeParse({ name: "x".repeat(61) }).success, false);
  const ok = createClubSchema.parse({ name: " Thursday Club " });
  assert.equal(ok.name, "Thursday Club");
  assert.equal(clubAbout(ok.about), null);
  // Left out of an update, about is untouched; sent empty, it's cleared.
  assert.equal(updateClubSchema.parse({ name: "New" }).about, undefined);
  assert.equal(clubAbout(updateClubSchema.parse({ about: "" }).about), null);
  assert.equal(updateClubSchema.safeParse({ status: "FINISHED" }).success, false);
});

// ---- Round 9 fixes ---------------------------------------------------------------------------

test("a club's book: club roles decide removals, whoever started the book", () => {
  // A co-host started the book; another co-host or the club's host can't be removed by them.
  assert.equal(canRemoveFromClubBook("cohost", "host", false), false);
  assert.equal(canRemoveFromClubBook("cohost", "cohost", false), false);
  assert.equal(canRemoveFromClubBook("cohost", "member", false), true);
  // Someone who has left the club counts as a member; the club's host can remove anyone else.
  assert.equal(canRemoveFromClubBook("cohost", null, false), true);
  assert.equal(canRemoveFromClubBook("host", "cohost", false), true);
  // Nobody removes the book's own host, and a reader out of the club removes nobody.
  assert.equal(canRemoveFromClubBook("host", "member", true), false);
  assert.equal(canRemoveFromClubBook(null, "member", false), false);
  assert.equal(canRemoveFromClubBook("member", "member", false), false);
});

test("the club never marks anyone as reading: its copies go in Want to read", () => {
  assert.equal(CLUB_COPY_STATUS, "NOT_STARTED");
});

test("two joins at once: only the first CLUB_MAX_MEMBERS in joining order stay", () => {
  const order = Array.from({ length: CLUB_MAX_MEMBERS + 1 }, (_, i) => `u${i}`);
  assert.equal(admittedWithinCap(order, "u0"), true);
  assert.equal(admittedWithinCap(order, `u${CLUB_MAX_MEMBERS - 1}`), true);
  assert.equal(admittedWithinCap(order, `u${CLUB_MAX_MEMBERS}`), false);
  // Not written at all (the other request removed it): not admitted.
  assert.equal(admittedWithinCap(order, "nobody"), false);
});

test("the public invite shows only members a stranger could see", () => {
  const members = [
    { userId: "host", profileVisibility: "PRIVATE" },
    { userId: "pub" },
    { userId: "followers", profileVisibility: "FOLLOWERS" },
    { userId: "private", profileVisibility: "PRIVATE" },
    { userId: "blocker", profileVisibility: "PUBLIC" },
    { userId: "suspended", profileVisibility: "PUBLIC", suspended: true },
    { userId: "me", profileVisibility: "PRIVATE" },
  ];
  const anon = inviteFaces(members, { hostId: "host", blocked: new Set() }).map((m) => m.userId);
  assert.deepEqual(anon, ["pub", "blocker"]);
  // Signed in: their own face shows; anyone blocked either way doesn't.
  const viewer = inviteFaces(members, { hostId: "host", viewerId: "me", blocked: new Set(["blocker"]) }).map((m) => m.userId);
  assert.deepEqual(viewer, ["pub", "me"]);
});
