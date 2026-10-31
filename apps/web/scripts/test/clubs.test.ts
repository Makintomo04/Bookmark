// Book clubs (BOO-49): who can do what, the club's books in order, and the hosting limits.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/clubs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_CLUB_LIMIT,
  CLUB_MAX_MEMBERS,
  CLUB_OPEN_CIRCLES_MAX,
  canEditClubSettings,
  canManageClub,
  canRemoveFromClub,
  circleSlotsLeft,
  clubAbout,
  clubAllowance,
  clubRole,
  clubShelf,
  createClubSchema,
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
