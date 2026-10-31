// Reminder timing and words (packages/shared/src/reminders.ts): quiet hours, due windows, the reader's
// clock across zones and the clocks going back, the streak, the one-nudge-a-day rule and the push copy.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/reminders.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkpointMinute,
  checkpointPush,
  clockLabel,
  DEFAULT_QUIET_END,
  DEFAULT_QUIET_START,
  formatMinute,
  inQuietHours,
  isDue,
  isoWeekKey,
  localClock,
  nudgeFor,
  parseMinute,
  quietHoursOf,
  readingReminderPush,
  reminderTimes,
  streakAlertMinute,
  streakAlertPush,
  streakState,
  type NudgeInput,
} from "@bookmark/shared/reminders";

const at = (hhmm: string) => parseMinute(hhmm)!;
const quiet = quietHoursOf(null, null);

test("quiet hours wrap midnight, and default to 10pm to 8am", () => {
  assert.equal(quiet.start, DEFAULT_QUIET_START);
  assert.equal(quiet.end, DEFAULT_QUIET_END);
  assert.equal(inQuietHours(at("22:00"), quiet), true);
  assert.equal(inQuietHours(at("02:30"), quiet), true);
  assert.equal(inQuietHours(at("07:59"), quiet), true);
  assert.equal(inQuietHours(at("08:00"), quiet), false);
  assert.equal(inQuietHours(at("21:59"), quiet), false);
  // A daytime window, and none at all.
  assert.equal(inQuietHours(at("13:00"), { start: at("12:00"), end: at("14:00") }), true);
  assert.equal(inQuietHours(at("15:00"), { start: at("12:00"), end: at("14:00") }), false);
  assert.equal(inQuietHours(at("03:00"), { start: 0, end: 0 }), false);
});

test("a send is due from its slot for 45 minutes", () => {
  assert.equal(isDue(at("19:00"), at("18:59")), false);
  assert.equal(isDue(at("19:00"), at("19:00")), true);
  assert.equal(isDue(at("19:00"), at("19:44")), true);
  assert.equal(isDue(at("19:00"), at("19:45")), false);
});

test("the streak alert is at 7pm unless evening quiet hours start sooner", () => {
  assert.equal(streakAlertMinute(quiet), at("19:00"));
  assert.equal(streakAlertMinute({ start: at("19:30"), end: at("07:00") }), at("18:30"));
  // Quiet hours from 1am don't move it.
  assert.equal(streakAlertMinute({ start: at("01:00"), end: at("07:00") }), at("19:00"));
});

test("the reader's clock follows their zone, across midnight and the clocks going back", () => {
  // 25 Oct 2026, the UK leaves summer time at 01:00 UTC. 07:00 local is 06:00 UTC before and 07:00 after.
  assert.deepEqual(localClock(new Date("2026-10-24T06:00:00Z"), "Europe/London"), { day: "2026-10-24", minute: at("07:00"), weekday: 6 });
  assert.deepEqual(localClock(new Date("2026-10-26T07:00:00Z"), "Europe/London"), { day: "2026-10-26", minute: at("07:00"), weekday: 1 });
  // Late Saturday in Los Angeles is Sunday in UTC; mid-morning Sunday in Auckland is still Saturday in UTC.
  assert.deepEqual(localClock(new Date("2026-11-01T06:30:00Z"), "America/Los_Angeles"), { day: "2026-10-31", minute: at("23:30"), weekday: 6 });
  assert.deepEqual(localClock(new Date("2026-10-31T20:00:00Z"), "Pacific/Auckland"), { day: "2026-11-01", minute: at("09:00"), weekday: 0 });
  // Midnight is 0, not 24:00.
  assert.equal(localClock(new Date("2026-11-01T00:00:00Z"), "UTC").minute, 0);
});

test("ISO weeks, including across a year boundary", () => {
  assert.equal(isoWeekKey("2026-11-01"), "2026-W44");
  assert.equal(isoWeekKey("2026-10-26"), "2026-W44");
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
  assert.equal(isoWeekKey("2027-01-04"), "2027-W01");
  assert.equal(isoWeekKey("2024-12-30"), "2025-W01");
});

test("times as HH:MM and as a label", () => {
  assert.equal(formatMinute(at("07:05")), "07:05");
  assert.equal(parseMinute("24:00"), null);
  assert.equal(parseMinute("7:00"), null);
  assert.equal(clockLabel(at("00:00")), "12am");
  assert.equal(clockLabel(at("19:30")), "7:30pm");
  // The picker never offers a time inside quiet hours.
  const times = reminderTimes(quiet);
  assert.ok(times.includes(at("08:00")) && times.includes(at("21:45")));
  assert.ok(!times.includes(at("22:00")) && !times.includes(at("07:45")));
});

