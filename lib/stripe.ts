import Stripe from "stripe";
import { z } from "zod";
import type { BillingStripeApi } from "./billing.ts";

// One Stripe client, made on first use so builds and tests without STRIPE_SECRET_KEY still load
// the modules that import this. Keys and prices come from the environment:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY

let client: Stripe | null = null;

export function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { typescript: true, appInfo: { name: "Bookmark" } });
  return client;
}

// Signature checks need no API key, only the webhook secret, so a server that only receives
// webhooks (or a test that signs its own events) can verify without a secret key.
export function stripeWebhooks() {
  return isStripeConfigured() ? stripe().webhooks : new Stripe("sk_test_unused", { typescript: true }).webhooks;
}

// Tags every Bookmark Plus Checkout Session so its conversion can be compared in the Dashboard
// (API 2026-03-25.dahlia and later). Fixed per flow; Stripe asks for an 8-letter random suffix.
export const CHECKOUT_INTEGRATION_ID = "bookmark_plus_checkout_qvxtmrka";

// The Stripe calls lib/billing.ts needs for the risk events, from the real client.
export function stripeBillingApi(): BillingStripeApi {
  const client = stripe();
  return {
    retrieveSubscription: (id) => client.subscriptions.retrieve(id),

    async paymentIntentOfCharge(chargeId) {
      const charge = await client.charges.retrieve(chargeId);
      const intent = charge.payment_intent;
      return typeof intent === "string" ? intent : intent?.id ?? null;
    },

    // Charge → PaymentIntent → paid InvoicePayments (paginated) → invoice → subscription.
    async subscriptionsForPaymentIntent(paymentIntentId) {
      const invoiceIds = new Set<string>();
      for await (const payment of client.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntentId },
        status: "paid",
        limit: 100,
      })) {
        const invoice = payment.invoice;
        invoiceIds.add(typeof invoice === "string" ? invoice : invoice.id!);
      }
      const subscriptions = new Set<string>();
      for (const id of Array.from(invoiceIds)) {
        const invoice = await client.invoices.retrieve(id);
        if (invoice.parent?.type !== "subscription_details") continue;
        const sub = invoice.parent.subscription_details?.subscription;
        if (sub) subscriptions.add(typeof sub === "string" ? sub : sub.id);
      }
      return Array.from(subscriptions);
    },

    async cancelSubscription(id) {
      const sub = await client.subscriptions.retrieve(id);
      if (sub.status === "canceled" || sub.status === "incomplete_expired") return;
      await client.subscriptions.cancel(id);
    },
  };
}

export const billingIntervalSchema = z.enum(["monthly", "yearly"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export function priceIdFor(interval: BillingInterval): string | null {
  const id = interval === "monthly" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
  return id || null;
}
