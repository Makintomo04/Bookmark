// The Readers screen of the staff console (lib/staffUsers.ts) and what a suspended reader is told
// (lib/suspension.ts): who can search by what, the role filter, the confirm step for roles, billing on
// the card, appeals and who decides them, staff notes, the notice, and what a suspension hides. Pure: no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/staffUsers.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminConfirmWord, appealDecisionProblem, appealOpenProblem, billingDates, roleChangeProblem, roleFilterWhere, searchLimit, staffSearchWhere, stripeCustomerUrl } from "@/lib/staffUserRules";
import { hiddenWhileSuspended, suspensionNotice } from "@/lib/suspension";
import { appealDeciderProblem } from "@/lib/staffAppealRules";
import { mayKeepNotesOn } from "@/lib/staffNoteRules";

const now = new Date("2026-10-29T12:00:00Z");

const fieldsOf = (where: ReturnType<typeof staffSearchWhere>) => (where.OR ?? []).map((w) => Object.keys(w)[0]);

test("librarians search by handle (from the start) and display name (anywhere); only admins match email and account name", () => {
  assert.deepEqual(fieldsOf(staffSearchWhere("jane", { private: false })), ["username", "displayName"]);
  assert.deepEqual(fieldsOf(staffSearchWhere("jane", { private: true })), ["username", "displayName", "email", "name"]);
  assert.deepEqual(staffSearchWhere("Jane", { private: false }).OR?.[1], { displayName: { contains: "Jane", mode: "insensitive" } }, "display names match anywhere in them");
  assert.deepEqual(staffSearchWhere("a.b", { private: false }).OR?.[0], { username: { startsWith: "a\\.b", mode: "insensitive" } }, "regex characters are escaped");
});

test("a role change needs a reason; making an admin also needs their username typed back", () => {
  const target = { id: "a".repeat(24), username: "jane" };
  assert.match(roleChangeProblem(target, "LIBRARIAN", {}) ?? "", /reason/i);
  assert.match(roleChangeProblem(target, "LIBRARIAN", { reason: "   " }) ?? "", /reason/i);
  assert.equal(roleChangeProblem(target, "LIBRARIAN", { reason: "Helps with the catalogue" }), null);
  assert.match(roleChangeProblem(target, "ADMIN", { reason: "New team member" }) ?? "", /username/);
  assert.match(roleChangeProblem(target, "ADMIN", { reason: "New team member", confirm: "jan" }) ?? "", /username/);
  assert.equal(roleChangeProblem(target, "ADMIN", { reason: "New team member", confirm: "@Jane " }), null);
  assert.equal(adminConfirmWord({ id: "b".repeat(24), username: null }), "b".repeat(24), "no username yet: their id");
});

test("the suspension notice says when it ends, why, and who to email", () => {
  const notice = suspensionNotice({ suspendedUntil: new Date("2026-11-05T14:30:00Z"), suspensionReason: "Spam in reviews" }, "help@example.com");
  assert.equal(notice.until, "2026-11-05T14:30:00.000Z");
  assert.equal(notice.reason, "Spam in reviews");
  assert.equal(notice.message, "This account is suspended until 5 November 2026 at 14:30 UTC. Reason: Spam in reviews. If you think that's a mistake, email help@example.com.");

  const open = suspensionNotice({ suspendedUntil: null, suspensionReason: null }, null);
  assert.equal(open.until, null);
  assert.equal(open.message, "This account is suspended with no end date. Email support if you think that's a mistake.");
});

test("a suspended reader's reviews and comments are hidden from everyone but themselves, until it ends", () => {
  const author = { id: "a", suspendedAt: new Date("2026-10-28"), suspendedUntil: new Date("2026-11-01") };
  assert.equal(hiddenWhileSuspended(author, "b", now), true);
  assert.equal(hiddenWhileSuspended(author, null, now), true, "signed-out visitors too");
  assert.equal(hiddenWhileSuspended(author, "a", now), false, "not from themselves");
  assert.equal(hiddenWhileSuspended(author, "b", new Date("2026-11-02")), false, "back once it has ended");
  assert.equal(hiddenWhileSuspended({ id: "a", suspendedAt: null }, "b", now), false);
});

test("the role filter follows roleOf: no role stored is an admin with the old isStaff flag, a reader without", () => {
  assert.equal(roleFilterWhere("all"), null);
  assert.deepEqual(roleFilterWhere("LIBRARIAN"), { role: "LIBRARIAN" });
  const noRole = { OR: [{ role: { isSet: false } }, { role: null }] };
  assert.deepEqual(roleFilterWhere("ADMIN"), { OR: [{ role: "ADMIN" }, { AND: [noRole, { isStaff: true }] }] });
  assert.deepEqual(roleFilterWhere("READER"), { OR: [{ role: "READER" }, { AND: [noRole, { NOT: { isStaff: true } }] }] });
});

test("searches show 20 at a time, up to 100", () => {
  assert.equal(searchLimit(null), 20);
  assert.equal(searchLimit("abc"), 20);
  assert.equal(searchLimit("0"), 20);
  assert.equal(searchLimit("40"), 40);
  assert.equal(searchLimit("5000"), 100);
});

