import { GIFT_DAYS, REFERRALS } from "./entitlements.ts";

// Free Plus months: referral rewards and gift codes. The rules, pure so they can be tested without a
// database; lib/referrals.ts and lib/giftCodes.ts do the database work.

const DAY = 86_400_000;

// A free month adds to whatever free Plus is left, so two rewards in a row give two months.
export function extendComp(current: Date | string | null | undefined, now: Date, days: number): Date {
  const from = current ? new Date(current) : null;
  const base = from && from.getTime() > now.getTime() ? from : now;
  return new Date(base.getTime() + days * DAY);
}

// Readers who joined in the last two weeks count as new: joining a circle then credits the host.
export const NEW_ACCOUNT_DAYS = 14;
export function isNewAccount(createdAt: Date | string, now: Date): boolean {
  return now.getTime() - new Date(createdAt).getTime() <= NEW_ACCOUNT_DAYS * DAY;
}

// May an inviter be rewarded again this calendar year?
export function referralRewardAllowed(rewardedThisYear: number): boolean {
  return rewardedThisYear < REFERRALS.perYear;
}

export const startOfYear = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

// Who can redeem a gift code: a reader who has never had Plus in any form (no trial, subscription,
// lifetime, founder mark or free months). Gifts are for bringing new readers in.
type GiftCandidate = {
  plan?: string | null;
  trialEndsAt?: Date | string | null;
  stripeSubscriptionId?: string | null;
  lifetime?: boolean | null;
  compPlusUntil?: Date | string | null;
  foundingMember?: boolean | null;
};
export function canRedeemGift(user: GiftCandidate): boolean {
  return user.plan !== "PLUS" && !user.trialEndsAt && !user.stripeSubscriptionId && !user.lifetime && !user.compPlusUntil && !user.foundingMember;
}
export const GIFT_DAYS_GRANTED = GIFT_DAYS;

// Codes look like "BKMK-7QH4-M2XD": no 0/O or 1/I/L, so they survive being read aloud or copied by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeGiftCode(random: (n: number) => Uint8Array): string {
  const chars = Array.from(random(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `BKMK-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// What a reader types, tidied: "bkmk 7qh4 m2xd" becomes "BKMK-7QH4-M2XD". Null when it can't be a code.
export function normaliseGiftCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("BKMK") ? raw.slice(4) : raw;
  if (body.length !== 8 || body.split("").some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `BKMK-${body.slice(0, 4)}-${body.slice(4)}`;
}

// The personal invite link: sign-up remembers the inviter (lib/referrals.ts) until onboarding finishes.
export const REFERRAL_COOKIE = "bm_ref";
export function inviteLinkPath(username: string): string {
  return `/register?ref=${encodeURIComponent(username)}`;
}
