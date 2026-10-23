import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { foundingProducts, handleRevenueCatEvent, revenueCatApi, type RevenueCatEvent } from "@/lib/storeBilling";

// RevenueCat calls this for every App Store and Google Play purchase event. It sends the Authorization
// header set on the webhook in RevenueCat's dashboard, which must equal REVENUECAT_WEBHOOK_AUTH. The rules
// live in lib/storeBilling.ts.
export const runtime = "nodejs";

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function POST(req: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret) return NextResponse.json({ error: "REVENUECAT_WEBHOOK_AUTH is not set" }, { status: 503 });
  if (!sameSecret(req.headers.get("authorization") ?? "", secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const event = body?.event as RevenueCatEvent | undefined;
  if (!event || typeof event.type !== "string") return NextResponse.json({ error: "No event" }, { status: 400 });

  const api = revenueCatApi();
  const outcome = await handleRevenueCatEvent(event, {
    db: prisma,
    fetchSubscriber: api ? (id) => api.fetchSubscriber(id) : undefined,
    founding: foundingProducts(),
  });
  // 200 even when nothing matched: RevenueCat would otherwise retry an event we can never use.
  return NextResponse.json({ received: true, ...outcome });
}
