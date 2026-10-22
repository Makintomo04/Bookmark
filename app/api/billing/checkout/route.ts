import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { appUrl } from "@/lib/siteUrl";
import { PLUS_PRICING, planStatusOf } from "@/lib/entitlements";
import { CHECKOUT_INTEGRATION_ID, billingIntervalSchema, isStripeConfigured, priceIdFor, stripe } from "@/lib/stripe";

const bodySchema = z.object({ interval: billingIntervalSchema });

// Starts Bookmark Plus: a Stripe Checkout Session for the monthly or yearly price. The first time,
// a 14-day trial with no card; when the trial ends without one, Stripe cancels the subscription
// (trial_settings.end_behavior.missing_payment_method). The webhook flips the plan; this route only
// hands back the Checkout URL.
export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to start Bookmark Plus.");
  if (response) return response;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up on this server yet." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose monthly or yearly." }, { status: 400 });
  const price = priceIdFor(parsed.data.interval);
  if (!price) return NextResponse.json({ error: "That price isn't set up yet." }, { status: 503 });

  const status = planStatusOf(user);
  if (status.plan === "PLUS") {
    return NextResponse.json({ error: "You're already on Plus. Manage it from your settings." }, { status: 409 });
  }
  const limit = rateLimit(`billing-checkout:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  // One Stripe customer per account, made the first time and reused after.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email ?? undefined,
      name: user.username ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const trial = !status.trialUsed;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    integration_identifier: CHECKOUT_INTEGRATION_ID,
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    // No card for the trial. A reader who already had one pays up front.
    payment_method_collection: trial ? "if_required" : "always",
    subscription_data: {
      metadata: { userId: user.id },
      ...(trial && {
        trial_period_days: PLUS_PRICING.trialDays,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      }),
    },
    metadata: { userId: user.id, interval: parsed.data.interval },
    success_url: `${appUrl}/plus?checkout=success`,
    cancel_url: `${appUrl}/plus?checkout=cancelled`,
  });

  if (!session.url) return NextResponse.json({ error: "Stripe didn't return a checkout page. Try again." }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
