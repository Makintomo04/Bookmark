import type Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { PLUS_PRICING } from "./entitlements.ts";

// What Stripe's webhooks do to an account. Pure apart from the database and Stripe calls handed in,
// so the state machine can be tested against stubs:
//   - subscription created or renewed, or an invoice paid → PLUS with the period end
//   - cancelled → FREE
//   - a failed payment → FREE until a retry succeeds (invoice.paid, or customer.subscription.updated
//     with status "active", brings PLUS back)
//   - a dispute or an early fraud warning on a subscription charge, or a full refund of one → the
//     subscription is cancelled in Stripe straight away (no more charges) and the account is FREE.
//     A partial refund is a goodwill gesture and changes nothing.

// Stripe statuses that mean the reader has Plus right now. "past_due" is deliberately not here: a
// failed renewal pauses Plus rather than running a grace period we would have to track ourselves.
export const PLUS_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set(["active", "trialing"]);

export function planForStatus(status: Stripe.Subscription.Status): Plan {
  return PLUS_STATUSES.has(status) ? "PLUS" : "FREE";
}

const fromUnix = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

export interface SubscriptionSnapshot {
  id: string;
  customerId: string | null;
  status: Stripe.Subscription.Status;
  // End of the current paid or trial period (on the first item since the 2025-03-31 API).
  periodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  // The Bookmark user id Checkout put in the subscription's metadata.
  userId: string | null;
  // The price on the first item: the Founding Reader price marks the subscriber as a founder.
  priceId: string | null;
}

export function snapshotSubscription(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const legacy = sub as Stripe.Subscription & { current_period_end?: number };
  return {
    id: sub.id,
    customerId: idOf(sub.customer),
    status: sub.status,
    periodEnd: fromUnix(item?.current_period_end ?? legacy.current_period_end),
    trialEnd: fromUnix(sub.trial_end),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    userId: sub.metadata?.userId || null,
    priceId: idOf(item?.price as Stripe.Price | string | undefined),
  };
}

// A type alias rather than an interface, so it fits BillingDb's `data: Record<string, unknown>`.
export type PlanUpdate = {
  plan: Plan;
  planRenewsAt: Date | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId?: string;
  trialEndsAt?: Date;
  foundingMember?: true;
}

// The User fields a subscription snapshot sets. `foundingPriceId` is the Founding Reader price
// (STRIPE_PRICE_FOUNDING); a paid subscription on it marks the account as a founder, which is never
// undone. Trials don't count, so the founding cap can't fill up with trials that never convert; a trial
// started on the Founding price keeps that price when it converts, and is counted then.
export function planUpdateFor(snapshot: SubscriptionSnapshot, foundingPriceId?: string | null): PlanUpdate {
  const plan = planForStatus(snapshot.status);
  const founder = !!foundingPriceId && snapshot.priceId === foundingPriceId && snapshot.status === "active";
  return {
    plan,
    planRenewsAt: plan === "PLUS" ? snapshot.periodEnd : null,
    stripeSubscriptionId: snapshot.id,
    ...(snapshot.customerId && { stripeCustomerId: snapshot.customerId }),
    // Recorded once so a second Checkout doesn't grant a second trial.
    ...(snapshot.trialEnd && { trialEndsAt: snapshot.trialEnd }),
    ...(founder && { foundingMember: true as const }),
  };
}

// ---- The handler ---------------------------------------------------------------------------