test("the streak: alive from yesterday until midnight, broken after a missed day", () => {
  const days = new Set(["2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.deepEqual(streakState(days, "2026-10-31"), { streak: 3, readToday: false });
  assert.deepEqual(streakState(new Set([...days, "2026-10-31"]), "2026-10-31"), { streak: 4, readToday: true });
  assert.deepEqual(streakState(days, "2026-11-01"), { streak: 0, readToday: false });
});

const nudge = (over: Partial<NudgeInput>): ReturnType<typeof nudgeFor> =>
  nudgeFor({ minute: at("12:00"), quiet, reminderMinute: null, streakAlerts: false, streak: 0, readToday: false, ...over });

test("one reading nudge a day: the reminder at its time, the streak alert in the evening", () => {
  assert.equal(nudge({ minute: at("08:30"), reminderMinute: at("08:30") }), "reminder");
  assert.equal(nudge({ minute: at("19:00"), streakAlerts: true, streak: 4 }), "streak");
  // Nothing once they've read today.
  assert.equal(nudge({ minute: at("19:00"), streakAlerts: true, streak: 4, readToday: true }), null);
  assert.equal(nudge({ minute: at("08:30"), reminderMinute: at("08:30"), readToday: true }), null);
});

test("the streak alert needs a streak of three days or more", () => {
  assert.equal(nudge({ minute: at("19:00"), streakAlerts: true, streak: 2 }), null);
  assert.equal(nudge({ minute: at("19:00"), streakAlerts: true, streak: 3 }), "streak");
  assert.equal(nudge({ minute: at("19:00"), streakAlerts: false, streak: 9 }), null);
});

test("an evening reminder becomes the streak alert when a streak is at risk", () => {
  assert.equal(nudge({ minute: at("20:00"), reminderMinute: at("20:00"), streakAlerts: true, streak: 5 }), "streak");
});

test("a morning reminder doesn't stop the evening streak alert", () => {
  // The job keeps them apart in the ledger ("nudge" and "streak"), so both go out on an at-risk day.
  assert.equal(nudge({ minute: at("08:00"), reminderMinute: at("08:00"), streakAlerts: true, streak: 5 }), "reminder");
  assert.equal(nudge({ minute: at("19:00"), reminderMinute: at("08:00"), streakAlerts: true, streak: 5 }), "streak");
});

test("checkpoint reminders wait for quiet hours to end", () => {
  assert.equal(checkpointMinute(quiet), at("09:00"));
  assert.equal(checkpointMinute({ start: at("23:00"), end: at("10:30") }), at("10:30"));
});

test("nothing is sent inside quiet hours", () => {
  const late = { start: at("18:00"), end: at("08:00") };
  assert.equal(nudge({ minute: at("18:30"), reminderMinute: at("18:30"), quiet: late }), null);
});

test("the words use only the reader's own book and numbers", () => {
  assert.deepEqual(readingReminderPush({ id: "b1", title: "The Hobbit", at: 112, of: 310, unit: "PAGES" }), {
    title: "Time to read?",
    body: "You're on page 112 of 310 of The Hobbit.",
    path: "/book/b1",
  });
  assert.equal(readingReminderPush({ id: "b1", title: "Dune", at: 95, of: 1260, unit: "MINUTES" }).body, "You're 1h 35m into Dune.");
  assert.equal(readingReminderPush({ id: "b1", title: "Dune", at: 0, of: 400, unit: "PAGES" }).body, "Dune is waiting for you.");
  assert.equal(readingReminderPush(null).body, "Pick something from Want to read.");
  assert.deepEqual(streakAlertPush(6), { title: "Your 6-day streak ends tonight", body: "Log a page to keep it going.", path: "/" });
  assert.deepEqual(checkpointPush({ circleId: "c1", label: "Part 2", due: "2026-11-01", progress: 41.2, until: 55, waiting: 3 }), {
    title: "Part 2 is due Sunday",
    body: "You're at 41% and it ends at 55%. 3 comments are waiting there.",
    path: "/circles/c1",
  });
  assert.equal(checkpointPush({ circleId: "c1", label: "Part 2", due: "2026-11-01", progress: 41, until: 55, waiting: 0 }).body, "You're at 41% and it ends at 55%.");
});
