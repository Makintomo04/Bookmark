import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { LIFETIME } from "@/lib/entitlements";
import { GIFT_DAYS_GRANTED, canRedeemGift, extendComp, makeGiftCode, normaliseGiftCode } from "@/lib/plusRewards";

// Gift codes: each lifetime buyer gets LIFETIME.giftCodes one-month Plus gifts for friends who have
// never had Plus. The rules are in lib/plusRewards.ts.

// Tops a lifetime buyer up to LIFETIME.giftCodes codes. Safe to call twice (webhook retries).
export async function grantLifetimeGiftCodes(ownerId: string): Promise<string[]> {
  const have = await prisma.giftCode.count({ where: { ownerId } });
  const codes: string[] = [];
  for (let i = have; i < LIFETIME.giftCodes; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeGiftCode((n) => randomBytes(n));
      try {
        await prisma.giftCode.create({ data: { code, ownerId } });
        codes.push(code);
        break;
      } catch {
        // A clash on the unique code; try another.
      }
    }
  }
  return codes;
}

export type RedeemResult =
  | { ok: true; until: Date }
  | { ok: false; error: string; status: number };

export async function redeemGiftCode(userId: string, input: unknown, now = new Date()): Promise<RedeemResult> {
  const code = normaliseGiftCode(input);
  if (!code) return { ok: false, error: "That doesn't look like a gift code. They look like BKMK-7QH4-M2XD.", status: 400 };

  const [gift, user] = await Promise.all([
    prisma.giftCode.findUnique({ where: { code } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, trialEndsAt: true, stripeSubscriptionId: true, lifetime: true, compPlusUntil: true, foundingMember: true, storeProductId: true },
    }),
  ]);
  if (!gift) return { ok: false, error: "We couldn't find that gift code. Check it and try again.", status: 404 };
  // redeemedAt, not redeemedById: a redeemer who deletes their account leaves the code used.
  if (gift.redeemedAt) return { ok: false, error: "That gift code has already been used.", status: 409 };
  if (gift.ownerId === userId) return { ok: false, error: "Gift codes are for friends. Share it with someone who hasn't tried Plus.", status: 400 };
  if (!user || !canRedeemGift(user)) return { ok: false, error: "Gift codes are for readers who haven't had Plus before.", status: 403 };

  // Claim the code first, so it can't be used twice.
  // On MongoDB `{ field: null }` misses documents where the field was never written, hence both.
  const claimed = await prisma.giftCode.updateMany({
    where: { id: gift.id, OR: [{ redeemedAt: null }, { redeemedAt: { isSet: false } }] },
    data: { redeemedById: userId, redeemedAt: now },
  });
  if (claimed.count === 0) return { ok: false, error: "That gift code has already been used.", status: 409 };
  const until = extendComp(user.compPlusUntil, now, GIFT_DAYS_GRANTED);
  await prisma.user.update({ where: { id: userId }, data: { compPlusUntil: until } });
  return { ok: true, until };
}

export async function giftCodesOf(ownerId: string) {
  const codes = await prisma.giftCode.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" }, select: { code: true, redeemedAt: true } });
  return codes.map((c) => ({ code: c.code, redeemed: !!c.redeemedAt }));
}
