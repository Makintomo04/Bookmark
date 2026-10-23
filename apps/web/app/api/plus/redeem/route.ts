import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { redeemGiftCode } from "@/lib/giftCodes";

// Redeems a lifetime buyer's gift code: a month of Plus for a reader who has never had it.
export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to use a gift code.");
  if (response) return response;

  // Slows down guessing codes.
  const limit = rateLimit(`gift-redeem:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const body = await req.json().catch(() => null);
  const result = await redeemGiftCode(user.id, body?.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ until: result.until.toISOString() });
}
