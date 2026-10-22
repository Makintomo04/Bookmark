# Bookmark launch-readiness audit — 22 October 2026

Branch audited: `claude/design-system-foundations` @ `80d7e25`. No code was changed.

## How this was done (and what wasn't)

**Actually done**
- Mapped the codebase: 506 files and about 58k lines (Next.js 14 App Router, Prisma on MongoDB, next-auth v4 with JWT sessions, SWR, zustand, Stripe, UploadThing, and Anthropic for import matching).
- Read the whole reading-circle stack line by line: `lib/buddyReads.ts`, `lib/buddyReadsServer.ts`, every `app/api/buddy-reads/**` route, the invite page, the auth config, middleware and `lib/rateLimit.ts`.
- Three parallel read-only reviews covered:
  - every other API route, for security and privacy
  - UX, accessibility, mobile and visual consistency
  - core tracking and technical quality
- I spot-checked each of their headline claims against the code. One proved false: on the landing page, Sign in and Sign up do render; they just appear after the session check finishes.
- Ran `npm test`: **115/115 pass**.
- Ran `node scripts/check-buddy-read-spoilers.ts`: **2,512 checks pass**.
- The tech-quality reviewer ran `tsc --noEmit` (**0 errors**) and `npm run lint` (**0 errors, 7 benign warnings**).
- Loaded the signed-out landing page in a browser at desktop and 375px width.

**Not done**
- No signed-in browser walkthrough. Circles, progress updates, onboarding and chat were reviewed in code, not clicked through.
- No load testing.
- No Lighthouse or axe run.
- No real-device testing.
- No check of the production Vercel and Stripe configuration.
- The CSS-injection finding (SEC-03) is reasoned from how React server rendering behaves. I haven't reproduced it.

---

## A. Executive summary

**Verdict: not ready for a public launch. Closer than most products at this stage.** A focused 1–2 week P0 pass would make it ready for an invite-only beta, and a P0+P1 pass of roughly 3–5 weeks for a public launch.

**What's genuinely strong**
- **The pitch lands.** The landing page says what Bookmark is in one line ("Read with your friends. Nobody gets spoiled.") and why it's different from Goodreads and StoryGraph. It handles the "my friends aren't on it" objection in the FAQ.
- **The spoiler lock is built correctly where it matters.**
  - Comment bodies, labels, authors and replies past a reader's position never leave the server (`loadBuddyReadView` → `serializeComments`).
  - Locked comments can't be reacted to, replied to or reported, so none of those actions can confirm what a locked comment says.
  - A comment's position is capped at the author's own progress, so nobody can pin a comment ahead of where they've read and spoil others.
  - Not-found and not-a-member return the same 404, so circle IDs can't be probed.
- **The engineering basics are good.**
  - strict TypeScript with 0 errors
  - zod on most newer routes
  - an explicit allow-list of reading-status transitions, with optimistic concurrency
  - hashed, single-use, expiring tokens
  - Stripe webhooks verified
  - embeds that escape user input and restrict which image hosts they load from
  - no `dangerouslySetInnerHTML` on user content
  - empty, loading and error states almost everywhere
  - good colour contrast
  - consistent UK spelling

**What blocks launch** is trust and safety around the edges, not the core loop:
1. **Deleting an account leaves the person billed and leaves their data behind.**
   - Their Stripe subscription isn't cancelled.
   - Their reading-circle data and several other collections aren't deleted.
   - A clean-up function for the circle data (`deleteBuddyReadDataFor`) exists, but nothing calls it.
2. **Circle hosts can't actually keep someone out.** A removed member can rejoin immediately with the same link, and the link can't be changed.
3. **Privacy settings promise more than they deliver.**
   - "Followers only" means any signed-in user who clicks Follow.
   - A private reader's lists, and their entries in follower lists, are still visible.
4. **Reports go nowhere.** Comment and list reports are stored, but nothing in the codebase reads them. For a UK user-to-user service, a working report-handling process is a legal expectation as well as a trust one.
5. **Engagement features are quietly broken.**
   - Reading streaks only ever count days you finished a book.
   - Every reader's stats, goal and Wrapped run on UTC, because the browser time-zone cookie is never set.
6. **Core controls are mouse-only.** The notification bell and compact book cards can't be reached by keyboard.
7. **No error monitoring.** You would launch blind.

