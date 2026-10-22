// Proves the buddy-read spoiler lock: a comment's body (and its replies, labels and author) never
// reaches a reader who hasn't got to its position. Pure functions only, no database.
//
//   node scripts/check-buddy-read-spoilers.ts
//
// Exits non-zero on the first failure.
import {
  buildTimeline,
  commentPosition,
  progressPercent,
  serializeComments,
  type CommentAuthor,
  type CommentRow,
  type SerializedComment,
} from "../lib/buddyReads.ts";

let failures = 0
let passes = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passes++
    return
  }
  failures++
  console.error(`FAIL ${name}`, detail ?? "")
}

const authors = new Map<string, CommentAuthor>([
  ["ana", { username: "ana_secretname", image: "/a.png", favColour: "#112233" }],
  ["ben", { username: "ben_secretname", image: null, favColour: "#445566" }],
  ["cal", { username: "cal_secretname", image: null, favColour: null }],
])

let seq = 0
function row(userId: string, position: number, extra: Partial<CommentRow> = {}): CommentRow {
  seq++
  const id = `c${seq}`
  return {
    id,
    userId,
    position,
    pageLabel: `PAGE-LABEL-${id}-END`,
    chapterLabel: `CHAPTER-LABEL-${id}-END`,
    body: `SECRET-BODY-${id}-END`,
    parentId: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, seq)),
    editedAt: null,
    deletedAt: null,
    reactions: [],
    ...extra,
  }
}

const early = row("ana", 10, { reactions: [{ userId: "ben", emoji: "❤️" }, { userId: "cal", emoji: "❤️" }] })
const atBoundary = row("ben", 30)
const ahead = row("ana", 42, { reactions: [{ userId: "cal", emoji: "😮" }] })
const aheadReply = row("ben", 50, { parentId: ahead.id })
const aheadReply2 = row("cal", 60, { parentId: ahead.id })
const earlyReplyAhead = row("cal", 75, { parentId: early.id })
const earlyReplyVisible = row("ben", 12, { parentId: early.id })
const ownAhead = row("cal", 90)
const deletedWithReplies = row("ben", 5, { deletedAt: new Date(), body: "" })
const deletedReply = row("ana", 6, { parentId: deletedWithReplies.id })
const deletedAlone = row("ana", 7, { deletedAt: new Date() })
const fromRemovedMember = row("zed", 1, { body: "SECRET-BODY-removed" })
const end = row("ana", 100)

const rows = [end, ahead, aheadReply2, early, atBoundary, aheadReply, earlyReplyAhead, earlyReplyVisible, ownAhead, deletedWithReplies, deletedReply, deletedAlone, fromRemovedMember]

const STUB_KEYS = ["authorColour", "id", "locked", "position", "reactionCount", "replyCount"]

function flatten(list: SerializedComment[]): SerializedComment[] {
  return list.flatMap((c) => (c.locked ? [c] : [c, ...flatten(c.replies)]))
}

function checkViewer(userId: string, progress: number) {
  const viewer = { userId, progress }
  const out = serializeComments(rows, viewer, authors)
  // What actually goes over the wire.
  const json = JSON.stringify(out)
  const label = `${userId}@${progress}%`

  for (const r of rows) {
    const visible = r.userId === userId || r.position <= progress
    const leakable = [r.body, r.pageLabel, r.chapterLabel].filter((s): s is string => !!s)
    if (!visible) {
      for (const secret of leakable) check(`${label}: locked ${r.id} doesn't leak "${secret}"`, !json.includes(secret))
    }
  }

  for (const c of flatten(out)) {
    if (c.locked) {
      check(`${label}: stub ${c.id} has only the stub keys`, JSON.stringify(Object.keys(c).sort()) === JSON.stringify(STUB_KEYS), Object.keys(c))
      const source = rows.find((r) => r.id === c.id)!
      check(`${label}: stub ${c.id} really is ahead and not the viewer's`, source.position > progress && source.userId !== userId)
    } else {
      const source = rows.find((r) => r.id === c.id)!
      check(`${label}: unlocked ${c.id} is allowed`, source.userId === userId || source.position <= progress)
    }
  }

  // An author's name only appears for comments the viewer may read.
  for (const [id, a] of Array.from(authors)) {
    const readable = rows.some((r) => r.userId === id && !r.deletedAt && (r.userId === userId || r.position <= progress)
      && (!r.parentId || rows.find((p) => p.id === r.parentId)!.position <= progress || rows.find((p) => p.id === r.parentId)!.userId === userId))
    if (!readable) check(`${label}: no name for ${id}`, !json.includes(a.username!))
  }

  check(`${label}: comments from non-members are dropped`, !json.includes("SECRET-BODY-removed") && !json.includes(fromRemovedMember.id))
  check(`${label}: a deleted comment without replies is dropped`, !json.includes(`"${deletedAlone.id}"`))
  return out
}

// Behind everything, at the start, partway, exactly on a boundary, and at the end.
for (const userId of ["ana", "ben", "cal", "stranger"]) {
  for (const progress of [0, 9.9, 10, 29.9, 30, 41.9, 42, 55, 99.9, 100]) checkViewer(userId, progress)
}

