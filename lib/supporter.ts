import type { Plan } from "@prisma/client";
import { plusSourceOf } from "./entitlements.ts";

// The supporter badge beside a paying reader's name on their profile (Bookmark Plus).

// The User fields these need. Spread into a Prisma `select`.
export const supporterSelect = { plan: true, foundingMember: true, lifetime: true, patron: true, compPlusUntil: true } as const;

// Most generous first. Free months earn none.
export type SupporterBadgeKind = "patron" | "lifetime" | "founding" | "supporter";

export interface Supporter {
  // Paying for Plus: a subscription or lifetime.
  supporter: boolean;
  // A founder on Plus: the badge reads "Founding Reader".
  founding: boolean;
  badge: SupporterBadgeKind | null;
}

type Stored = {
  plan?: Plan | null;
  foundingMember?: boolean | null;
  lifetime?: boolean | null;
  patron?: boolean | null;
  compPlusUntil?: Date | string | null;
};

export function supporterOf(user: Stored, now = new Date()): Supporter {
  const source = plusSourceOf(user, now);
  const paying = source === "subscription" || source === "lifetime";
  const badge: SupporterBadgeKind | null = !paying ? null
    : source === "subscription" && user.patron ? "patron"
    : source === "lifetime" ? "lifetime"
    : user.foundingMember ? "founding"
    : "supporter";
  return { supporter: paying, founding: paying && !!user.foundingMember, badge };
}
