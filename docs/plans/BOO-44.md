# BOO-44 · Log progress as a percent, for Kindle readers

## Goal

Kindle shows "37%", not a page. Our ideal reader is mostly on Kindle and KDP books, and many of those
books arrive from a Goodreads import with no page count. Today she has to do maths on every update, and
a book with no page count can't be tracked at all, so she can't move forward in a reading circle
(and comments stay locked). That breaks the first week of use for our main audience.

## What exists today (checked in this worktree)

- `packages/shared/src/progress.ts` holds all the progress logic, and web re-exports it from
  `apps/web/lib/progress.ts:2`. `ProgressUnit` is `"PAGES" | "MINUTES"` (l.6). `progressScale` (l.39-46)
  and `progressPercent` (l.53-59) work out the percent as current/total, and `progressPercent` returns
  **0 whenever total is 0** (l.57). `progressSelect` (l.20-27) is spread by every server caller
  (`lib/buddyReadsServer.ts:92`, `api/buddy-reads/route.ts:38`, `lib/recapSource.ts:79,98`), so a new
  field added there reaches circles and recaps without any other change.
- Prisma `Book` (schema l.333-341) stores `pages`, `currentPage`, `progressUnit`, `audioMinutes` and
  `currentMinute`. `BookRead` (l.551-578) mirrors them per read, and the `ProgressUnit` enum is at l.541.
- Web modal `apps/web/app/components/modals/BookUpdateModal.tsx`: the scale is set at l.137-146, and
  `at()` sends `currentPage`/`currentMinute` (l.152). The progress control is at l.336-393. **If there's no
  page count (l.394-398), the reader only gets "Add it", which opens the edit modal.** The start control
  (l.400-445) hides "Set your page" when there's no count.
- Mobile `apps/mobile/src/app/(app)/book/[id].tsx` is the same logic, duplicated: l.71-74, l.98 and l.108,
  with the no-count branch at l.287 ("Add it" goes to `/book/edit`).
- API `apps/web/app/api/book-progress/route.ts`: the body schema is at l.60-81, and l.139-156 clamps the
  position to the book's own scale. **When total is 0, `clampPos` forces every position to 0** (l.143).
- Circles: `circleProgress` (`packages/shared/src/buddyReads.ts:201`) takes the max of the book percent
  and `notifiedProgress`. `onBuddyReadProgress` (`lib/buddyReadsServer.ts:372`) unlocks comments from
  `progressPercent(updated)`. Circles already work in percent, so they need no changes once
  `progressPercent` is right.
- **The ticket missed this:** hosting a circle is refused when total is 0
  (`api/buddy-reads/route.ts:98-102`, with the matching copy at `NewBuddyReadForm.tsx:111`). Joining
  reuses the reader's existing shelf copy (`shelfBookFor`, `buddyReadsServer.ts:255-262`), so an
  imported Kindle copy with `pages: 0` joins and then sits at 0% for ever.
- Stats: "pages read" comes only from finished reads, through `readLength` (`progress.ts:118`,
  `lib/stats.ts:108,214`). The `PAGES_READ` achievement is the sum of finished `pages` plus the
  `currentPage` of first reads in progress (`lib/achievements.ts:146-158`). The book edit route requires
  `pages > 0` for non-audiobooks (`api/books/[bookId]/route.ts:71`). The add route and the importer
  allow 0 (`api/books/route.ts:83,122`, `lib/import/records.ts:79`).

## Design decisions

1. **Percent is a way of entering progress, not a third `ProgressUnit`.** The unit stays the book's
   format (pages or minutes), so `readLength`, `lengthSnapshot`, Wrapped and the audiobook split all
   stay as they are. A `PERCENT` unit would mix up "what format is this" with "how do I type my place",
   and would break minute totals for an audiobook logged in percent.
2. **New fields:**
   - `Book.currentPercent Float?`: the exact percent the reader typed.
   - `Book.logsPercent Boolean?`: the per-book "remember %" preference, stored on the server so web and
     mobile agree.
   - `BookRead.currentPercent Float?`: mirrors the open read, and is final on a DNF.

   When she logs in percent, the server stores **both** the exact percent and the matching page or minute
   (`Math.round(pct / 100 * total)`). That way `PAGES_READ`, pace, `formatPosition` and old clients keep
   working, and her place doesn't drift on a short book (37% of 50 pages is page 19, which would show
   as 38%). Any write in pages or minutes sets `currentPercent: null`, so old mobile builds that only
   send `currentPage` stay correct.
3. **`progressPercent` uses `currentPercent` when it's set,** and otherwise falls back to current/total.
   This one change makes percent-only books advance in circles, recaps and cards.
4. **Percent-only mode for books with no page count.** The modal shows the percent control in place of
   "Add it", with a quieter "Add a page count" link underneath. Saving stores `currentPercent` and
   leaves `currentPage` at 0.
5. **Stats for percent-only books:**
   - A finish counts as a book read and adds **0 pages**. We don't guess. This is what `readLength`
     already does with `pages: 0`.
   - The average-length stat already skips books with no length (`stats.ts:166`).
   - When she adds a page count later, `readLengthsAfterEdit` already stamps the old 0-page reads,
     because they match the "same edition" rule at `progress.ts:135-136`. Pages read then catch up
     without anything extra. I checked this by reading the code; a test for it is listed below.
   - On finishing a percent-only book, the toast offers "Add page count" so stats pick it up.
6. **Remember per book:** pressing the "%" toggle sets local state. The choice is saved as
   `logsPercent` on the next save, so we don't need a separate request. A book with no count always
   opens in percent.
7. Quick adds in percent are +1, +5 and +10. "Mark it as finished?" shows at 100%. **Open question
   (Michael):** should we also show it from 97%, since Kindle back matter often ends around there?

