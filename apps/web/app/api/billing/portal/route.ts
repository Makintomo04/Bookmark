import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { appUrl } from "@/lib/siteUrl";
import { isStripeConfigured, stripe } from "@/lib/stripe";

// Opens Stripe's customer portal: change the card, switch monthly and yearly, cancel, see invoices.
// Cancelling there reaches us as customer.subscription.updated/deleted on the webhook.
export async function POST() {
  const { user, response } = await requireUser("Sign in to manage your subscription.");
  if (response) return response;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up on this server yet." }, { status: 503 });
  }
  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "There's no subscription to manage yet." }, { status: 400 });
  }
  const limit = rateLimit(`billing-portal:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl}/plus`,
  });
  return NextResponse.json({ url: session.url });
}
