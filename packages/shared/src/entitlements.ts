import type { Plan } from "./enums.ts";

// Bookmark Plus: what a plan may do. Pure, so client components and tests can read it off a user
// with nothing but `plan`. The rule from the strategy: charge for convenience and power;
// gate the host, never the guest; never gate stats or import. Every gated feature
// checks these on the server through lib/entitlementsServer.ts, not only in the UI.

// Final prices: the Stripe prices are tax-inclusive (tax_behavior "inclusive"), so readers pay
// exactly these wherever they are, with any VAT or sales tax taken out of them.
export const PLUS_PRICING = {
  monthly: 3.99,
  yearly: 29.99,
  currency: "USD",
  trialDays: 14,
} as const;

// The Founding Reader price: the yearly plan at $24.99, kept for as long as the subscription runs.
// Offered until FOUNDING_CAP founders have subscribed or the window closes (PLUS_FOUNDING_CLOSES_AT,
// set at launch to launch + 90 days), whichever comes first. foundingStatus() decides.
export const FOUNDING = {
  yearly: 24.99,
  cap: 1000,
} as const;

// Patron: the yearly plan at a higher, optional price for readers who want to give more. Same
// features, a Patron badge. Left out of every forecast.
export const PATRON = {
  yearly: 49.99,
} as const;

// Lifetime Plus: one payment, sold only during the launch window (the Founding window's closing date)
// and to at most `cap` buyers. Each buyer gets `giftCodes` one-month Plus gifts to hand out. The AI
// allowances are the same fair-use ceiling as Plus.
export const LIFETIME = {
  price: 79,
  cap: 500,
  giftCodes: 3,
} as const;

// Referral months: an inviter earns `days` of Plus for each invited friend who joins and logs some
// reading, up to `perYear` a calendar year. Inviter only.
export const REFERRALS = {
  perYear: 2,
  days: 30,
} as const;

// A gift code from a lifetime buyer is worth this many days of Plus to a reader who has never had it.
export const GIFT_DAYS = 30;

// Monthly allowances for the AI slices that come later (mood search, recaps). Counted per calendar
// month. Plus has a stated fair-use ceiling, never "unlimited": raising a cap later reads as a gift,
// capping an unlimited promise reads as a betrayal. Metering goes through allowanceLeft().
export const MONTHLY_ALLOWANCES = {
  askShelfSearches: { free: 5, plus: 100 },
  recaps: { free: 3, plus: 30 },
} as const satisfies Record<string, { free: number; plus: number | null }>;

export type AllowanceKey = keyof typeof MONTHLY_ALLOWANCES;

export type EntitlementKey = "canHostUnlimited" | "extraGoalTypes" | "customWrapDesigns";

export interface Entitlements {
  plan: Plan;
  isPlus: boolean;
  // Active hosted reading circles: free hosts one at a time (lib/buddyReads.ts hostingAllowance).
  canHostUnlimited: boolean;
  // A page goal and a custom monthly target beside the yearly count. The pace worked out from the
  // yearly goal is a stat, so it's free.
  extraGoalTypes: boolean;
  // Alternative Wrap card designs (planned). The standard monthly Wrap card is free.
  customWrapDesigns: boolean;
  // Per calendar month; null is unlimited.
  allowances: Record<AllowanceKey, number | null>;
}

// The User fields these need. Spread into a Prisma `select`.
export const entitlementsSelect = { plan: true, lifetime: true, compPlusUntil: true, storePlusUntil: true } as const;

type StoredPlan = { plan?: Plan | null; lifetime?: boolean | null; compPlusUntil?: Date | string | null; storePlusUntil?: Date | string | null };

const asDate = (value: Date | string | null | undefined) => (value ? new Date(value) : null);

// Where an account's Plus comes from: a Stripe subscription (or trial), an App Store or Google Play
// subscription bought in the app, a lifetime purchase, or free months earned by inviting friends or from
// a gift code. Null on free.
export type PlusSource = "subscription" | "store" | "lifetime" | "comp";

export function plusSourceOf(user: StoredPlan, now = new Date()): PlusSource | null {
  if (user.lifetime) return "lifetime";
  if (user.plan === "PLUS") return "subscription";
  const store = asDate(user.storePlusUntil);
  if (store && store.getTime() > now.getTime()) return "store";
  const comp = asDate(user.compPlusUntil);
  if (comp && comp.getTime() > now.getTime()) return "comp";
  return null;
}

// Accounts made before billing have no plan stored; they're free.
export function planOf(user: StoredPlan, now = new Date()): Plan {
  return plusSourceOf(user, now) ? "PLUS" : "FREE";
}

