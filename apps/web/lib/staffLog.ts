import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { bookHref } from "@/lib/workKey";
import { fieldChanges } from "@/lib/catalogueFixRules";

// The audit trail for the staff tools: every change made through /api/staff writes one row, shown on
// /staff/log. Written after the change succeeds, in the same request.
export type StaffActionKind =
  | "user.suspend"
  | "user.unsuspend"
  | "plus.grant"
  | "plus.revoke"
  | "role.set"
  | "work.edit"
  | "work.add"
  | "work.create"
  | "work.page_approve"
  | "work.page_withdraw"
  | "edition.edit"
  | "report.dismiss"
  | "report.hide"
  | "report.hide_rating"
  | "report.resolve"
  | "list.choose"
  | "list.unchoose"
  | "report.escalate"
  | "report.unhide"
  | "work.revert"
  | "edition.revert"
  | "list.hide"
  | "list.unhide"
  | "list.pick"
  | "list.unpick"
  | "list.spotlight"
  | "list.unspotlight"
  | "list.delete"
  | "report.reopen"
  | "work.merge"
  | "work.unmerge"
  | "edition.move"
  | "author.rename"
  | "author.merge"
  | "series.edit"
  | "user.note"
  | "appeal.open"
  | "appeal.resolve"
  | "edition.unmove"
  | "author.revert"
  | "series.revert"
  | "list.edit"

export type StaffTarget = "user" | "work" | "edition" | "list" | "comment" | "review" | "report" | "author" | "series" | "appeal"

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
  "work.add": "Added book from Open Library",
  "work.create": "Added a book by hand",
  "work.page_approve": "Gave a hand-typed book a page",
  "work.page_withdraw": "Took a hand-typed book's page down",
  "edition.edit": "Edited edition",
  "report.dismiss": "Dismissed report",
  "report.hide": "Took content down",
  "report.hide_rating": "Hid a review and its rating",
  "report.resolve": "Marked book report fixed",
  "list.choose": "Made a list an editors' choice",
  "list.unchoose": "Removed a list from editors' choice",
  "report.escalate": "Escalated report",
  "report.unhide": "Put a review back up",
  "work.revert": "Reverted a book edit",
  "edition.revert": "Reverted an edition edit",
  "list.hide": "Hid a list",
  "list.unhide": "Unhid a list",
  "list.pick": "Made a list a Bookmark Pick",
  "list.unpick": "Removed a list from Bookmark Picks",
  "list.spotlight": "Put a list in the spotlight",
  "list.unspotlight": "Took a list out of the spotlight",
  "list.delete": "Deleted someone's list",
  "report.reopen": "Reopened reports",
  "work.merge": "Merged duplicate books",
  "work.unmerge": "Undid a merge",
  "edition.move": "Moved an edition to another book",
  "author.rename": "Renamed an author",
  "author.merge": "Merged authors",
  "series.edit": "Edited a series",
  "user.note": "Added a note on an account",
  "appeal.open": "Logged an appeal",
  "appeal.resolve": "Decided an appeal",
  "edition.unmove": "Moved an edition back",
  "author.revert": "Undid an author change",
  "series.revert": "Undid a series edit",
  "list.edit": "Edited someone's list",
}

export const isStaffActionKind = (value: unknown): value is StaffActionKind => typeof value === "string" && value in STAFF_ACTION_LABELS

const LOG_PAGE = 50
const DAY = 24 * 60 * 60 * 1000
const isId = (id: string) => /^[a-f0-9]{24}$/i.test(id)

// Who's reading. `everything` is "staff.log" (admins). With only "log.own" (librarians) the log is their
// own actions, or the history of one book or edition, and never anything done to an account. Enforced
// here, so no route can widen it.
export interface LogViewer {
  id: string
  everything: boolean
}

// From the log page's URL: `before` pages back from an ISO date; `from` and `to` are days (2026-10-01),
// both included; `actor` a username; `action` a StaffActionKind; `targetId` an account, book or edition id.
export interface LogFilters {
  before?: string | null
  targetId?: string | null
  actor?: string | null
  action?: string | null
  from?: string | null
  to?: string | null
}

