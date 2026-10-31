import prisma from "@/lib/db";
import { canActOn, isSuspended } from "@/lib/roles";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail as fail } from "@/lib/staffRoute";
import { appealDecisionProblem, appealOpenProblem, cleanReason, APPEAL_SUMMARY_MAX } from "@/lib/staffUserRules";
import { appealDeciderProblem } from "@/lib/staffAppealRules";
import { roleFilterWhere } from "@/lib/staffUserRules";
import { isObjectId, staffUserById, type StaffResult } from "@/lib/staffUsers";

// A suspended reader's appeal (/staff/users, admins only). The reader writes to support; an admin logs
// it here and another admin decides it (the same one only when there's no other: appealDeciderProblem).
// Upholding lifts the suspension too, and that's logged as a lift. Each step answers with the reader's card.

type Actor = { id: string; role?: string | null; isStaff?: boolean | null };

const card = async (id: string, actor: Actor): Promise<StaffResult> => {
  const value = await staffUserById(id, actor);
  return value ? { ok: true, value } : fail(404, "No account with that id.");
};

// Body: { summary }.
export async function openAppeal(actor: Actor, userId: string, body: { summary?: unknown }, now = new Date()): Promise<StaffResult> {
  if (!isObjectId(userId)) return fail(404, "No account with that id.");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, suspendedAt: true, suspendedUntil: true } });
  if (!target) return fail(404, "No account with that id.");
  const waiting = await prisma.appeal.count({ where: { userId, status: "OPEN" } });
  const problem = appealOpenProblem({ suspended: isSuspended(target, now) }, waiting > 0, body.summary);
  if (problem) return fail(400, problem);
  const summary = (body.summary as string).trim().slice(0, APPEAL_SUMMARY_MAX);
  const appeal = await prisma.appeal.create({ data: { userId, openedById: actor.id, summary, status: "OPEN" } });
  await logStaffAction({ actorId: actor.id, action: "appeal.open", targetType: "appeal", targetId: appeal.id, after: { userId }, reason: summary.slice(0, 500) });
  return card(userId, actor);
}

// Body: { decision: "UPHELD" | "REJECTED", note }.
export async function decideAppeal(actor: Actor, userId: string, appealId: string, body: { decision?: unknown; note?: unknown }, now = new Date()): Promise<StaffResult> {
  if (!isObjectId(userId) || !isObjectId(appealId)) return fail(404, "No appeal with that id.");
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (!appeal || appeal.userId !== userId) return fail(404, "No appeal with that id.");
  const problem = appealDecisionProblem(actor, appeal, body);
  if (problem) return fail(appeal.status === "OPEN" ? 400 : 409, problem);
  const admins = appeal.openedById === actor.id ? await prisma.user.count({ where: roleFilterWhere("ADMIN")! }) : 0;
  const decider = appealDeciderProblem(actor, appeal, admins);
  if (decider) return fail(403, decider);
  const decision = body.decision as "UPHELD" | "REJECTED";
  const note = cleanReason(body.note);

  // Upholding lifts the suspension, with the same checks as a lift by hand (unsuspendUser). A suspension
  // that has run out still has its fields set; lifting clears them. One already lifted needs nothing.
  const target = decision === "UPHELD"
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isStaff: true, suspendedAt: true, suspendedUntil: true, suspensionReason: true } })
    : null;
  if (target?.suspendedAt && !canActOn(actor, target)) {
    return fail(403, actor.id === target.id ? "You can't do that to your own account." : "Admins can't be changed from the console.");
  }
  // The decision and the lift in one transaction. Only an open appeal moves, so of two admins deciding at
  // once the second finds nothing to move and lifts nothing; and a lift that fails takes the decision
  // with it. Either way the suspension is never lifted with the appeal left undecided.
  const lifted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.appeal.updateMany({
      where: { id: appealId, status: "OPEN" },
      data: { status: decision, decisionNote: note, decidedById: actor.id, decidedAt: now },
    });
    if (count === 0) return null;
    if (!target?.suspendedAt) return false;
    await tx.user.update({ where: { id: userId }, data: { suspendedAt: null, suspendedUntil: null, suspensionReason: null, suspendedById: null } });
    return true;
  });
  if (lifted === null) return fail(409, "That appeal has already been decided.");
  if (lifted && target) {
    await logStaffAction({
      actorId: actor.id, action: "user.unsuspend", targetType: "user", targetId: userId,
      before: { until: target.suspendedUntil?.toISOString() ?? "indefinite", reason: target.suspensionReason }, reason: `Appeal upheld: ${note}`,
    });
  }
  await logStaffAction({
    actorId: actor.id, action: "appeal.resolve", targetType: "appeal", targetId: appealId,
    before: { status: "OPEN" }, after: { status: decision, userId }, reason: note,
  });
  return card(userId, actor);
}
