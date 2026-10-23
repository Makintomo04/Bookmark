import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { EntitlementError } from "@/lib/entitlements";
import { entitlementResponse } from "@/lib/entitlementsServer";
import { rateLimit } from "@/lib/rateLimit";
import { AiError, aiAvailable, askJson } from "@/lib/ai/client";
import { allowanceStatus, consumeAllowance, usageAccountOf } from "@/lib/ai/usage";
import { ASK_QUERY_MAX, askShelf } from "@/lib/askShelf";
import { preferencesOf } from "@/lib/preferences";
import { prismaAskCatalog } from "@/lib/askShelfCatalog";

// Ask the shelf (lib/askShelf.ts).
//
//   GET  /api/discover/ask              whether search is available, whether the reader has AI on, and their allowance
//   POST /api/discover/ask { query }    one search: spends one of the month's allowance
//
// Refusals: 403 when the reader has AI features switched off, 503 when no model is configured (nothing spent), 402 with the upgrade body when the
// month's allowance is used up, 429 at the daily cost guard. A search whose model call fails is refunded,
// and so is one that finds no books (back to the month's allowance; it still counts towards the daily guard).

// Two short model calls, with a retry each in the worst case.
export const maxDuration = 60;

const bodySchema = z.object({ query: z.string().trim().min(3, "Say a little more about what you'd like to read.").max(ASK_QUERY_MAX) });

// Beyond the allowance: a speed bump against a script hammering the endpoint.
const PER_MINUTE = 6;

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const status = await allowanceStatus(user.id, "askShelfSearches", { account: usageAccountOf(user) });
  return NextResponse.json({ available: aiAvailable(), enabled: preferencesOf(user).aiFeatures, ...status }, { headers: noStore });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Type what you'd like to read." }, { status: 400 });

  if (!preferencesOf(user).aiFeatures) {
    return NextResponse.json({ error: "AI features are switched off in your settings.", code: "ai_off" }, { status: 403 });
  }

  if (!aiAvailable()) {
    return NextResponse.json({ error: "Search isn't available right now.", code: "ai_unavailable" }, { status: 503 });
  }

  const limited = rateLimit(`ask-shelf:${user.id}`, PER_MINUTE, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "That's a lot of searches at once. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }

  const spent = await consumeAllowance(user.id, "askShelfSearches", { account: usageAccountOf(user) });
  if (!spent.ok) {
    if (spent.reason === "allowance") return entitlementResponse(new EntitlementError("askShelfSearches"));
    return NextResponse.json({ error: "You've reached today's limit for AI features. It resets at midnight.", code: "daily_cap", left: spent.left }, { status: 429 });
  }

  try {
    const result = await askShelf(user.id, parsed.data.query, { ask: askJson, catalog: prismaAskCatalog });
    if (result.results.length === 0) {
      await spent.refund({ daily: false });
      return NextResponse.json({ ...result, left: spent.left === null ? null : spent.left + 1, refunded: true }, { headers: noStore });
    }
    return NextResponse.json({ ...result, left: spent.left }, { headers: noStore });
  } catch (err) {
    await spent.refund();
    if (err instanceof AiError) {
      console.warn(`ask-shelf: ${err.kind}: ${err.message}`);
      return NextResponse.json({ error: "Search isn't available right now. Try again in a minute. That one didn't count.", code: "ai_failed" }, { status: 502 });
    }
    throw err;
  }
}
