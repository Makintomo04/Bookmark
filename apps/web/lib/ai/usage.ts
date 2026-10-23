import { allowanceLeft, entitlementsOf, entitlementsSelect, type AllowanceKey, type Entitlements } from "@/lib/entitlements";
import { DEFAULT_TIME_ZONE, isValidTimeZone, localDay } from "@/lib/timeZone";

// Metering for the AI features: how many of a monthly allowance (lib/entitlements.ts
// MONTHLY_ALLOWANCES) a reader has used, and spending one.
//
// Two counters are spent together on every use:
//   - the feature's monthly count, against the plan's allowance. Months run in the reader's time zone,
//     so a search at 11pm on the 31st in New York counts towards that month, not the next.
//   - a daily count across every AI feature, against DAILY_AI_CAP whatever the plan. A cost guard: a
//     runaway script on one Plus account can't spend a month's ceiling in an afternoon.
//
// Each is spent with one conditional increment ("add one if below the limit"), which MongoDB applies
// atomically to the document, so two requests racing for the last search can't both get it. No
// read-then-write anywhere. A use that then fails (the model call errors) is refunded.
//
// The store is injectable: tests use memoryUsageStore(), the app the Prisma one.

// AI uses per reader per local day, all features together.
export const DAILY_AI_CAP = 30;
// The feature name the daily rows are kept under.
export const DAILY_FEATURE = "all";

export interface UsageCounter {
  userId: string;
  feature: string;
  period: string;
}

export interface UsageStore {
  count(counter: UsageCounter): Promise<number>;
  // Adds one when the count is below `limit` (null: no limit), in one atomic step. True when it added.
  incrementBelow(counter: UsageCounter, limit: number | null): Promise<boolean>;
  decrement(counter: UsageCounter): Promise<void>;
}

// What metering needs to know about the reader.
export interface UsageAccount {
  entitlements: Entitlements;
  timeZone: string;
}

export interface UsageOptions {
  store?: UsageStore;
  // Saves a lookup when the caller already has the user row (plan fields and timeZone).
  account?: UsageAccount;
  now?: Date;
}

export const monthKey = (now: Date, zone: string) => localDay(now, zone).slice(0, 7);
export const dayKey = (now: Date, zone: string) => localDay(now, zone);

type StoredAccount = Parameters<typeof entitlementsOf>[0] & { timeZone?: string | null };

export function usageAccountOf(user: StoredAccount, now = new Date()): UsageAccount {
  return {
    entitlements: entitlementsOf(user, now),
    timeZone: isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE,
  };
}

async function loadAccount(userId: string, now: Date): Promise<UsageAccount> {
  const { default: prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ...entitlementsSelect, timeZone: true } });
  return usageAccountOf(user ?? {}, now);
}

const counters = (userId: string, key: AllowanceKey, account: UsageAccount, now: Date) => ({
  month: { userId, feature: key, period: monthKey(now, account.timeZone) },
  day: { userId, feature: DAILY_FEATURE, period: dayKey(now, account.timeZone) },
});

export interface AllowanceStatus {
  allowance: number | null;
  used: number;
  // Null when unlimited.
  left: number | null;
  isPlus: boolean;
  dailyLeft: number;
}

// The monthly allowance, how much of it is used, and what today's cost guard leaves.
export async function allowanceStatus(userId: string, key: AllowanceKey, opts: UsageOptions = {}): Promise<AllowanceStatus> {
  const now = opts.now ?? new Date();
  const store = opts.store ?? prismaUsageStore;
  const account = opts.account ?? (await loadAccount(userId, now));
  const { month, day } = counters(userId, key, account, now);
  const [used, today] = await Promise.all([store.count(month), store.count(day)]);
  return {
    allowance: account.entitlements.allowances[key],
    used,
    left: allowanceLeft(account.entitlements, key, used),
    isPlus: account.entitlements.isPlus,
    dailyLeft: Math.max(0, DAILY_AI_CAP - today),
  };
}