**The biggest product risk is retention, not code.**
- Circles are the differentiator, but nothing brings a reader back when a friend posts or catches up: there are no emails or push notifications for circle activity, only the in-app bell.
- Progress can only be entered in pages or minutes, never as a percentage, even though circles run on percent and the landing page sells "Kindle".
- Onboarding never offers to start a circle, which is the thing every landing-page button promised.

---

## B. Prioritised findings

Severity: **Critical**, **High**, **Medium**, **Low**. Effort: **S** is under half a day, **M** is 1–3 days, **L** is more than 3 days.
"Confirmed" means I verified it in code. "Likely" means it follows from the code but I haven't reproduced it. "Opinion" marks a design judgement rather than a defect.

| ID | Area | Finding | Evidence | Sev | Recommended fix | Effort | Blocker |
|---|---|---|---|---|---|---|---|
| SEC-01 | Security/Billing | Deleting an account doesn't cancel the Stripe subscription, so a Plus subscriber keeps being charged with no account to manage it from. Confirmed. | `app/api/user/route.ts:87-114` never calls Stripe. `cancelSubscription` exists in `lib/stripe.ts:70` but is only used by `lib/billing.ts:184`. | **Critical** | Before deleting, cancel any subscription that isn't lifetime. Abort the deletion if Stripe errors. **Verify:** delete a test-mode Plus account and check the subscription shows as cancelled in the Stripe dashboard. | S | **Yes** |
| SEC-02 | Privacy | Account deletion orphans personal data. Circle comments, reactions, memberships, invites, reports and hosted circles all survive, and hosted circles are left with no host who can archive them. `ImportJob` (which can hold reviews), `ReaderTags`, which still count toward public mood/warning totals, and `QuestProgress` also survive. The deletes aren't in a transaction. Confirmed. | `app/api/user/route.ts:94-111`. `deleteBuddyReadDataFor` (`lib/buddyReadsServer.ts:357`) is never called anywhere. | **High** | Call `deleteBuddyReadDataFor` and add `deleteMany` for each model keyed by a plain `userId`, inside `$transaction` where Mongo allows. Decide what happens to hosted circles (see CIR-05). **Verify:** a deletion test asserting zero documents reference the user ID in any collection. | M | **Yes** |
| CIR-01 | Circles/Safety | A removed member can rejoin straight away with the same invite link. There is no ban list and the code can't be regenerated. Every member is given the code. Confirmed. | `members/[userId]/route.ts:19` only deletes the membership. `joinBuddyRead` (`buddyReadsServer.ts:250-268`) checks only blocks with the host. No route changes `inviteCode`. | **High** | (1) Add a `removedAt`/`BuddyReadBan` record that `joinBuddyRead` checks. (2) Add a host-only "Reset invite link". (3) Consider showing the link to the host only. **Verify:** host removes B, B opens the link, and joining is refused. | S–M | **Yes** |
| PRIV-01 | Privacy | "Followers only" isn't private: anyone signed in can follow instantly and see the shelf, activity and reviews. The settings copy implies the owner chooses who sees them. Confirmed. | `app/api/users/[username]/follow/route.ts:47-49`. There is no follow-request model in `prisma/schema.prisma`. | **High** | Minimum for launch: a "Remove follower" control plus honest copy ("Anyone who follows you"). Proper fix: follow requests for FOLLOWERS/PRIVATE profiles. **Verify:** a second account follows, and the owner can remove it and the shelf disappears for it. | S (copy + remove) / M (requests) | **Yes** (at least the copy) |
| PRIV-02 | Privacy | A private or followers-only reader's public lists can still be read through the list API and `/lists/[id]`, including by people they've blocked. That contradicts the code's own rule in `lib/embed.ts:105`. Confirmed. | `lib/lists.ts:17-23` (`visibleTo`) and `findLists` check only list visibility. | **Medium** | In `findList`/`findLists`, also require `canViewUser` on the owner and drop blocked owners. **Verify:** test that a PRIVATE owner's PUBLIC list returns 404 to strangers and blocked users. | S | **Yes** |
| SEC-03 | Security | Colours are stored unvalidated (`favColour`, `cardColour`) and rendered into inline `style` on server-rendered public pages. That allows CSS injection, e.g. a full-page overlay or a tracking-pixel background on a profile or list. Likely. | Writes: `api/user/route.ts:60-62`, `api/new-user/route.ts:40`, `api/books/[bookId]/route.ts:95`. Render: `TierAvatar.tsx:34`, `lists/[id]/page.tsx:75`, `BookCover.tsx:19,27`. | **High** | Validate on write against `/^#[0-9a-f]{6}$/i` (or `SWATCHES`) and normalise on render with the existing `toHex()`. **Verify:** PATCH a colour containing `;`, expect a 400, then confirm existing rows are cleaned. | S | **Yes** |
| MOD-01 | Trust & safety | Comment and list reports are written to the database, but nothing reads them: no admin view, no email to staff, no auto-hide. Users are told reports are "reviewed by staff". Confirmed. | `buddyReadCommentReport` / `listReport` have only `create` and `deleteMany` uses, no `findMany`. | **High** | Minimum: email a staff inbox on every report, and add a script or page that lists open reports, with one-click hide. Write down a response-time commitment. **Verify:** file a report and receive the email. | S–M | **Yes** |
| OPS-01 | Reliability | No error monitoring or alerting. `global-error.tsx` only logs to the console, and only 13 of 65 API routes have any try/catch. Confirmed. | `app/global-error.tsx:38`. No Sentry or other APM in `package.json`. | **High** | Add Sentry (or similar) for server and client, with release tagging and an alert on a spike in 5xx errors. **Verify:** throw a test error in preview and see it arrive. | S | **Yes** |
| A11Y-01 | Accessibility | The notification bell can't be reached by keyboard and has no accessible name. Its rows aren't menu items, so they can't be reached by keyboard either. There's also a `<button>` nested inside a `<Link>`. Confirmed. | `NotificationBell.tsx:72-73` (trigger is a `<div>`), plus `:87` and `:105`. | **High** | Make the trigger a `<button aria-label="Notifications, N unread">`, render rows as `DropdownMenuItem asChild`, and make the inner button a sibling of the link. **Verify:** reach and open every notification using only the keyboard, and check the name in VoiceOver/NVDA. | S | **Yes** |
| A11Y-02 | Accessibility | Compact book cards are a `<div onClick>`. Their favourite and "more" controls are unlabelled `<div>`s about 16–24px across. This is one of the two routes into progress updates. Confirmed. | `CompactBookCard.tsx:62,91,97` | **High** | Reuse `BookActions` and the `role="button"` pattern from `BookCoverCard.tsx:62-65`. **Verify:** keyboard-only, update progress from a compact card. | S | **Yes** |
| CORE-01 | Engagement | Reading streaks never record days when you only made progress. The only callers pass the default trigger `"all"`, which isn't one of the reading triggers, so a streak only grows on days you finish a book. Confirmed. | `lib/achievements.ts:43,312-318`. Callers: `api/book-progress/route.ts:220` and `api/books/route.ts:150`. | **High** | Pass `trigger: "progress"` / `"completion"` (plus rating/review) from book-progress. **Verify:** a unit test of awarding achievements on a progress update writes a `ReadingDay`, and three consecutive days earn the 3-day streak. | S | No (do it in P0) |
| CORE-02 | Correctness | Every reader's time zone is treated as UTC. The server reads a `tz` cookie, but nothing ever sets it, so streak days, stats months, goal years and Wrapped cut over at UTC midnight while the goal hook uses the browser's year. Confirmed. | `lib/timeZone.ts:7`, `lib/achievements.ts:59`. No writer anywhere (grep for `resolvedOptions` returns nothing). | **Medium** | Set the cookie once in a client provider from `Intl.DateTimeFormat().resolvedOptions().timeZone`. **Verify:** with a US time zone, a book finished at 8pm on 31 December counts toward the current year. | S | No (P0) |
| CIR-02 | Circles | When a member leaves or is removed, all their comments disappear, and so do all the replies other people wrote under them. Members lose their own words with no warning. Confirmed. | `serializeComments` drops any comment whose author isn't a current member (`lib/buddyReads.ts:197`). A reply whose parent is dropped is never rendered. | **Medium** | Keep former members' comments, attributed as "former member" or anonymised. At minimum, still render replies under a placeholder parent. **Verify:** extend `check-buddy-read-spoilers.ts`: remove the author and check the replies still serialise. | S–M | No |
| CIR-03 | Circles/Spoilers | The lock trusts each reader's own copy and can lock and unlock unexpectedly. Confirmed. These cases:<br>• **Marking Finished** (even by accident) → 100%, which unlocks everything.<br>• **Editing your page count down** → unlocks.<br>• **Starting a re-read** → progress returns to 0, so the whole discussion locks again, including comments the reader already read.<br>• **Removing the book from your shelf** → re-locks.<br>• **Another edition** → there's no mapping beyond percentage. | `progressPercent` (`lib/progress.ts:53-59`), `findMembership` (`buddyReadsServer.ts:106-108`), re-read reset (`api/book-progress/route.ts:143-146`) | **Medium** | Unlock on a circle high-water mark, `max(currentPercent, member.notifiedProgress)`. That field already exists and never decreases, so re-reads and removal won't re-lock. Confirm before marking Finished inside a circle ("this unlocks all N comments"). Accept that the lock is honour-based and say so in the FAQ. **Verify:** spoiler-script cases for re-read and removal. | S | No |
| CIR-04 | Progress UX | Progress can only be entered in pages or minutes, never as a percent. A book with no page count can't be tracked at all; the modal sends you to edit the book. Kindle readers, whom the landing page addresses directly, think in percent. Confirmed. | `BookUpdateModal.tsx:249-308,338-343`. Copy: `Landing.tsx:28`. | **High** (core loop) | Add a Pages/% toggle that stores `currentPage = round(pct × pages)`. When pages are unknown, allow a percent-only mode. **Verify:** a Kindle-style book with no page count can be advanced in a circle. | M | No (strong P1) |
| CIR-05 | Circles | Hosts can't leave or hand over a circle. Once SEC-02 is fixed by calling the existing helper, a host deleting their account will delete every member's discussion. Confirmed. | `members/[userId]/route.ts:15`, `deleteBuddyReadDataFor` (`:358-368`) | **Medium** | Transfer hosting automatically to the longest-standing member when the host leaves or deletes their account. Only delete a circle when it has no members left. **Verify:** delete the host account, and the circle survives with a new host. | M | No (decide before SEC-02) |
| UX-01 | Onboarding | Every landing CTA says "Start a reading circle", but onboarding step 3 offers add a book, import, a goal or your profile. Circles aren't mentioned. Confirmed. | `Landing.tsx:139,210,236`, `app/(auth)/new-user/page.tsx:237-262` | **Medium** | Make "Start a reading circle" the first option and link it to `/circles/new`. **Verify:** sign up from the landing CTA, and onboarding offers a circle. | S | No (P0) |
| UX-02 | Mobile | Sign-up, forgot-password and reset-password scroll sideways on phones (`w-screen` inside padding). `h-screen` can hide the top when the keyboard opens. There's no way back to the home page. Confirmed. | `SignUpComponent.tsx:86`, `register/layout.tsx:6` | **Medium** | Use `w-full min-h-dvh`, and make the logo a link to `/`. **Verify:** at 375px, the page has no horizontal scroll and the keyboard doesn't hide the form. | S | No (P0) |
| SEC-04 | Security | A password reset doesn't sign out existing sessions (JWTs), so a stolen session survives the reset. Confirmed. | `api/auth/reset-password/route.ts:33-38`, JWT strategy at `[...nextauth].ts:135` | **Medium** | Add `passwordChangedAt`/`tokenVersion` and reject older tokens in the `jwt` callback. **Verify:** sign in on two browsers, reset on one, and the other is signed out. | S–M | No (P1) |
| SEC-05 | Security | Rate limiting is per serverless instance and resets on a cold start. It covers sign-in, sign-up, password reset, invites, joins and comments. The code itself says so. Confirmed. | `lib/rateLimit.ts:1-6` | **Medium** | Swap the in-memory store for Upstash Redis behind the same function. **Verify:** a burst across concurrent requests is limited consistently. | S | No (P1) |
| SEC-06 | Security | Usernames have no character rules (2–50 of anything), and several links build `/u/${username}` without encoding. That allows impersonation with lookalike characters and odd paths. Much harder to fix once real users exist. Confirmed. | `api/user/route.ts:34`, `api/new-user/route.ts:42`. Unencoded links: `ActivityFeedItem.tsx:53`, `NotificationBell.tsx:45`, `CommentItem.tsx:86` | **Medium** | Enforce `^[a-z0-9._-]{2,30}$`, compare without case, and use `encodeURIComponent` in links. **Verify:** unit test the validator and try registering `../settings`. | S | No (P0, cheap now) |
| PRIV-03 | Privacy | Follower and following lists show private readers' bio and book count, and ignore blocks. Confirmed. | `lib/follows.ts:20,56-61` | **Medium** | Blank out bio and count when the profile can't be viewed, and exclude blocked users. | S | No (P1) |
| PRIV-04 | Privacy | The "send to friends" picker reveals whether a friend has a book on their hidden shelves: "Will not read", a hidden Want to read, or a private profile. Confirmed. | `lib/recommendations.ts:33-41` | **Low** | Exclude `NOT_INTERESTED` and respect `hideWantToRead` and profile visibility. | S | No |
| PRIV-05 | Privacy | The public invite page and its OG image show every member's avatar, username and reader tier to anyone with the link, whatever their profile privacy. Confirmed. | `loadInvite` (`buddyReadsServer.ts:189-202`) | **Low** | Show the host plus a count, and only show avatars for members whose profiles are public. Your call: see E. | S | No |
| SEC-07 | Security | Shared catalog poisoning: a user's description or cover fills in a shared Work's missing fields, and other readers' new books then copy them. Plain text only, not XSS. Confirmed. | `api/books/route.ts:95-110`, `lib/catalog/resolve.ts:343-349` | **Low–Med** | Only fill Work and Edition fields from Open Library, never from user input. | S | No (P1) |
| CORE-03 | Data integrity | There's no server-side check for adding the same book twice. A double submit or a second tab creates duplicate shelf rows, which inflate stats, the goal, reader tier and the feed. Confirmed. | `api/books/route.ts:113`. Index at `schema.prisma:283` isn't unique. | **Medium** | Look up an existing `(userId, workId/workKey)` and return that book. **Verify:** two parallel POSTs leave one row. | S | No (P1) |
| CORE-04 | Data | A book shelved as finished on add gets today's date, so backfilled finishes all land in the current month's stats and Wrap. Confirmed. | `api/books/route.ts:133` | **Low** | Accept an optional finish date, or "date unknown", which is excluded from monthly stats. | S | No |
| SEC-08 | Robustness | Bad IDs and bad JSON return 500s instead of 400 or 404, across many routes. Text fields (titles, notes, search queries) have no length limits. Confirmed. | ObjectId lookups in `books/[bookId]/*`, `notes`, `favourites`, `notifications` PATCH. `req.json()` without `.catch` in 11 routes. | **Low** | A shared `isObjectId` guard plus zod schemas with `.max()`, as the circle routes already do. | M | No (P1) |
| SEC-09 | Abuse | Toggling follow/unfollow creates a new "new follower" notification each time, with no rate limit. Two simultaneous follow requests return a 500. Confirmed. | `api/users/[username]/follow/route.ts:33-52` | **Low** | Rate-limit the route, skip the notification if an unread one from the same follower exists, and catch P2002. | S | No |
| A11Y-03 | Accessibility | With modals stacked, one Escape closes all of them, and their focus traps fight. Confirmed. | `Modal.tsx:75-79` (each modal adds its own `document` listener) | **Medium** | Keep a module-level stack and let only the top modal handle keys. | S | No (P1) |
| A11Y-04 | Accessibility | The full-screen account menu on mobile doesn't move focus in, trap it, or return it to the avatar. | `UserMenu.tsx:105-145` | **Medium** | Reuse Modal's focus logic. | S | No (P1) |
| A11Y-05 | Accessibility/Mobile | Touch targets are under 44px for comment options, remove-reader (×), reaction chips, book actions, modal close and the bell. | `CommentItem.tsx:27,102`, `ProgressTrack.tsx:59-66`, `BookActions.tsx:44`, `Modal.tsx:134` | **Medium** | Apply `min-h-11 min-w-11` below `sm`, or add an invisible hit area. | S | No (P1) |
| A11Y-06 | Accessibility | Most motion ignores reduced-motion settings: the auth slide, `animate-pulse`, the 700ms progress-bar transitions, and the loader only slows down. | `SignUpComponent.tsx:65-78`, `globals.css:186` | **Low** | Add `<MotionConfig reducedMotion="user">` plus `motion-reduce:` variants. | S | No |
| A11Y-07 | Accessibility | No skip link and no `<nav>` landmark. Circle comments arriving by polling aren't announced. The landing demo is hidden from screen readers. | `Header.tsx:11-27`, `Discussion.tsx:42`, `Landing.tsx:92` | **Low** | Add a skip link, `<nav aria-label="Main">`, a polite live region ("2 new comments"), and `role="img"` with a label on the demo. | S | No |
| UX-03 | Feedback | Saving progress gives no confirmation. The biggest moment in a circle, "you've unlocked 3 comments", isn't shown at the moment it happens. Finishing, archiving and removing use `window.confirm` and show no success toast. Confirmed. | `BookUpdateModal.tsx:176`, `BuddyReadView.tsx:150-162` | **Medium** | Return the newly unlocked count from book-progress and show "3 comments unlocked — read them". Use a styled `ConfirmDialog` for destructive actions. | S–M | No (P1) |
| UX-04 | Navigation | On phones every destination except the bell lives inside the avatar menu. Feed is only in that menu on desktop too. There is no notifications page. Opinion. | `Header.tsx:17-25`, `UserMenu.tsx:23-34` | **Medium** | A bottom tab bar on mobile (Home · Circles · Feed · Discover), and an `/notifications` page. | M | No (P1) |
| RET-01 | Retention | Nothing outside the app brings anyone back. Email is only used for sign-in, password reset and verification. There's no circle-activity email or digest, and no web push. Circle chat refreshes by polling every 20 seconds. Confirmed. | `lib/mailer.ts` is used only by the auth modules. `BUDDY_READ_REFRESH_MS = 20_000`. | **High** (product) | A daily digest email per circle ("Sam caught up to you; 4 comments unlocked"), opt-out in settings, sent by a Vercel cron. Later: web push. | M | No (strong P1) |
| PERF-01 | Performance | `GET /api/books` returns the whole shelf with full descriptions and reviews and no pagination. Imports allow 10k books, and several pages call this endpoint. Risk. | `api/books/route.ts:38` | **Medium** | A slim `select` for the list view, and fetch details per book. **Verify:** time the payload for a 2k-book account. | S–M | No (P1) |
| PERF-02 | Performance | The circle page polls every 20 seconds per member. Each poll reloads up to 2,000 comments and makes one block query per member. `take: 2000` sorted by position would silently drop the furthest-ahead comments in a very busy circle. Confirmed. | `buddyReadsServer.ts:130-133,155-160` | **Low** | Fetch blocks in one query, return an ETag/`since` cursor, back off while the tab is hidden. | M | No (P2) |
| PERF-03 | Performance | A signed-out visit to the landing page calls `/api/user` and `/api/books` and gets 401s, which show as console errors. Observed in the browser. | Network log on `/` signed out | **Low** | Skip those fetches when there's no session. | S | No |
| CIR-06 | Circles | The 15-member cap can be exceeded by simultaneous joins (it counts, then creates). Confirmed. | `buddyReadsServer.ts:265-273` | **Low** | Re-count after inserting and roll back if over, or keep an atomic counter on `BuddyRead`. | S | No |
| CORE-05 | Import | An import with close to 10k rows stores every row and its candidate matches in one Mongo document, which could approach the 16 MB limit. Risk, untested. | `lib/import/job.ts:23-24` | **Medium** | Test with a 10k-row export. Lower `MAX_ROWS` or store matches separately. | S (test) | No (P1) |
| OPS-02 | Maintainability | `README.md` is still the create-next-app boilerplate. There's no env validation, though there are about 30 `process.env` reads. The NextAuth JWT secret logic is muddled (`SECRET` / `NEXTAUTH_SECRET` / `NEXTAUTH_JWT_SECRET`). Confirmed. | `README.md`, `[...nextauth].ts:131-139`, `middleware.ts:7` | **Low** | A zod env schema at boot, one secret, and a README covering setup, env vars and the test DB. | S | No |
| CODE-01 | Maintainability | Dead weight:<br>• **Never imported:** `primereact`, `react-loaders`, `loaders.css`, `randomcolor`, `d3-ease`, `@auth/prisma-adapter`, `ColorPickerComponent.tsx`, and the `react-calendar` CSS (which includes a global `abbr{color:black}` that would be invisible on the dark theme).<br>• **Wraps every page for nothing:** the NextUI provider and Tailwind plugin; no NextUI component is used.<br>• **Duplicated tools:** both `moment` and `Intl` for dates, both `axios` and `fetch` for requests.<br>• **Unused assets:** template images in `public/` (`next.svg`, `vercel.svg`, `images/test-avatars/*`).<br>Confirmed. | `package.json`, `globals.css:84-152`, `app/providers/provider.tsx` | **Low** | Delete them. Migrate `moment` and `axios` over time. | S | No (P2) |
| VIS-01 | Visual | Three different "primary" button styles: brand red, inverted foreground (circle pages), and the reader's favourite colour (modal save button). Modal titles are 3xl Inter bold next to Literata page titles. Opinion. | `ProfileHeader.tsx:53`, `BookUpdateModal.tsx:552`, `Modal.tsx:133` | **Low** | One primary style. The reader's colour belongs on identity (avatars and the like), not actions. | S | No |

