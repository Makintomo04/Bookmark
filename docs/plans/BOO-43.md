# BOO-43: Notify circle members about new comments they can read

**Goal.** When a member posts, everyone whose progress already reaches that comment hears about it (bell and push group `circles`). Members who haven't got that far still hear only through the unlock path, and never earlier.
**Why it blocks launch.** Circles are the social proof for "Your reading and your friends, in one app". At the moment a comment lands in silence unless the reader happens to pass it later. Hardcover's clubs beta is live, so a quiet circle reads as a dead one.

## What exists today (verified at d910e16)

- `apps/web/app/api/buddy-reads/[id]/comments/route.ts:37-49` creates the comment and returns it. It has no notify or push call. **The ticket is right.**
- `apps/web/lib/buddyReadsServer.ts:372-407` `onBuddyReadProgress`. When a reader's progress rises, it claims the stretch `(notifiedProgress, progress]` (conditional `updateMany`, :382-389), then bumps one `COMMENTS_UNLOCKED` per circle for other members' non-deleted comments with `position > notifiedProgress && position <= progress` (:391-405). Blocked writers are skipped (:403).
- Because of that range, **a comment posted at or below a member's `notifiedProgress` is never notified to them.** That is the gap. A comment above it is already caught by the unlock path when they pass it.
- `bumpNotification` (:351-367): while an unread row of the same type exists for the circle, it bumps `count` and `actorId` silently. Only a *new* row is pushed (:363-365, through `createNotification` in `lib/notifications.ts:11-15`). Batching like "3 comments in X" already exists for the bell.
- Nothing marks a circle's notifications read when the reader opens the circle. Only the bell does that (`app/api/notifications/route.ts:50-79`). So once a row sits unread, that circle never buzzes again.
- `packages/shared/src/push.ts:9-13` holds the push groups. `COMMENTS_UNLOCKED` copy is at :67-74. The rule at :5-7 says no push carries what anyone wrote.
- `lib/push.ts:63` drops self-notifications (`userId !== actorId`). That's fine here because the author is never a recipient.
- Lock rule: `canSeeComment` is `position <= viewer.progress` (`packages/shared/src/buddyReads.ts:206-208`). `viewer.progress` is `circleProgress(bookPercent, notifiedProgress)`, which is rounded (:201-203, `buddyReadsServer.ts:144`).
- Bell copy: web `app/components/header/NotificationBell.tsx:146`, app `apps/mobile/src/app/(app)/notifications.tsx:113`. The app falls back to "did something" for unknown types (`notifications.tsx:42`).
- No mute exists anywhere. `BuddyReadMember` is at `prisma/schema.prisma:848-868`.

## Design decisions

1. **Who counts as "already reached".** Use `member.notifiedProgress >= comment.position`, the raw stored value, not the rounded circle progress. The unlock path covers `position > notifiedProgress`, so the two paths split every (member, comment) pair between them exactly once: nobody is told twice and nobody is told early. `notifiedProgress <= circleProgress` always holds, so anyone notified can open and read the comment. Cost: a reader whose shelf progress moved without going through `/api/book-progress` hears through the unlock path on their next update rather than straight away. That lag is acceptable.
2. **A new notification type `CIRCLE_COMMENTS`**, batched per circle with `bumpNotification`, in push group `circles`. Bell copy is "3 new comments in Dune". Push copy is "@ana commented in your reading circle for Dune." for one and "3 new comments in your reading circle for Dune." for more. It never includes the body, labels or page.
3. **Batching at launch (Phase A, no cron needed).** Keep the existing rule of one push per unread row, plus two changes:
   - Opening the circle (`GET /api/buddy-reads/[id]`, web page render, app screen poll) marks that viewer's unread `CIRCLE_COMMENTS` and `COMMENTS_UNLOCKED` rows for that circle as read, so the next comment pushes again.
   - Skip the push, but still write the bell row, when the reader has the circle open (`lastSeenAt` within 5 minutes).
