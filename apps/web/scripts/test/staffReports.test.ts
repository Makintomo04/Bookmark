// The staff reports queue's rules (lib/staffReportRules.ts): who may act on an escalated report, what a
// closed card says, when a review can go back up (and who may put it back), the badge count, edition labels and the overview's
// activity windows. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/staffReports.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityWindows, adminTookDown, canPutBack, editionLabel, isReportView, mayActOnReport, mayReverseTakedown, reportOutcome, stillTakenDown,
  takedownLockReason, timeAgo, trackRecordLine, waitingCount,
} from "@/lib/staffReportRules";

const reader = { role: "READER" };
const librarian = { role: "LIBRARIAN" };
const admin = { role: "ADMIN" };

test("anyone on the queue can act on an open report; readers can't act at all", () => {
  for (const action of ["dismiss", "hide", "hide_rating", "resolve", "escalate"] as const) {
    assert.equal(mayActOnReport(librarian, "OPEN", action), true, action);
    assert.equal(mayActOnReport(admin, "OPEN", action), true, action);
    assert.equal(mayActOnReport(reader, "OPEN", action), false, action);
  }
});

test("an escalated report is the admins': a librarian can't dismiss or hide it, and nobody escalates it twice", () => {
  for (const action of ["dismiss", "hide", "hide_rating", "resolve"] as const) {
    assert.equal(mayActOnReport(librarian, "ESCALATED", action), false, action);
    assert.equal(mayActOnReport(admin, "ESCALATED", action), true, action);
  }
  assert.equal(mayActOnReport(librarian, "ESCALATED", "escalate"), false);
  assert.equal(mayActOnReport(admin, "ESCALATED", "escalate"), false);
  // The old isStaff flag reads as an admin.
  assert.equal(mayActOnReport({ isStaff: true }, "ESCALATED", "dismiss"), true);
});

test("a closed card says what was decided", () => {
  assert.equal(reportOutcome("list", "DISMISSED"), "Dismissed");
  assert.equal(reportOutcome("book", "DISMISSED"), "Dismissed");
  assert.equal(reportOutcome("review", "ACTIONED"), "Taken down");
  assert.equal(reportOutcome("comment", "ACTIONED"), "Taken down");
  assert.equal(reportOutcome("book", "ACTIONED"), "Fixed");
  assert.equal(reportOutcome("list", "OPEN"), null);
  assert.equal(reportOutcome("list", "ESCALATED"), null);
});

test("only a closed review report whose review is still hidden can be put back up", () => {
  assert.equal(canPutBack({ kind: "review", status: "ACTIONED", restorable: true }), true);
  assert.equal(canPutBack({ kind: "review", status: "DISMISSED", restorable: true }), true);
  assert.equal(canPutBack({ kind: "review", status: "ACTIONED", restorable: false }), false);
  assert.equal(canPutBack({ kind: "review", status: "OPEN", restorable: true }), false);
  assert.equal(canPutBack({ kind: "list", status: "ACTIONED", restorable: true }), false);
});

test("an admin's decision stays an admin's: only an admin puts back up what went to one or what one took down", () => {
  const plain = { everEscalated: false, takenDownByAdmin: false };
  const escalated = { everEscalated: true, takenDownByAdmin: false };
  const byAdmin = { everEscalated: false, takenDownByAdmin: true };
  assert.equal(mayReverseTakedown(librarian, plain), true);
  assert.equal(mayReverseTakedown(librarian, escalated), false);
  assert.equal(mayReverseTakedown(librarian, byAdmin), false);
  for (const trail of [plain, escalated, byAdmin]) assert.equal(mayReverseTakedown(admin, trail), true);
  assert.equal(mayReverseTakedown(reader, plain), false);
  assert.equal(takedownLockReason(byAdmin), "An admin took this down, so only an admin can put it back up.");
  assert.equal(takedownLockReason(escalated), "This went to an admin, so only an admin can put it back up.");
});

test("taken down by an admin goes by the role they had then, or their role now for older log entries", () => {
  const nowAdmin = new Set(["promoted", "admin"]);
  // A librarian since made admin took it down as a librarian.
  assert.equal(adminTookDown([{ actorId: "promoted", byRole: "LIBRARIAN" }], nowAdmin), false);
  // An admin since stepped down still took it down as an admin.
  assert.equal(adminTookDown([{ actorId: "former", byRole: "ADMIN" }], nowAdmin), true);
  // No role recorded: their role now.
  assert.equal(adminTookDown([{ actorId: "admin" }], nowAdmin), true);
  assert.equal(adminTookDown([{ actorId: "lib", byRole: null }], nowAdmin), false);
  assert.equal(adminTookDown([], nowAdmin), false);
});