---

## C. The five most important things to do first

1. **Make account deletion correct** (SEC-01, SEC-02, with CIR-05 decided first). Cancel Stripe, call the circle clean-up that already exists, delete the remaining collections, and hand hosting over instead of wiping other people's discussion. This is the only finding that costs a user money.
2. **Give circle hosts real control** (CIR-01, MOD-01). A removal that sticks, a "reset invite link" button, and reports that reach a human. The product promise is "a private chat for one book", and both need to be true on day one.
3. **Make privacy settings mean what they say** (PRIV-01, PRIV-02, SEC-03). Honest "Followers only" copy plus a remove-follower control, list visibility tied to profile privacy, and hex-only colours.
4. **Fix the quietly broken engagement plumbing** (CORE-01, CORE-02, CIR-03). Pass the correct achievement trigger, set the `tz` cookie, and unlock on the circle high-water mark. That's about three small diffs. Streaks, the year cut-over, and re-reads that re-lock the discussion would each be the first "this is buggy" post after launch.
5. **Close the loop that brings people back** (CIR-04, UX-03, RET-01, UX-01). Percent progress entry, a "3 comments unlocked" toast, a daily circle digest email, and a circle option in onboarding. This is where Bookmark either becomes a habit or a one-off.

Do OPS-01 (Sentry) on day one, before any of these. It takes an hour and turns everything after it from guesswork into data.

