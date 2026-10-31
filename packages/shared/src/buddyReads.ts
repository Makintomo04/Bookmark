// Reading circles: the rules shared by the API and the client, and the spoiler lock itself.
// No database or "@/" imports here, so scripts/check-buddy-read-spoilers.ts can run it under plain Node.
import { z } from "zod";
import { roundPercent } from "./progress";
import type { StaffBadgeKind } from "./staffBadge";

export const BUDDY_READ_MAX_MEMBERS = 15
export const COMMENT_MAX = 2000
export const LABEL_MAX = 40
export const SCHEDULE_MAX = 30
// "Where everyone is" in a big club's book (BOO-79): past a few more than TRACK_SHOWN readers, the track
// shows you, the book's host and the club's host, then whoever's nearest you in the book, and "Show
// everyone" for the rest. Kept in joining order.
export const TRACK_SHOWN = 12
export type TrackMember = { userId: string, isYou: boolean, isHost: boolean, clubRole?: string | null, progress: number }
export function trackRows<T extends TrackMember>(members: T[], max: number = TRACK_SHOWN) {
  if (members.length <= max + 3) return { shown: members, hidden: 0 }
  const at = members.find((m) => m.isYou)?.progress ?? 0
  const pinned = members.filter((m) => m.isYou || m.isHost || m.clubRole === "host")
  const nearest = members.filter((m) => !pinned.includes(m)).sort((a, b) => Math.abs(a.progress - at) - Math.abs(b.progress - at))
  const keep = new Set([...pinned, ...nearest.slice(0, Math.max(0, max - pinned.length))])
  const shown = members.filter((m) => keep.has(m))
  return { shown, hidden: members.length - shown.length }
}

// How often an open reading circle page polls. There's no realtime service; this keeps running costs near zero.
export const BUDDY_READ_REFRESH_MS = 20_000

// One tap each. A small fixed set keeps reactions calm and the unique index small.
export const BUDDY_READ_EMOJI = ["❤️", "😂", "😮", "😢", "😡", "🔥"] as const
export type BuddyReadEmoji = typeof BUDDY_READ_EMOJI[number]

export const COMMENT_REPORT_REASONS = ["Spoiler posted too early", "Hateful or harassing", "Spam or advertising", "Something else"] as const

// ---- Progress -----------------------------------------------------------------------------

// Pages or minutes listened: the maths lives in lib/progress.ts so every surface agrees. Re-exported
// here because the circle code and scripts/check-buddy-read-spoilers.ts have always taken it from here.
export { progressPercent, roundPercent, type ProgressBook } from "./progress"

// ---- Hosting ------------------------------------------------------------------------------

// Joining is never limited. Hosting is: a free account runs one active circle at a time, and Bookmark
// Plus lifts the limit (lib/entitlements.ts canHostUnlimited). Everything that asks "may they host
// another?" goes through canHostAnotherCircle() in lib/buddyReadsServer.ts, which looks the plan up,
// counts, and then calls this.
export type HostingPlan = "free" | "plus"
// The free limit is promised publicly never to go down; raise it, never lower it.
export const ACTIVE_HOSTED_LIMIT: Record<HostingPlan, number> = { free: 1, plus: Infinity }

export type HostingAllowance = {
  allowed: boolean
  active: number
  // null when unlimited.
  limit: number | null
  plan: HostingPlan
  // The refusal is one Plus would lift, so the UI shows the upgrade prompt beside the message.
  upgrade: boolean
  message: string | null
}

const NUMBER_WORDS: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five" }

export function hostingAllowance(activeHosted: number, plan: HostingPlan = "free"): HostingAllowance {
  const limit = ACTIVE_HOSTED_LIMIT[plan]
  const allowed = activeHosted < limit
  return {
    allowed,
    active: activeHosted,
    limit: Number.isFinite(limit) ? limit : null,
    plan,
    upgrade: !allowed && plan === "free",
    message: allowed ? null
      : limit === 1
        ? "You're already hosting an active circle. Mark it as finished or archive it to start another. Joining circles is never limited."
        : `You're already hosting ${NUMBER_WORDS[limit] ?? limit} active circles. Mark one as finished or archive it to start another. Joining circles is never limited.`,
  }
}

// A circle handed on to a reader (its host left or closed their account) doesn't count against the one
// they may start themselves: they didn't choose it. Inherited circles have their own cap instead, so a
// second account can't be used to pass circles to a main one past the limit. Plus lifts it too.
export const INHERITED_HOSTING_LIMIT: Record<HostingPlan, number> = { free: 5, plus: Infinity }

export function inheritedAllowance(activeInherited: number, plan: HostingPlan = "free"): HostingAllowance {
  const limit = INHERITED_HOSTING_LIMIT[plan]
  const allowed = activeInherited < limit
  return {
    allowed,
    active: activeInherited,
    limit: Number.isFinite(limit) ? limit : null,
    plan,
    upgrade: !allowed && plan === "free",
    message: allowed ? null
      : `You're already looking after ${NUMBER_WORDS[limit] ?? limit} active circles handed on to you. Mark one as finished or archive it to reopen this one.`,
  }
}

