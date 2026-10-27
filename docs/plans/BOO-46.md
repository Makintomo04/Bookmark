# BOO-46 Let readers report a review

**Goal.** Readers can report a review; staff can take it down (text only, or text and rating), logged, and the reviewer is told.
**Why it blocks launch.** Reviews are public user-to-user content. Under the Online Safety Act a UK user-to-user service needs a way to report content and act on it. Today lists, circle comments and book details can be reported. Reviews can't, and staff can't take one down.

**Effort: M.** Schema fields plus one new report model, one route, a queue kind, two staff actions, a notification type, and report menus on 3 web and 2 mobile surfaces.

## What exists today (verified in this worktree)

- `apps/web/lib/staffReports.ts:17` has `REPORT_KINDS = ["list","comment","book"]`, as the ticket says. `reportQueue()` (:89-146) groups rows per item. `actionAllowed()` (:152) and `actOnReport()` (:167-195) handle `hide` for list/comment and log `report.<action>` with `before`.
- A review is not its own model. It is `Book.review` / `reviewSpoiler` / `reviewPrivate` / `rating` on the reader's shelf copy (`prisma/schema.prisma`, `model Book`). So **the reported item is a `Book` id**. `BookRead.rating` keeps per-read history; `Book.rating` is the current one.
- Comment report route: `app/api/buddy-reads/[id]/comments/[commentId]/report/route.ts`. It uses `rateLimit` 20/hour (:20), `reportSchema` (fixed reasons), refuses your own comment and anything you can't see (:26-29), treats P2002 as a no-op (:33-38), and sends `alertReport` email (:40).
  - **Ticket correction:** comment reports have no explicit block check. Blocks only hold there because blocked readers can't share a circle. List reports (`app/api/lists/[id]/report/route.ts`) have **no rate limit** at all. For reviews we check blocks explicitly through `getRelation`.
- Reasons: `COMMENT_REPORT_REASONS` (`packages/shared/src/buddyReads.ts:17`), list `REPORT_REASONS` (`packages/shared/src/listRules.ts:25`).
- Alerts: `lib/reportAlerts.ts:11` types `kind` as `"list" | "comment"` only. Message copy at :32.
- Staff log: `lib/staffLog.ts:6-21` (`StaffActionKind`, `StaffTarget`), labels :39-53.
- Staff UI: `app/components/staff/StaffReports.tsx:12` (`KIND_LABELS`), action buttons :106-111. Route `app/api/staff/reports/[kind]/[id]/route.ts` is generic over `isReportKind`.
- Where review text leaves the server: always through `visibleReview` (`packages/shared/src/privacyRules.ts:105-115`). Callers:
  - `app/api/feed/route.ts:61` (select :36)
  - `lib/publicProfile.ts:102` (select :56; it destructures only the three review fields, so a new field must be passed explicitly)
  - `lib/workReviews.ts:64` (select :37)
  - `lib/lists.ts:391` (selects :436, :501)
  - `app/components/profile-head/OwnerProfile.tsx:40`
- Book average: `ratingSummaryForWork` (`lib/workReviews.ts:18-26`) feeds `summariseRatings` (`lib/workReviewRules.ts`). It is the only public aggregate.
- Surfaces:
  - web book page: `app/components/books/BookReviews.tsx` `ReviewItem` :15. Has `review.id` (the Book id) and `isMine`.
  - web profile: `app/components/profile-head/ProfileReviews.tsx` (has `book.id`).
  - web feed: `app/components/feed/ActivityFeedItem.tsx`. **The payload has no book id**: the feed route strips it, and `ActivityFeedItemData.book` has no `id`.
  - mobile feed: `apps/mobile/src/app/(app)/(tabs)/feed.tsx:76`. Same missing id; type in `apps/mobile/src/lib/social.ts:15`.
  - mobile profile: `apps/mobile/src/app/(app)/u/[username].tsx:233-246` (has `b.id`).
  - **Ticket correction:** mobile has no community-reviews section on book pages. `book/[id].tsx` is the reader's own copy, and nothing in `apps/mobile` calls `/api/books/reviews`. "Book pages (mobile)" can't be done until that section exists.
- Notifications: `lib/notifications.ts` (`createNotification` also pushes). `NotificationType` enum in the schema. Bell copy: `app/components/header/NotificationBell.tsx:35-55` and `apps/mobile/src/app/(app)/notifications.tsx:38-41`. Push map in `packages/shared/src/push.ts:11-61`. Precedent for "actor is you": `BUDDY_READ_HOST_INHERITED`.
- Takedowns of lists and comments **do not tell the author today**. Reviews would be the first to do it.

