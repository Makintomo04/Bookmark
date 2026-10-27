// Bookmark Plus: entitlements for free and Plus, the hosting limit with a plan, the Plus goal gates,
// and the Stripe webhook's state machine against a stubbed database.
// No network and no real database: the webhook signature is made locally with Stripe's test helper.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/billing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { EntitlementError, FOUNDING, PLUS_PRICING, allowanceLeft, canStartCheckout, entitlementErrorBody, entitlementsOf, foundingStatus, hasAllowance, isUpgradeRequired, parseFoundingClose, planOf, planStatusOf, plusSourceOf } from "@/lib/entitlements";
import { ASSUMED_USD_PER, REGIONAL_PRICES, currencyForCountry, formatPrice } from "@/lib/regionalPricing";
import { hostingAllowance } from "@/lib/buddyReads";
import { handleStripeEvent, planForStatus, type BillingDb, type BillingStripeApi } from "@/lib/billing";
import { formatPace, goalInputSchema, goalProgress, monthTarget, monthlyPace, setsExtraGoals } from "@/lib/goals";
import { supporterOf } from "@/lib/supporter";
import { CHECKOUT_INTEGRATION_ID, stripeWebhooks } from "@/lib/stripe";

// ---- Entitlements ------------------------------------------------------------------------

test("a free account gets the free allowances and no Plus features", () => {
  const free = entitlementsOf({ plan: "FREE" });
  assert.equal(free.isPlus, false);
  assert.equal(free.canHostUnlimited, false);
  assert.equal(free.extraGoalTypes, false);
  assert.equal(free.customWrapDesigns, false);
  // Catch me up comes with Plus: a free allowance of 0, never null (which would mean unlimited).
  assert.deepEqual(free.allowances, { askShelfSearches: 3, recaps: 0 });
});

test("accounts made before billing (no plan stored) are free", () => {
  assert.deepEqual(entitlementsOf({}), entitlementsOf({ plan: "FREE" }));
  assert.deepEqual(entitlementsOf({ plan: null }), entitlementsOf({ plan: "FREE" }));
});

test("a Plus account gets every Plus feature and the fair-use allowances", () => {
  const plus = entitlementsOf({ plan: "PLUS" });
  assert.equal(plus.isPlus, true);
  assert.equal(plus.canHostUnlimited, true);
  assert.equal(plus.extraGoalTypes, true);
  assert.equal(plus.customWrapDesigns, true);
  assert.deepEqual(plus.allowances, { askShelfSearches: 100, recaps: 30 });
});

test("monthly allowances count down, with a higher stated ceiling on Plus", () => {
  const free = entitlementsOf({ plan: "FREE" });
  const plus = entitlementsOf({ plan: "PLUS" });
  assert.equal(allowanceLeft(free, "askShelfSearches", 0), 3);
  assert.equal(allowanceLeft(free, "askShelfSearches", 2), 1);
  assert.equal(hasAllowance(free, "askShelfSearches", 2), true);
  assert.equal(hasAllowance(free, "askShelfSearches", 3), false);
  assert.equal(allowanceLeft(free, "recaps", 0), 0);
  assert.equal(allowanceLeft(free, "recaps", 7), 0);
  assert.equal(hasAllowance(free, "recaps", 0), false);
  assert.equal(allowanceLeft(plus, "recaps", 10), 20);
  assert.equal(hasAllowance(plus, "askShelfSearches", 99), true);
  assert.equal(hasAllowance(plus, "askShelfSearches", 100), false);
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
  assert.deepEqual(trial, { plan: "PLUS", source: "subscription", founding: false, patron: false, lifetime: false, compUntil: null, trialing: true, until: trialEnds, store: null, hasBilling: true, trialUsed: true });

  const renews = new Date("2026-11-22T12:00:00Z");
  const paid = planStatusOf({ plan: "PLUS", trialEndsAt: new Date("2026-09-01T00:00:00Z"), planRenewsAt: renews, stripeCustomerId: "cus_1" }, now);
  assert.equal(paid.trialing, false);
  assert.deepEqual(paid.until, renews);

  const lapsed = planStatusOf({ plan: "FREE", trialEndsAt: new Date("2026-09-01T00:00:00Z"), stripeCustomerId: "cus_1" }, now);
  assert.deepEqual(lapsed, { plan: "FREE", source: null, founding: false, patron: false, lifetime: false, compUntil: null, trialing: false, until: null, store: null, hasBilling: true, trialUsed: true });
  assert.deepEqual(planStatusOf({}, now), { plan: "FREE", source: null, founding: false, patron: false, lifetime: false, compUntil: null, trialing: false, until: null, store: null, hasBilling: false, trialUsed: false });
  assert.equal(planStatusOf({ plan: "PLUS", foundingMember: true }, now).founding, true);
});