// ---- Input --------------------------------------------------------------------------------

const label = z.string().trim().max(LABEL_MAX).optional().nullable().transform((s) => s || null)
const percent = z.number().finite().min(0).max(100)

export const scheduleSchema = z.array(z.object({
  label: z.string().trim().min(1, "Give each part of the schedule a name").max(LABEL_MAX),
  until: percent.optional().nullable(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01").optional().nullable(),
})).max(SCHEDULE_MAX)
export type BuddyReadSchedule = z.infer<typeof scheduleSchema>

export const createBuddyReadSchema = z.object({
  bookId: z.string().min(1, "Choose a book"),
  startsAt: z.string().datetime({ offset: true }).optional(),
  schedule: scheduleSchema.optional(),
})

export const updateBuddyReadSchema = z.object({
  startsAt: z.string().datetime({ offset: true }).optional(),
  schedule: scheduleSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "FINISHED", "ARCHIVED"]).optional(),
})

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(COMMENT_MAX, `Comments can be up to ${COMMENT_MAX} characters`),
  // Defaults to the author's progress; they can only lower it ("this is about chapter 3").
  position: percent.optional(),
  pageLabel: label,
  chapterLabel: label,
  parentId: z.string().min(1).optional(),
})

export const editCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(COMMENT_MAX, `Comments can be up to ${COMMENT_MAX} characters`).optional(),
  position: percent.optional(),
})

export const reactionSchema = z.object({ emoji: z.enum(BUDDY_READ_EMOJI) })
export const reportSchema = z.object({ reason: z.enum(COMMENT_REPORT_REASONS) })

// A comment can't sit ahead of where its author is: that would let them unlock it for others
// before reading it themselves. A reply sits at least where its parent does, so it unlocks with it.
export function commentPosition(requested: number | undefined, authorProgress: number, parentPosition?: number) {
  const ceiling = authorProgress
  const floor = parentPosition ?? 0
  const wanted = requested === undefined ? ceiling : Math.min(requested, ceiling)
  return roundPercent(Math.max(floor, wanted))
}

