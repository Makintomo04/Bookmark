import type { Plan } from "@prisma/client";

// Bookmark Plus: what a plan may do. Pure, so client components and tests can read it off a user
// with nothing but `plan`. The rule from the strategy: charge for convenience, power and
// personalisation; gate the host, never the guest; never gate stats or import. Every gated feature
// checks these on the server through lib/entitlementsServer.ts, not only in the UI.

// Final prices: the Stripe prices are tax-inclusive (tax_behavior "inclusive"), so readers pay
// exactly these wherever they are, with any VAT or sales tax taken out of them.
export const PLUS_PRICING = {
  monthly: 2.99,
  yearly: 24.99,
  currency: "USD",
  trialDays: 14,
} as const;

// Monthly allowances for the AI slices that come later (mood search, recaps). Counted per calendar
// month; null means unlimited. Metering goes through allowanceLeft() so the numbers live here only.
export const MONTHLY_ALLOWANCES = {
  askShelfSearches: { free: 5, plus: null },
  recaps: { free: 3, plus: null },
} as const satisfies Record<string, { free: number; plus: number | null }>;

export type AllowanceKey = keyof typeof MONTHLY_ALLOWANCES;

export type EntitlementKey = "canHostUnlimited" | "extraGoalTypes" | "monthlyWrapCards" | "personalisation";

export interface Entitlements {
  plan: Plan;
  isPlus: boolean;
  // Active hosted reading circles: free hosts one at a time (lib/buddyReads.ts hostingAllowance).
  canHostUnlimited: boolean;
  // A page goal and a monthly book goal beside the yearly count.
  extraGoalTypes: boolean;
  // Share cards for a single month, from the Wrapped image generator.
  monthlyWrapCards: boolean;
  // Profile themes and the shelf card colour.
  personalisation: boolean;
  // Per calendar month; null is unlimited.
  allowances: Record<AllowanceKey, number | null>;
}

// The User fields these need. Spread into a Prisma `select`.
export const entitlementsSelect = { plan: true } as const;

type StoredPlan = { plan?: Plan | null };

// Accounts made before billing have no plan stored; they're free.
export function planOf(user: StoredPlan): Plan {
  return user.plan === "PLUS" ? "PLUS" : "FREE";
}

export function entitlementsOf(user: StoredPlan): Entitlements {
  const plan = planOf(user);
  const isPlus = plan === "PLUS";
  const tier = isPlus ? "plus" : "free";
  return {
    plan,
    isPlus,
    canHostUnlimited: isPlus,
    extraGoalTypes: isPlus,
    monthlyWrapCards: isPlus,
    personalisation: isPlus,
    allowances: {
      askShelfSearches: MONTHLY_ALLOWANCES.askShelfSearches[tier],
      recaps: MONTHLY_ALLOWANCES.recaps[tier],
    },
  };
}

// How many of a metered feature are left this month, given how many were used; null is unlimited.
export function allowanceLeft(entitlements: Entitlements, key: AllowanceKey, usedThisMonth: number): number | null {
  const allowance = entitlements.allowances[key];
  return allowance === null ? null : Math.max(0, allowance - usedThisMonth);
}

export function hasAllowance(entitlements: Entitlements, key: AllowanceKey, usedThisMonth: number): boolean {
  const left = allowanceLeft(entitlements, key, usedThisMonth);
  return left === null || left > 0;
}

// What the upgrade prompt says for each gate. One place, so the API's 402 and the UI agree.
export const FEATURE_COPY: Record<EntitlementKey | AllowanceKey, { title: string; message: string }> = {
  canHostUnlimited: {
    title: "Host as many circles as you like",
    message: "Free accounts host one active circle at a time. Plus lifts the limit. Joining is never limited.",
  },
  extraGoalTypes: {
    title: "Goals beyond one number",
    message: "Add a page goal and a monthly pace beside your yearly count, and see them in your stats.",
  },
  monthlyWrapCards: {
    title: "Monthly Wrap cards",
    message: "A share-ready card for any month, in the same style as your Wrapped. The year-end Wrapped stays free.",
  },
  personalisation: {
    title: "Make your profile yours",
    message: "Pick a profile theme and a colour for your shelf cards, and show a supporter badge.",
  },
  askShelfSearches: {
    title: "Ask the shelf, without limits",
    message: `Free accounts get ${MONTHLY_ALLOWANCES.askShelfSearches.free} mood searches a month. Plus is unlimited.`,
  },
  recaps: {
    title: "Catch me up, without limits",
    message: `Free accounts get ${MONTHLY_ALLOWANCES.recaps.free} recaps a month. Plus is unlimited.`,
  },
};

export const UPGRADE_URL = "/plus";

// Thrown by requireEntitlement(); API routes map it to a 402 JSON body (entitlementResponse()).
export class EntitlementError extends Error {
  readonly status = 402;
  readonly code = "upgrade_required";
  readonly feature: EntitlementKey | AllowanceKey;

  constructor(feature: EntitlementKey | AllowanceKey, message = FEATURE_COPY[feature].message) {
    super(message);
    this.name = "EntitlementError";
    this.feature = feature;
  }
}

export function isEntitlementError(error: unknown): error is EntitlementError {
  return error instanceof EntitlementError;
}

export interface UpgradeRequiredBody {
  error: string;
  code: "upgrade_required";
  feature: EntitlementKey | AllowanceKey;
  upgradeUrl: string;
}

export function entitlementErrorBody(error: EntitlementError): UpgradeRequiredBody {
  return { error: error.message, code: "upgrade_required", feature: error.feature, upgradeUrl: UPGRADE_URL };
}

// True for the JSON body an API route sends when a gate refuses (axios: err.response.data).
export function isUpgradeRequired(body: unknown): body is UpgradeRequiredBody {
  return !!body && typeof body === "object" && (body as { code?: string }).code === "upgrade_required";
}

// ---- Plan status, for settings and the pricing page ------------------------------------------

type StoredBilling = StoredPlan & { planRenewsAt?: Date | string | null; trialEndsAt?: Date | string | null; stripeCustomerId?: string | null };

export interface PlanStatus {
  plan: Plan;
  // On Plus through a trial that hasn't ended yet.
  trialing: boolean;
  // When the trial or the paid period ends. Null on free.
  until: Date | null;
  // Has a Stripe customer, so the portal can open (even when back on free).
  hasBilling: boolean;
  // A trial was already used, so Checkout won't offer another.
  trialUsed: boolean;
}

const asDate = (value: Date | string | null | undefined) => (value ? new Date(value) : null);

export function planStatusOf(user: StoredBilling, now = new Date()): PlanStatus {
  const plan = planOf(user);
  const trialEndsAt = asDate(user.trialEndsAt);
  const renewsAt = asDate(user.planRenewsAt);
  const trialing = plan === "PLUS" && !!trialEndsAt && trialEndsAt.getTime() > now.getTime();
  return {
    plan,
    trialing,
    until: plan === "PLUS" ? (trialing ? trialEndsAt : renewsAt) : null,
    hasBilling: !!user.stripeCustomerId,
    trialUsed: !!trialEndsAt,
  };
}
