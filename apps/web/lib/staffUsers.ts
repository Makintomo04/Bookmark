import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { entitlementsSelect, grantedCompUntil, hasActiveComp, isIndefiniteComp, paysForPlus, plusSourceOf, plusSourcesOf, COMP_GRANTS, type CompGrant } from "@/lib/entitlements";
import { can, canActOn, isRole, isSuspended, roleOf, suspensionEnd, SUSPENSION_DURATIONS, type Role, type SuspensionDuration } from "@/lib/roles";
import { logStaffAction } from "@/lib/staffLog";
import { notifyRoleChanged } from "@/lib/staffNotify";
import { staffFail as fail, type StaffOutcome } from "@/lib/staffRoute";
import { trackRecords, type TrackRecord } from "@/lib/staffTrackRecord";
import { mayKeepNotesOn } from "@/lib/staffNoteRules";
import { billingDates, canHandleAppeals, cleanReason, roleChangeProblem, roleFilterWhere, staffSearchWhere, stripeCustomerUrl, type RoleFilter } from "@/lib/staffUserRules";

export { REASON_MAX } from "@/lib/staffUserRules";

// The admin side of /staff/users: finding an account, suspending it, granting free Plus and setting its
// role. Each change is logged (lib/staffLog.ts). The routes in app/api/staff/users check the permission;
// these check who may act on whom (roles.ts canActOn) and return a message the console can show.

export const isObjectId = (id: string | null | undefined): boolean => !!id && /^[a-f0-9]{24}$/i.test(id);

const staffUserSelect = {
  id: true,
  username: true,
  displayName: true,
  name: true,
  email: true,
  image: true,
  favColour: true,
  createdAt: true,
  role: true,
  isStaff: true,
  suspendedAt: true,
  suspendedUntil: true,
  suspensionReason: true,
  stripeCustomerId: true,
  storeName: true,
  planRenewsAt: true,
  planCancelsAtPeriodEnd: true,
  trialEndsAt: true,
  storeTrialing: true,
  foundingMember: true,
  ...entitlementsSelect,
} as const;

const findStaffUserRow = (id: string) => prisma.user.findUnique({ where: { id }, select: staffUserSelect });

type StaffUserRow = NonNullable<Awaited<ReturnType<typeof findStaffUserRow>>>;

// Email and the account's own name are for admins (users.suspend); librarians find readers by handle,
// display name or id.
export const seesPrivateDetails = (viewer: Actor) => can(viewer, "users.suspend");

// What a card shows besides the account itself, loaded for a page of cards at once (cardExtras).
export interface CardExtras {
  trackRecord: TrackRecord | null;
  noteCount: number;
  // Admins only: the appeal waiting for a decision, if there is one.
  openAppeal: { id: string; summary: string; createdAt: string; openedBy: string | null } | null;
}

const noExtras: CardExtras = { trackRecord: null, noteCount: 0, openAppeal: null };

// What the console shows for an account. No password or tokens. Admins also see billing: the Stripe
// customer id, to open it in Stripe's dashboard, and when a plan renews or a trial ends.
export function staffUserView(user: StaffUserRow, viewer: Actor, now = new Date(), extras: CardExtras = noExtras) {
  const showPrivate = seesPrivateDetails(viewer);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    name: showPrivate ? user.name : null,
    email: showPrivate ? user.email : null,
    image: user.image,
    favColour: user.favColour,
    createdAt: user.createdAt.toISOString(),
    role: roleOf(user),
    suspended: isSuspended(user, now),
    suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
    suspensionReason: user.suspensionReason,
    plusSource: plusSourceOf(user, now),
    // Every source at once (a free grant on top of a paid plan included), for the pills.
    plusSources: plusSourcesOf(user, now).map((s) => ({ source: s.source, until: s.until?.toISOString() ?? null, indefinite: s.indefinite })),
    paysForPlus: paysForPlus(user, now),
    compActive: hasActiveComp(user, now),
    compPlusUntil: user.compPlusUntil?.toISOString() ?? null,
    compIndefinite: isIndefiniteComp(user.compPlusUntil),
    hasStripe: !!user.stripeCustomerId,
    store: user.storeName,
    billing: showPrivate
      ? {
          ...billingDates(user, now),
          foundingMember: !!user.foundingMember,
          stripeCustomerId: user.stripeCustomerId,
          stripeUrl: user.stripeCustomerId ? stripeCustomerUrl(user.stripeCustomerId, process.env.STRIPE_SECRET_KEY) : null,
        }
      : null,
    trackRecord: extras.trackRecord,
    noteCount: extras.noteCount,
    openAppeal: canHandleAppeals(viewer) ? extras.openAppeal : null,
  };
}
export type StaffUser = ReturnType<typeof staffUserView>;

