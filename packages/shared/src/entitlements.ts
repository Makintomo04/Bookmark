import type { Plan } from "./enums";

// Bookmark Plus: what a plan may do. Pure, so client components and tests can read it off a user
// with nothing but `plan`. The rule from the strategy: charge for convenience and power;
// gate the host, never the guest; never gate import. Never take away a stat that's free: Plus adds
// ways to explore your stats, never the stats themselves. Every gated feature
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

// Monthly allowances for the AI features (Ask the shelf, Catch me up). Counted per calendar
// month. A free allowance of 0 means the feature comes with Plus; only null means unlimited. Plus has a stated fair-use ceiling, never "unlimited": raising a cap later reads as a gift,
// capping an unlimited promise reads as a betrayal. Metering goes through allowanceLeft().
export const MONTHLY_ALLOWANCES = {
  askShelfSearches: { free: 3, plus: 100 },
  recaps: { free: 0, plus: 30 },
} as const satisfies Record<string, { free: number; plus: number | null }>;

export type AllowanceKey = keyof typeof MONTHLY_ALLOWANCES;

export type EntitlementKey = "canHostUnlimited" | "extraGoalTypes" | "customWrapDesigns" | "statsExplorer";

export interface Entitlements {
  plan: Plan;
  isPlus: boolean;
  // Active hosted reading circles: free hosts one at a time (lib/buddyReads.ts hostingAllowance).
  canHostUnlimited: boolean;
  // A page goal and a custom monthly target beside the yearly count. The pace worked out from the
  // yearly goal is a stat, so it's free.
  extraGoalTypes: boolean;
  // The Paper and Your colour designs for Wrap cards (packages/shared/src/wrapCards.ts). Midnight, the
  // standard design, is free in every size.
  customWrapDesigns: boolean;
  // The stats explorer (packages/shared/src/statsExplorer.ts): any date range, comparing two periods,
  // filters, saved views, a CSV of a chart and Wrap cards for a custom range. Every stat on /stats, Wrapped
  // and the monthly and yearly cards stays free.
  statsExplorer: boolean;
  // Per calendar month; null is unlimited.
  allowances: Record<AllowanceKey, number | null>;
}

// The User fields these need. Spread into a Prisma `select`.
export const entitlementsSelect = { plan: true, lifetime: true, compPlusUntil: true, storePlusUntil: true } as const;

type StoredPlan = { plan?: Plan | null; lifetime?: boolean | null; compPlusUntil?: Date | string | null; storePlusUntil?: Date | string | null };

const asDate = (value: Date | string | null | undefined) => (value ? new Date(value) : null);

// Where an account's Plus comes from: a Stripe subscription (or trial), an App Store or Google Play
// subscription bought in the app, a lifetime purchase (no longer sold), or free months. Null on free.
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

// Every source of Plus an account has right now, paid first, where plusSourceOf() names only the one that
// wins. The staff console shows them all, so free months given on top of a paid plan aren't hidden.
// `until` is when that source runs out, where the stored fields say (a Stripe renewal isn't kept here).
export interface ActivePlusSource {
  source: PlusSource;
  until: Date | null;
  indefinite: boolean;
}

export function plusSourcesOf(user: StoredPlan, now = new Date()): ActivePlusSource[] {
  const sources: ActivePlusSource[] = [];
  if (user.lifetime) sources.push({ source: "lifetime", until: null, indefinite: true });
  if (user.plan === "PLUS") sources.push({ source: "subscription", until: null, indefinite: false });
  const store = asDate(user.storePlusUntil);
  if (store && store.getTime() > now.getTime()) sources.push({ source: "store", until: store, indefinite: false });
  const comp = asDate(user.compPlusUntil);
  if (comp && comp.getTime() > now.getTime()) {
    const indefinite = comp.getTime() >= COMP_INDEFINITE.getTime();
    sources.push({ source: "comp", until: indefinite ? null : comp, indefinite });
  }
  return sources;
}

// Already paying for Plus (or paid once, for lifetime): staff are warned before giving free months on top.
export function paysForPlus(user: StoredPlan, now = new Date()): boolean {
  return plusSourcesOf(user, now).some((s) => s.source !== "comp");
}

// Free Plus that is still running, so there is something for staff to remove.
export function hasActiveComp(user: StoredPlan, now = new Date()): boolean {
  return plusSourcesOf(user, now).some((s) => s.source === "comp");
}

// Free Plus granted by an admin with no end date. Stored as a far-off compPlusUntil, so plusSourceOf()
// needs no special case; isIndefiniteComp() tells the settings page to say "no end date".
export const COMP_INDEFINITE = new Date("9999-12-31T00:00:00.000Z");

export function isIndefiniteComp(compPlusUntil: Date | string | null | undefined): boolean {
  const comp = asDate(compPlusUntil);
  return !!comp && comp.getTime() >= COMP_INDEFINITE.getTime();
}

export const COMP_GRANTS = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, indefinite: null } as const satisfies Record<string, number | null>;
export type CompGrant = keyof typeof COMP_GRANTS;

// The new compPlusUntil for a staff grant: months are added to whatever free Plus is still left, so a
// grant never cuts one short.
export function grantedCompUntil(current: Date | string | null | undefined, grant: CompGrant, now = new Date()): Date {
  const months = COMP_GRANTS[grant];
  if (months === null || isIndefiniteComp(current)) return COMP_INDEFINITE;
  const existing = asDate(current);
  const from = new Date(Math.max(now.getTime(), existing?.getTime() ?? 0));
  from.setUTCMonth(from.getUTCMonth() + months);
  return from;
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
    statsExplorer: isPlus,
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
    message: "Paper and your own colour are Plus designs for your Wrap cards. Midnight stays free in every size, and so does your year-end Wrapped.",
  },
  statsExplorer: {
    title: "Dig deeper into your stats",
    message: "Pick any dates, set two periods side by side, filter by format, genre, mood, spice, author or re-reads, and save the views you come back to. Every stat on your stats page stays free.",
  },
  askShelfSearches: {
    title: "More Ask the shelf searches",
    message: `Free accounts get ${MONTHLY_ALLOWANCES.askShelfSearches.free} mood searches a month. Plus raises it to ${MONTHLY_ALLOWANCES.askShelfSearches.plus}.`,
  },
  recaps: {
    title: "Catch me up comes with Plus",
    message: `Plus recaps the story so far when you come back to a book: up to ${MONTHLY_ALLOWANCES.recaps.plus} a month.`,
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
  // Free months run until this date (set by staff; referrals and gift codes, now cut, set it before launch).
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