## Design decisions

1. **Report row:** new `ReviewReport { id, bookId, reviewerId, reporterId, reason, note?, createdAt, status?, resolvedById?, resolvedAt?, resolutionNote?, excerpt }`, with `@@unique([bookId, reporterId])` and `@@index([status, createdAt])`. Plain ids, not a relation, so the report survives the reviewer deleting the copy. That matches `BookReport` and keeps the evidence. `excerpt` stores the text as reported, because the reviewer can edit it later.
2. **Reasons** (shared constant `REVIEW_REPORT_REASONS`): "Abusive or harassing", "Spoilers not marked", "Spam or advertising", "Not about the book", "Something else". The ticket lists four; "Something else" matches the other kinds. Plain wording.
3. **Hide, don't delete.** Add to `Book`:
   - `reviewHiddenAt DateTime?`: review text hidden from everyone but the reviewer.
   - `ratingHiddenAt DateTime?`: rating left out of the book's average.
   
   The reader's own data stays intact, and so do their stats, Wrapped and export. This differs from comments, which are cleared. A review is part of the reader's own record, so clearing it would destroy their journal.
   - `visibleReview` treats `reviewHiddenAt` as self-only and returns a new `reviewRemoved: true` for the owner. The owner sees "Hidden by the Bookmark team. Only you can see it."
   - `ratingSummaryForWork` adds `ratingHiddenAt` unset/null to its `where`.
4. **Staff actions:** `hide` on `review` means hide the text and keep the rating. New action `hide_rating` (review only) does both. Both write `report.hide` / `report.hide_rating`, targetType `review`, `before: { review, rating }`.
5. **Telling the reviewer:** new `NotificationType.REVIEW_HIDDEN` with `actorId` = the reviewer, so no staff identity leaks, and `bookId` = the copy. Copy: "We've hidden your review of *Title*. It broke our rules on {reason}. Reply to support if you think we got it wrong." Push it, under a new or existing account category in `push.ts`. Plain voice: this is moderation, not a reading moment.
6. **Who can report:** signed in, not your own review, and the review must be visible to you: `getRelation` + `visibleReview` on the copy. That covers blocks either way, suspensions and private reviews. Otherwise 404. Rate limit `review-report:<id>`, 20/hour, as for comments. A duplicate is a no-op.

**Open questions for Michael**
- **Q1.** If the reviewer edits a hidden review, does the hide stand? Recommendation: yes. The flag stays until staff lift it (add an `unhide` action later), otherwise editing one character re-publishes it.
- **Q2.** Should a hidden rating also drop out of friend signals, like "people you follow rated it 4+" (`lib/lists.ts:434,498`, `lib/askShelfCatalog.ts:175`)? Recommendation: yes for `ratingHiddenAt`. It is cheap: add the same `where` clause.
- **Q3.** Do we also back-fill notifications for list and comment takedowns now, for parity? Recommendation: a separate small ticket.

## Changes

**Shared** (`packages/shared/src`)
- `privacyRules.ts`: `visibleReview` input gains `reviewHiddenAt?`, output gains `reviewRemoved`. Hidden text goes to the owner only.
- New `reviewReports.ts`: `REVIEW_REPORT_REASONS` and `reviewReportSchema` (zod: reason enum, optional note ≤ 500). Re-export from `apps/web/lib/` the way the other old paths do.
- `push.ts`: `REVIEW_HIDDEN` in a category and in the title/body switch. Keep `apps/web/lib/sharedEnums.check.ts` in step.

**Schema** (`apps/web/prisma/schema.prisma`)
- `Book.reviewHiddenAt`, `Book.ratingHiddenAt`; model `ReviewReport`; `NotificationType.REVIEW_HIDDEN`. Mongo, so no migration, just `prisma generate`.

**Web**
- New `app/api/books/[bookId]/review-report/route.ts` (POST), following the comment route's shape plus the visibility check. Calls `alertReport({ kind: "review", path: "/books/<workKey or workId>#reviews", excerpt })`.
- `lib/reportAlerts.ts`: widen `kind` to include `"review"`; fix the copy at :32 to a lookup.
- Pass `reviewHiddenAt` through every `visibleReview` caller:
  - `app/api/feed/route.ts:36,61`
  - `lib/publicProfile.ts:56,102`
  - `lib/workReviews.ts:37,64` (also skip hidden ones when ranking)
  - `lib/lists.ts:391,436,501`
  - `OwnerProfile.tsx:40`