// ---- Prices and the Founding Reader window -----------------------------------------------------

test("Plus costs $3.99 a month or $29.99 a year, and founders pay $24.99 a year", () => {
  assert.equal(PLUS_PRICING.monthly, 3.99);
  assert.equal(PLUS_PRICING.yearly, 29.99);
  assert.equal(FOUNDING.yearly, 24.99);
  assert.equal(FOUNDING.cap, 1000);
  // The yearly plan is a 37% saving on twelve monthly payments.
  assert.equal(Math.round((1 - PLUS_PRICING.yearly / (PLUS_PRICING.monthly * 12)) * 100), 37);
});

test("the Founding window closes at the cap or on its closing date, whichever comes first", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const closes = new Date("2027-01-30T00:00:00Z");
  assert.deepEqual(foundingStatus(0, closes, now), { open: true, remaining: 1000, closesAt: closes });
  assert.deepEqual(foundingStatus(999, closes, now), { open: true, remaining: 1, closesAt: closes });
  assert.deepEqual(foundingStatus(1000, closes, now), { open: false, remaining: 0, closesAt: closes });
  assert.equal(foundingStatus(1200, null, now).remaining, 0);
  assert.equal(foundingStatus(10, closes, new Date("2027-01-30T00:00:00Z")).open, false);
  // No closing date set: only the cap applies.
  assert.equal(foundingStatus(10, null, now).open, true);
  assert.deepEqual(parseFoundingClose("2027-01-30"), new Date("2027-01-30T00:00:00Z"));
  assert.equal(parseFoundingClose("not a date"), null);
  assert.equal(parseFoundingClose(undefined), null);
});

// ---- Hosting -------------------------------------------------------------------------------

test("a Plus host has no active-circle limit", () => {
  const plus = hostingAllowance(1, "plus");
  assert.deepEqual(plus, { allowed: true, active: 1, limit: null, plan: "plus", upgrade: false, message: null });
  assert.equal(hostingAllowance(250, "plus").allowed, true);
});

test("a free host's refusal at one active circle offers the upgrade", () => {
  assert.equal(hostingAllowance(0, "free").allowed, true);
  const free = hostingAllowance(1, "free");
  assert.equal(free.allowed, false);
  assert.equal(free.limit, 1);
  assert.equal(free.upgrade, true);
  assert.match(free.message ?? "", /Joining circles is never limited/);
  assert.equal(hostingAllowance(0, "free").upgrade, false);
});

// ---- Goal gates ----------------------------------------------------------------------------

test("only setting a page or monthly goal needs Plus", () => {
  const parse = (body: unknown) => goalInputSchema.parse(body);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20 })), false);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20, targetPages: null, targetBooksPerMonth: null })), false);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20, targetPages: "8000" })), true);
  assert.equal(setsExtraGoals(parse({ targetBooks: 20, targetBooksPerMonth: 2 })), true);
  assert.equal(goalInputSchema.safeParse({ targetBooks: 0 }).success, false);
  assert.equal(goalInputSchema.safeParse({ targetBooks: 12, targetPages: 0 }).success, false);
});

