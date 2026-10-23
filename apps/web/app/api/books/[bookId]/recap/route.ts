import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { EntitlementError } from "@/lib/entitlements";
import { entitlementResponse } from "@/lib/entitlementsServer";
import { rateLimit } from "@/lib/rateLimit";
import { aiAvailable, askJson } from "@/lib/ai/client";
import { allowanceStatus, usageAccountOf } from "@/lib/ai/usage";
import { isObjectId } from "@/lib/buddyReadsServer";
import { preferencesOf } from "@/lib/preferences";
import { catchMeUp, recapState } from "@/lib/recap";
import { prismaRecapSource, voteOnRecap } from "@/lib/recapSource";

// Catch me up (lib/recap.ts), for one of the reader's own shelf books. Owner only; recaps are private.
//
//   GET   /api/books/:id/recap                     which recaps the book can have, kept ones included, and the allowance
//   POST  /api/books/:id/recap { kind }            a recap: the kept one (free) or a new one (one of the month's allowance)
//   PATCH /api/books/:id/recap { recapId, vote }   thumbs up or down (or null to clear), for quality tracking
//
// Refusals: 404 not the reader's book, 403 AI features switched off in settings, 409 that kind isn't offered
// for the book now, 503 no model configured, 402 with the upgrade body when the month's recaps are used,
// 429 at the daily cost guard. A recap that fails, goes past the reader's point, or that the model isn't
// confident about is refunded.

// One model call with thinking, and a retry in the worst case.
export const maxDuration = 60;

const PER_MINUTE = 6;
const noStore = { "Cache-Control": "private, no-store" };

const postSchema = z.object({ kind: z.enum(["RESUME", "SERIES"]) });
const patchSchema = z.object({ recapId: z.string().refine(isObjectId), vote: z.enum(["UP", "DOWN"]).nullable() });

export async function GET(_req: Request, { params }: { params: { bookId: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.bookId)) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const reader = { id: user.id, aiFeatures: preferencesOf(user).aiFeatures };
  const state = await recapState(reader, params.bookId, { source: prismaRecapSource, available: aiAvailable });
  if (!state.enabled) return NextResponse.json(state, { headers: noStore });
  const allowance = await allowanceStatus(user.id, "recaps", { account: usageAccountOf(user) });
  return NextResponse.json({ ...state, allowance }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: { bookId: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.bookId)) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say which recap: RESUME or SERIES." }, { status: 400 });

  const limited = rateLimit(`recap:${user.id}`, PER_MINUTE, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "That's a lot of recaps at once. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }

  const reader = { id: user.id, aiFeatures: preferencesOf(user).aiFeatures };
  const account = usageAccountOf(user);
  const result = await catchMeUp(reader, params.bookId, parsed.data.kind, { ask: askJson, source: prismaRecapSource, available: aiAvailable, usage: { account } });
  const left = async () => (await allowanceStatus(user.id, "recaps", { account })).left;

  switch (result.status) {
    case "ready":
      return NextResponse.json({ status: "ready", recap: result.recap, cached: result.cached, left: result.cached ? await left() : result.left }, { headers: noStore });
    case "not_confident":
      return NextResponse.json({ status: "not_confident", left: await left() }, { headers: noStore });
    case "not_found":
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    case "off":
      return NextResponse.json({ error: "AI features are switched off in your settings.", code: "ai_off" }, { status: 403 });
    case "not_eligible":
      return NextResponse.json({ error: "There's no recap for this book right now.", code: "not_eligible" }, { status: 409 });
    case "unavailable":
      return NextResponse.json({ error: "Recaps aren't available right now.", code: "ai_unavailable" }, { status: 503 });
    case "allowance":
      return entitlementResponse(new EntitlementError("recaps"));
    case "daily":
      return NextResponse.json({ error: "You've reached today's limit for AI features. It resets at midnight.", code: "daily_cap", left: result.left }, { status: 429 });
    case "failed":
      console.warn(`recap: ${result.reason}${result.detail ? `: ${result.detail}` : ""}`);
      return NextResponse.json({
        error: result.reason === "overreach"
          ? "That recap went further than where you are, so we threw it away. Try again later. That one didn't count."
          : "Couldn't write a recap right now. Try again in a minute. That one didn't count.",
        code: result.reason === "overreach" ? "recap_overreach" : "ai_failed",
      }, { status: 502 });
  }
}

export async function PATCH(req: Request, { params }: { params: { bookId: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.bookId)) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  const ok = await voteOnRecap(user.id, parsed.data.recapId, parsed.data.vote);
  if (!ok) return NextResponse.json({ error: "Recap not found" }, { status: 404 });
  return NextResponse.json({ vote: parsed.data.vote }, { headers: noStore });
}
