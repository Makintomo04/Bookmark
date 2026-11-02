// A circle card's standing line (BOO-92): the words must agree with the percents beside them. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/circleStanding.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { circleStanding } from "@/lib/buddyReads";

const circle = (myProgress: number, others: number[], status = "ACTIVE") =>
  ({ status, myProgress, members: [{ progress: myProgress }, ...others.map((progress) => ({ progress }))] });

test("nobody is furthest along when everyone is still at 0", () => {
  assert.deepEqual(circleStanding(circle(0, [0])), { finished: false, label: "Nobody's started yet" });
});

test("a tie at the front says so", () => {
  assert.equal(circleStanding(circle(40, [40, 10])).label, "You're joint furthest along");
  assert.equal(circleStanding(circle(66.4, [65.1, 0])).label, "You're furthest along");
});

test("counts the readers ahead of you", () => {
  assert.equal(circleStanding(circle(10, [20])).label, "1 reader is ahead of you");
  assert.equal(circleStanding(circle(0, [20, 30])).label, "2 readers are ahead of you");
});

test("a circle everyone has finished moves out of Reading now", () => {
  assert.deepEqual(circleStanding(circle(100, [100, 100])), { finished: true, label: "Everyone's finished" });
});

test("a host-finished circle doesn't talk about who's ahead", () => {
  assert.deepEqual(circleStanding(circle(0, [40], "FINISHED")), { finished: true, label: "Circle finished" });
});

test("on your own, you're waiting for friends", () => {
  assert.deepEqual(circleStanding(circle(30, [])), { finished: false, label: "Waiting for friends to join" });
  assert.equal(circleStanding(circle(100, [])).finished, false);
});