export async function usedThisMonth(userId: string, key: AllowanceKey, opts: UsageOptions = {}): Promise<number> {
  return (await allowanceStatus(userId, key, opts)).used;
}

export type ConsumeResult =
  // refund({ daily: false }) gives back the month's use but keeps it against the daily cost guard: for
  // a model call that worked but found nothing for the reader.
  | { ok: true; left: number | null; refund: (opts?: { daily?: boolean }) => Promise<void> }
  // allowance: the plan's monthly allowance is spent (show the upgrade prompt). daily: the cost guard.
  | { ok: false; reason: "allowance" | "daily"; left: number | null };

// Spends one use of `key`, or refuses without spending anything.
export async function consumeAllowance(userId: string, key: AllowanceKey, opts: UsageOptions = {}): Promise<ConsumeResult> {
  const now = opts.now ?? new Date();
  const store = opts.store ?? prismaUsageStore;
  const account = opts.account ?? (await loadAccount(userId, now));
  const { month, day } = counters(userId, key, account, now);
  const allowance = account.entitlements.allowances[key];

  // The monthly allowance first, so a reader who is out of both sees the upgrade prompt.
  if (!(await store.incrementBelow(month, allowance))) return { ok: false, reason: "allowance", left: 0 };
  if (!(await store.incrementBelow(day, DAILY_AI_CAP))) {
    await store.decrement(month);
    return { ok: false, reason: "daily", left: allowanceLeft(account.entitlements, key, await store.count(month)) };
  }

  const left = allowanceLeft(account.entitlements, key, await store.count(month));
  let refunded = false;
  const refund = async ({ daily = true }: { daily?: boolean } = {}) => {
    if (refunded) return;
    refunded = true;
    await Promise.all([store.decrement(month), ...(daily ? [store.decrement(day)] : [])]);
  };
  return { ok: true, left, refund };
}

// ---- Stores --------------------------------------------------------------------------------------

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

export const prismaUsageStore: UsageStore = {
  async count(counter) {
    const { default: prisma } = await import("@/lib/db");
    const row = await prisma.aiUsage.findUnique({ where: { userId_feature_period: counter }, select: { count: true } });
    return row?.count ?? 0;
  },
  async incrementBelow(counter, limit) {
    const { default: prisma } = await import("@/lib/db");
    // Make sure the row exists. Two first uses racing here: one create wins, the other hits the
    // unique index and carries on to the same increment.
    const existing = await prisma.aiUsage.findUnique({ where: { userId_feature_period: counter }, select: { id: true } });
    if (!existing) {
      try {
        await prisma.aiUsage.create({ data: { ...counter, count: 0 } });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    // The filter and the increment are one update on one document: MongoDB applies it atomically.
    const { count } = await prisma.aiUsage.updateMany({
      where: { ...counter, ...(limit !== null && { count: { lt: limit } }) },
      data: { count: { increment: 1 } },
    });
    return count === 1;
  },
  async decrement(counter) {
    const { default: prisma } = await import("@/lib/db");
    await prisma.aiUsage.updateMany({ where: { ...counter, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
  },
};

// In memory, for tests. Every call yields to the event loop before touching the count, the way a
// database round trip would, so a read-then-write in consumeAllowance would show up as a race.
export function memoryUsageStore(): UsageStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  const id = (c: UsageCounter) => `${c.userId}|${c.feature}|${c.period}`;
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    rows,
    async count(counter) {
      await tick();
      return rows.get(id(counter)) ?? 0;
    },
    async incrementBelow(counter, limit) {
      await tick();
      const current = rows.get(id(counter)) ?? 0;
      if (limit !== null && current >= limit) return false;
      rows.set(id(counter), current + 1);
      return true;
    },
    async decrement(counter) {
      await tick();
      const current = rows.get(id(counter)) ?? 0;
      if (current > 0) rows.set(id(counter), current - 1);
    },
  };
}
