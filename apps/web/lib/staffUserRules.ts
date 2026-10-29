import type { Prisma } from "@prisma/client";
import { can, type Role } from "@/lib/roles";

// The parts of lib/staffUsers.ts that need no database, so tests can check them.

export const REASON_MAX = 500;
// A staff note on an account, and the summary of an appeal.
export const STAFF_NOTE_MAX = 1000;
export const APPEAL_SUMMARY_MAX = 1000;

export const cleanReason = (reason: unknown) => (typeof reason === "string" ? reason.trim().slice(0, REASON_MAX) : "");
export const cleanNote = (body: unknown) => (typeof body === "string" ? body.trim().slice(0, STAFF_NOTE_MAX) : "");

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// What a search matches: handle (from the start) and display name (anywhere in it) for every viewer;
// email and account name only for those who may see them (users.suspend, so admins). A librarian typing
// an email finds no one by it.
export function staffSearchWhere(query: string, opts: { private: boolean }): Prisma.UserWhereInput {
  const text = escapeRegex(query);
  const or: Prisma.UserWhereInput[] = [
    { username: { startsWith: text, mode: "insensitive" } },
    { displayName: { contains: text, mode: "insensitive" } },
  ];
  if (opts.private) {
    or.push({ email: { startsWith: text, mode: "insensitive" } }, { name: { contains: text, mode: "insensitive" } });
  }
  return { OR: or };
}

// The role filter on the Readers tab, so it doubles as a list of the team. "all" adds nothing.
export const ROLE_FILTERS = ["all", "LIBRARIAN", "ADMIN", "READER"] as const;
export type RoleFilter = (typeof ROLE_FILTERS)[number];
export const isRoleFilter = (value: unknown): value is RoleFilter => typeof value === "string" && (ROLE_FILTERS as readonly string[]).includes(value);

// Matches roles.ts roleOf: no role stored reads as ADMIN with the old isStaff flag, READER without.
// MongoDB keeps unset and null apart, so both are matched.
export function roleFilterWhere(filter: RoleFilter): Prisma.UserWhereInput | null {
  if (filter === "all") return null;
  const noRole: Prisma.UserWhereInput = { OR: [{ role: { isSet: false } }, { role: null }] };
  if (filter === "LIBRARIAN") return { role: "LIBRARIAN" };
  if (filter === "ADMIN") return { OR: [{ role: "ADMIN" }, { AND: [noRole, { isStaff: true }] }] };
  return { OR: [{ role: "READER" }, { AND: [noRole, { NOT: { isStaff: true } }] }] };
}

// How many accounts a search shows at first and per "Show more", and the most it will page to.
export const SEARCH_PAGE = 20;
export const SEARCH_MAX = 100;
export const searchLimit = (value: unknown) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(SEARCH_MAX, n) : SEARCH_PAGE;
};

// What staff type to confirm making someone an admin: their username, or their id if they have none yet.
export const adminConfirmWord = (target: { id: string; username: string | null }) => target.username ?? target.id;

// Why a role change can't go ahead, or null. Every change needs a reason for the log; making an admin
// also needs the target's username typed back, since the console can't undo it.
export function roleChangeProblem(target: { id: string; username: string | null }, role: Role, body: { reason?: unknown; confirm?: unknown }): string | null {
  if (!cleanReason(body.reason)) return "Give a reason. It's kept in the staff log.";
  if (role === "ADMIN") {
    const typed = typeof body.confirm === "string" ? body.confirm.trim().replace(/^@/, "").toLowerCase() : "";
    if (typed !== adminConfirmWord(target).toLowerCase()) return "Type their username to confirm.";
  }
  return null;
}

// ---- Billing on the card (admins) ------------------------------------------------------------

