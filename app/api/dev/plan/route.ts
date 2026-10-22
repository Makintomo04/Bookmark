import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { entitlementsSelect, planStatusOf } from "@/lib/entitlements";
import { NextResponse } from "next/server";
import { z } from "zod";

// Dev-only: put your own account on Plus or back on free without Stripe, so the gates can be tried
// from the browser. Does what scripts/set-plan.ts does, for the signed-in reader. Not served in production.
const bodySchema = z.object({ plus: z.boolean() }).strict();

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { plus } = parsed.data;
  // Going back to free also clears lifetime and free months, or they'd keep the account on Plus.
  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: plus
      ? { plan: "PLUS", planRenewsAt: new Date(Date.now() + 30 * 86_400_000) }
      : { plan: "FREE", planRenewsAt: null, lifetime: false, compPlusUntil: null },
    select: { ...entitlementsSelect, planRenewsAt: true, trialEndsAt: true, stripeCustomerId: true, foundingMember: true, patron: true },
  });
  return NextResponse.json(planStatusOf(user));
}