// Short, unambiguous, URL-safe. Uniqueness is enforced by the database index.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
export function makeInviteCode(random: (n: number) => Uint8Array, length = 10) {
  return Array.from(random(length), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")
}

// ---- The spoiler lock ---------------------------------------------------------------------

export type CommentRow = {
  id: string
  userId: string
  position: number
  pageLabel: string | null
  chapterLabel: string | null
  body: string
  parentId: string | null
  createdAt: Date | string
  editedAt: Date | string | null
  deletedAt: Date | string | null
  reactions: { userId: string, emoji: string }[]
}

export type CommentAuthor = { username: string | null, displayName?: string | null, image: string | null, favColour: string | null, staffBadge?: StaffBadgeKind | null }

export type Viewer = { userId: string, progress: number }

export type ReactionSummary = { emoji: string, count: number, mine: boolean }

// Everything a reader below the comment's position gets: where it is, whose colour, how much is there.
// No body, no labels (a chapter title can spoil), no author name, and nothing from its replies.
export type LockedComment = {
  id: string
  position: number
  authorColour: string
  reactionCount: number
  replyCount: number
  locked: true
}

export type UnlockedComment = {
  id: string
  locked: false
  position: number
  pageLabel: string | null
  chapterLabel: string | null
  // Null once deleted; the row stays while it has replies.
  body: string | null
  deleted: boolean
  mine: boolean
  // Null once deleted: a removed comment keeps its place, not its author. Also null for a former member.
  authorId: string | null
  author: CommentAuthor | null
  // The writer closed their account. Their words stay; their name doesn't.
  formerMember: boolean
  createdAt: string
  editedAt: string | null
  reactions: ReactionSummary[]
  replies: SerializedComment[]
}

export type SerializedComment = LockedComment | UnlockedComment

const DEFAULT_COLOUR = "#D92D2D"
const iso = (d: Date | string | null) => (d === null ? null : typeof d === "string" ? d : d.toISOString())

// Where a member stands in a circle: the furthest they've got while in it, not just where their copy is
// now. Starting a re-read, or taking the book off the shelf, then doesn't lock what they've already read.
// `furthest` is the membership's notifiedProgress, which only ever goes up.
export function circleProgress(bookPercent: number, furthest: number | null | undefined) {
  return roundPercent(Math.max(bookPercent, furthest ?? 0))
}

// The one rule: you see a comment's body if you wrote it or you've read that far.
export function canSeeComment(comment: Pick<CommentRow, "userId" | "position">, viewer: Viewer) {
  return comment.userId === viewer.userId || comment.position <= viewer.progress
}

// ---- Who hears about a comment -------------------------------------------------------------
//
// Every (member, comment) pair is told about once, by one of two paths, and never before the member's
// progress reaches it. Both split on the member's notifiedProgress, the raw stored value:
//   - posting: members already at or past the comment hear now (newCommentRecipients);
//   - reading on: members below it hear when their progress passes it (unlockedByProgress).
// notifiedProgress never exceeds circleProgress, so anyone told can open the comment.

// Did moving from `prev` to `next` reach a comment at `position`? The "comments unlocked" range.
export function unlockedByProgress(position: number, prev: number, next: number) {
  return position > prev && position <= next
}

export type CommentRecipientCandidate = { userId: string, notifiedProgress: number, mutedAt?: Date | string | null }

// The members to tell about a comment just posted: not its writer, not blocked either way, not muting
// the circle, and already at or past its position. The rest hear through unlockedByProgress later.
export function newCommentRecipients(
  comment: { userId: string, position: number },
  members: CommentRecipientCandidate[],
  blocked: Set<string>,
): string[] {
  return members
    .filter((m) => m.userId !== comment.userId && !blocked.has(m.userId) && !m.mutedAt && m.notifiedProgress >= comment.position)
    .map((m) => m.userId)
}

function summariseReactions(reactions: CommentRow["reactions"], viewerId: string): ReactionSummary[] {
  const byEmoji = new Map<string, ReactionSummary>()
  for (const r of reactions) {
    const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
    entry.count++
    if (r.userId === viewerId) entry.mine = true
    byEmoji.set(r.emoji, entry)
  }
  // The picker's order, so chips don't jump around between polls.
  return BUDDY_READ_EMOJI.map((e) => byEmoji.get(e)).filter((r): r is ReactionSummary => !!r)
}

// Who wrote what, as this viewer may see it: an author's details, or null for a former member (the account
// was closed). A writer missing from the map (blocked either way) drops out with everything they wrote.
export type CommentAuthors = Map<string, CommentAuthor | null>

function lockedStub(row: CommentRow, replyCount: number, authors: CommentAuthors): LockedComment {
  // Built field by field (never spread from the row) so a new column can't leak into a stub.
  return {
    id: row.id,
    position: row.position,
    authorColour: authors.get(row.userId)?.favColour || DEFAULT_COLOUR,
    reactionCount: row.reactions.length,
    replyCount,
    locked: true,
  }
}

// Turns comment rows into what this viewer may see, in reading order (position, then time), with
// replies nested under their parent. Rows from authors not in `authors` (blocked) are dropped.
export function serializeComments(rows: CommentRow[], viewer: Viewer, authors: CommentAuthors): SerializedComment[] {
  const visibleRows = rows.filter((r) => authors.has(r.userId))
  const repliesByParent = new Map<string, CommentRow[]>()
  for (const r of visibleRows) {
    if (!r.parentId) continue
    const list = repliesByParent.get(r.parentId) ?? []
    list.push(r)
    repliesByParent.set(r.parentId, list)
  }
  const liveReplies = (id: string) => (repliesByParent.get(id) ?? []).filter((r) => !r.deletedAt)

  const byReadingOrder = (a: CommentRow, b: CommentRow) =>
    a.position - b.position || String(iso(a.createdAt)).localeCompare(String(iso(b.createdAt)))

  const serialize = (row: CommentRow, isReply: boolean): SerializedComment | null => {
    const replies = isReply ? [] : liveReplies(row.id)
    if (row.deletedAt && replies.length === 0) return null
    if (!canSeeComment(row, viewer)) return lockedStub(row, replies.length, authors)
    const deleted = !!row.deletedAt
    const author = deleted ? null : authors.get(row.userId) ?? null
    return {
      id: row.id,
      locked: false,
      position: row.position,
      pageLabel: deleted ? null : row.pageLabel,
      chapterLabel: deleted ? null : row.chapterLabel,
      body: deleted ? null : row.body,
      deleted,
      mine: row.userId === viewer.userId,
      authorId: author ? row.userId : null,
      author,
      formerMember: !deleted && !author,
      createdAt: iso(row.createdAt)!,
      editedAt: iso(row.editedAt),
      reactions: deleted ? [] : summariseReactions(row.reactions, viewer.userId),
      replies: replies.sort(byReadingOrder).map((r) => serialize(r, true)).filter((c): c is SerializedComment => !!c),
    }
  }

  const topLevel = visibleRows.filter((r) => !r.parentId).sort(byReadingOrder)
  return topLevel.map((r) => serialize(r, false)).filter((c): c is SerializedComment => !!c)
}

// ---- Timeline -----------------------------------------------------------------------------

export type TimelineEntry =
  | { kind: "comment", comment: UnlockedComment }
  | { kind: "locked", position: number, count: number, colours: string[], ids: string[] }

// Consecutive locked stubs collapse into one "🔒 3 comments ahead at 42%" row (at the first one's position).
export function buildTimeline(comments: SerializedComment[]): TimelineEntry[] {
  const out: TimelineEntry[] = []
  for (const c of comments) {
    const last = out[out.length - 1]
    if (c.locked) {
      if (last?.kind === "locked") {
        last.count += 1 + c.replyCount
        last.ids.push(c.id)
        if (!last.colours.includes(c.authorColour)) last.colours.push(c.authorColour)
      } else {
        out.push({ kind: "locked", position: c.position, count: 1 + c.replyCount, colours: [c.authorColour], ids: [c.id] })
      }
    } else {
      out.push({ kind: "comment", comment: c })
    }
  }
  return out
}

export const formatPercent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`
