// A circle card's standing line (BOO-92): the words must agree with the percents beside them. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/circleStanding.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { circleStanding, formatPercent } from "@/lib/buddyReads";

const circle = (myProgress: number, others: number[], status = "ACTIVE") =>
  ({ status, myProgress, members: [{ progress: myProgress }, ...others.map((progress) => ({ progress }))] });

test("nobody is furthest along when everyone is still at 0", () => {
  assert.equal(circleStanding(circle(0, [0])).label, "Nobody's started yet");
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
  assert.equal(circleStanding(circle(100, [100, 100])).label, "Everyone's finished");
  assert.equal(circleStanding(circle(100, [100, 100])).finished, true);
});

test("a host-finished circle doesn't talk about who's ahead", () => {
  assert.equal(circleStanding(circle(0, [40], "FINISHED")).label, "Circle finished");
  assert.equal(circleStanding(circle(0, [40], "FINISHED")).finished, true);
});

test("on your own, you're waiting for friends", () => {
  assert.equal(circleStanding(circle(30, [])).label, "Waiting for friends to join");
  assert.equal(circleStanding(circle(100, [])).finished, false);
});

// The circle page's line under the shared track (BOO-96): whole percents, names, nearest first.
const named = (myProgress: number, others: [string, number][]) =>
  ({ status: "ACTIVE", myProgress, members: [{ progress: myProgress, name: "you", isYou: true }, ...others.map(([name, progress]) => ({ name, progress }))] });

test("the summary names who's near you and who hasn't started", () => {
  assert.equal(
    circleStanding(named(66.4, [["circleguest", 65.1], ["plusfriend", 0]])).summary,
    "You're at 66%. circleguest is just behind you; plusfriend hasn't started.",
  );
});

test("the summary puts the furthest along first and groups alike", () => {
  assert.equal(
    circleStanding(named(40, [["ana", 90], ["ben", 0], ["cat", 0]])).summary,
    "You're at 40%. ana is ahead at 90%; ben and cat haven't started.",
  );
  assert.equal(circleStanding(named(40, [["ana", 100], ["ben", 42]])).summary, "You're at 40%. ana has finished; ben is just ahead of you.");
  assert.equal(circleStanding(named(40.2, [["ana", 39.8]])).summary, "You're at 40%. ana is level with you.");
  assert.equal(circleStanding(named(80, [["ana", 20]])).summary, "You're at 80%. ana is at 20%.");
});

test("the summary for you at either end, alone, or with everyone level", () => {
  assert.equal(circleStanding(named(0, [["ana", 30]])).summary, "You haven't started yet. ana is ahead at 30%.");
  assert.equal(circleStanding(named(100, [["ana", 30]])).summary, "You've finished. ana is at 30%.");
  assert.equal(circleStanding(named(30, [])).summary, "You're at 30%. Nobody else has joined yet.");
  assert.equal(circleStanding(named(0, [["ana", 0]])).summary, "Nobody's started yet.");
  assert.equal(circleStanding(named(100, [["ana", 100]])).summary, "Everyone's finished.");
});

test("a big circle's summary counts instead of naming", () => {
  assert.equal(
    circleStanding(named(50, [["a", 80], ["b", 60], ["c", 50], ["d", 20], ["e", 0]])).summary,
    "You're at 50%. 2 are ahead of you, 1 is level with you, 1 is behind, 1 hasn't started.",
  );
});

test("percents are whole, and only 0 and 100 read as 0% and 100%", () => {
  assert.equal(formatPercent(66.4), "66%");
  assert.equal(formatPercent(66.5), "67%");
  assert.equal(formatPercent(0.2), "1%");
  assert.equal(formatPercent(99.7), "99%");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(100), "100%");
});