// The slice of Prisma the handler uses. prisma.user satisfies it; tests pass a stub.
export interface BillingUserRow {
  id: string;
}
export interface BillingDb {
  user: {
    findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<BillingUserRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

// The Stripe calls the risk events need, to get from a charge to its subscription and stop it.
// lib/stripe.ts stripeBillingApi() builds these from the real client.
export interface BillingStripeApi {
  // The subscription, for its current status and period end.
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  // A charge's PaymentIntent id, for disputes and fraud warnings that arrive without one.
  paymentIntentOfCharge(chargeId: string): Promise<string | null>;
  // Every subscription a PaymentIntent paid an invoice for (API 2025-03-31.basil and later:
  // InvoicePayments by payment_intent, then each invoice's parent.subscription_details).
  subscriptionsForPaymentIntent(paymentIntentId: string): Promise<string[]>;
  // Cancels straight away. Resolves quietly when it's already cancelled.
  cancelSubscription(id: string): Promise<void>;
}

export interface BillingDeps {
  db: BillingDb;
  // Optional so the handler still works where Stripe can't be called (no secret key): lifecycle
  // events then use what the event itself carries, and risk events only change the plan locally
  // for the subscriptions the database already knows.
  stripe?: BillingStripeApi;
  // Kept for callers that only need the subscription lookup.
  retrieveSubscription?: (id: string) => Promise<Stripe.Subscription>;
  // STRIPE_PRICE_FOUNDING, to recognise founders.
  foundingPriceId?: string | null;
  now?: () => Date;
}

export interface BillingOutcome {
  handled: boolean;
  userId: string | null;
  plan: Plan | null;
  note: string;
}

const isObjectId = (id: string | null | undefined): id is string => !!id && /^[a-f0-9]{24}$/i.test(id);

// By the ids Stripe gives us, falling back to the user id Checkout put in metadata.
async function findUser(db: BillingDb, ids: { subscriptionId?: string | null; customerId?: string | null; userId?: string | null }) {
  const or: Record<string, unknown>[] = [];
  if (ids.subscriptionId) or.push({ stripeSubscriptionId: ids.subscriptionId });
  if (ids.customerId) or.push({ stripeCustomerId: ids.customerId });
  if (isObjectId(ids.userId)) or.push({ id: ids.userId });
  if (or.length === 0) return null;
  return db.user.findFirst({ where: { OR: or }, select: { id: true } });
}

const outcome = (handled: boolean, userId: string | null, plan: Plan | null, note: string): BillingOutcome => ({ handled, userId, plan, note });

// The subscription an invoice belongs to (API 2025-03-31.basil and later keep it under parent).
function subscriptionOfInvoice(invoice: Stripe.Invoice & { subscription?: string | { id: string } | null }) {
  return idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription);
}

type RiskKind = "dispute" | "early_fraud_warning" | "refund";

// Disputes, early fraud warnings and full refunds end Plus: the subscription is cancelled in Stripe
// so nothing more is charged, and the account goes back to FREE now rather than waiting for
// customer.subscription.deleted. The charge is followed to its subscriptions through Stripe's object
// graph (charge → PaymentIntent → paid InvoicePayments → invoice → subscription).
async function handleRisk(kind: RiskKind, chargeId: string | null, paymentIntentId: string | null, deps: BillingDeps): Promise<BillingOutcome> {
  const { db, stripe } = deps;
  if (!stripe) return outcome(false, null, null, `${kind}: can't resolve the subscription without Stripe access`);

  const intent = paymentIntentId ?? (chargeId ? await stripe.paymentIntentOfCharge(chargeId) : null);
  if (!intent) return outcome(false, null, null, `${kind}: charge has no PaymentIntent`);
  const subscriptionIds = await stripe.subscriptionsForPaymentIntent(intent);
  if (subscriptionIds.length === 0) return outcome(false, null, null, `${kind}: not a subscription charge`);

  let last: BillingOutcome = outcome(false, null, null, `${kind}: no account for the subscription`);
  for (const subscriptionId of subscriptionIds) {
    await stripe.cancelSubscription(subscriptionId);
    const user = await findUser(db, { subscriptionId });
    if (!user) continue;
    await db.user.update({ where: { id: user.id }, data: { plan: "FREE", planRenewsAt: null, stripeSubscriptionId: null } });
    // Server log, so the owner can follow up from the Dashboard (evidence for a dispute, a refund for a fraud warning).
    console.warn(`[billing] ${kind} on ${subscriptionId}: cancelled the subscription and moved user ${user.id} to FREE`);
    last = outcome(true, user.id, "FREE", `${kind}: subscription cancelled`);
  }
  return last;
}

export async function handleStripeEvent(event: Stripe.Event, deps: BillingDeps): Promise<BillingOutcome> {
  const { db } = deps;
  const retrieveSubscription = deps.stripe ? (id: string) => deps.stripe!.retrieveSubscription(id) : deps.retrieveSubscription;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return outcome(false, null, null, "not a subscription checkout");
      const subscriptionId = idOf(session.subscription);
      const customerId = idOf(session.customer);
      const userId = session.client_reference_id || session.metadata?.userId || null;
      const user = await findUser(db, { subscriptionId, customerId, userId });
      if (!user) return outcome(false, null, null, "no user for checkout session");

      let data: PlanUpdate;
      if (subscriptionId && retrieveSubscription) {
        data = planUpdateFor(snapshotSubscription(await retrieveSubscription(subscriptionId)), deps.foundingPriceId);
      } else {
        // Without the subscription, assume what Checkout always starts: a Plus trial of the full length.
        const now = (deps.now ?? (() => new Date()))();
        data = {
          plan: "PLUS",
          planRenewsAt: new Date(now.getTime() + PLUS_PRICING.trialDays * 86_400_000),
          stripeSubscriptionId: subscriptionId,
          ...(customerId && { stripeCustomerId: customerId }),
        };
      }
      await db.user.update({ where: { id: user.id }, data });
      return outcome(true, user.id, data.plan, "checkout completed");
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const snapshot = snapshotSubscription(event.data.object);
      const user = await findUser(db, { subscriptionId: snapshot.id, customerId: snapshot.customerId, userId: snapshot.userId });
      if (!user) return outcome(false, null, null, "no user for subscription");
      const data = planUpdateFor(snapshot, deps.foundingPriceId);
      await db.user.update({ where: { id: user.id }, data });
      return outcome(true, user.id, data.plan, `subscription ${snapshot.status}`);
    }