- `lib/workReviews.ts:20`: exclude `ratingHiddenAt`.
- Feed: add `bookId` to the feed payload (`activity.bookId` is already on the row) and to `ActivityFeedItemData`.
- UI: new `app/components/books/ReportReviewButton.tsx`. A `Flag` dropdown of reasons, modelled on `ReportListButton` (`components/discover/ListButtons.tsx:66`), with a "Reported. Thanks for letting us know." state. Mount it in:
  - `BookReviews.tsx` `ReviewItem` (when `!isMine`)
  - `ProfileReviews.tsx` (pass a `canReport` prop; false on the owner's own profile)
  - `ActivityFeedItem.tsx` (REVIEWED_BOOK only)
- `ReviewText` (`app/components/feed/ReviewText.tsx`): render the `reviewRemoved` note for the owner.
- Bell: `NotificationBell.tsx`, copy for `REVIEW_HIDDEN` that links to the book. `app/api/notifications/route.ts`: attach book title as for recommendations.

**Staff console**
- `lib/staffReports.ts`:
  - add `"review"` to `REPORT_KINDS`; `REVIEW_REPORT_REASONS` lookup
  - query `prisma.reviewReport` in `reportQueue`. Title "Review of *Title*" by the reviewer's username. Excerpt = live text if not hidden, else the stored excerpt. `removed = !!reviewHiddenAt`. Path to the book page.
  - `REPORT_ACTIONS` add `hide_rating`; `actionAllowed`: `hide_rating` only for review
  - `closeReports` branch for review
  - `actOnReport` branch: set the flags, log `before`, create the notification
- `lib/staffLog.ts`: `report.hide_rating` kind and label "Hid a review and its rating"; `StaffTarget` add `"review"`.
- `StaffReports.tsx`: `KIND_LABELS.review = 'Review'`; buttons "Hide review" and "Hide review and rating" (destructive), plus the existing Dismiss / Escalate / Review the author.

**Mobile**
- `apps/mobile/src/lib/social.ts:15`: `bookId` on activity.
- `(tabs)/feed.tsx` and `u/[username].tsx`: a "Report" ghost button under a review, opening a reason chip row. Copy the `ReportComment` pattern at `circles/[id].tsx:264-281`, with "Thanks. The Bookmark team will take a look; nobody else can see that you reported it."
- `notifications.tsx`: `REVIEW_HIDDEN` copy.
- `components/social/ReviewText`: owner's removed note. (Mobile profile is never your own; your own is `profile/`.)

## Tests (`apps/web/scripts/test/`)
- `workReviews.test.ts`: `visibleReview` with `reviewHiddenAt`. Owner sees it with `reviewRemoved`; follower and anonymous get null.
- New `reviewReports.test.ts`:
  - schema rejects unknown reasons and long notes
  - `actionAllowed("review","hide_rating")` true; `("list","hide_rating")` false; `("review","resolve")` false
- `social.test.ts`: `reportAlertMessage` for `kind: "review"` reads "a review".
- `push.test.ts`: `REVIEW_HIDDEN` has a category and copy.
- `pnpm test` stays green, spoiler-lock script included.

## Manual verification
1. Two readers A and B, public profiles; A reviews a book. As B, report it from the book page, then A's profile, then the feed: one row (unique), a "Reported" state, and an email in the dev log.
2. B blocks A, or A makes the review private: B gets no button, and a direct POST gives 404. Reporting your own review gives 404. 21 reports in an hour gives 429.
3. As a librarian on `/staff/reports`, the review appears grouped.
   - "Hide review": gone from the book page, A's profile, the feed and list reasons. The rating still counts in the average. A sees the note and gets a notification and push. `/staff/log` shows it with `before`.
   - "Hide review and rating" on another: the average and count drop by one.
4. Mobile: report from the feed and from a profile; the notification shows.

## Out of scope
- Mobile book-page community reviews (doesn't exist; separate ticket if wanted).
- An unhide or appeal flow in the console. Appeals go to the support email for now.
- Notifying authors of list and comment takedowns (Q3).
- A public community guidelines page. There isn't one in `apps/web/app`, and OSA terms will want one. Flag it for the launch checklist.
- Rate-limiting list reports (the existing gap noted above): a one-line follow-up.