4. **Batching after BOO-48 (Phase B).** BOO-48 lays down the scheduled job: `/api/cron/tick` every 15 minutes, a `ScheduledSend` ledger, quiet hours, and a `PendingPush` queue (see `docs/plans/BOO-48.md` in that worktree). Then the immediate push changes: a new `CIRCLE_COMMENTS` row instead queues a `PendingPush` due in 10 minutes, collapsed per (reader, circle). The tick sends one "3 new comments in Dune" push, held through the reader's quiet hours. `COMMENTS_UNLOCKED` can move onto the same queue.
5. **Order: BOO-43 lands first.** It's smaller and launch-critical for circles, and needs no ops work. It lays down three things BOO-48 builds on: the `CIRCLE_COMMENTS` type, `BuddyReadMember.mutedAt`, and the pure recipient rule. BOO-48's weekly digest reuses the rule to count "comments you can read" and leaves muted circles out.
6. **Muting is per circle and per member.** A muted member gets no `CIRCLE_COMMENTS` or `COMMENTS_UNLOCKED` (bell or push) for that circle. `notifiedProgress` still advances while muted, so unmuting doesn't dump a backlog. Invites, joins (for hosts) and handovers are not muted. Free for everyone.
7. **Scope stays where the ticket puts it.** Replies count as comments. A reply is never placed before its parent (`commentPosition`), so the same rule applies. Archived circles already refuse posts (route :16).

**Open questions for Michael**
- Q1. Muted means *nothing in the bell either* (recommended), or bell yes and push no?
- Q2. New type `CIRCLE_COMMENTS` (recommended), or reuse `COMMENTS_UNLOCKED` with neutral copy ("3 comments to read in Dune")? Reusing means one row per circle and old app builds show sensible copy. With a new type, old builds show "@ana did something" until they update.
- Q3. Should the parent's author get their own "replied to your comment" notification? Out of scope here; that would be a follow-up ticket.
- Q4. Is the 5-minute "has it open" window right? It's a guess.

## Changes

### Shared (`packages/shared`)
- `src/buddyReads.ts`: add pure helpers.
  - `newCommentRecipients(comment: { userId; position }, members: { userId; notifiedProgress; mutedAt? }[], blocked: Set<string>): string[]` returns members other than the author, not blocked, not muted, with `notifiedProgress >= position`.
  - `unlockedByProgress(position, prev, next): boolean` is `position > prev && position <= next`, the existing range lifted out of `onBuddyReadProgress` so both paths are testable together.
- `src/push.ts`: add `"CIRCLE_COMMENTS"` to `PUSH_GROUPS.circles` and a `case "CIRCLE_COMMENTS"` in `pushContentFor`, using `count` and `actorUsername` only. Update the `circles` description to "Invites, people joining, new comments you can read, and hosting handed to you."

### Schema (`apps/web/prisma/schema.prisma`)
- `enum NotificationType`: add `CIRCLE_COMMENTS`, with a comment in the house style ("Members posted comments you'd already read up to. Batched per circle like COMMENTS_UNLOCKED.").
- `BuddyReadMember`: add `mutedAt DateTime?` (unset reads as not muted) and `lastSeenAt DateTime?`.
- MongoDB, so no migration. Run `prisma generate`. The `{ isSet: false }` caveat applies to `mutedAt` filters (see `buddyReadsServer.ts:96-97`).

### API / server (`apps/web`)
- `lib/buddyReadsServer.ts`:
  - New `notifyNewComment(buddyReadId, comment: { userId; position })`. It loads the other members (`userId`, `notifiedProgress`, `mutedAt`, `lastSeenAt`), runs `blockedAmong(author, ids)`, then `newCommentRecipients`, then `bumpNotification({ type: "CIRCLE_COMMENTS", by: 1, push: !recentlySeen })` for each. It's wrapped in try/catch and logged, so a post never fails because of it.
  - `bumpNotification`: add an optional `push = true`. When false, the new row is written with `prisma.notification.create` (no push).
  - `onBuddyReadProgress` (:377-406): use `unlockedByProgress` for clarity. Skip the bump when `m.mutedAt` is set, but still make the claim.
  - New `markCircleSeen(buddyReadId, userId)`. It sets `lastSeenAt`, throttled to one write a minute, and `updateMany` marks unread `CIRCLE_COMMENTS`/`COMMENTS_UNLOCKED` for that circle as read.
  - `loadBuddyReadView`: add `viewer.muted: boolean`.
