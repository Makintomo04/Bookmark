import type Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { PLUS_PRICING } from "./entitlements.ts";

// What Stripe's webhooks do to an account. Pure apart from the database handed in, so the state
// machine can be tested against a stub: subscription created or renewed → PLUS with the period end;
// cancelled → FREE; a failed payment → FREE until a retry succeeds (Stripe then sends
// customer.subscription.updated with status "active", which brings PLUS back).

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
  };
}

// A type alias rather than an interface, so it fits BillingDb's `data: Record<string, unknown>`.
export type PlanUpdate = {
  plan: Plan;
  planRenewsAt: Date | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId?: string;
  trialEndsAt?: Date;
}

// The User fields a subscription snapshot sets.
export function planUpdateFor(snapshot: SubscriptionSnapshot): PlanUpdate {
  const plan = planForStatus(snapshot.status);
  return {
    plan,
    planRenewsAt: plan === "PLUS" ? snapshot.periodEnd : null,
    stripeSubscriptionId: snapshot.id,
    ...(snapshot.customerId && { stripeCustomerId: snapshot.customerId }),
    // Recorded once so a second Checkout doesn't grant a second trial.
    ...(snapshot.trialEnd && { trialEndsAt: snapshot.trialEnd }),
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

export interface BillingDeps {
  db: BillingDb;
  // Fetches the subscription Checkout created, for its status and period end. Optional so the
  // handler still works (setting PLUS from the session alone) where Stripe can't be called.
  retrieveSubscription?: (id: string) => Promise<Stripe.Subscription>;
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

export async function handleStripeEvent(event: Stripe.Event, deps: BillingDeps): Promise<BillingOutcome> {
  const { db } = deps;

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
      if (subscriptionId && deps.retrieveSubscription) {
        data = planUpdateFor(snapshotSubscription(await deps.retrieveSubscription(subscriptionId)));
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
      const data = planUpdateFor(snapshot);
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

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription);
      const customerId = idOf(invoice.customer);
      const user = await findUser(db, { subscriptionId, customerId });
      if (!user) return outcome(false, null, null, "no user for failed invoice");
      // Plus pauses until a retry succeeds; customer.subscription.updated (active) restores it.
      await db.user.update({ where: { id: user.id }, data: { plan: "FREE", planRenewsAt: null } });
      return outcome(true, user.id, "FREE", "payment failed");
    }

    default:
      return outcome(false, null, null, `ignored ${event.type}`);
  }
}
