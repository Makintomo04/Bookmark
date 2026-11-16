// Club votes (BOO-49 phase 2): who may nominate and run a vote, counting, ties, and what's shown when.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/clubVotes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOTE_DAYS_DEFAULT,
  VOTE_DAYS_MAX,
  VOTE_NOMINATIONS_MAX,
  ballotSchema,
  canNominate,
  canRunVote,
  closesAtFor,
  closesInText,
  clubVoteText,
  countsVisible,
  isClubVoteNotification,
  isVoteDue,
  nominateSchema,
  nominationAdmitted,
  openVoteSchema,
  tallyVotes,
  turnoutText,
  voteActionSchema,
  voteOutcome,
  ARCHIVED_MESSAGE,
  HOSTS_ONLY_MESSAGE,
  NO_VOTES_MESSAGE,
  SHORTLIST_OPEN_MESSAGE,
  SHORTLIST_UP_MESSAGE,
  mayNominateMore,
  nominationsEach,
  settledVoteText,
} from "@bookmark/shared/clubVotes";
import { inviteFaces } from "@bookmark/shared/clubs";
import { PUSH_GROUPS, pushContentFor, pushedToSelf } from "@bookmark/shared/push";

const ID = (n: number) => n.toString(16).padStart(24, "0");

test("the host and co-hosts run votes; members don't", () => {
  assert.equal(canRunVote("host"), true);
  assert.equal(canRunVote("cohost"), true);
  assert.equal(canRunVote("member"), false);
  assert.equal(canRunVote(null), false);
});

test("everyone nominates, unless the vote is a shortlist or a host muted them", () => {
  assert.equal(canNominate("member", { hostsOnly: false, muted: false }), true);
  assert.equal(canNominate("member", { hostsOnly: true, muted: false }), false);
  assert.equal(canNominate("cohost", { hostsOnly: true, muted: false }), true);
  assert.equal(canNominate("member", { hostsOnly: false, muted: true }), false);
  // Even a muted co-host can't put a book up.
  assert.equal(canNominate("cohost", { hostsOnly: true, muted: true }), false);
  assert.equal(canNominate(null, { hostsOnly: false, muted: false }), false);
});

test("counting: one vote each, current members only, every book listed", () => {
  const members = new Set(["a", "b", "c"]);
  const counts = tallyVotes(["n1", "n2", "n3"], [
    { userId: "a", nominationId: "n1" },
    { userId: "b", nominationId: "n1" },
    { userId: "c", nominationId: "n2" },
    // Left the club: not counted.
    { userId: "gone", nominationId: "n2" },
    // A book taken down: not counted.
    { userId: "a", nominationId: "n9" },
  ], members);
  assert.deepEqual([...counts], [["n1", 2], ["n2", 1], ["n3", 0]]);
});

test("a clear winner wins; a level top is a tie for the host; no books cancels", () => {
  assert.deepEqual(voteOutcome(new Map([["n1", 3], ["n2", 1]])), { kind: "winner", nominationId: "n1" });
  assert.deepEqual(voteOutcome(new Map([["n1", 2], ["n2", 2], ["n3", 1]])), { kind: "tied", nominationIds: ["n1", "n2"], unvoted: false });
  // Nobody voted: every book is level, and it says so rather than calling it a tie.
  assert.deepEqual(voteOutcome(new Map([["n1", 0], ["n2", 0]])), { kind: "tied", nominationIds: ["n1", "n2"], unvoted: true });
  assert.equal(settledVoteText({ status: "TIED", voted: 0 }, true).heading, "Nobody voted");
  assert.equal(settledVoteText({ status: "TIED", voted: 4 }, false).heading, "The vote’s a tie");
  assert.match(clubVoteText("CLUB_VOTE_TIED", "Ash Club", NO_VOTES_MESSAGE)!, /^Nobody voted in Ash Club/);
  assert.match(clubVoteText("CLUB_VOTE_TIED", "Ash Club", null)!, /is a tie/);
  // One book, no votes: it wins.
  assert.deepEqual(voteOutcome(new Map([["n1", 0]])), { kind: "winner", nominationId: "n1" });
  assert.deepEqual(voteOutcome(new Map()), { kind: "empty" });
});

test("two nominations at once can't make eleven: only the first ten written stay", () => {
  const order = Array.from({ length: VOTE_NOMINATIONS_MAX + 1 }, (_, i) => `n${i}`);
  assert.equal(nominationAdmitted(order, `n${VOTE_NOMINATIONS_MAX - 1}`), true);
  assert.equal(nominationAdmitted(order, `n${VOTE_NOMINATIONS_MAX}`), false);
  assert.equal(nominationAdmitted(order, "missing"), false);
});

test("counts stay hidden while the vote is open, for everyone", () => {
  assert.equal(countsVisible("OPEN"), false);
  assert.equal(countsVisible("TIED"), true);
  assert.equal(countsVisible("CLOSED"), true);
});

test("a vote is due once its time is up, and only while it's open", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  assert.equal(isVoteDue({ status: "OPEN", closesAt: "2026-11-01T11:59:00Z" }, now), true);
  assert.equal(isVoteDue({ status: "OPEN", closesAt: "2026-11-01T12:01:00Z" }, now), false);
  assert.equal(isVoteDue({ status: "CLOSED", closesAt: "2026-10-01T00:00:00Z" }, now), false);
  assert.equal(closesAtFor(3, now).toISOString(), "2026-11-04T12:00:00.000Z");
});