    case "customer.subscription.deleted": {
      const snapshot = snapshotSubscription(event.data.object);
      const user = await findUser(db, { subscriptionId: snapshot.id, customerId: snapshot.customerId, userId: snapshot.userId });
      if (!user) return outcome(false, null, null, "no user for deleted subscription");
      // The customer stays, so the portal can still show invoices and a resubscribe skips the trial.
      await db.user.update({ where: { id: user.id }, data: { plan: "FREE", planRenewsAt: null, stripeSubscriptionId: null } });
      return outcome(true, user.id, "FREE", "subscription deleted");
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      const subscriptionId = subscriptionOfInvoice(invoice);
      if (!subscriptionId) return outcome(false, null, null, "not a subscription invoice");
      const user = await findUser(db, { subscriptionId, customerId: idOf(invoice.customer) });
      if (!user) return outcome(false, null, null, "no user for paid invoice");

      let data: PlanUpdate;
      if (retrieveSubscription) {
        // The subscription's own status and period end are the source of truth.
        data = planUpdateFor(snapshotSubscription(await retrieveSubscription(subscriptionId)), deps.foundingPriceId);
      } else {
        // A paid subscription invoice means the period it covers is paid for.
        data = { plan: "PLUS", planRenewsAt: fromUnix(invoice.lines?.data?.[0]?.period?.end), stripeSubscriptionId: subscriptionId };
      }
      await db.user.update({ where: { id: user.id }, data });
      return outcome(true, user.id, data.plan, "invoice paid");
    }

    case "charge.dispute.created": {
      const dispute = event.data.object;
      return handleRisk("dispute", idOf(dispute.charge), idOf(dispute.payment_intent), deps);
    }

    case "radar.early_fraud_warning.created": {
      const warning = event.data.object;
      return handleRisk("early_fraud_warning", idOf(warning.charge), idOf(warning.payment_intent), deps);
    }

    case "charge.refunded": {
      const charge = event.data.object;
      // `refunded` is only true once the whole charge is refunded.
      if (!charge.refunded) return outcome(false, null, null, "partial refund: Plus continues");
      return handleRisk("refund", charge.id, idOf(charge.payment_intent), deps);
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
      const subscriptionId = subscriptionOfInvoice(invoice);
      const customerId = idOf(invoice.customer);
      const user = await findUser(db, { subscriptionId, customerId });
      if (!user) return outcome(false, null, null, "no user for failed invoice");
      // Plus pauses until a retry succeeds; invoice.paid or customer.subscription.updated (active) restores it.
      await db.user.update({ where: { id: user.id }, data: { plan: "FREE", planRenewsAt: null } });
      return outcome(true, user.id, "FREE", "payment failed");
    }

    default:
      return outcome(false, null, null, `ignored ${event.type}`);
  }
}
