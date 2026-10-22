import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { appUrl } from "@/lib/siteUrl";
import { PLUS_PRICING, canStartCheckout, planStatusOf } from "@/lib/entitlements";
import { currentFoundingStatus, currentLifetimeStatus } from "@/lib/entitlementsServer";
import { CHECKOUT_INTEGRATION_ID, isStripeConfigured, priceIdFor, stripe } from "@/lib/stripe";

// "interval" is kept for the older client, which only sent monthly or yearly.
const bodySchema = z.union([
  z.object({ plan: z.enum(["monthly", "yearly", "patron", "lifetime"]) }),
  z.object({ interval: z.enum(["monthly", "yearly"]) }).transform((b) => ({ plan: b.interval })),
]);

// Starts Bookmark Plus through Stripe Checkout and hands back its URL; the webhook changes the plan.
//   - monthly, yearly: a subscription. Yearly gets the Founding Reader price while that window is open.
//   - patron: the yearly subscription at the Patron price.
//   - lifetime: a one-time payment, while the launch window and the lifetime cap allow.
// The first subscription comes with a 14-day trial and no card; Stripe cancels it if no card is added
// by the end (trial_settings.end_behavior.missing_payment_method).
export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to start Bookmark Plus.");
  if (response) return response;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up on this server yet." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose monthly, yearly, Patron or lifetime." }, { status: 400 });
  const { plan } = parsed.data;

  const status = planStatusOf(user);
  if (!canStartCheckout(status)) {
    return NextResponse.json({
      error: status.source === "lifetime" ? "You have lifetime Plus already." : "You're already on Plus. Manage it from your settings.",
    }, { status: 409 });
  }
  const limit = rateLimit(`billing-checkout:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  // The server decides the offers, so a page loaded before a window closed can't claim it afterwards.
  if (plan === "lifetime" && !(await currentLifetimeStatus()).open) {
    return NextResponse.json({ error: "Lifetime Plus has sold out or closed. Yearly is the next best thing." }, { status: 410 });
  }
  const founding = plan === "yearly" && (await currentFoundingStatus()).open;
  const price = priceIdFor(founding ? "founding" : plan);
  if (!price) return NextResponse.json({ error: "That price isn't set up yet." }, { status: 503 });

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

  const common = {
    integration_identifier: CHECKOUT_INTEGRATION_ID,
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/plus?checkout=success`,
    cancel_url: `${appUrl}/plus?checkout=cancelled`,
  };

  if (plan === "lifetime") {
    const session = await stripe().checkout.sessions.create({
      ...common,
      mode: "payment",
      // On the PaymentIntent too, so a later refund or dispute can find whose lifetime it was.
      payment_intent_data: { metadata: { userId: user.id, plan: "lifetime" } },
      metadata: { userId: user.id, plan: "lifetime" },
    });
    if (!session.url) return NextResponse.json({ error: "Stripe didn't return a checkout page. Try again." }, { status: 502 });
    return NextResponse.json({ url: session.url });
  }

  const trial = !status.trialUsed;
  const tags = { userId: user.id, plan, ...(founding && { founding: "true" }) };
  const session = await stripe().checkout.sessions.create({
    ...common,
    mode: "subscription",
    allow_promotion_codes: true,
    // No card for the trial. A reader who already had one pays up front.
    payment_method_collection: trial ? "if_required" : "always",
    subscription_data: {
      metadata: tags,
      ...(trial && {
        trial_period_days: PLUS_PRICING.trialDays,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      }),
    },
    metadata: tags,
  });

  if (!session.url) return NextResponse.json({ error: "Stripe didn't return a checkout page. Try again." }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
