// Bookmark Plus: entitlements for free and Plus, the hosting limit with a plan, the Plus goal and
// personalisation gates, and the Stripe webhook's state machine against a stubbed database.
// No network and no real database: the webhook signature is made locally with Stripe's test helper.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/billing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { EntitlementError, allowanceLeft, entitlementErrorBody, entitlementsOf, hasAllowance, isUpgradeRequired, planStatusOf } from "@/lib/entitlements";
import { hostingAllowance } from "@/lib/buddyReads";
import { handleStripeEvent, planForStatus, type BillingDb } from "@/lib/billing";
import { goalInputSchema, goalProgress, setsExtraGoals } from "@/lib/goals";
import { personalisationOf, personalisationSchema, setsPersonalisation, shelfAccent } from "@/lib/personalisation";
import { stripeWebhooks } from "@/lib/stripe";

// ---- Entitlements ------------------------------------------------------------------------

test("a free account gets the free allowances and no Plus features", () => {
  const free = entitlementsOf({ plan: "FREE" });
  assert.equal(free.isPlus, false);
  assert.equal(free.canHostUnlimited, false);
  assert.equal(free.extraGoalTypes, false);
  assert.equal(free.monthlyWrapCards, false);
  assert.equal(free.personalisation, false);
  assert.deepEqual(free.allowances, { askShelfSearches: 5, recaps: 3 });
});

test("accounts made before billing (no plan stored) are free", () => {
  assert.deepEqual(entitlementsOf({}), entitlementsOf({ plan: "FREE" }));
  assert.deepEqual(entitlementsOf({ plan: null }), entitlementsOf({ plan: "FREE" }));
});

test("a Plus account gets every Plus feature and unlimited allowances", () => {
  const plus = entitlementsOf({ plan: "PLUS" });
  assert.equal(plus.isPlus, true);
  assert.equal(plus.canHostUnlimited, true);
  assert.equal(plus.extraGoalTypes, true);
  assert.equal(plus.monthlyWrapCards, true);
  assert.equal(plus.personalisation, true);
  assert.deepEqual(plus.allowances, { askShelfSearches: null, recaps: null });
});

test("monthly allowances count down on free and never run out on Plus", () => {
  const free = entitlementsOf({ plan: "FREE" });
  const plus = entitlementsOf({ plan: "PLUS" });
  assert.equal(allowanceLeft(free, "askShelfSearches", 0), 5);
  assert.equal(allowanceLeft(free, "askShelfSearches", 4), 1);
  assert.equal(allowanceLeft(free, "recaps", 7), 0);
  assert.equal(hasAllowance(free, "recaps", 2), true);
  assert.equal(hasAllowance(free, "recaps", 3), false);
  assert.equal(allowanceLeft(plus, "recaps", 500), null);
  assert.equal(hasAllowance(plus, "askShelfSearches", 500), true);
});

test("a refused entitlement becomes a 402 body the client recognises", () => {
  const error = new EntitlementError("extraGoalTypes");
  assert.equal(error.status, 402);
  const body = entitlementErrorBody(error);
  assert.equal(body.code, "upgrade_required");
  assert.equal(body.feature, "extraGoalTypes");
  assert.equal(body.upgradeUrl, "/plus");
  assert.ok(isUpgradeRequired(body));
  assert.equal(isUpgradeRequired({ error: "Something else" }), false);
});

test("plan status reads trials, renewals and a used trial", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const trialEnds = new Date("2026-11-05T12:00:00Z");
  const trial = planStatusOf({ plan: "PLUS", trialEndsAt: trialEnds, planRenewsAt: trialEnds, stripeCustomerId: "cus_1" }, now);
  assert.deepEqual(trial, { plan: "PLUS", trialing: true, until: trialEnds, hasBilling: true, trialUsed: true });

  const renews = new Date("2026-11-22T12:00:00Z");
  const paid = planStatusOf({ plan: "PLUS", trialEndsAt: new Date("2026-09-01T00:00:00Z"), planRenewsAt: renews, stripeCustomerId: "cus_1" }, now);
  assert.equal(paid.trialing, false);
  assert.deepEqual(paid.until, renews);

  const lapsed = planStatusOf({ plan: "FREE", trialEndsAt: new Date("2026-09-01T00:00:00Z"), stripeCustomerId: "cus_1" }, now);
  assert.deepEqual(lapsed, { plan: "FREE", trialing: false, until: null, hasBilling: true, trialUsed: true });
  assert.deepEqual(planStatusOf({}, now), { plan: "FREE", trialing: false, until: null, hasBilling: false, trialUsed: false });
});

// ---- Hosting -------------------------------------------------------------------------------

test("a Plus host has no active-circle limit", () => {
  const plus = hostingAllowance(1, "plus");
  assert.deepEqual(plus, { allowed: true, active: 1, limit: null, plan: "plus", upgrade: false, message: null });
  assert.equal(hostingAllowance(250, "plus").allowed, true);
});

