import prisma from "@/lib/db";
import { REFERRALS, planStatusOf } from "@/lib/entitlements";
import { extendComp, isNewAccount, referralRewardAllowed, startOfYear } from "@/lib/plusRewards";
import { REGIONAL_PRICES, toMinor, type PlusCurrency } from "@/lib/regionalPricing";
import { isStripeConfigured, stripe } from "@/lib/stripe";

// Referral months: who brought whom, and the month of Plus the inviter earns once the friend logs
// some reading. The rules are in lib/plusRewards.ts. Every function here swallows nothing: callers on
// hot paths (logging progress, adding a book) call them with .catch() so a reward never blocks reading.

export type ReferralSource = "link" | "circle";

// Records that `inviterId` brought `inviteeId`. Only for new accounts, never yourself, and only once
// per invitee (the first inviter wins). Returns whether a referral was recorded.
export async function attachReferral(inviteeId: string, inviterId: string, source: ReferralSource, now = new Date()): Promise<boolean> {
  if (inviteeId === inviterId) return false;
  const [invitee, inviter, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: inviteeId }, select: { createdAt: true } }),
    prisma.user.findUnique({ where: { id: inviterId }, select: { id: true } }),
    prisma.referral.findUnique({ where: { inviteeId }, select: { id: true } }),
  ]);
  if (!invitee || !inviter || existing || !isNewAccount(invitee.createdAt, now)) return false;
  try {
    await prisma.referral.create({ data: { inviterId, inviteeId, source } });
    return true;
  } catch {
    // Two requests raced; the unique index on inviteeId kept the first.
    return false;
  }
}

export async function attachReferralByUsername(inviteeId: string, inviterUsername: string, source: ReferralSource) {
  const inviter = await prisma.user.findUnique({ where: { username: inviterUsername }, select: { id: true } });
  return inviter ? attachReferral(inviteeId, inviter.id, source) : false;
}

export type RewardResult = "comp" | "credit" | "lifetime" | "capped" | "none";

// The invitee logged some reading: the referral qualifies, and the inviter gets a month of Plus if
// they haven't had REFERRALS.perYear rewards this calendar year.
export async function qualifyReferral(inviteeId: string, now = new Date()): Promise<RewardResult> {
  const referral = await prisma.referral.findUnique({ where: { inviteeId } });
  if (!referral || referral.qualifiedAt) return "none";
  // Claim it first, so two requests can't both reward the same referral.
  // On MongoDB `{ field: null }` misses documents where the field was never written, hence both.
  const claimed = await prisma.referral.updateMany({
    where: { id: referral.id, OR: [{ qualifiedAt: null }, { qualifiedAt: { isSet: false } }] },
    data: { qualifiedAt: now },
  });
  if (claimed.count === 0) return "none";

  const rewardedThisYear = await prisma.referral.count({ where: { inviterId: referral.inviterId, rewardedAt: { gte: startOfYear(now) } } });
  if (!referralRewardAllowed(rewardedThisYear)) return "capped";

  const result = await rewardInviter(referral.inviterId, now);
  if (result === "comp" || result === "credit") {
    await prisma.referral.update({ where: { id: referral.id }, data: { rewardedAt: now } });
  }
  return result;
}

// A month of Plus. Free readers (and those on free months) get REFERRALS.days more. Subscribers get a
// month's price as account credit in their subscription's currency, which comes off their next bill.
// Lifetime readers already have Plus for good, so there's nothing to give.
async function rewardInviter(inviterId: string, now: Date): Promise<RewardResult> {
  const user = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { plan: true, lifetime: true, compPlusUntil: true, planRenewsAt: true, trialEndsAt: true, stripeCustomerId: true, stripeSubscriptionId: true, foundingMember: true, patron: true },
  });
  if (!user) return "none";
  const status = planStatusOf(user, now);
  if (status.source === "lifetime") return "lifetime";

  if (status.source === "subscription" && user.stripeCustomerId && user.stripeSubscriptionId && isStripeConfigured()) {
    const sub = await stripe().subscriptions.retrieve(user.stripeSubscriptionId);
    const currency = sub.currency.toUpperCase() as PlusCurrency;
    const monthly = REGIONAL_PRICES[currency]?.monthly;
    if (monthly) {
      await stripe().customers.createBalanceTransaction(user.stripeCustomerId, {
        amount: -toMinor(monthly),
        currency: sub.currency,
        description: "A free month of Bookmark Plus for inviting a friend",
      });
      return "credit";
    }
  }

  await prisma.user.update({ where: { id: inviterId }, data: { compPlusUntil: extendComp(user.compPlusUntil, now, REFERRALS.days) } });
  return "comp";
}

// For the settings page: the invite link's results.
export async function referralSummary(inviterId: string, now = new Date()) {
  const [joined, qualified, rewardedThisYear] = await Promise.all([
    prisma.referral.count({ where: { inviterId } }),
    prisma.referral.count({ where: { inviterId, qualifiedAt: { not: null } } }),
    prisma.referral.count({ where: { inviterId, rewardedAt: { gte: startOfYear(now) } } }),
  ]);
  return { joined, qualified, rewardedThisYear, perYear: REFERRALS.perYear };
}
