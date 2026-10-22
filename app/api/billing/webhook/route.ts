import { NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma from "@/lib/db";
import { handleStripeEvent } from "@/lib/billing";
import { isStripeConfigured, stripeBillingApi, stripeWebhooks } from "@/lib/stripe";

// Stripe calls this for the events registered on the endpoint: checkout.session.completed,
// customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, and the risk
// events charge.dispute.created, charge.refunded and radar.early_fraud_warning.created. The body is read raw
// so the signature can be checked against STRIPE_WEBHOOK_SECRET; the rules live in lib/billing.ts.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set" }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeWebhooks().constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  const outcome = await handleStripeEvent(event, {
    db: prisma,
    stripe: isStripeConfigured() ? stripeBillingApi() : undefined,
    foundingPriceId: process.env.STRIPE_PRICE_FOUNDING || null,
  });
  // 200 even when nothing matched: Stripe would otherwise retry an event we can never use.
  return NextResponse.json({ received: true, ...outcome });
}