---

## D. Missing or incomplete test coverage

Today: 115 unit tests of pure `lib` code (billing, import/CSV, catalog, embeds, preferences, progress maths, quests, work tags) and a separate 2,512-check spoiler-lock script. There are **no tests of API routes, permissions or flows**, and the spoiler script **isn't part of `npm test`**.

Add, in this order:
1. **Spoiler script in CI.** Move `scripts/check-buddy-read-spoilers.ts` into `scripts/test/` so `npm test` runs it.
2. **Circle access tests**, as route tests against the test DB (`scripts/with-test-db.mjs` already exists). Each of these should return 404 or 403:
   - a non-member calls GET, PATCH, comment, react or report
   - a member edits or deletes someone else's comment
   - a non-host removes a member
   - a removed member rejoins (expect a failure once CIR-01 is fixed)
   - a blocked user joins
   - an invite code for an archived circle
3. **Lock edge cases**, added to the spoiler script:
   - a reply under a removed author (CIR-02)
   - re-read and shelf removal using the high-water mark (CIR-03)
   - editing a comment's position upwards (should be refused)
   - `take` truncation
4. **Book-progress state machine.** Every allowed and refused transition, clamping, re-reads creating a `BookRead`, double-submit returning 409, and DNF/pause positions. It's the most important logic in the app and has no tests.
5. **Account deletion.** After deleting, no collection references the user ID, the Stripe cancel mock is called, and hosted circles are handed over.
6. **Privacy matrix.** For each Viewable (profile, activity, wantToRead, reviews, followCounts, lists, follower lists), test PUBLIC/FOLLOWERS/PRIVATE owners against anonymous, signed-in, follower, blocked and self viewers, across the API, the page and the OG image.
7. **Achievements and time zones.** Streak days recorded on progress, and the year boundary in `America/Los_Angeles` and `Pacific/Auckland`.
8. **Input validation.** Bad ObjectIds give 404 not 500, oversize fields give 400, and non-hex colours give 400.
9. **End-to-end smoke tests** (Playwright, which isn't installed yet):
   - landing → register → verify → onboarding → add book → start circle → copy invite
   - second user opens invite → signs up → lands in the circle → posts → first user sees it locked, updates progress, sees it unlocked
   - each at 375px and on desktop
10. **Accessibility:** `@axe-core/playwright` on the main pages in the same run.

---

## E. Assumptions and questions for you

**Assumptions I made**
- The hosting target is Vercel serverless, given the analytics package and the comments in the code. The rate-limit and polling findings depend on this.
- The launch audience is UK-first (UK English, `en-GB` dates). That brings the Online Safety Act duties for user-to-user services and UK GDPR into play for MOD-01 and SEC-02.
- The spoiler lock is meant to be honour-based, protecting honest readers, not tamper-proof. I rated CIR-03 on that basis.
- There's no staff or admin surface yet. I found none, beyond quests being staff-only.

**Questions that change what to build**
1. **When a host deletes their account or wants out**, should the circle pass to the next member, or end for everyone? This decides CIR-05, and that decides how to fix SEC-02.
2. **When someone leaves a circle**, should their comments stay (as "former member"), stay attributed, or go? Today they vanish along with everyone's replies.
3. **"Followers only":** follow requests (approval) for launch, or honest copy plus a "remove follower" button now and requests later?
4. **Should every member see and share the invite link**, or only the host? Should hosts be able to switch joining off once the group is complete?
5. **Who reviews reports at launch**, and how quickly? Is an email to you enough for now?
6. **Is percent entry acceptable as the stored value** for a book with no page count, and should stats count "pages read" for it?
7. **Is a daily digest email in scope for the first release?** It needs a sending domain with SPF/DKIM, an unsubscribe link and a cron job.
8. **Is the public invite page allowed to show member avatars** (PRIV-05), or just the host and a count?
9. **Is the launch invite-only or open?** An invite-only beta would let you ship once P0 is done and leave P1 for the next few weeks.
10. **Are there production Stripe prices, a webhook endpoint and a sending domain** already configured on Vercel? I didn't inspect anything outside the repo.

---

## F. Phased roadmap

### P0 — must fix before launch (about 1–2 weeks)
- SEC-01: cancel Stripe on deletion
- CIR-05 decision, then SEC-02: full and transactional deletion, with hosting handed over
- CIR-01: removals stick, and the host can reset the invite link
- MOD-01: reports reach a human, plus a minimal review list
- PRIV-01: honest "Followers only" copy plus remove-follower
- PRIV-02: lists follow profile privacy and blocks
- SEC-03: hex-only colours, on write and on render
- OPS-01: Sentry and a 5xx alert
- A11Y-01, A11Y-02: keyboard access to the bell and the compact cards
- CORE-01, CORE-02: streak trigger and `tz` cookie
- SEC-06: username character rules, before real names are taken
- UX-01, UX-02: a circle in onboarding, and the mobile auth layout
- Tests: spoiler script in `npm test`, circle access tests, deletion test

### P1 — needed for a credible first release (about 2–3 weeks after P0)
- CIR-03: unlock on the high-water mark, and confirm before Finished in a circle
- CIR-04: percent progress entry
- UX-03: "N comments unlocked" feedback and a styled confirm dialog
- RET-01: daily circle digest email
- CIR-02: keep former members' comments and replies
- UX-04: mobile tab bar and a notifications page
- SEC-04: sign out other sessions on password reset
- SEC-05: shared rate-limit store
- PRIV-03: follow lists respect privacy
- SEC-07: stop catalog poisoning
- SEC-08: input validation and 4xx responses
- CORE-03: server-side duplicate-book check
- PERF-01: slim shelf payload
- CORE-05: test a 10k-row import
- A11Y-03 to A11Y-05: modal stack, menu focus, touch targets
- Tests: book-progress state machine, privacy matrix, Playwright smoke tests with axe

### P2 — after launch
- Web push, and faster circle refresh (ETag/`since` cursor, or a realtime provider once usage justifies it), PERF-02
- PRIV-04, PRIV-05, CORE-04, CIR-06, SEC-09, PERF-03
- A11Y-06, A11Y-07
- VIS-01: one primary button style, and a pass on headings
- CODE-01: dependency clean-up, moment → Intl, axios → fetch
- OPS-02: README and env schema
- **Product:**
  - circle schedules with reminders ("Part 2 due Sunday")
  - an end-of-book "spoiler zone" thread
  - host tools: pin comments, mute members
  - circle templates for book clubs
  - share cards for "we finished it"