test("a take-down that was reversed no longer counts against the author", () => {
  assert.equal(stillTakenDown("review", { actioned: true, hiddenNow: true }), true);
  // Put back up.
  assert.equal(stillTakenDown("review", { actioned: true, hiddenNow: false }), false);
  // The reader deleted it since: still counts.
  assert.equal(stillTakenDown("review", { actioned: true }), true);
  assert.equal(stillTakenDown("review", { actioned: false, hiddenNow: true }), false);
  // A list counts while it's hidden, however it got there; un-hidden, it doesn't.
  assert.equal(stillTakenDown("list", { actioned: true, hiddenNow: false }), false);
  assert.equal(stillTakenDown("list", { actioned: false, hiddenNow: true }), true);
  assert.equal(stillTakenDown("comment", { actioned: true }), true);
  assert.equal(stillTakenDown("comment", { actioned: false }), false);
});

test("an author's track record leaves out the item on the card", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const clean = { reported: 1, takenDown: 0, suspensions: 0, lastSuspendedAt: null };
  assert.equal(trackRecordLine(clean, { actioned: false }, "sam", now), "First report about @sam");
  assert.equal(trackRecordLine({ ...clean, takenDown: 1 }, { actioned: true }, "sam", now), "First report about @sam");
  assert.equal(trackRecordLine({ reported: 4, takenDown: 1, suspensions: 1, lastSuspendedAt: "2026-09-12T10:00:00Z" }, { actioned: false }, "sam", now),
    "Reported 3 times before (1 upheld) · suspended once (12 Sep)");
  assert.equal(trackRecordLine({ reported: 2, takenDown: 0, suspensions: 2, lastSuspendedAt: "2025-03-01T10:00:00Z" }, { actioned: false }, null, now),
    "Reported once before · suspended twice (1 Mar 2025)");
  assert.equal(trackRecordLine({ ...clean, suspensions: 1, lastSuspendedAt: "2026-01-05T00:00:00Z" }, { actioned: false }, "sam", now),
    "First report about @sam · suspended once (5 Jan)");
});

test("the badge counts escalated items only for those who can act on them", () => {
  assert.equal(waitingCount({ open: 3, escalated: 2 }, admin), 5);
  assert.equal(waitingCount({ open: 3, escalated: 2 }, librarian), 3);
});

test("the tabs are open, escalated and closed", () => {
  assert.ok(isReportView("open") && isReportView("escalated") && isReportView("closed"));
  assert.equal(isReportView("queue"), false);
  assert.equal(isReportView(undefined), false);
});

test("a reported edition reads as format, publisher, ISBN and year, with whatever's known", () => {
  assert.equal(editionLabel({ format: "PAPERBACK", isbn13: "9780441013593", isbn10: "0441013597", publishedYear: 2005, publisher: "Ace" }), "Paperback · Ace · ISBN 9780441013593 · 2005");
  assert.equal(editionLabel({ format: "AUDIOBOOK", isbn10: "0441013597" }), "Audiobook · ISBN 0441013597");
  assert.equal(editionLabel({}), "An edition with no details");
});

test("times read as minutes, hours and days ago", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(timeAgo("2026-10-29T11:59:40Z", now), "just now");
  assert.equal(timeAgo("2026-10-29T11:45:00Z", now), "15m ago");
  assert.equal(timeAgo("2026-10-29T10:00:00Z", now), "2h ago");
  assert.equal(timeAgo("2026-10-26T12:00:00Z", now), "3d ago");
});

test("today starts at midnight UTC and the week on Monday", () => {
  // A Thursday afternoon.
  const { today, week } = activityWindows(new Date("2026-10-29T15:30:00Z"));
  assert.equal(today.toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(week.toISOString(), "2026-10-26T00:00:00.000Z");
  // A Sunday still belongs to the week that started on Monday.
  assert.equal(activityWindows(new Date("2026-11-01T08:00:00Z")).week.toISOString(), "2026-10-26T00:00:00.000Z");
  // And a Monday starts its own.
  assert.equal(activityWindows(new Date("2026-10-26T00:00:01Z")).week.toISOString(), "2026-10-26T00:00:00.000Z");
});
