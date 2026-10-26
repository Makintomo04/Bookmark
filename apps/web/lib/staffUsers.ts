import prisma from "@/lib/db";
import { entitlementsSelect, grantedCompUntil, isIndefiniteComp, plusSourceOf, COMP_GRANTS, type CompGrant } from "@/lib/entitlements";
import { canActOn, isRole, isSuspended, roleOf, suspensionEnd, SUSPENSION_DURATIONS, type Role, type SuspensionDuration } from "@/lib/roles";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail as fail, type StaffOutcome } from "@/lib/staffRoute";

// The admin side of /staff/users: finding an account, suspending it, granting free Plus and setting its
// role. Each change is logged (lib/staffLog.ts). The routes in app/api/staff/users check the permission;
// these check who may act on whom (roles.ts canActOn) and return a message the console can show.

export const isObjectId = (id: string | null | undefined): boolean => !!id && /^[a-f0-9]{24}$/i.test(id);

export const REASON_MAX = 500;

const staffUserSelect = {
  id: true,
  username: true,
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
  ...entitlementsSelect,
} as const;

const findStaffUserRow = (id: string) => prisma.user.findUnique({ where: { id }, select: staffUserSelect });

type StaffUserRow = NonNullable<Awaited<ReturnType<typeof findStaffUserRow>>>;

// What the console shows for an account. No password, tokens or Stripe ids beyond whether one exists.
export function staffUserView(user: StaffUserRow, now = new Date()) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    image: user.image,
    favColour: user.favColour,
    createdAt: user.createdAt.toISOString(),
    role: roleOf(user),
    suspended: isSuspended(user, now),
    suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
    suspensionReason: user.suspensionReason,
    plusSource: plusSourceOf(user, now),
    compPlusUntil: user.compPlusUntil?.toISOString() ?? null,
    compIndefinite: isIndefiniteComp(user.compPlusUntil),
    hasStripe: !!user.stripeCustomerId,
    store: user.storeName,
  };
}
export type StaffUser = ReturnType<typeof staffUserView>;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function searchStaffUsers(query: string, limit = 20): Promise<StaffUser[]> {
  const q = query.trim().replace(/^@/, "");
  if (!q) {
    const recent = await prisma.user.findMany({ select: staffUserSelect, orderBy: { createdAt: "desc" }, take: limit });
    return recent.map((u) => staffUserView(u));
  }
  if (isObjectId(q)) {
    const one = await findStaffUserRow(q);
    return one ? [staffUserView(one)] : [];
  }
  const text = escapeRegex(q);
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: text, mode: "insensitive" } },
        { email: { startsWith: text, mode: "insensitive" } },
        { name: { contains: text, mode: "insensitive" } },
      ],
    },
    select: staffUserSelect,
    take: limit,
  });
  return rows.map((u) => staffUserView(u));
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

const cleanReason = (reason: unknown) => (typeof reason === "string" ? reason.trim().slice(0, REASON_MAX) : "");

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
  return { ok: true, value: staffUserView(updated, now) };
}

export async function unsuspendUser(actor: Actor, id: string, body: { reason?: unknown }, now = new Date()): Promise<StaffResult> {
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
    before: { until: target.suspendedUntil?.toISOString() ?? "indefinite", reason: target.suspensionReason }, reason: cleanReason(body.reason),
  });
  return { ok: true, value: staffUserView(updated, now) };
}

export async function grantPlus(actor: Actor, id: string, body: { grant?: unknown; note?: unknown }, now = new Date()): Promise<StaffResult> {
  const grant = body.grant;
  if (typeof grant !== "string" || !(grant in COMP_GRANTS)) return fail(400, "Pick how long the free Plus lasts.");
  if (!isObjectId(id)) return fail(404, "No account with that id.");
  // Granting Plus to yourself or another admin is fine: it isn't a sanction.
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
  return { ok: true, value: staffUserView(updated, now) };
}

export async function revokePlus(actor: Actor, id: string, body: { note?: unknown }, now = new Date()): Promise<StaffResult> {
  if (!isObjectId(id)) return fail(404, "No account with that id.");
  const target = await findStaffUserRow(id);
  if (!target) return fail(404, "No account with that id.");
  if (!target.compPlusUntil) return fail(400, "That account has no free Plus to remove. Paid plans are managed in Stripe or the app stores.");
  const updated = await prisma.user.update({ where: { id: target.id }, data: { compPlusUntil: null }, select: staffUserSelect });
  await logStaffAction({
    actorId: actor.id, action: "plus.revoke", targetType: "user", targetId: target.id,
    before: { compPlusUntil: target.compPlusUntil.toISOString() }, reason: cleanReason(body.note),
  });
  return { ok: true, value: staffUserView(updated, now) };
}

export async function setRole(actor: Actor, id: string, body: { role?: unknown }, now = new Date()): Promise<StaffResult> {
  if (!isRole(body.role)) return fail(400, "Pick a role.");
  const role: Role = body.role;
  const { target, error } = await targetFor(actor, id);
  if (error) return error;
  const before = roleOf(target);
  if (before === role) return { ok: true, value: staffUserView(target, now) };
  // isStaff is cleared so the old flag can't bring a role back (roles.ts roleOf).
  const updated = await prisma.user.update({ where: { id: target.id }, data: { role, isStaff: false }, select: staffUserSelect });
  await logStaffAction({ actorId: actor.id, action: "role.set", targetType: "user", targetId: target.id, before: { role: before }, after: { role } });
  return { ok: true, value: staffUserView(updated, now) };
}