// Track records, note counts and open appeals for a page of cards: a query each, not one per card.
async function cardExtras(ids: string[], viewer: Actor): Promise<Map<string, CardExtras>> {
  if (ids.length === 0) return new Map();
  const [records, notes, appeals, roles] = await Promise.all([
    trackRecords(ids).catch((e) => {
      console.error("staff track records failed", e);
      return new Map<string, TrackRecord>();
    }),
    prisma.staffNote.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
    canHandleAppeals(viewer)
      ? prisma.appeal.findMany({ where: { userId: { in: ids }, status: "OPEN" }, select: { id: true, userId: true, summary: true, createdAt: true, openedById: true } })
      : [],
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, isStaff: true } }),
  ]);
  // Notes on staff accounts are for admins (lib/staffNoteRules.ts): nobody else is told they exist either.
  const notesHidden = new Set(roles.filter((u) => !mayKeepNotesOn(viewer, u)).map((u) => u.id));
  const openers = appeals.length
    ? await prisma.user.findMany({ where: { id: { in: appeals.map((a) => a.openedById) } }, select: { id: true, username: true } })
    : [];
  const opener = new Map(openers.map((u) => [u.id, u.username]));
  const noteCount = new Map(notes.map((n) => [n.userId, n._count._all]));
  const appealOf = new Map(appeals.map((a) => [a.userId, a]));
  return new Map(ids.map((id): [string, CardExtras] => {
    const appeal = appealOf.get(id);
    return [id, {
      trackRecord: records.get(id) ?? null,
      noteCount: notesHidden.has(id) ? 0 : noteCount.get(id) ?? 0,
      openAppeal: appeal ? { id: appeal.id, summary: appeal.summary, createdAt: appeal.createdAt.toISOString(), openedBy: opener.get(appeal.openedById) ?? null } : null,
    }];
  }));
}

export async function staffUserViews(rows: StaffUserRow[], viewer: Actor, now = new Date()): Promise<StaffUser[]> {
  const extras = await cardExtras(rows.map((r) => r.id), viewer);
  return rows.map((r) => staffUserView(r, viewer, now, extras.get(r.id)));
}

// One card, fresh, after a change to it (notes and appeals).
export async function staffUserById(id: string, viewer: Actor, now = new Date()): Promise<StaffUser | null> {
  const row = await findStaffUserRow(id);
  return row ? (await staffUserViews([row], viewer, now))[0] : null;
}

const withExtras = async (row: StaffUserRow, viewer: Actor, now: Date): Promise<StaffResult> =>
  ({ ok: true, value: (await staffUserViews([row], viewer, now))[0] });

export interface StaffSearch {
  query: string;
  role?: RoleFilter;
  // Readers with an appeal waiting, oldest appeal first. Admins only: the route checks.
  openAppeals?: boolean;
  limit?: number;
}

// A page of cards, and whether "Show more" would find any: one more than the page is read to tell.
export async function searchStaffUsers(viewer: Actor, search: StaffSearch): Promise<{ users: StaffUser[]; hasMore: boolean }> {
  const limit = search.limit ?? 20;
  const q = search.query.trim().replace(/^@/, "");
  const and: Prisma.UserWhereInput[] = [];
  const roleWhere = roleFilterWhere(search.role ?? "all");
  if (roleWhere) and.push(roleWhere);

  let rows: StaffUserRow[];
  if (search.openAppeals) {
    const appeals = await prisma.appeal.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, select: { userId: true }, take: 200 });
    const order = Array.from(new Set(appeals.map((a) => a.userId)));
    const found = await prisma.user.findMany({ where: { id: { in: order }, AND: and }, select: staffUserSelect });
    const byId = new Map(found.map((u) => [u.id, u]));
    rows = order.map((id) => byId.get(id)).filter((u): u is StaffUserRow => !!u).slice(0, limit + 1);
  } else if (q && isObjectId(q)) {
    const one = await prisma.user.findFirst({ where: { id: q, AND: and }, select: staffUserSelect });
    rows = one ? [one] : [];
  } else {
    if (q) and.push(staffSearchWhere(q, { private: seesPrivateDetails(viewer) }));
    rows = await prisma.user.findMany({
      where: { AND: and },
      select: staffUserSelect,
      // Newest first, which also keeps "Show more" in a steady order.
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });
  }
  return { users: await staffUserViews(rows.slice(0, limit), viewer), hasMore: rows.length > limit };
}

export type StaffResult = StaffOutcome<StaffUser>;

type Actor = { id: string; role?: string | null; isStaff?: boolean | null };

async function targetFor(actor: Actor, id: string): Promise<{ target: StaffUserRow; error?: undefined } | { target?: undefined; error: StaffResult }> {
  if (!isObjectId(id)) return { error: fail(404, "No account with that id.") };
  const target = await findStaffUserRow(id);
  if (!target) return { error: fail(404, "No account with that id.") };
  if (!canActOn(actor, target)) {
    return { error: fail(403, actor.id === target.id ? "You can't do that to your own account." : "Admins can't be changed from the console.") };
  }
  return { target };
}

