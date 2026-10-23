import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  EntitlementError,
  entitlementErrorBody,
  entitlementsOf,
  entitlementsSelect,
  foundingStatus,
  parseFoundingClose,
  type EntitlementKey,
  type Entitlements,
  type FoundingStatus,
} from "@/lib/entitlements";

// Whether a new subscriber can still get the Founding Reader price. Closed when the founding Stripe
// price isn't configured, so the pricing page never offers what Checkout can't charge.
export async function currentFoundingStatus(now = new Date()): Promise<FoundingStatus> {
  const closesAt = parseFoundingClose(process.env.PLUS_FOUNDING_CLOSES_AT);
  if (!process.env.STRIPE_PRICE_FOUNDING) return { open: false, remaining: 0, closesAt };
  const founders = await prisma.user.count({ where: { foundingMember: true } });
  return foundingStatus(founders, closesAt, now);
}

// The server side of lib/entitlements.ts: look the plan up, and refuse with a 402 the client
// understands. Route handlers:
//
//   const refused = await guardEntitlement(user.id, "extraGoalTypes"); if (refused) return refused
//
// or, inside code that can't return a response, `await requireEntitlement(userId, key)` and let the
// handler's catch map the EntitlementError with entitlementResponse().

export async function entitlementsFor(userId: string): Promise<Entitlements> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: entitlementsSelect });
  return entitlementsOf(user ?? {});
}

export async function requireEntitlement(userId: string, key: EntitlementKey): Promise<Entitlements> {
  const entitlements = await entitlementsFor(userId);
  if (!entitlements[key]) throw new EntitlementError(key);
  return entitlements;
}

export function entitlementResponse(error: EntitlementError) {
  return NextResponse.json(entitlementErrorBody(error), { status: error.status });
}

export async function guardEntitlement(userId: string, key: EntitlementKey): Promise<NextResponse | null> {
  try {
    await requireEntitlement(userId, key);
    return null;
  } catch (error) {
    if (error instanceof EntitlementError) return entitlementResponse(error);
    throw error;
  }
}
