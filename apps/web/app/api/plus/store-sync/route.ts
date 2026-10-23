import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { planStatusOf } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rateLimit";
import { foundingProducts, handleRevenueCatEvent, revenueCatApi } from "@/lib/storeBilling";

// POST: the app calls this straight after a purchase or a restore, so Plus switches on without waiting
// for RevenueCat's webhook. It only ever reads the reader's own subscriber from RevenueCat's API, the same
// source the webhook trusts, so nothing the app sends can grant Plus.
export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const api = revenueCatApi();
  if (!api) return NextResponse.json({ error: "Store purchases aren't set up yet." }, { status: 503 });

  const limit = rateLimit(`store-sync:${user.id}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  await handleRevenueCatEvent(
    { type: "SYNC", app_user_id: user.id },
    { db: prisma, fetchSubscriber: (id) => api.fetchSubscriber(id), founding: foundingProducts() },
  );
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const status = planStatusOf(fresh);
  return NextResponse.json({ status: { ...status, until: status.until?.toISOString() ?? null, compUntil: status.compUntil?.toISOString() ?? null } });
}