**Open questions for Michael**

- Q1: Should **hosting** a circle from a percent-only book be allowed? I recommend yes: change the guard
  at `buddy-reads/route.ts:99` to `total > 0 || book.logsPercent`. Joiners would get `pages: 0`, a
  percent default and the same "add a page count" nudge.
- Q2: Should an audiobook get the "%" toggle as well? I recommend yes, since it's the same code path
  and Libby shows percent. It would store `currentMinute` in the same way.
- Q3: Should the 97% "Mark as finished?" nudge go in (see point 7)?

## Changes

**Shared (`packages/shared/src/progress.ts`)**
- Add `currentPercent?` and `logsPercent?` to `ProgressBook` and to `progressSelect`.
- `progressPercent`: use `roundPercent(currentPercent)` when it isn't null and the book isn't COMPLETED.
- Add `percentToPosition(pct, total)` (rounded and clamped).
- Add `entersPercent(book)` (`logsPercent || total === 0`).
- Add `PERCENT_QUICK_ADDS = [1, 5, 10]`.
- `formatPosition` and `formatStoppedAt` show "37%" / "Stopped at 42%" for percent-only books, and
  `formatPosition` adds "· page 111 of 300" when there is a count.

**Schema (`apps/web/prisma/schema.prisma`)**
- Add `Book.currentPercent Float?`, `Book.logsPercent Boolean?` and `BookRead.currentPercent Float?`, each
  with a comment. Every field is optional, so no backfill is needed. Run `prisma generate`.

**API**
- `api/book-progress/route.ts`:
  - Add `currentPercent: z.number().min(0).max(100).optional()` and `logsPercent: z.boolean().optional()`.
  - When `currentPercent` is sent, the position is `percentToPosition`, and both `currentPercent` and
    the position are written to the Book and the open read.
  - When it isn't sent, write `currentPercent: null`.
  - `clampPos` is no longer allowed to zero out a percent.
  - Reset `currentPercent` on `start`/`restart`/`wantToRead`, set it to 100 (or null) on `complete`, and
    record it on `dnf`.
  - The `moved` check at l.277 also compares `currentPercent`, so streaks and achievements fire.
- `lib/readHistory.ts`: `readFromBook` copies `currentPercent`, and `reshelvedFields` (l.60-70) resets it.
- `api/books/[bookId]/route.ts` (l.78-83): when `currentPercent` is set and the new total is above 0,
  set the position with `percentToPosition` instead of `convertPosition`. This covers 0 pages becoming
  320, so the page catches up.
- `api/buddy-reads/route.ts:99`: the guard depends on Q1.

**Web**
- `BookUpdateModal.tsx`:
  - Add a segmented "Page | %" (or "Min | %") toggle beside the big number (l.304-334). Its state starts
    from `entersPercent(book)`.
  - In % mode the input takes 0-100, the range input runs 0-100, the label reads "You're at", and
    beside the number it shows "%" plus "page 111 of 300" when there's a count.
  - `at()` (l.152) sends `{ currentPercent, logsPercent: true }` in % mode, and `logsPercent: false` when
    the reader switched back.
  - Replace the no-count branch (l.394-398) with the % control and an "Add a page count" link.
  - Give `startControl` (l.400-445) the same toggle, and show "Set how far you are" even with no count.
  - Pace (l.293-296) is only worked out when there's a total.
- `NewBuddyReadForm.tsx:111`: update the copy, depending on Q1.

**Mobile**
- `apps/mobile/src/lib/books.ts`: add the new fields to `Book`/`BookRead` and send them through the
  existing `/api/book-progress` helper (l.76).
- `apps/mobile/src/app/(app)/book/[id].tsx`: make the same changes as on web (the toggle near l.250-280,
  the % branch replacing l.287, and the start control near l.239-245). Use the shared helpers, and don't
  hand-roll the `Math.round(page / pages * 100)` at l.98. Do the same on web at l.146.

## Tests

- `apps/web/scripts/test/progress.test.ts`:
  - `progressPercent` prefers `currentPercent`, and returns 0 when it's null and there's no total.
  - COMPLETED still counts as 100.
  - `percentToPosition` rounds and clamps.
  - `entersPercent` is true for books with no count.
  - `formatPosition` covers percent-only books and percent-with-pages.
  - `readLengthsAfterEdit` stamps a 0-page finished read when the count goes from 0 to 320.
- `apps/web/scripts/check-buddy-read-spoilers.ts`: add checks that a percent-only member at 40% sees a
  comment at 40 and not one at 41, and that clearing `currentPercent` on a re-read keeps the furthest
  point through `circleProgress`. **The spoiler rules themselves don't change.**
- Add a route-level test for the payload builder, if it's pulled out as a pure helper: given
  `{ currentPercent: 37 }` on a 300-page book, it returns `currentPage: 111` and `currentPercent: 37`.

## Manual check

- **300-page book, web:** switch to %, type 37 and save. The card shows 37%. Reopen it: the modal is
  still in % mode. Open it on mobile: also in % mode.
- **Imported book with no count:** log 25%. Join a circle on it: you see comments up to 25%. Add a page
  count of 400: the card shows page 100.
- **Audiobook:** the toggle works if Q2 is accepted.
- **Old-client path:** POST `currentPage` only. `currentPercent` is cleared and the percent follows pages.
- **Finish a percent-only book:** /stats books read +1, pages unchanged. Then add the page count: pages
  read goes up.

## Out of scope

- Kindle "location" numbers.
- A Kindle/Goodreads sync.
- Guessing page counts from the catalogue. Add and import already do this where an edition count
  exists (`api/books/route.ts:122`).
- Percent entry in the add-book flow (`apps/mobile/.../add-book.tsx:142`). It could follow later.