export function entitlementsOf(user: StoredPlan, now = new Date()): Entitlements {
  const plan = planOf(user, now);
  const isPlus = plan === "PLUS";
  const tier = isPlus ? "plus" : "free";
  return {
    plan,
    isPlus,
    canHostUnlimited: isPlus,
    extraGoalTypes: isPlus,
    customWrapDesigns: isPlus,
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
    message: "Add a page goal and your own monthly target beside your yearly count, and see them in your stats.",
  },
  customWrapDesigns: {
    title: "Your Wrap, your way",
    message: "Pick other designs for your Wrap cards. The standard monthly card and your year-end Wrapped stay free.",
  },
  askShelfSearches: {
    title: "Ask the shelf, without limits",
    message: `Free accounts get ${MONTHLY_ALLOWANCES.askShelfSearches.free} mood searches a month. Plus raises it to ${MONTHLY_ALLOWANCES.askShelfSearches.plus}.`,
  },
  recaps: {
    title: "Catch me up more often",
    message: `Free accounts get ${MONTHLY_ALLOWANCES.recaps.free} recaps a month. Plus raises it to ${MONTHLY_ALLOWANCES.recaps.plus}.`,
  },
};

// ---- The Founding Reader window ----------------------------------------------------------------

export interface FoundingStatus {
  open: boolean;
  // Founders still to come before the cap; 0 once it's reached.
  remaining: number;
  // When the window closes, if a date is set.
  closesAt: Date | null;
}

// Open while fewer than FOUNDING.cap founders have subscribed and the closing date (if set) hasn't
// passed. A founder keeps the price for as long as the subscription runs; this only decides who can start one.
export function foundingStatus(founders: number, closesAt: Date | null, now = new Date(), cap: number = FOUNDING.cap): FoundingStatus {
  const remaining = Math.max(0, cap - founders);
  const beforeClose = !closesAt || now.getTime() < closesAt.getTime();
  return { open: remaining > 0 && beforeClose, remaining, closesAt };
}

// PLUS_FOUNDING_CLOSES_AT as a date, or null when unset or unreadable.
export function parseFoundingClose(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The lifetime offer shares the Founding window's closing date and has its own cap.
export function lifetimeStatus(sold: number, closesAt: Date | null, now = new Date()): FoundingStatus {
  return foundingStatus(sold, closesAt, now, LIFETIME.cap);
}

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

type StoredBilling = StoredPlan & {
  planRenewsAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  stripeCustomerId?: string | null;
  foundingMember?: boolean | null;
  patron?: boolean | null;
  storeName?: string | null;
  storeTrialing?: boolean | null;
};

export type PlusStore = "APP_STORE" | "PLAY_STORE";

export interface PlanStatus {
  plan: Plan;
  // Where Plus comes from, or null on free.
  source: PlusSource | null;
  // Subscribed at the Founding Reader price.
  founding: boolean;
  patron: boolean;
  lifetime: boolean;
  // Free months (referrals, gift codes) run until this date.
  compUntil: Date | null;
  // On Plus through a trial that hasn't ended yet.
  trialing: boolean;
  // When the trial or the paid period ends. Null on free.
  until: Date | null;
  // On Plus through the App Store or Google Play: managed there, not in Stripe's portal.
  store: PlusStore | null;
  // Has a Stripe customer, so the portal can open (even when back on free).
  hasBilling: boolean;
  // A trial was already used, so Checkout won't offer another.
  trialUsed: boolean;
}

export function planStatusOf(user: StoredBilling, now = new Date()): PlanStatus {
  const source = plusSourceOf(user, now);
  const plan: Plan = source ? "PLUS" : "FREE";
  const trialEndsAt = asDate(user.trialEndsAt);
  const renewsAt = asDate(user.planRenewsAt);
  const compUntil = asDate(user.compPlusUntil);
  const storeUntil = asDate(user.storePlusUntil);
  const trialing = (source === "subscription" && !!trialEndsAt && trialEndsAt.getTime() > now.getTime()) || (source === "store" && !!user.storeTrialing);
  return {
    plan,
    source,
    founding: !!user.foundingMember,
    patron: source === "subscription" && !!user.patron,
    lifetime: source === "lifetime",
    compUntil: compUntil && compUntil.getTime() > now.getTime() ? compUntil : null,
    trialing,
    until: source === "subscription" ? (trialing ? trialEndsAt : renewsAt) : source === "store" ? storeUntil : source === "comp" ? compUntil : null,
    store: source === "store" && (user.storeName === "APP_STORE" || user.storeName === "PLAY_STORE") ? user.storeName : null,
    hasBilling: !!user.stripeCustomerId,
    trialUsed: !!trialEndsAt,
  };
}

// Can this reader start a subscription or buy lifetime? Not while already subscribed (on the web or in
// the app) or lifetime. Free months don't block it: a reader can subscribe before they run out.
export function canStartCheckout(status: PlanStatus): boolean {
  return status.source !== "subscription" && status.source !== "store" && status.source !== "lifetime";
}
