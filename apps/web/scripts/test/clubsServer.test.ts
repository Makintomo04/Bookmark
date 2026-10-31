// Book clubs (BOO-49): the database rules that close round 9's loopholes, against a stubbed database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/clubsServer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { finishClubBooks, settleNewClubBook, withinClubCap } from "@/lib/clubLimits";
import { BIG_CLUB_MAX_MEMBERS, CLUB_MAX_MEMBERS } from "@bookmark/shared/clubs";

test("archiving a club finishes its open books, so none run outside every hosting limit", async () => {
  const calls: unknown[] = [];
  const db = { buddyRead: { updateMany: async (args: unknown) => { calls.push(args); return { count: 2 }; } } };
  const finished = await finishClubBooks("club1", db as never);
  assert.equal(finished, 2);
  assert.deepEqual(calls, [{ where: { clubId: "club1", status: "ACTIVE" }, data: { status: "FINISHED" } }]);
});

test("a book started as the club is archived is finished with the rest; one in an active club is left alone", async () => {
  const finishing: unknown[] = [];
  const stub = (status: string) => ({
    club: { findUnique: async () => ({ status }) },
    buddyRead: { updateMany: async (args: unknown) => { finishing.push(args); return { count: 1 }; } },
  });
  assert.equal(await settleNewClubBook("club1", stub("ACTIVE") as never), true);
  assert.equal(finishing.length, 0);
  assert.equal(await settleNewClubBook("club1", stub("ARCHIVED") as never), false);
  assert.deepEqual(finishing, [{ where: { clubId: "club1", status: "ACTIVE" }, data: { status: "FINISHED" } }]);
});

test("a join that races past the cap backs out: the later of two simultaneous joins isn't admitted", async () => {
  const order = Array.from({ length: CLUB_MAX_MEMBERS + 1 }, (_, i) => ({ userId: `u${i}` }));
  let query: unknown = null;
  const db = { clubMember: { findMany: async (args: unknown) => { query = args; return order; } } };
  assert.equal(await withinClubCap("club1", `u${CLUB_MAX_MEMBERS - 1}`, db as never), true);
  assert.equal(await withinClubCap("club1", `u${CLUB_MAX_MEMBERS}`, db as never), false);
  // In joining order, with the id breaking ties.
  assert.deepEqual((query as { orderBy: unknown }).orderBy, [{ joinedAt: "asc" }, { id: "asc" }]);
});

test("a Plus host's club checks the race against its own cap (BOO-79)", async () => {
  const order = Array.from({ length: BIG_CLUB_MAX_MEMBERS + 1 }, (_, i) => ({ userId: `u${i}` }));
  const db = { clubMember: { findMany: async () => order } };
  // The 16th is in a big club...
  assert.equal(await withinClubCap("club1", "u15", db as never, BIG_CLUB_MAX_MEMBERS), true);
  assert.equal(await withinClubCap("club1", `u${BIG_CLUB_MAX_MEMBERS - 1}`, db as never, BIG_CLUB_MAX_MEMBERS), true);
  // ...and the 151st isn't.
  assert.equal(await withinClubCap("club1", `u${BIG_CLUB_MAX_MEMBERS}`, db as never, BIG_CLUB_MAX_MEMBERS), false);
  // Left out, the cap is the free one.
  assert.equal(await withinClubCap("club1", "u15", db as never), false);
});
