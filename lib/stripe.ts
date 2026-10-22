import Stripe from "stripe";
import { z } from "zod";

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

export const billingIntervalSchema = z.enum(["monthly", "yearly"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export function priceIdFor(interval: BillingInterval): string | null {
  const id = interval === "monthly" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
  return id || null;
}