test("goal progress counts every dated finish this year, re-reads included", () => {
  const finishes = [
    { year: 2026, month: 9, pages: 300 },
    { year: 2026, month: 1, pages: 200 },
    // The same book again in October: a re-read counts, as on the stats page.
    { year: 2026, month: 9, pages: 300 },
    // A listened finish adds a book but no pages.
    { year: 2026, month: 3, pages: 0 },
    { year: 2025, month: 9, pages: 999 },
    { year: null, month: null, pages: 400 },
  ];
  assert.deepEqual(goalProgress(finishes, 2026, 9), { books: 4, pages: 800, thisMonth: 2, month: 9 });
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
        return row ? { id: row.id, stripeSubscriptionId: (row.stripeSubscriptionId as string | null | undefined) ?? null } : null;
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

// Stripe doesn't deliver events in order. These pin the guards in lib/billing.ts against stale ones.
const withId = (sub: Stripe.Subscription, id: string) => ({ ...sub, id }) as unknown as Stripe.Subscription;

test("a stale 'incomplete' update arriving after the subscription went active keeps Plus", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" }]);
  const live = subscription({ status: "active", periodEnd: "2026-12-22T00:00:00Z" });
  await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "incomplete" })), { db, retrieveSubscription: async () => live });
  assert.equal(db.rows[0].plan, "PLUS");
  assert.deepEqual(db.rows[0].planRenewsAt, new Date("2026-12-22T00:00:00Z"));
});

test("events about an old subscription don't downgrade the account's current one", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_new", stripeCustomerId: "cus_123" }]);
  const old = withId(subscription({ status: "canceled" }), "sub_old");

  const deleted = await handleStripeEvent(event("customer.subscription.deleted", old), { db });
  assert.equal(deleted.handled, false);
  const updated = await handleStripeEvent(event("customer.subscription.updated", old), { db });
  assert.equal(updated.handled, false);
  assert.equal(db.rows[0].plan, "PLUS");
  assert.equal(db.rows[0].stripeSubscriptionId, "sub_new");

  // A new subscription that does grant Plus still takes over.
  await handleStripeEvent(event("customer.subscription.created", withId(subscription({ status: "active" }), "sub_newer")), { db });
  assert.equal(db.rows[0].stripeSubscriptionId, "sub_newer");
  assert.equal(db.rows[0].plan, "PLUS");
});

test("a failed invoice for an old subscription is ignored", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_new", stripeCustomerId: "cus_123" }]);
  const invoice = { id: "in_old", object: "invoice", customer: "cus_123", parent: { type: "subscription_details", subscription_details: { subscription: "sub_old" } } };
  const result = await handleStripeEvent(event("invoice.payment_failed", invoice), { db });
  assert.equal(result.handled, false);
  assert.equal(db.rows[0].plan, "PLUS");
});

