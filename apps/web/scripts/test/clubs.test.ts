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
  BIG_CLUB_MAX_MEMBERS,
  MEMBERS_SHOWN,
  canMuteInClub,
  clubBookAdditions,
  clubFullMessage,
  clubMemberCap,
  matchesMember,
} from "@bookmark/shared/clubs";
import { BUDDY_READ_MAX_MEMBERS, TRACK_SHOWN, trackRows } from "@bookmark/shared/buddyReads";
import { FEATURE_COPY, entitlementsOf } from "@bookmark/shared/entitlements";

test("a free host's club holds a circle's 15; a Plus host's up to 150 (BOO-79)", () => {
  assert.equal(CLUB_MAX_MEMBERS, BUDDY_READ_MAX_MEMBERS);
  // The limit is the host's entitlement, so the 402 copy and the cap come from one place.
  assert.equal(clubMemberCap(entitlementsOf({})), 15);
  assert.equal(clubMemberCap(entitlementsOf({ plan: "PLUS" })), BIG_CLUB_MAX_MEMBERS);
  assert.equal(entitlementsOf({ plan: "PLUS" }).bigClubs, true);
  assert.equal(entitlementsOf({}).bigClubs, false);
  assert.equal(BIG_CLUB_MAX_MEMBERS, 150);
  assert.match(FEATURE_COPY.bigClubs.message, /150/);
  assert.match(FEATURE_COPY.bigClubs.message, /votes are free/);
  assert.equal(clubFullMessage(150), "This club is full (150 readers).");
});

test("two joins at once at a big club's cap: only the first 150 in joining order stay", () => {
  const order = Array.from({ length: BIG_CLUB_MAX_MEMBERS + 1 }, (_, i) => `u${i}`);
  const plus = clubMemberCap(entitlementsOf({ plan: "PLUS" }));
  assert.equal(admittedWithinCap(order, `u${BIG_CLUB_MAX_MEMBERS - 1}`, plus), true);
  assert.equal(admittedWithinCap(order, `u${BIG_CLUB_MAX_MEMBERS}`, plus), false);
  // The same order under a free host: the 16th is out.
  assert.equal(admittedWithinCap(order, "u15", clubMemberCap(entitlementsOf({}))), false);
});

test("a new club book takes members in joining order, skipping blocked and removed, up to the club's size", () => {
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(clubBookAdditions(ids, { skip: new Set(["b"]), already: ["host"], cap: 4 }), ["a", "c", "d"]);
  // Nobody's added twice.
  assert.deepEqual(clubBookAdditions(ids, { skip: new Set(), already: ["a", "c"], cap: 10 }), ["b", "d", "e"]);
  // A club over its cap (the host dropped Plus) keeps its readers but adds nobody new.
  assert.deepEqual(clubBookAdditions(ids, { skip: new Set(), already: ["x", "y", "z"], cap: 2 }), []);
});

test("muting follows removing: the host mutes anyone else, a co-host only members", () => {
  assert.equal(canMuteInClub("host", "cohost"), true);
  assert.equal(canMuteInClub("host", "member"), true);
  assert.equal(canMuteInClub("cohost", "member"), true);
  assert.equal(canMuteInClub("cohost", "cohost"), false);
  assert.equal(canMuteInClub("cohost", "host"), false);
  assert.equal(canMuteInClub("member", "member"), false);
});

test("the members search matches names and @usernames, ignoring case and accents", () => {
  const zoe = { username: "zoereads", displayName: "Zoë Adeyemi" };
  assert.equal(matchesMember(zoe, "zoe"), true);
  assert.equal(matchesMember(zoe, "ADEY"), true);
  assert.equal(matchesMember(zoe, "@zoereads"), true);
  assert.equal(matchesMember(zoe, "kofi"), false);
  assert.equal(matchesMember({ username: null, displayName: null }, "a"), false);
  assert.equal(matchesMember(zoe, "  "), true);
  assert.equal(MEMBERS_SHOWN, 20);
});

test("a big club's progress track shows you, the hosts and the readers nearest you", () => {
  const members = Array.from({ length: 40 }, (_, i) => ({ userId: `u${i}`, isYou: i === 20, isHost: i === 0, clubRole: i === 1 ? "host" : null, progress: i * 2 }));
  const { shown, hidden } = trackRows(members);
  assert.equal(shown.length, TRACK_SHOWN);
  assert.equal(hidden, 40 - TRACK_SHOWN);
  const ids = shown.map((m) => m.userId);
  for (const pinned of ["u0", "u1", "u20"]) assert.ok(ids.includes(pinned));
  // The rest are the nearest to you (40%): u19 and u21 before u30.
  assert.ok(ids.includes("u19") && ids.includes("u21"));
  assert.ok(!ids.includes("u39"));
  // Kept in joining order.
  assert.deepEqual(ids, [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  // A small circle shows everyone.
  assert.equal(trackRows(members.slice(0, 15)).hidden, 0);
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