// Spot checks on the shapes the UI relies on.
{
  const out = serializeComments(rows, { userId: "stranger", progress: 30 }, authors)
  const order = out.map((c) => c.position)
  check("top level is in reading order", order.every((p, i) => i === 0 || order[i - 1] <= p), order)

  const lockedAhead = out.find((c) => c.id === ahead.id)
  check("a locked parent counts its replies", lockedAhead?.locked === true && lockedAhead.replyCount === 2, lockedAhead)
  check("a locked stub counts reactions", lockedAhead?.locked === true && lockedAhead.reactionCount === 1)
  check("a locked stub has the author's colour", lockedAhead?.locked === true && lockedAhead.authorColour === "#112233")

  const openEarly = out.find((c) => c.id === early.id)
  check("an unlocked parent shows its visible reply and stubs the one ahead",
    openEarly?.locked === false
      && openEarly.replies.length === 2
      && openEarly.replies.some((r) => r.id === earlyReplyVisible.id && !r.locked)
      && openEarly.replies.some((r) => r.id === earlyReplyAhead.id && r.locked))
  check("reactions are summarised per emoji", openEarly?.locked === false && openEarly.reactions[0]?.count === 2)

  const deleted = out.find((c) => c.id === deletedWithReplies.id)
  check("a deleted comment with replies keeps its place but loses its body",
    deleted?.locked === false && deleted.deleted && deleted.body === null && deleted.pageLabel === null)

  const timeline = buildTimeline(out)
  const lockedRuns = timeline.filter((t) => t.kind === "locked")
  check("consecutive stubs collapse into one locked row", lockedRuns.length === 1 && lockedRuns[0].kind === "locked" && lockedRuns[0].count === 5 && lockedRuns[0].position === 42, lockedRuns)

  const own = serializeComments(rows, { userId: "cal", progress: 0 }, authors)
  check("authors always see their own comments", flatten(own).some((c) => c.id === ownAhead.id && !c.locked))
}

// Positions: default to the author's progress, can be lowered, never raised, and replies sit with their parent.
check("position defaults to progress", commentPosition(undefined, 37.5) === 37.5)
check("position can be lowered", commentPosition(12, 37.5) === 12)
check("position can't be raised past progress", commentPosition(80, 37.5) === 37.5)
check("a reply sits at least at its parent", commentPosition(5, 37.5, 20) === 20)
check("position is clamped", commentPosition(-4, 150) === 0 && commentPosition(undefined, 150) === 100)

// Progress: a percent of the member's own edition; finishing is 100.
check("progress is a percent", progressPercent({ status: "STARTED", currentPage: 50, pages: 200 }) === 25)
check("completed is 100", progressPercent({ status: "COMPLETED", currentPage: 3, pages: 200 }) === 100)
check("no page count is 0", progressPercent({ status: "STARTED", currentPage: 50, pages: 0 }) === 0)
check("a missing book is 0", progressPercent(null) === 0)
check("progress is clamped", progressPercent({ status: "STARTED", currentPage: 500, pages: 200 }) === 100)

// Audiobooks: minutes listened out of the running time, the same percent as pages, so a listener and
// a reader share one lock. A stale page count on an audiobook never counts.
const audio = { status: "STARTED", currentPage: 0, pages: 0, progressUnit: "MINUTES" as const, currentMinute: 304, audioMinutes: 724 }
check("minutes are a percent", progressPercent(audio) === 42)
check("a print page count on an audiobook is ignored", progressPercent({ ...audio, pages: 400, currentPage: 400 }) === 42)
check("no running time is 0", progressPercent({ ...audio, audioMinutes: 0 }) === 0 && progressPercent({ ...audio, audioMinutes: null }) === 0)
check("an audiobook not marked as minutes runs on pages", progressPercent({ ...audio, progressUnit: null, pages: 400, currentPage: 100 }) === 25)
check("a finished audiobook is 100", progressPercent({ ...audio, status: "COMPLETED", currentMinute: 1 }) === 100)
check("minutes are clamped", progressPercent({ ...audio, currentMinute: 9999 }) === 100)
check("minutes round to one decimal", progressPercent({ ...audio, currentMinute: 100 }) === 13.8)

// The lock, driven by minute-based progress: a listener at 42% (304 of 724 minutes) sees the 42%
// comment and nothing past it; one minute earlier and it's locked.
{
  const listener = serializeComments(rows, { userId: "stranger", progress: progressPercent(audio) }, authors)
  check("a listener at 42% has the 42% comment open", listener.some((c) => c.id === ahead.id && !c.locked))
  check("a listener at 42% has the 50% reply locked", flatten(listener).some((c) => c.id === aheadReply.id && c.locked))
  const almost = serializeComments(rows, { userId: "stranger", progress: progressPercent({ ...audio, currentMinute: 303 }) }, authors)
  check("one minute short of 42% keeps the 42% comment locked", almost.some((c) => c.id === ahead.id && c.locked))
  check("a locked body never reaches a listener", !JSON.stringify(almost).includes(`SECRET-BODY-${ahead.id}-END`))
  // Posting from an audiobook: the position defaults to the listener's percent and can't be raised.
  check("a listener's comment sits at their percent", commentPosition(undefined, progressPercent(audio)) === 42)
  check("a listener can't post ahead of their minutes", commentPosition(80, progressPercent(audio)) === 42)
  // The whole sweep again, at minute-derived progress on and around each boundary.
  for (const minutes of [0, 71, 72, 73, 217, 218, 303, 304, 398, 723, 724]) {
    for (const userId of ["ana", "ben", "cal", "stranger"]) checkViewer(userId, progressPercent({ ...audio, currentMinute: minutes }))
  }
}

if (failures > 0) {
  console.error(`\n${failures} failed, ${passes} passed`)
  process.exit(1)
}
console.log(`Spoiler lock OK: ${passes} checks passed`)