test("a late payment_failed after a retry already succeeded keeps Plus", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" }]);
  const invoice = { id: "in_1", object: "invoice", customer: "cus_123", parent: { type: "subscription_details", subscription_details: { subscription: "sub_123" } } };
  const { api } = stubStripe({ subscription: subscription({ status: "active", periodEnd: "2026-12-22T00:00:00Z" }) });
  const result = await handleStripeEvent(event("invoice.payment_failed", invoice), { db, stripe: api });
  assert.equal(result.plan, "PLUS");
  assert.equal(db.rows[0].plan, "PLUS");

  // While the subscription really is past due, Plus pauses as before.
  const pastDue = stubStripe({ subscription: subscription({ status: "past_due" }) });
  await handleStripeEvent(event("invoice.payment_failed", invoice), { db, stripe: pastDue.api });
  assert.equal(db.rows[0].plan, "FREE");
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

// ---- invoice.paid and the risk events --------------------------------------------------------

// Stripe's object graph for the risk events, as a stub: charge → PaymentIntent → subscriptions.
function stubStripe(graph: { charges?: Record<string, string | null>; intents?: Record<string, string[]>; subscription?: Stripe.Subscription; lifetime?: Record<string, string> }) {
  const cancelled: string[] = [];
  const api: BillingStripeApi = {
    async retrieveSubscription() {
      if (!graph.subscription) throw new Error("no subscription stubbed");
      return graph.subscription;
    },
    async paymentIntentOfCharge(chargeId) { return graph.charges?.[chargeId] ?? null; },
    async subscriptionsForPaymentIntent(intent) { return graph.intents?.[intent] ?? []; },
    async cancelSubscription(id) { cancelled.push(id); },
    async lifetimeBuyerOfPaymentIntent(intent) { return graph.lifetime?.[intent] ?? null; },
  };
  return { api, cancelled };
}

const paidInvoice = (periodEnd: string) => ({
  id: "in_2", object: "invoice", customer: "cus_123", status: "paid",
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_123" } },
  lines: { object: "list", data: [{ id: "il_1", period: { start: at("2026-11-22T00:00:00Z"), end: at(periodEnd) } }], has_more: false, url: "" },
});

test("a paid renewal invoice keeps Plus and moves the period end from the subscription", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" }]);
  const { api } = stubStripe({ subscription: subscription({ periodEnd: "2026-12-22T00:00:00Z" }) });
  const result = await handleStripeEvent(event("invoice.paid", paidInvoice("2026-12-22T00:00:00Z")), { db, stripe: api });
  assert.equal(result.plan, "PLUS");
  assert.deepEqual(db.rows[0].planRenewsAt, new Date("2026-12-22T00:00:00Z"));
});

test("a paid invoice after a failed payment brings Plus back, even without Stripe access", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" }]);
  const failed = { id: "in_1", object: "invoice", customer: "cus_123", parent: { type: "subscription_details", subscription_details: { subscription: "sub_123" } } };
  await handleStripeEvent(event("invoice.payment_failed", failed), { db });
  assert.equal(db.rows[0].plan, "FREE");

  await handleStripeEvent(event("invoice.paid", paidInvoice("2026-12-22T00:00:00Z")), { db });
  assert.equal(db.rows[0].plan, "PLUS");
  assert.deepEqual(db.rows[0].planRenewsAt, new Date("2026-12-22T00:00:00Z"));
});

test("a paid invoice that isn't for a subscription changes nothing", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE", stripeCustomerId: "cus_123" }]);
  const oneOff = { id: "in_3", object: "invoice", customer: "cus_123", parent: null, lines: { data: [] } };
  assert.equal((await handleStripeEvent(event("invoice.paid", oneOff), { db })).handled, false);
  assert.equal(db.rows[0].plan, "FREE");
});

test("a dispute cancels the subscription in Stripe and ends Plus now", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123" }]);
  const { api, cancelled } = stubStripe({ intents: { pi_1: ["sub_123"] } });
  const dispute = { id: "dp_1", object: "dispute", charge: "ch_1", payment_intent: "pi_1" };
  const result = await handleStripeEvent(event("charge.dispute.created", dispute), { db, stripe: api });
  assert.equal(result.handled, true);
  assert.deepEqual(cancelled, ["sub_123"]);
  assert.equal(db.rows[0].plan, "FREE");
  assert.equal(db.rows[0].stripeSubscriptionId, null);
});

test("an early fraud warning without a PaymentIntent is followed through its charge", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123" }]);
  const { api, cancelled } = stubStripe({ charges: { ch_9: "pi_9" }, intents: { pi_9: ["sub_123"] } });
  const warning = { id: "issfr_1", object: "radar.early_fraud_warning", charge: "ch_9", payment_intent: null };
  await handleStripeEvent(event("radar.early_fraud_warning.created", warning), { db, stripe: api });
  assert.deepEqual(cancelled, ["sub_123"]);
  assert.equal(db.rows[0].plan, "FREE");
});

