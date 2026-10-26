// Staff roles (packages/shared/src/roles.ts): what each role may do, the old isStaff flag, who may act
// on whom, and suspensions. Pure: no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/roles.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, can, canActOn, isStaffRole, isSuspended, roleOf, suspensionEnd } from "@/lib/roles";
import { STAFF_BADGE, staffBadgeOf } from "@/lib/staffBadge";

const reader = { id: "r", role: "READER" };
const librarian = { id: "l", role: "LIBRARIAN" };
const admin = { id: "a", role: "ADMIN" };

test("readers can do nothing staff-only; librarians fix books, curate lists and work reports; admins can do everything", () => {
  for (const p of PERMISSIONS) assert.equal(can(reader, p), false, `reader: ${p}`);
  for (const p of PERMISSIONS) assert.equal(can(admin, p), true, `admin: ${p}`);
  for (const p of ["catalogue.edit", "lists.curate", "reports.review", "users.view", "content.quests"] as const) assert.equal(can(librarian, p), true, `librarian: ${p}`);
  for (const p of ["users.suspend", "plus.grant", "roles.assign", "staff.log"] as const) assert.equal(can(librarian, p), false, `librarian: ${p}`);
});

test("no role reads as reader, and the old isStaff flag reads as admin until a role is set", () => {
  assert.equal(roleOf(null), "READER");
  assert.equal(roleOf({}), "READER");
  assert.equal(roleOf({ role: "nonsense" }), "READER");
  assert.equal(roleOf({ isStaff: true }), "ADMIN");
  assert.equal(roleOf({ isStaff: true, role: "LIBRARIAN" }), "LIBRARIAN");
  assert.equal(can(undefined, "lists.curate"), false);
  assert.equal(isStaffRole(librarian), true);
  assert.equal(isStaffRole(reader), false);
});

test("an admin can act on readers and librarians, but not on themselves or another admin", () => {
  assert.equal(canActOn(admin, reader), true);
  assert.equal(canActOn(admin, librarian), true);
  assert.equal(canActOn(admin, admin), false);
  assert.equal(canActOn(admin, { id: "a2", role: "ADMIN" }), false);
  assert.equal(canActOn(admin, { id: "old", isStaff: true }), false, "a legacy staff account is an admin");
});

test("a suspension lasts from suspendedAt until suspendedUntil, or for good with no end", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.equal(isSuspended(null, now), false);
  assert.equal(isSuspended({}, now), false);
  assert.equal(isSuspended({ suspendedAt: null, suspendedUntil: new Date("2027-01-01") }, now), false);
  assert.equal(isSuspended({ suspendedAt: new Date("2026-10-01") }, now), true);
  assert.equal(isSuspended({ suspendedAt: "2026-10-01", suspendedUntil: "2026-10-27" }, now), true);
  assert.equal(isSuspended({ suspendedAt: "2026-10-01", suspendedUntil: "2026-10-26T11:59:59Z" }, now), false, "ended");
  assert.equal(suspensionEnd("indefinite", now), null);
  assert.equal(suspensionEnd("7d", now)?.toISOString(), "2026-11-02T12:00:00.000Z");
});

test("the staff badge: the team always shows as Bookmark team, librarians can hide theirs, readers get none", () => {
  assert.equal(staffBadgeOf(reader), null);
  assert.equal(staffBadgeOf(null), null);
  assert.equal(staffBadgeOf(librarian), "librarian");
  assert.equal(staffBadgeOf({ ...librarian, hideStaffBadge: true }), null);
  assert.equal(staffBadgeOf(admin), "team");
  assert.equal(staffBadgeOf({ ...admin, hideStaffBadge: true }), "team", "the team can't hide it");
  assert.equal(staffBadgeOf({ isStaff: true }), "team", "the old staff flag");
  assert.equal(STAFF_BADGE.team.label, "Bookmark team");
});