test("a free host's refusal offers the upgrade", () => {
  const free = hostingAllowance(1, "free");
  assert.equal(free.allowed, false);
  assert.equal(free.limit, 1);
  assert.equal(free.upgrade, true);
  assert.match(free.message ?? "", /Joining circles is never limited/);
  assert.equal(hostingAllowance(0, "free").upgrade, false);
});

// ---- Goals and personalisation gates -------------------------------------------------------

test("only setting a page or monthly goal needs Plus", () => {
  const parse = (body: unknown) => goalInputSchema.parse(body);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20 })), false);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20, targetPages: null, targetBooksPerMonth: null })), false);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20, targetPages: "8000" })), true);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20, targetBooksPerMonth: 2 })), true);
  assert.equal(goalInputSchema.safeParse({ targetBooks: 0 }).success, false);
  assert.equal(goalInputSchema.safeParse({ targetBooks: 12, targetPages: 0 }).success, false);
});

test("goal progress counts this year's pages and this month's books", () => {
  const now = new Date(2026, 9, 22);
  const books = [
    { status: "COMPLETED", completedAt: new Date(2026, 9, 3), pages: 300 },
    { status: "COMPLETED", completedAt: new Date(2026, 1, 10), pages: 200 },
    { status: "COMPLETED", completedAt: new Date(2025, 9, 10), pages: 999 },
    { status: "STARTED", completedAt: null, pages: 400 },
  ];
  assert.deepEqual(goalProgress(books, now), { books: 2, pages: 500, thisMonth: 1, month: 9 });
});

test("personalisation applies only on Plus, and going back to the defaults is always allowed", () => {
  const stored = { profileTheme: "INK" as const, shelfCardColour: "#2f9e44", favColour: "#D92D2D" };
  assert.deepEqual(personalisationOf({ ...stored, plan: "PLUS" }), { profileTheme: "INK", shelfCardColour: "#2F9E44", supporter: true });
  assert.deepEqual(personalisationOf({ ...stored, plan: "FREE" }), { profileTheme: "CLASSIC", shelfCardColour: null, supporter: false });
  assert.equal(shelfAccent({ ...stored, plan: "PLUS" }), "#2F9E44");
  assert.equal(shelfAccent({ ...stored, plan: "FREE" }), "#D92D2D");

  assert.equal(setsPersonalisation(personalisationSchema.parse({ profileTheme: "TINT" })), true);
  assert.equal(setsPersonalisation(personalisationSchema.parse({ shelfCardColour: "#123456" })), true);
  assert.equal(setsPersonalisation(personalisationSchema.parse({ profileTheme: "CLASSIC" })), false);
  assert.equal(setsPersonalisation(personalisationSchema.parse({ shelfCardColour: null })), false);
  assert.equal(personalisationSchema.safeParse({ profileTheme: "NEON" }).success, false);
  assert.equal(personalisationSchema.safeParse({ plan: "PLUS" }).success, false);
});

// ---- The webhook ---------------------------------------------------------------------------

type Row = { id: string; [field: string]: unknown };

// Enough of prisma.user for lib/billing.ts: findFirst over an OR of equalities, and update.
function stubDb(rows: Row[]): BillingDb & { rows: Row[] } {
  const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    rows,
    user: {
      async findFirst({ where }) {
        const or = (where.OR as Record<string, unknown>[] | undefined) ?? [where];
        const row = rows.find((r) => or.some((clause) => matches(r, clause)));
        return row ? { id: row.id } : null;
      },
      async update({ where, data }) {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error("Record to update not found");
        Object.assign(row, data);
        return row;
      },
    },
  };
}

const USER_ID = "6560f1c2a1b2c3d4e5f60718";
const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function subscription(overrides: Partial<{ status: Stripe.Subscription.Status; periodEnd: string; trialEnd: string | null; cancelAtPeriodEnd: boolean }> = {}): Stripe.Subscription {
  const { status = "active", periodEnd = "2026-11-22T00:00:00Z", trialEnd = null, cancelAtPeriodEnd = false } = overrides;
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status,
    trial_end: trialEnd ? at(trialEnd) : null,
    cancel_at_period_end: cancelAtPeriodEnd,
    metadata: { userId: USER_ID },
    items: { object: "list", data: [{ id: "si_1", current_period_end: at(periodEnd) }], has_more: false, url: "" },
  } as unknown as Stripe.Subscription;
}

const event = (type: string, object: unknown) => ({ id: `evt_${type}`, object: "event", type, data: { object } }) as unknown as Stripe.Event;

test("checkout completed starts the Plus trial from the subscription Stripe made", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE", stripeCustomerId: "cus_123" }]);
  const session = { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_123", customer: "cus_123", client_reference_id: USER_ID, metadata: { userId: USER_ID } };
  const trial = subscription({ status: "trialing", periodEnd: "2026-11-05T00:00:00Z", trialEnd: "2026-11-05T00:00:00Z" });
  const outcome = await handleStripeEvent(event("checkout.session.completed", session), { db, retrieveSubscription: async () => trial });

  assert.equal(outcome.handled, true);
  assert.equal(outcome.plan, "PLUS");
  const row = db.rows[0];
  assert.equal(row.plan, "PLUS");
  assert.equal(row.stripeSubscriptionId, "sub_123");
  assert.deepEqual(row.planRenewsAt, new Date("2026-11-05T00:00:00Z"));
  assert.deepEqual(row.trialEndsAt, new Date("2026-11-05T00:00:00Z"));
  assert.ok(entitlementsOf(row as never).canHostUnlimited);
});