test("a full refund ends Plus; a partial refund doesn't", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123" }]);
  const { api, cancelled } = stubStripe({ intents: { pi_1: ["sub_123"] } });
  const partial = { id: "ch_1", object: "charge", payment_intent: "pi_1", refunded: false, amount_refunded: 100 };
  assert.equal((await handleStripeEvent(event("charge.refunded", partial), { db, stripe: api })).handled, false);
  assert.equal(db.rows[0].plan, "PLUS");
  assert.deepEqual(cancelled, []);

  const full = { ...partial, refunded: true, amount_refunded: 299 };
  await handleStripeEvent(event("charge.refunded", full), { db, stripe: api });
  assert.deepEqual(cancelled, ["sub_123"]);
  assert.equal(db.rows[0].plan, "FREE");
});

test("risk events on charges that aren't for a subscription, or without Stripe access, change nothing", async () => {
  const db = stubDb([{ id: USER_ID, plan: "PLUS", stripeSubscriptionId: "sub_123" }]);
  const { api, cancelled } = stubStripe({ charges: { ch_legacy: null }, intents: {} });
  const unrelated = { id: "dp_2", object: "dispute", charge: "ch_2", payment_intent: "pi_other" };
  assert.equal((await handleStripeEvent(event("charge.dispute.created", unrelated), { db, stripe: api })).handled, false);
  const legacy = { id: "dp_3", object: "dispute", charge: "ch_legacy", payment_intent: null };
  assert.equal((await handleStripeEvent(event("charge.dispute.created", legacy), { db, stripe: api })).handled, false);
  const dispute = { id: "dp_4", object: "dispute", charge: "ch_1", payment_intent: "pi_1" };
  assert.equal((await handleStripeEvent(event("charge.dispute.created", dispute), { db })).handled, false);
  assert.deepEqual(cancelled, []);
  assert.equal(db.rows[0].plan, "PLUS");
});

test("Checkout sessions carry a fixed integration identifier with an 8-letter suffix", () => {
  assert.match(CHECKOUT_INTEGRATION_ID, /^bookmark_plus_checkout_[a-z]{8}$/);
});

// ---- The free monthly pace, and founders --------------------------------------------------------

test("everyone gets a monthly pace from the yearly goal; Plus can set its own", () => {
  assert.deepEqual(monthlyPace({ targetBooks: 24 }), { perMonth: 2, custom: false });
  assert.deepEqual(monthlyPace({ targetBooks: 24, targetBooksPerMonth: 3 }), { perMonth: 3, custom: true });
  // A lapsed Plus account keeps its stored target but sees the worked-out pace.
  assert.deepEqual(monthlyPace({ targetBooks: 24, targetBooksPerMonth: 3 }, false), { perMonth: 2, custom: false });
  assert.equal(formatPace(monthlyPace({ targetBooks: 50 }).perMonth), "4.2");
  assert.equal(formatPace(2), "2");
});

test("this month's target is whole books to stay on track for the yearly goal", () => {
  // 14 a year, none read by October: 14 left over Oct–Dec, so 5 this month (not 14/12 = 1.2).
  assert.deepEqual(monthTarget({ targetBooks: 14 }, 0, 9), { perMonth: 5, custom: false });
  // In January it's the even share, rounded up.
  assert.deepEqual(monthTarget({ targetBooks: 14 }, 0, 0), { perMonth: 2, custom: false });
  // Ahead of pace needs less; the goal already met needs nothing.
  assert.deepEqual(monthTarget({ targetBooks: 24 }, 22, 9), { perMonth: 1, custom: false });
  assert.deepEqual(monthTarget({ targetBooks: 24 }, 30, 9), { perMonth: 0, custom: false });
  // December takes everything that's left.
  assert.deepEqual(monthTarget({ targetBooks: 24 }, 20, 11), { perMonth: 4, custom: false });
  // A Plus target replaces it while Plus lasts.
  assert.deepEqual(monthTarget({ targetBooks: 14, targetBooksPerMonth: 3 }, 0, 9), { perMonth: 3, custom: true });
  assert.deepEqual(monthTarget({ targetBooks: 14, targetBooksPerMonth: 3 }, 0, 9, false), { perMonth: 5, custom: false });
});

