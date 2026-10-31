// Staff notifications (lib/staffNotifyRules.ts, packages/shared/src/staffNotices.ts): who hears a report is
// waiting, one unread notice per person at a time and kept to the current count, admins alone hear of
// escalations, staff pushes only for staff, and readers are never told which librarian or admin it was.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/staffNotify.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { escalationRecipients, planStaffReportNotices, planWaitingRefresh, reportRecipients } from "@/lib/staffNotifyRules";
import {
  escalationMessage, escalationResolvedText, reviewRestoredText, roleChangedText, staffNoticeWebPath, staffReportText,
} from "@bookmark/shared/staffNotices";
import { pushContentFor, pushGroupOf, pushGroupsFor, pushedToSelf } from "@bookmark/shared/push";

const librarian = { id: "lib", role: "LIBRARIAN" };
const admin = { id: "adm", role: "ADMIN" };
const oldTeam = { id: "old", role: null, isStaff: true };
const reader = { id: "rdr", role: "READER" };
const suspended = { id: "sus", role: "LIBRARIAN", suspendedAt: new Date("2026-01-01") };
const staff = [librarian, admin, oldTeam, reader, suspended];
const ids = (list: { id: string }[]) => list.map((s) => s.id).sort();

test("a report reaches every librarian and admin, but not the reporter, readers or the suspended", () => {
  assert.deepEqual(ids(reportRecipients(staff, "someone")), ["adm", "lib", "old"]);
  assert.deepEqual(ids(reportRecipients(staff, "lib")), ["adm", "old"]);
});

test("an escalation reaches admins only, never the one who escalated", () => {
  assert.deepEqual(ids(escalationRecipients(staff, "lib")), ["adm", "old"]);
  assert.deepEqual(ids(escalationRecipients(staff, "adm")), ["old"]);
});

test("one unread notice per person: refreshed, not piled up", () => {
  const plan = planStaffReportNotices([librarian, admin], [{ id: "n1", userId: "lib" }], { open: 3, escalated: 2 });
  assert.deepEqual(plan.update, [{ id: "n1", userId: "lib", count: 3 }]);
  // Admins count the escalated ones too.
  assert.deepEqual(plan.create, [{ userId: "adm", count: 5 }]);
});

test("nobody is told when nothing's waiting on them", () => {
  const plan = planStaffReportNotices([librarian, admin], [], { open: 0, escalated: 1 });
  assert.deepEqual(plan.create, [{ userId: "adm", count: 1 }]);
  assert.deepEqual(plan.update, []);
});

test("staff notices open the queue", () => {
  assert.equal(staffReportText(1), "A report is waiting in the staff queue");
  assert.equal(staffReportText(4), "4 reports are waiting in the staff queue");
  assert.equal(staffNoticeWebPath("STAFF_REPORT", null), "/staff/reports");
  assert.equal(staffNoticeWebPath("STAFF_ESCALATION", "review"), "/staff/reports?view=escalated");
  assert.match(escalationResolvedText(escalationMessage("list", "DISMISSED")), /closed a list you escalated without acting/);
  assert.match(escalationResolvedText(escalationMessage("review", "ACTIONED")), /acted on a review you escalated/);
});

test("a new role says what it's for; back to reader is a thank-you", () => {
  assert.match(roleChangedText("LIBRARIAN"), /You're a Librarian/);
  assert.equal(staffNoticeWebPath("ROLE_CHANGED", "ADMIN"), "/staff");
  assert.match(roleChangedText("READER"), /Thank you/);
  assert.equal(staffNoticeWebPath("ROLE_CHANGED", "READER"), null);
});

test("reader-facing notices are pushed and name nobody", () => {
  for (const type of ["REVIEW_HIDDEN", "REVIEW_RESTORED", "ROLE_CHANGED"]) {
    assert.equal(pushGroupOf(type), "account", type);
    assert.ok(pushedToSelf(type), type);
    const push = pushContentFor({ type, actorUsername: "librarian_ana", bookTitle: "Dune", buddyReadId: null, count: null, message: "LIBRARIAN" })!;
    assert.ok(!push.body.includes("librarian_ana") && !push.title.includes("librarian_ana"), type);
  }
  assert.equal(reviewRestoredText("Dune"), pushContentFor({ type: "REVIEW_RESTORED", actorUsername: null, bookTitle: "Dune", buddyReadId: null, count: null })!.body);
  assert.equal(pushGroupOf("ESCALATION_RESOLVED"), null);
});

test("after staff close or escalate reports, each unread notice says what's waiting on its owner now", () => {
  const unread = [
    { id: "n-lib", userId: "lib", count: 4 },
    { id: "n-adm", userId: "adm", count: 6 },
    { id: "n-old", userId: "old", count: 3 },
    { id: "n-rdr", userId: "rdr", count: 2 },
  ];
  const plan = planWaitingRefresh(staff, unread, { open: 1, escalated: 2 });
  // The old team account's count is already right, so it's left alone.
  assert.deepEqual(plan.update, [{ id: "n-lib", count: 1 }, { id: "n-adm", count: 3 }]);
  // Someone no longer on the queue has nothing waiting on them.
  assert.deepEqual(plan.markRead, ["n-rdr"]);
  // Nothing left for librarians: theirs is read even while an escalation waits for admins.
  const empty = planWaitingRefresh(staff, unread, { open: 0, escalated: 1 });
  assert.deepEqual(empty.markRead, ["n-lib", "n-rdr"]);
  assert.deepEqual(empty.update, [{ id: "n-adm", count: 1 }, { id: "n-old", count: 1 }]);
  // An owner who's gone reads as nothing waiting.
  assert.deepEqual(planWaitingRefresh([], [{ id: "x", userId: "gone", count: 1 }], { open: 5, escalated: 0 }).markRead, ["x"]);
});

test("staff work is pushed to staff, who can switch it off; readers never see the setting", () => {
  assert.equal(pushGroupOf("STAFF_REPORT"), "staff");
  assert.equal(pushGroupOf("STAFF_ESCALATION"), "staff");
  // The queue count has no actor but the recipient.
  assert.ok(pushedToSelf("STAFF_REPORT"));
  assert.ok(pushGroupsFor(true).includes("staff"));
  assert.ok(!pushGroupsFor(false).includes("staff"));
  assert.equal(pushContentFor({ type: "STAFF_REPORT", actorUsername: null, bookTitle: null, buddyReadId: null, count: 3 })!.body, "3 reports are waiting in the staff queue.");
  assert.equal(pushContentFor({ type: "STAFF_ESCALATION", actorUsername: "ana", bookTitle: null, buddyReadId: null, count: null, message: "list" })!.body, "@ana passed a list to admins.");
});