test("checkout completed without Stripe access still grants a full-length trial", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE" }]);
  const session = { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_123", customer: "cus_123", client_reference_id: USER_ID };
  const now = new Date("2026-10-22T00:00:00Z");
  await handleStripeEvent(event("checkout.session.completed", session), { db, now: () => now });
  assert.equal(db.rows[0].plan, "PLUS");
  assert.equal(db.rows[0].stripeCustomerId, "cus_123");
  assert.deepEqual(db.rows[0].planRenewsAt, new Date("2026-11-05T00:00:00Z"));
});

test("a subscription created event finds the account by the user id in its metadata", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE" }]);
  await handleStripeEvent(event("customer.subscription.created", subscription({ status: "trialing", trialEnd: "2026-11-05T00:00:00Z", periodEnd: "2026-11-05T00:00:00Z" })), { db });
  assert.equal(db.rows[0].plan, "PLUS");
  assert.equal(db.rows[0].stripeCustomerId, "cus_123");
});

test("a renewal moves the period end forward and keeps Plus", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", planRenewsAt: new Date("2026-11-22T00:00:00Z") }]);
  await handleStripeEvent(event("customer.subscription.updated", subscription({ periodEnd: "2026-12-22T00:00:00Z" })), { db });
  assert.equal(db.rows[0].plan, "PLUS");
  assert.deepEqual(db.rows[0].planRenewsAt, new Date("2026-12-22T00:00:00Z"));
});

test("cancelling in the portal keeps Plus until the period ends, then downgrades", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123" }]);
  await handleStripeEvent(event("customer.subscription.updated", subscription({ cancelAtPeriodEnd: true })), { db });
  assert.equal(db.rows[0].plan, "PLUS");

  const outcome = await handleStripeEvent(event("customer.subscription.deleted", subscription({ status: "canceled" })), { db });
  assert.equal(outcome.plan, "FREE");
  assert.equal(db.rows[0].plan, "FREE");
  assert.equal(db.rows[0].planRenewsAt, null);
  assert.equal(db.rows[0].stripeSubscriptionId, null);
  assert.equal(entitlementsOf(db.rows[0] as never).canHostUnlimited, false);
});

test("a trial that ends without a card is cancelled and the account goes back to free", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", trialEndsAt: new Date("2026-11-05T00:00:00Z") }]);
  await handleStripeEvent(event("customer.subscription.deleted", subscription({ status: "canceled", trialEnd: "2026-11-05T00:00:00Z" })), { db });
  assert.equal(db.rows[0].plan, "FREE");
  // The used trial stays recorded, so Checkout won't offer another.
  assert.ok(planStatusOf(db.rows[0] as never).trialUsed);
});

test("a failed payment pauses Plus, and a successful retry brings it back", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" }]);
  const invoice = { id: "in_1", object: "invoice", customer: "cus_123", parent: { type: "subscription_details", subscription_details: { subscription: "sub_123" } } };
  const failed = await handleStripeEvent(event("invoice.payment_failed", invoice), { db });
  assert.equal(failed.plan, "FREE");
  assert.equal(db.rows[0].plan, "FREE");

  await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "past_due" })), { db });
  assert.equal(db.rows[0].plan, "FREE");
  await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "active", periodEnd: "2026-12-22T00:00:00Z" })), { db });
  assert.equal(db.rows[0].plan, "PLUS");
});

test("events for unknown accounts and other event types change nothing", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE" }]);
  const stranger = { ...subscription(), id: "sub_other", customer: "cus_other", metadata: {} } as unknown as Stripe.Subscription;
  assert.equal((await handleStripeEvent(event("customer.subscription.updated", stranger), { db })).handled, false);
  assert.equal((await handleStripeEvent(event("customer.created", { id: "cus_x" }), { db })).handled, false);
  assert.equal((await handleStripeEvent(event("checkout.session.completed", { mode: "payment" }), { db })).handled, false);
  assert.equal(db.rows[0].plan, "FREE");
});

test("only active and trialing subscriptions are Plus", () => {
  assert.equal(planForStatus("active"), "PLUS");
  assert.equal(planForStatus("trialing"), "PLUS");
  for (const s of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const) assert.equal(planForStatus(s), "FREE");
});

test("the webhook accepts Stripe's signature over the raw body and rejects a tampered one", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify(event("customer.subscription.deleted", subscription({ status: "canceled" })));
  const webhooks = stripeWebhooks();
  const header = webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(webhooks.constructEvent(payload, header, secret).type, "customer.subscription.deleted");
  assert.throws(() => webhooks.constructEvent(payload.replace("canceled", "active"), header, secret));
  assert.throws(() => webhooks.constructEvent(payload, header, "whsec_wrong"));
});