test("input: 1 to 14 days, three by default; ids must look like ids", () => {
  assert.deepEqual(openVoteSchema.parse({}), { days: VOTE_DAYS_DEFAULT, hostsOnly: false });
  assert.equal(openVoteSchema.safeParse({ days: 0 }).success, false);
  assert.equal(openVoteSchema.safeParse({ days: VOTE_DAYS_MAX + 1 }).success, false);
  assert.equal(openVoteSchema.safeParse({ days: 2.5 }).success, false);
  assert.equal(nominateSchema.safeParse({ bookId: "nope" }).success, false);
  assert.equal(ballotSchema.safeParse({ nominationId: ID(7) }).success, true);
  assert.equal(voteActionSchema.safeParse({ action: "pick" }).success, false);
  assert.equal(voteActionSchema.safeParse({ action: "pick", nominationId: ID(1) }).success, true);
  assert.equal(voteActionSchema.safeParse({ action: "delete" }).success, false);
});

test("copy: time left, turnout", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  assert.equal(closesInText("2026-11-04T12:00:00Z", now), "Closes in 3 days");
  // A 7-day vote a minute after opening.
  assert.equal(closesInText("2026-11-08T11:59:00Z", now), "Closes in 7 days");
  assert.equal(closesInText("2026-11-03T13:00:00Z", now), "Closes in 2 days");
  assert.equal(closesInText("2026-11-02T12:00:00Z", now), "Closes in 24 hours");
  // A 1-day vote a minute after opening, and a 2-day one.
  assert.equal(closesInText("2026-11-02T11:59:00Z", now), "Closes in 24 hours");
  assert.equal(closesInText("2026-11-03T11:59:00Z", now), "Closes in 2 days");
  assert.equal(closesInText("2026-11-01T13:20:00Z", now), "Closes in 1 hour");
  assert.equal(closesInText("2026-11-01T13:00:00Z", now), "Closes in 1 hour");
  assert.equal(closesInText("2026-11-01T12:30:00Z", now), "Closes in under an hour");
  assert.equal(closesInText("2026-11-01T11:00:00Z", now), "Closing now");
  assert.equal(turnoutText(1, 40), "1 of 40 has voted");
  assert.equal(turnoutText(12, 40), "12 of 40 have voted");
});

test("voter lists follow the invite's rule: public profiles only, never blocked or suspended", () => {
  const voters = [
    { userId: "pub" },
    { userId: "priv", profileVisibility: "PRIVATE" },
    { userId: "followers", profileVisibility: "FOLLOWERS" },
    { userId: "blocked" },
    { userId: "suspended", suspended: true },
    { userId: "me", profileVisibility: "PRIVATE" },
  ];
  const named = inviteFaces(voters, { hostId: "pub", viewerId: "me", blocked: new Set(["blocked"]) }).map((v) => v.userId);
  assert.deepEqual(named, ["pub", "me"]);
});

test("vote notifications name nobody, are pushed in the circles group, and open the club", () => {
  for (const type of ["CLUB_VOTE_OPENED", "CLUB_VOTE_PICKED", "CLUB_VOTE_TIED", "CLUB_VOTE_CANCELLED"]) {
    assert.ok(isClubVoteNotification(type));
    assert.ok((PUSH_GROUPS.circles as readonly string[]).includes(type));
    // actorId is the reader themselves, so they must still be pushed.
    assert.ok(pushedToSelf(type));
    const push = pushContentFor({ type, actorUsername: "someone", bookTitle: null, buddyReadId: null, count: null, clubId: "c1", clubName: "Night Owls", message: "Piranesi" });
    assert.ok(push);
    assert.equal(push!.path, "/clubs/c1");
    assert.ok(!push!.body.includes("someone"));
  }
  assert.equal(clubVoteText("CLUB_VOTE_PICKED", "Night Owls", "Piranesi"), "Night Owls picked Piranesi as its next book.");
  assert.equal(clubVoteText("CLUB_VOTE_OPENED", null), "Your club is voting on its next book. Put one up or cast your vote.");
  assert.equal(clubVoteText("CLUB_VOTE_OPENED", "Night Owls", HOSTS_ONLY_MESSAGE), "Night Owls is voting on its next book. The hosts are putting up the shortlist; cast your vote.");
  assert.equal(isClubVoteNotification("CLUB_CIRCLE_ADDED"), false);
});

test("a hosts-only vote asks the hosts for books, then tells members once the shortlist is up", () => {
  assert.equal(clubVoteText("CLUB_VOTE_OPENED", "Night Owls", SHORTLIST_OPEN_MESSAGE), "Night Owls is voting on its next book. Put books up for the shortlist.");
  assert.equal(clubVoteText("CLUB_VOTE_OPENED", "Night Owls", SHORTLIST_UP_MESSAGE), "The shortlist for Night Owls's next book is up. Cast your vote.");
});

test("a vote called off says so, and says when archiving did it", () => {
  assert.equal(clubVoteText("CLUB_VOTE_CANCELLED", "Night Owls", null), "The vote on Night Owls's next book was called off.");
  assert.equal(clubVoteText("CLUB_VOTE_CANCELLED", "Night Owls", ARCHIVED_MESSAGE), "Night Owls was archived, so its vote on the next book is called off.");
  const push = pushContentFor({ type: "CLUB_VOTE_CANCELLED", actorUsername: null, bookTitle: null, buddyReadId: null, count: null, clubId: "c1", clubName: "Night Owls", message: null });
  assert.equal(push?.title, "Vote called off");
});

test("a hosts-only shortlist lets a host put up several books; everyone else one each", () => {
  assert.equal(nominationsEach(false), 1);
  assert.equal(nominationsEach(true), VOTE_NOMINATIONS_MAX);
  // A one-host club can still make a real shortlist.
  assert.equal(mayNominateMore(true, 3), true);
  assert.equal(mayNominateMore(true, VOTE_NOMINATIONS_MAX), false);
  assert.equal(mayNominateMore(false, 1), false);
});