const FOUNDING_PRICE = "price_founding";
const onPrice = (sub: Stripe.Subscription, price: string) =>
  ({ ...sub, items: { ...sub.items, data: [{ ...sub.items.data[0], price: { id: price } }] } }) as unknown as Stripe.Subscription;

test("a paid subscription on the Founding price marks a founder; a trial or another price doesn't", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE" }]);
  const trial = onPrice(subscription({ status: "trialing", trialEnd: "2026-11-05T00:00:00Z" }), FOUNDING_PRICE);
  await handleStripeEvent(event("customer.subscription.created", trial), { db, foundingPriceId: FOUNDING_PRICE });
  assert.equal(db.rows[0].plan, "PLUS");
  assert.equal(db.rows[0].foundingMember, undefined);

  const paid = onPrice(subscription({ status: "active" }), FOUNDING_PRICE);
  await handleStripeEvent(event("customer.subscription.updated", paid), { db, foundingPriceId: FOUNDING_PRICE });
  assert.equal(db.rows[0].foundingMember, true);

  const other = stubDb([{ id: USER_ID, plan: "FREE" }]);
  await handleStripeEvent(event("customer.subscription.updated", onPrice(subscription({ status: "active" }), "price_yearly")), { db: other, foundingPriceId: FOUNDING_PRICE });
  assert.equal(other.rows[0].foundingMember, undefined);

  // Cancelling later never takes the founder mark away.
  await handleStripeEvent(event("customer.subscription.deleted", onPrice(subscription({ status: "canceled" }), FOUNDING_PRICE)), { db, foundingPriceId: FOUNDING_PRICE });
  assert.equal(db.rows[0].plan, "FREE");
  assert.equal(db.rows[0].foundingMember, true);
});

// ---- Where Plus comes from: subscriptions, lifetime, free months ---------------------------------

test("lifetime and unexpired free months are Plus; expired free months aren't", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  assert.equal(plusSourceOf({ lifetime: true }, now), "lifetime");
  assert.equal(plusSourceOf({ plan: "PLUS" }, now), "subscription");
  assert.equal(plusSourceOf({ compPlusUntil: new Date("2026-11-20T00:00:00Z") }, now), "comp");
  assert.equal(plusSourceOf({ compPlusUntil: new Date("2026-10-20T00:00:00Z") }, now), null);
  // A lifetime reader whose old subscription ended is still Plus.
  assert.equal(planOf({ plan: "FREE", lifetime: true }, now), "PLUS");
  assert.equal(entitlementsOf({ compPlusUntil: "2026-11-20T00:00:00Z" }, now).canHostUnlimited, true);
  const comp = planStatusOf({ compPlusUntil: new Date("2026-11-20T00:00:00Z") }, now);
  assert.equal(comp.source, "comp");
  assert.deepEqual(comp.until, new Date("2026-11-20T00:00:00Z"));
});

test("readers on free months can still subscribe; subscribers and lifetime readers can't check out again", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  assert.equal(canStartCheckout(planStatusOf({}, now)), true);
  assert.equal(canStartCheckout(planStatusOf({ compPlusUntil: new Date("2026-11-20T00:00:00Z") }, now)), true);
  assert.equal(canStartCheckout(planStatusOf({ plan: "PLUS" }, now)), false);
  assert.equal(canStartCheckout(planStatusOf({ lifetime: true }, now)), false);
});

test("supporter badges: Patron, Lifetime, Founding Reader, Supporter; free months earn none", () => {
  const now = new Date();
  const later = new Date(Date.now() + 10 * 86_400_000);
  assert.equal(supporterOf({ plan: "PLUS", patron: true }, now).badge, "patron");
  assert.equal(supporterOf({ lifetime: true }, now).badge, "lifetime");
  assert.equal(supporterOf({ plan: "PLUS", foundingMember: true }, now).badge, "founding");
  assert.equal(supporterOf({ plan: "PLUS" }, now).badge, "supporter");
  assert.equal(supporterOf({ compPlusUntil: later }, now).badge, null);
});