- `app/api/buddy-reads/[id]/comments/route.ts`: after create (:49), `await notifyNewComment(buddyRead.id, { userId: currentUser.id, position: comment.position })`.
- `app/api/buddy-reads/[id]/route.ts` GET (:8-15): call `markCircleSeen` after the view loads (both clients poll this, every 20s on the app).
- `app/api/buddy-reads/[id]/members/[userId]/route.ts`: add `PATCH { muted: boolean }`, allowed only when `userId` is the caller. Returns `{ muted }`.
- `app/api/notifications/route.ts` GET: make sure `CIRCLE_COMMENTS` rows include `buddyRead` like `COMMENTS_UNLOCKED` (check the include/select there).

### Web (`apps/web/app`)
- `components/header/NotificationBell.tsx` (~:146): a `CIRCLE_COMMENTS` branch with "{n} new comment(s) in **{title}**". `notificationHref` goes to `/circles/{id}`.
- `components/buddy-reads/BuddyReadView.tsx` aside (:147-159): a "Mute this circle" / "Unmute" text button with the hint "You won't hear about new comments here. Invites and hosting changes still reach you." It uses an optimistic `mutate`.

### Mobile (`apps/mobile/src`)
- `app/(app)/notifications.tsx:113`: the same `CIRCLE_COMMENTS` text. `pathOf` already routes any `buddyRead` to the circle.
- `app/(app)/circles/[id].tsx`: a Mute/Unmute ghost button under the discussion, calling `api.patch(.../members/{viewer.userId}, { muted })`. Add `muted` to `CircleView` in `lib/circles.ts`.
- Push tap already opens `/circles/{id}` via `PushContent.path`.

### Settings
- No new switch. The `circles` push group already covers it, and its description updates through `PUSH_GROUP_LABELS` (app `settings.tsx:203-206`). Per-circle mute lives on the circle.

## Tests
- `apps/web/scripts/check-buddy-read-spoilers.ts`, extended (lock-sensitive):
  - `newCommentRecipients` never returns a member whose `circleProgress(0, notifiedProgress) < position`. It never returns the author, a blocked reader or a muted member.
  - Rounding edges: notifiedProgress 24.96 against position 25 (not notified now, unlocked later). 25.0 against 25 (notified now and never unlocked).
  - Partition fuzz: random positions and progress sequences. Every (member, comment) pair is claimed by exactly one of "new comment" or `unlockedByProgress` across the sequence, and never while `position > notifiedProgress` at claim time.
- `apps/web/scripts/test/push.test.ts`: `CIRCLE_COMMENTS` copy for 1 and 4. It's in group `circles`. The body never contains a fixture comment string (pass one through a widened context to prove it's ignored).
- Optional `scripts/test/circleNotify.test.ts`: `notifyNewComment` with a stub prisma (the pattern in `accountDeletion.test.ts`). Checks that one bump goes to each eligible member, `push: false` when recently seen, and that a throw is swallowed.

## Manual verification
1. Three accounts, A at 90%, B at 50% and C at 10%, in one circle. B has the app with push on.
2. A posts at a lowered position of 40%. B gets a bell row and a push saying "@A commented…", with no text on the lock screen. C gets nothing.
3. A posts twice more. B's bell shows "3 new comments", with no second push. B opens the circle and the row reads as read. A posts again and B is pushed again.
4. With B looking at the circle, A posts. Bell row only, no push.
5. C updates to 45%. C gets "comments unlocked", never "new comments", for the 40% comment.
6. B mutes, A posts: nothing. B unmutes: no backlog. Block A from B: B hears nothing about A's comments.
7. Do it on desktop web, phone web and the app.

## Out of scope
- Phase B delayed digest pushes and quiet hours. These arrive after BOO-48's job lands.
- Reply-to-you notifications, @mentions and email for comments. Web-only members get circle news in BOO-48's weekly email.
- Notifying when an edit lowers a comment's position (`[commentId]/route.ts:29-33`). Members already past the new position but below the old one won't be told. It's rare, so leave it.