const dayOf = (value: string | null | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

// The log page: newest first, with who did each thing and what to.
export async function staffLog(viewer: LogViewer, opts: LogFilters = {}) {
  const and: Prisma.StaffActionWhereInput[] = []
  const before = opts.before ? new Date(opts.before) : null
  if (before && !Number.isNaN(before.getTime())) and.push({ createdAt: { lt: before } })
  const from = dayOf(opts.from)
  if (from) and.push({ createdAt: { gte: from } })
  const to = dayOf(opts.to)
  if (to) and.push({ createdAt: { lt: new Date(to.getTime() + DAY) } })
  if (opts.action) {
    if (!isStaffActionKind(opts.action)) return []
    and.push({ action: opts.action })
  }
  if (opts.actor?.trim()) {
    const actor = await prisma.user.findFirst({ where: { username: opts.actor.trim().replace(/^@/, "").toLowerCase() }, select: { id: true } })
    if (!actor) return []
    and.push({ actorId: actor.id })
  }
  if (opts.targetId) {
    // A book's history takes in its editions'.
    const editions = isId(opts.targetId) ? await prisma.edition.findMany({ where: { workId: opts.targetId }, select: { id: true } }) : []
    and.push({ targetId: { in: [opts.targetId, ...editions.map((e) => e.id)] } })
    if (!viewer.everything) and.push({ targetType: { in: ["work", "edition"] } })
  } else if (!viewer.everything) {
    and.push({ actorId: viewer.id }, { targetType: { not: "user" } })
  }
  const rows = await prisma.staffAction.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: { createdAt: "desc" },
    take: LOG_PAGE,
  })
  const ids = Array.from(new Set(rows.flatMap((r) => [r.actorId, ...(r.targetType === "user" ? [r.targetId] : [])])))
  const users = await prisma.user.findMany({ where: { id: { in: ids.filter(isId) } }, select: { id: true, username: true } })
  const username = new Map(users.map((u) => [u.id, u.username]))
  const targets = await describeTargets(rows)
  return rows.map((r) => {
    const target = r.targetType === "user"
      ? { name: username.has(r.targetId) ? `@${username.get(r.targetId)}` : null, path: `/staff/users?q=${r.targetId}` }
      : targets.get(`${r.targetType}:${r.targetId}`) ?? null
    return {
      id: r.id,
      action: r.action,
      label: STAFF_ACTION_LABELS[r.action as StaffActionKind] ?? r.action,
      actor: username.get(r.actorId) ?? r.actorId,
      targetType: r.targetType,
      targetId: r.targetId,
      targetName: target?.name ?? null,
      targetPath: target?.path ?? null,
      before: r.before,
      after: r.after,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
export type StaffLogEntry = Awaited<ReturnType<typeof staffLog>>[number]

type Described = { name: string | null; path: string | null }

const editionName = (e: { format: string | null; publishedYear: number | null; isbn13: string | null; isbn10: string | null }) =>
  [e.format?.toLowerCase(), e.publishedYear, e.isbn13 ?? e.isbn10].filter(Boolean).join(", ")

// Names and links for a page of log rows, loaded a type at a time: book titles for works and editions,
// list titles, the book a review is of and the circle a comment is in.
async function describeTargets(rows: { targetType: string; targetId: string }[]) {
  const idsOf = (type: string) => Array.from(new Set(rows.filter((r) => r.targetType === type && isId(r.targetId)).map((r) => r.targetId)))
  const [editions, lists, copies, comments] = await Promise.all([
    prisma.edition.findMany({ where: { id: { in: idsOf("edition") } }, select: { id: true, workId: true, format: true, publishedYear: true, isbn13: true, isbn10: true } }),
    prisma.list.findMany({ where: { id: { in: idsOf("list") } }, select: { id: true, title: true } }),
    prisma.book.findMany({ where: { id: { in: idsOf("review") } }, select: { id: true, title: true, workKey: true, workId: true } }),
    prisma.buddyReadComment.findMany({ where: { id: { in: idsOf("comment") } }, select: { id: true, buddyReadId: true } }),
  ])
  const [works, circles] = await Promise.all([
    prisma.work.findMany({ where: { id: { in: Array.from(new Set([...idsOf("work"), ...editions.map((e) => e.workId)])) } }, select: { id: true, title: true } }),
    prisma.buddyRead.findMany({ where: { id: { in: Array.from(new Set(comments.map((c) => c.buddyReadId))) } }, select: { id: true, title: true } }),
  ])
  const titleOf = new Map(works.map((w) => [w.id, w.title]))
  const circleOf = new Map(circles.map((c) => [c.id, c.title]))
  const out = new Map<string, Described>()
  for (const id of idsOf("work")) out.set(`work:${id}`, { name: titleOf.get(id) ?? null, path: `/staff/catalogue?work=${id}` })
  for (const e of editions) {
    const title = titleOf.get(e.workId)
    const which = editionName(e)
    out.set(`edition:${e.id}`, { name: title ? `${title} (${which || "an edition"})` : null, path: `/staff/catalogue?work=${e.workId}` })
  }
  const listTitle = new Map(lists.map((l) => [l.id, l.title]))
  for (const id of idsOf("list")) out.set(`list:${id}`, { name: listTitle.get(id) ?? null, path: `/lists/${id}` })
  for (const b of copies) {
    const href = bookHref({ workKey: b.workKey, pageWorkId: b.workId, title: b.title })
    out.set(`review:${b.id}`, { name: `review of ${b.title}`, path: href ? `${href}#reviews-heading` : null })
  }
  for (const c of comments) {
    const circle = circleOf.get(c.buddyReadId)
    out.set(`comment:${c.id}`, { name: circle ? `comment in ${circle}` : null, path: `/circles/${c.buddyReadId}` })
  }
  // Authors and series have no rows of their own: a series is logged by its name, an author by their slug.
  for (const r of rows) {
    const author = r.targetId.replace(/-/g, " ")
    if (r.targetType === "author") out.set(`author:${r.targetId}`, { name: author, path: `/staff/catalogue/authors?q=${encodeURIComponent(author)}` })
    if (r.targetType === "series") out.set(`series:${r.targetId}`, { name: r.targetId, path: `/staff/catalogue/series?q=${encodeURIComponent(r.targetId)}` })
  }
  return out
}

const HISTORY_ACTIONS: StaffActionKind[] = ["work.edit", "work.revert", "edition.edit", "edition.revert"]
const HISTORY_PAGE = 30

const revertsOf = (after: Prisma.JsonValue) => {
  const id = (after as { reverts?: unknown } | null)?.reverts
  return typeof id === "string" ? id : null
}

// The work editor's history: recent edits and reverts to the book and its editions, field by field, and
// whether each has been reverted already.
export async function bookHistory(workId: string) {
  if (!isId(workId)) return []
  const editions = await prisma.edition.findMany({ where: { workId }, select: { id: true, format: true, publishedYear: true, isbn13: true, isbn10: true } })
  const rows = await prisma.staffAction.findMany({
    where: {
      action: { in: HISTORY_ACTIONS },
      OR: [{ targetType: "work", targetId: workId }, { targetType: "edition", targetId: { in: editions.map((e) => e.id) } }],
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_PAGE,
  })
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.actorId))) } }, select: { id: true, username: true } })
  const username = new Map(users.map((u) => [u.id, u.username]))
  const editionOf = new Map(editions.map((e) => [e.id, e]))
  // An older edit's revert is newer, so it's on this page whenever the edit is.
  const reverted = new Set(rows.map((r) => revertsOf(r.after)).filter((id): id is string => !!id))
  return rows.map((r) => {
    const edition = r.targetType === "edition" ? editionOf.get(r.targetId) : null
    return {
      id: r.id,
      action: r.action,
      label: STAFF_ACTION_LABELS[r.action as StaffActionKind] ?? r.action,
      actor: username.get(r.actorId) ?? r.actorId,
      targetType: r.targetType as "work" | "edition",
      targetId: r.targetId,
      edition: edition ? editionName(edition) || "an edition" : null,
      changes: fieldChanges(r.before, r.after),
      reason: r.reason,
      reverts: revertsOf(r.after),
      reverted: reverted.has(r.id),
      createdAt: r.createdAt.toISOString(),
    }
  })
}
export type BookHistoryEntry = Awaited<ReturnType<typeof bookHistory>>[number]
