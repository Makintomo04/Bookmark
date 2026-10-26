import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

// The audit trail for the staff tools: every change made through /api/staff writes one row, shown on
// /staff/log. Written after the change succeeds, in the same request.
export type StaffActionKind =
  | "user.suspend"
  | "user.unsuspend"
  | "plus.grant"
  | "plus.revoke"
  | "role.set"
  | "work.edit"
  | "edition.edit"
  | "report.dismiss"
  | "report.hide"
  | "report.resolve"
  | "report.escalate"

export type StaffTarget = "user" | "work" | "edition" | "list" | "comment" | "report"

export interface StaffActionInput {
  actorId: string
  action: StaffActionKind
  targetType: StaffTarget
  targetId: string
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  reason?: string | null
}

export async function logStaffAction(input: StaffActionInput) {
  await prisma.staffAction.create({
    data: { ...input, reason: input.reason?.trim() || null },
  })
}

export const STAFF_ACTION_LABELS: Record<StaffActionKind, string> = {
  "user.suspend": "Suspended",
  "user.unsuspend": "Lifted suspension",
  "plus.grant": "Granted Plus",
  "plus.revoke": "Removed free Plus",
  "role.set": "Changed role",
  "work.edit": "Edited book",
  "edition.edit": "Edited edition",
  "report.dismiss": "Dismissed report",
  "report.hide": "Took content down",
  "report.resolve": "Marked book report fixed",
  "report.escalate": "Escalated report",
}

const LOG_PAGE = 50

// The log page: newest first, with who did each thing. `before` pages back from an ISO date.
export async function staffLog(opts: { before?: string | null; targetId?: string | null } = {}) {
  const before = opts.before ? new Date(opts.before) : null
  const rows = await prisma.staffAction.findMany({
    where: {
      ...(before && !Number.isNaN(before.getTime()) && { createdAt: { lt: before } }),
      ...(opts.targetId && { targetId: opts.targetId }),
    },
    orderBy: { createdAt: "desc" },
    take: LOG_PAGE,
  })
  const ids = Array.from(new Set(rows.flatMap((r) => [r.actorId, ...(r.targetType === "user" ? [r.targetId] : [])])))
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
  const username = new Map(users.map((u) => [u.id, u.username]))
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    label: STAFF_ACTION_LABELS[r.action as StaffActionKind] ?? r.action,
    actor: username.get(r.actorId) ?? r.actorId,
    targetType: r.targetType,
    targetId: r.targetId,
    targetName: r.targetType === "user" ? username.get(r.targetId) ?? null : null,
    before: r.before,
    after: r.after,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }))
}
export type StaffLogEntry = Awaited<ReturnType<typeof staffLog>>[number]
