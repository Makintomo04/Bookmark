import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  EntitlementError,
  entitlementErrorBody,
  entitlementsOf,
  entitlementsSelect,
  type EntitlementKey,
  type Entitlements,
} from "@/lib/entitlements";

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