export async function suspendUser(actor: Actor, id: string, body: { duration?: unknown; reason?: unknown }, now = new Date()): Promise<StaffResult> {
  const duration = body.duration;
  if (typeof duration !== "string" || !(duration in SUSPENSION_DURATIONS)) return fail(400, "Pick how long the suspension lasts.");
  const reason = cleanReason(body.reason);
  if (!reason) return fail(400, "Give a reason. It's kept in the staff log.");
  const { target, error } = await targetFor(actor, id);
  if (error) return error;

  const until = suspensionEnd(duration as SuspensionDuration, now);
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { suspendedAt: now, suspendedUntil: until, suspensionReason: reason, suspendedById: actor.id },
      select: staffUserSelect,
    }),
    // Ends the app's sessions; the web's JWT is refused by getCurrentUser from the next request.
    prisma.mobileSession.deleteMany({ where: { userId: target.id } }),
  ]);
  await logStaffAction({
    actorId: actor.id, action: "user.suspend", targetType: "user", targetId: target.id,
    after: { until: until?.toISOString() ?? "indefinite" }, reason,
  });
  return withExtras(updated, actor, now);
}

export async function unsuspendUser(actor: Actor, id: string, body: { reason?: unknown }, now = new Date()): Promise<StaffResult> {
  const reason = cleanReason(body.reason);
  if (!reason) return fail(400, "Give a reason. It's kept in the staff log.");
  const { target, error } = await targetFor(actor, id);
  if (error) return error;
  if (!target.suspendedAt) return fail(400, "That account isn't suspended.");
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { suspendedAt: null, suspendedUntil: null, suspensionReason: null, suspendedById: null },
    select: staffUserSelect,
  });
  await logStaffAction({
    actorId: actor.id, action: "user.unsuspend", targetType: "user", targetId: target.id,
    before: { until: target.suspendedUntil?.toISOString() ?? "indefinite", reason: target.suspensionReason }, reason,
  });
  return withExtras(updated, actor, now);
}

export async function grantPlus(actor: Actor, id: string, body: { grant?: unknown; note?: unknown }, now = new Date()): Promise<StaffResult> {
  const grant = body.grant;
  if (typeof grant !== "string" || !(grant in COMP_GRANTS)) return fail(400, "Pick how long the free Plus lasts.");
  if (!isObjectId(id)) return fail(404, "No account with that id.");
  // Granting Plus to yourself or another admin is fine: it isn't a sanction, and it's logged like any other grant.
  const target = await findStaffUserRow(id);
  if (!target) return fail(404, "No account with that id.");
  const until = grantedCompUntil(target.compPlusUntil, grant as CompGrant, now);
  const updated = await prisma.user.update({ where: { id: target.id }, data: { compPlusUntil: until }, select: staffUserSelect });
  await logStaffAction({
    actorId: actor.id, action: "plus.grant", targetType: "user", targetId: target.id,
    before: { compPlusUntil: target.compPlusUntil?.toISOString() ?? null },
    after: { compPlusUntil: isIndefiniteComp(until) ? "indefinite" : until.toISOString(), grant },
    reason: cleanReason(body.note),
  });
  return withExtras(updated, actor, now);
}

export async function revokePlus(actor: Actor, id: string, body: { note?: unknown }, now = new Date()): Promise<StaffResult> {
  if (!isObjectId(id)) return fail(404, "No account with that id.");
  const target = await findStaffUserRow(id);
  if (!target) return fail(404, "No account with that id.");
  if (!target.compPlusUntil || !hasActiveComp(target, now)) return fail(400, "That account has no free Plus to remove. Paid plans are managed in Stripe or the app stores.");
  const updated = await prisma.user.update({ where: { id: target.id }, data: { compPlusUntil: null }, select: staffUserSelect });
  await logStaffAction({
    actorId: actor.id, action: "plus.revoke", targetType: "user", targetId: target.id,
    before: { compPlusUntil: isIndefiniteComp(target.compPlusUntil) ? "indefinite" : target.compPlusUntil.toISOString() }, reason: cleanReason(body.note),
  });
  return withExtras(updated, actor, now);
}

// Body: { role, reason, confirm }. `confirm` is the target's username, needed only to make an admin.
export async function setRole(actor: Actor, id: string, body: { role?: unknown; reason?: unknown; confirm?: unknown }, now = new Date()): Promise<StaffResult> {
  if (!isRole(body.role)) return fail(400, "Pick a role.");
  const role: Role = body.role;
  const { target, error } = await targetFor(actor, id);
  if (error) return error;
  const before = roleOf(target);
  if (before === role) return withExtras(target, actor, now);
  const problem = roleChangeProblem(target, role, body);
  if (problem) return fail(400, problem);
  // isStaff is cleared so the old flag can't bring a role back (roles.ts roleOf), and roleWelcomedAs so
  // the new role gets its welcome (roleWelcome.ts), even one they held before.
  const updated = await prisma.user.update({ where: { id: target.id }, data: { role, isStaff: false, roleWelcomedAs: null }, select: staffUserSelect });
  await logStaffAction({ actorId: actor.id, action: "role.set", targetType: "user", targetId: target.id, before: { role: before }, after: { role }, reason: cleanReason(body.reason) });
  // Tells them in the app. Never throws; awaited so a serverless host doesn't cut it off.
  await notifyRoleChanged(target.id, before, role);
  return withExtras(updated, actor, now);
}
