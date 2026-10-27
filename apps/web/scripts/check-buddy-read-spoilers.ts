// Proves the reading circle spoiler lock: a comment's body (and its replies, labels and author) never
// reaches a reader who hasn't got to its position. Pure functions only, no database.
//
//   node scripts/check-buddy-read-spoilers.ts
//
// Exits non-zero on the first failure.
import {
  buildTimeline,
  circleProgress,
  commentPosition,
  newCommentRecipients,
  progressPercent,
  serializeComments,
  unlockedByProgress,
  type CommentAuthor,
  type CommentAuthors,
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
// A writer the viewer blocked (or who blocked them) is missing from the authors map.
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

  check(`${label}: comments from blocked writers are dropped`, !json.includes("SECRET-BODY-removed") && !json.includes(fromRemovedMember.id))
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

// Closed accounts: their comments stay, without a name, and replies to them still show.
{
  const withFormer: CommentAuthors = new Map(authors)
  withFormer.set("gone", null)
  const former = row("gone", 20, { body: "FORMER-BODY" })
  const replyToFormer = row("ana", 25, { parentId: former.id })
  const formerAhead = row("gone", 80, { body: "FORMER-AHEAD-BODY" })
  const out = serializeComments([former, replyToFormer, formerAhead], { userId: "ben", progress: 30 }, withFormer)
  const shown = out.find((c) => c.id === former.id)
  check("a former member's comment stays", !!shown && !shown.locked && shown.body === "FORMER-BODY")
  check("a former member's comment is marked as such", !!shown && !shown.locked && shown.formerMember && shown.author === null && shown.authorId === null)
  check("replies to a former member still show", !!shown && !shown.locked && shown.replies.some((r) => r.id === replyToFormer.id && !r.locked))
  check("a former member's comment ahead stays locked", out.some((c) => c.id === formerAhead.id && c.locked) && !JSON.stringify(out).includes("FORMER-AHEAD-BODY"))
  const live = serializeComments([atBoundary], { userId: "ana", progress: 30 }, authors)[0]
  check("a current member's comment isn't marked former", !!live && !live.locked && !live.formerMember)
}

// A member's place in a circle is the furthest they've reached there: a re-read or a removed book doesn't re-lock.
{
  check("a re-read back at 0% keeps the furthest point", circleProgress(0, 80) === 80)
  check("a book off the shelf keeps the furthest point", circleProgress(progressPercent(null), 64.2) === 64.2)
  check("reading on past the furthest point counts", circleProgress(90, 80) === 90)
  check("a fresh member starts where their copy is", circleProgress(12.5, 0) === 12.5)
  check("an unset furthest point is 0", circleProgress(30, undefined) === 30)
  const rereader = serializeComments(rows, { userId: "stranger", progress: circleProgress(0, 50) }, authors)
  check("a re-reader still sees the 42% comment they'd reached", rereader.some((c) => c.id === ahead.id && !c.locked))
  check("a re-reader still can't see past their furthest point", flatten(rereader).some((c) => c.id === aheadReply2.id && c.locked))
}

// Kindle readers log a percent, often on a book with no page count (BOO-44). The lock is the same: their
// typed percent is their progress, and nothing past it opens.
{
  const kindle = (currentPercent: number | null) => ({ status: "STARTED", currentPage: 0, pages: 0, currentPercent })
  check("a percent-only book is at its typed percent", progressPercent(kindle(40)) === 40)
  check("a percent-only book with no percent yet is 0", progressPercent(kindle(null)) === 0)
  check("a typed percent wins over a rounded page", progressPercent({ status: "STARTED", currentPage: 19, pages: 50, currentPercent: 37 }) === 37)
  check("a finished percent-only book is 100", progressPercent({ ...kindle(40), status: "COMPLETED" }) === 100)

  const at40 = row("ana", 40)
  const at41 = row("ben", 41)
  const out = serializeComments([at40, at41], { userId: "stranger", progress: progressPercent(kindle(40)) }, authors)
  check("a percent-only reader at 40% sees the 40% comment", out.some((c) => c.id === at40.id && !c.locked))
  check("a percent-only reader at 40% has the 41% comment locked", out.some((c) => c.id === at41.id && c.locked))
  check("a locked body never reaches a percent-only reader", !JSON.stringify(out).includes(`SECRET-BODY-${at41.id}-END`))
  check("a percent-only reader's comment sits at their percent", commentPosition(undefined, progressPercent(kindle(40))) === 40)
  check("a percent-only reader can't post ahead of their percent", commentPosition(80, progressPercent(kindle(40))) === 40)

  // Starting again clears the percent (the book is back at 0), but the circle keeps the furthest point.
  check("a re-read with the percent cleared keeps the furthest point", circleProgress(progressPercent(kindle(null)), 40) === 40)
  const rereader = serializeComments([at40, at41], { userId: "stranger", progress: circleProgress(progressPercent(kindle(null)), 40) }, authors)
  check("a percent-only re-reader still sees what they'd reached and no further",
    rereader.some((c) => c.id === at40.id && !c.locked) && rereader.some((c) => c.id === at41.id && c.locked))

  // The whole sweep again, at typed percents on and around each boundary.
  for (const percent of [0, 9.9, 10, 29.9, 30, 41.9, 42, 99.9, 100]) {
    for (const userId of ["ana", "ben", "cal", "stranger"]) checkViewer(userId, progressPercent(kindle(percent)))
  }
}

// BOO-43: who hears about a comment. Posting tells members already past it (newCommentRecipients); reading on
// tells the rest as they pass it (unlockedByProgress). Never before they can read it, and never twice.
{
  const canRead = (notified: number, position: number) => circleProgress(0, notified) >= position
  const members = [
    { userId: "ana", notifiedProgress: 90 },
    { userId: "ben", notifiedProgress: 50 },
    { userId: "cal", notifiedProgress: 10 },
    { userId: "dot", notifiedProgress: 60, mutedAt: new Date() },
    { userId: "eve", notifiedProgress: 70 },
  ]
  const told = newCommentRecipients({ userId: "ana", position: 40 }, members, new Set(["eve"]))
  check("a member already past a new comment hears now", told.includes("ben"))
  check("a member short of a new comment doesn't hear now", !told.includes("cal"))
  check("the writer isn't told about their own comment", !told.includes("ana"))
  check("a muted member isn't told", !told.includes("dot"))
  check("a blocked member isn't told", !told.includes("eve"))
  check("a member who'd only rounded up to it waits", !newCommentRecipients({ userId: "ana", position: 25 }, [{ userId: "ben", notifiedProgress: 24.96 }], new Set()).includes("ben"))
  check("...and hears when they read on to it", unlockedByProgress(25, 24.96, 25))
  check("a member exactly at it hears now", newCommentRecipients({ userId: "ana", position: 25 }, [{ userId: "ben", notifiedProgress: 25 }], new Set()).includes("ben"))
  check("...and isn't told again as they read on", !unlockedByProgress(25, 25, 80))

  // Fuzz: comments posted while members read on. Every (member, comment) pair is claimed once, by one path,
  // and only when the member can already read it.
  let state = 0x2f6b9e1
  const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const roundTo = (n: number) => Math.round(n * 100) / 100
  for (let run = 0; run < 300; run++) {
    const readers = ["m0", "m1", "m2", "m3"].map((userId) => ({ userId, notifiedProgress: roundTo(random() * 30) }))
    const comments: { id: number, userId: string, position: number }[] = []
    const claims = new Map<string, number>()
    const claim = (userId: string, id: number, notified: number, position: number, how: string) => {
      const key = `${userId}:${id}`
      claims.set(key, (claims.get(key) ?? 0) + 1)
      if (!canRead(notified, position)) check(`fuzz ${run}: ${how} told ${userId} before they reached ${position}`, false, { notified })
    }
    for (let step = 0; step < 40; step++) {
      if (random() < 0.5) {
        // A post, at or below the writer's own progress (commentPosition rounds it).
        const writer = readers[Math.floor(random() * readers.length)]
        const position = commentPosition(random() < 0.3 ? undefined : random() * 100, circleProgress(0, writer.notifiedProgress))
        const comment = { id: comments.length, userId: writer.userId, position }
        comments.push(comment)
        for (const userId of newCommentRecipients(comment, readers, new Set())) {
          claim(userId, comment.id, readers.find((r) => r.userId === userId)!.notifiedProgress, position, "a new comment")
        }
      } else {
        // Reading on: progress only ever rises, as notifiedProgress does.
        const reader = readers[Math.floor(random() * readers.length)]
        const next = Math.min(100, roundTo(reader.notifiedProgress + random() * 25))
        for (const c of comments) {
          if (c.userId !== reader.userId && unlockedByProgress(c.position, reader.notifiedProgress, next)) claim(reader.userId, c.id, next, c.position, "reading on")
        }
        reader.notifiedProgress = next
      }
    }
    for (const r of readers) {
      for (const c of comments) {
        if (c.userId === r.userId) continue
        const times = claims.get(`${r.userId}:${c.id}`) ?? 0
        const reached = r.notifiedProgress >= c.position
        check(`fuzz ${run}: ${r.userId} told about comment ${c.id} ${times} times`, times === (reached ? 1 : 0), { notified: r.notifiedProgress, position: c.position })
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} failed, ${passes} passed`)
  process.exit(1)
}
console.log(`Spoiler lock OK: ${passes} checks passed`)