// ---- Local prices ------------------------------------------------------------------------------

test("no local price is above the US price at the assumed exchange rates", () => {
  for (const currency of ["GBP", "EUR"] as const) {
    for (const [plan, amount] of Object.entries(REGIONAL_PRICES[currency])) {
      const inUsd = amount * ASSUMED_USD_PER[currency];
      const usd = REGIONAL_PRICES.USD[plan as keyof typeof REGIONAL_PRICES.USD];
      assert.ok(inUsd <= usd, `${currency} ${plan}: ${amount} is $${inUsd.toFixed(2)}, above $${usd}`);
    }
  }
});

test("the US prices are the Plus prices, and visitors see their own currency", () => {
  assert.deepEqual(REGIONAL_PRICES.USD, { monthly: 3.99, yearly: 29.99, founding: 24.99 });
  assert.equal(currencyForCountry("GB"), "GBP");
  assert.equal(currencyForCountry("de"), "EUR");
  assert.equal(currencyForCountry("IE"), "EUR");
  assert.equal(currencyForCountry("US"), "USD");
  assert.equal(currencyForCountry("CA"), "USD");
  assert.equal(currencyForCountry(null), "USD");
  assert.equal(formatPrice("GBP", 21.99), "£21.99");
  assert.equal(formatPrice("USD", 30), "$30");
});

// ---- The webhook: readers already on Patron or lifetime (no longer sold) ----------------------------------------------------------

test("the Patron price sets the Patron flag, and switching back clears it", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE" }]);
  const deps = { db, patronPriceId: "price_patron" };
  await handleStripeEvent(event("customer.subscription.updated", onPrice(subscription({ status: "active" }), "price_patron")), deps);
  assert.equal(db.rows[0].patron, true);
  await handleStripeEvent(event("customer.subscription.updated", onPrice(subscription({ status: "active" }), "price_yearly")), deps);
  assert.equal(db.rows[0].patron, false);
});

test("a paid lifetime checkout grants lifetime Plus; an unpaid one doesn't", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE" }]);
  const deps = { db };
  const session = { id: "cs_life", object: "checkout.session", mode: "payment", customer: "cus_9", client_reference_id: USER_ID, metadata: { userId: USER_ID, plan: "lifetime" } };

  const unpaid = await handleStripeEvent(event("checkout.session.completed", { ...session, payment_status: "unpaid" }), deps);
  assert.equal(unpaid.handled, false);
  assert.equal(db.rows[0].lifetime, undefined);

  const paid = await handleStripeEvent(event("checkout.session.completed", { ...session, payment_status: "paid" }), deps);
  assert.equal(paid.plan, "PLUS");
  assert.equal(db.rows[0].lifetime, true);
  assert.equal(db.rows[0].stripeCustomerId, "cus_9");
  // An old subscription ending later doesn't touch lifetime.
  await handleStripeEvent(event("customer.subscription.deleted", { ...subscription({ status: "canceled" }), customer: "cus_9" }), deps);
  assert.equal(planOf(db.rows[0] as never), "PLUS");
});

test("a full refund or dispute of the lifetime payment takes lifetime back", async () => {
  const db = stubDb([{ id: USER_ID, plan: "FREE", lifetime: true }]);
  const { api, cancelled } = stubStripe({ intents: {}, lifetime: { pi_life: USER_ID } });
  const refund = { id: "ch_life", object: "charge", payment_intent: "pi_life", refunded: true, amount_refunded: 7900 };
  const result = await handleStripeEvent(event("charge.refunded", refund), { db, stripe: api });
  assert.equal(result.handled, true);
  assert.equal(db.rows[0].lifetime, false);
  assert.deepEqual(cancelled, []);
});
