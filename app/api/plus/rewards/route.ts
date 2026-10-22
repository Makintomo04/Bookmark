import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { giftCodesOf } from "@/lib/giftCodes";
import { referralSummary } from "@/lib/referrals";
import { inviteLinkPath } from "@/lib/plusRewards";

// For the Plus section in settings: the reader's invite link and how it's done, and any gift codes
// they have to hand out (lifetime buyers).
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const [referrals, giftCodes] = await Promise.all([referralSummary(user.id), giftCodesOf(user.id)]);
  return NextResponse.json({
    invitePath: user.username ? inviteLinkPath(user.username) : null,
    referrals,
    giftCodes,
  });
}