test("Open in Stripe goes to the test dashboard with a test key", () => {
  assert.equal(stripeCustomerUrl("cus_123", "sk_live_abc"), "https://dashboard.stripe.com/customers/cus_123");
  assert.equal(stripeCustomerUrl("cus_123", "sk_test_abc"), "https://dashboard.stripe.com/test/customers/cus_123");
  assert.equal(stripeCustomerUrl("cus_123", "rk_test_abc"), "https://dashboard.stripe.com/test/customers/cus_123", "restricted test keys too");
  assert.equal(stripeCustomerUrl("cus_123", undefined), "https://dashboard.stripe.com/customers/cus_123");
});

test("billing shows a running trial's end, or else when a Stripe plan renews", () => {
  const later = new Date("2026-12-04T00:00:00Z");
  const earlier = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(billingDates({ plan: "PLUS", planRenewsAt: later, trialEndsAt: earlier }, now), { renewsAt: later.toISOString(), endsAt: null, trialEndsAt: null }, "a used trial doesn't show");
  assert.deepEqual(billingDates({ plan: "PLUS", planRenewsAt: later, planCancelsAtPeriodEnd: true }, now), { renewsAt: null, endsAt: later.toISOString(), trialEndsAt: null }, "a cancelled plan ends, it doesn't renew");
  assert.deepEqual(billingDates({ plan: "PLUS", planRenewsAt: later, trialEndsAt: later, planCancelsAtPeriodEnd: true }, now), { renewsAt: null, endsAt: later.toISOString(), trialEndsAt: null }, "a cancelled trial ends, it doesn't convert");
  assert.deepEqual(billingDates({ plan: "PLUS", planRenewsAt: later, trialEndsAt: later }, now), { renewsAt: null, endsAt: null, trialEndsAt: later.toISOString() });
  assert.deepEqual(billingDates({ plan: "FREE", planRenewsAt: later }, now), { renewsAt: null, endsAt: null, trialEndsAt: null }, "nothing renews on free");
  assert.deepEqual(billingDates({ plan: "FREE", storeTrialing: true, storePlusUntil: later }, now), { renewsAt: null, endsAt: null, trialEndsAt: later.toISOString() }, "an app store trial");
  assert.deepEqual(billingDates({ plan: "FREE", storeTrialing: false, storePlusUntil: later }, now), { renewsAt: null, endsAt: null, trialEndsAt: null });
});

test("an appeal is logged only for a suspended reader, one at a time, with a summary", () => {
  assert.match(appealOpenProblem({ suspended: false }, false, "Sorry") ?? "", /aren't suspended/);
  assert.match(appealOpenProblem({ suspended: true }, true, "Sorry") ?? "", /already/);
  assert.match(appealOpenProblem({ suspended: true }, false, "  ") ?? "", /appealing/);
  assert.equal(appealOpenProblem({ suspended: true }, false, "Says the spam was a hacked account"), null);
});

test("admins decide open appeals, never their own, with a note", () => {
  const admin = { id: "a".repeat(24), role: "ADMIN" };
  const librarian = { id: "b".repeat(24), role: "LIBRARIAN" };
  const appeal = { userId: "c".repeat(24), status: "OPEN" };
  const body = { decision: "UPHELD", note: "Account was hacked" };
  assert.equal(appealDecisionProblem(admin, appeal, body), null);
  assert.equal(appealDecisionProblem(admin, appeal, { decision: "REJECTED", note: "Repeat spam" }), null);
  assert.match(appealDecisionProblem(librarian, appeal, body) ?? "", /admins/);
  assert.equal(appealDecisionProblem({ id: "x", isStaff: true }, appeal, body), null, "the old isStaff flag reads as admin");
  assert.match(appealDecisionProblem({ ...admin, id: appeal.userId }, appeal, body) ?? "", /your own/);
  assert.match(appealDecisionProblem(admin, { ...appeal, status: "UPHELD" }, body) ?? "", /already/);
  assert.match(appealDecisionProblem(admin, appeal, { decision: "OPEN", note: "x" }) ?? "", /Uphold or reject/);
  assert.match(appealDecisionProblem(admin, appeal, { decision: "UPHELD", note: " " }) ?? "", /note/);
});

test("the admin who logged an appeal doesn't decide it, unless they're the only admin", () => {
  const appeal = { openedById: "adm1" };
  assert.match(appealDeciderProblem({ id: "adm1" }, appeal, 2) ?? "", /another admin decides it/);
  assert.equal(appealDeciderProblem({ id: "adm1" }, appeal, 1), null);
  assert.equal(appealDeciderProblem({ id: "adm2" }, appeal, 2), null);
});

test("notes on readers are for anyone who can see readers; notes on staff are for admins", () => {
  const librarian = { role: "LIBRARIAN" };
  const admin = { role: "ADMIN" };
  const reader = { role: "READER" };
  assert.equal(mayKeepNotesOn(librarian, reader), true);
  assert.equal(mayKeepNotesOn(admin, reader), true);
  for (const target of [librarian, admin, { role: null, isStaff: true }]) {
    assert.equal(mayKeepNotesOn(librarian, target), false);
    assert.equal(mayKeepNotesOn(admin, target), true);
  }
  assert.equal(mayKeepNotesOn(reader, reader), false);
});