// Stripe's dashboard page for a customer. Test-mode customers live under /test, which the server
// knows from its secret key (sk_test_, or a restricted rk_test_ key).
export function stripeCustomerUrl(customerId: string, secretKey: string | null | undefined): string {
  const test = !!secretKey && /^(sk|rk)_test_/.test(secretKey);
  return `https://dashboard.stripe.com/${test ? "test/" : ""}customers/${encodeURIComponent(customerId)}`;
}

type StoredBilling = {
  plan?: string | null;
  planRenewsAt?: Date | null;
  planCancelsAtPeriodEnd?: boolean | null;
  trialEndsAt?: Date | null;
  storeTrialing?: boolean | null;
  storePlusUntil?: Date | null;
  foundingMember?: boolean | null;
};

// The dates worth showing next to the Plus pills: when a trial ends (a Stripe trial still running, or a
// store trial) or else when a Stripe plan renews, or ends if they've cancelled. trialEndsAt stays set after
// a trial, so only a future one counts. Null for each that doesn't apply.
export function billingDates(user: StoredBilling, now = new Date()): { renewsAt: string | null; endsAt: string | null; trialEndsAt: string | null } {
  const onStripe = user.plan === "PLUS";
  const stripeTrial = onStripe && user.trialEndsAt && user.trialEndsAt.getTime() > now.getTime() ? user.trialEndsAt : null;
  const storeTrial = user.storeTrialing && user.storePlusUntil && user.storePlusUntil.getTime() > now.getTime() ? user.storePlusUntil : null;
  const trial = stripeTrial ?? storeTrial;
  const renews = onStripe && !stripeTrial && user.planRenewsAt && user.planRenewsAt.getTime() > now.getTime() ? user.planRenewsAt : null;
  // A cancelled plan ends rather than renews, and a cancelled Stripe trial ends rather than converting.
  const cancelled = !!user.planCancelsAtPeriodEnd;
  const ends = cancelled ? renews ?? stripeTrial : null;
  return {
    renewsAt: (!cancelled && renews?.toISOString()) || null,
    endsAt: ends?.toISOString() ?? null,
    trialEndsAt: (cancelled && stripeTrial ? storeTrial : trial)?.toISOString() ?? null,
  };
}

// ---- Appeals ---------------------------------------------------------------------------------

export const APPEAL_STATUSES = ["OPEN", "UPHELD", "REJECTED"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];
export type AppealDecision = Exclude<AppealStatus, "OPEN">;
export const isAppealDecision = (value: unknown): value is AppealDecision => value === "UPHELD" || value === "REJECTED";

type Viewer = { id: string; role?: string | null; isStaff?: boolean | null };

// Appeals are an admin's job (users.suspend, the same as lifting a suspension), and never your own.
export const canHandleAppeals = (viewer: Viewer) => can(viewer, "users.suspend");

// Why an appeal can't be logged, or null: the reader must be suspended now, with no appeal already open.
export function appealOpenProblem(target: { suspended: boolean }, hasOpenAppeal: boolean, summary: unknown): string | null {
  if (!target.suspended) return "They aren't suspended, so there's nothing to appeal.";
  if (hasOpenAppeal) return "They already have an appeal waiting. Decide that one first.";
  if (typeof summary !== "string" || !summary.trim()) return "Say what they're appealing and why.";
  return null;
}

// Why this viewer can't decide this appeal, or null. Admins decide, never on their own appeal, only
// while it's open, and always with a note for the log.
export function appealDecisionProblem(viewer: Viewer, appeal: { userId: string; status: string }, body: { decision?: unknown; note?: unknown }): string | null {
  if (!canHandleAppeals(viewer)) return "Only admins decide appeals.";
  if (viewer.id === appeal.userId) return "You can't decide your own appeal.";
  if (appeal.status !== "OPEN") return "That appeal has already been decided.";
  if (!isAppealDecision(body.decision)) return "Uphold or reject it.";
  if (!cleanReason(body.note)) return "Add a note. It's kept with the appeal and in the staff log.";
  return null;
}
