# BOO-48: Bring readers back with reading reminders, streak alerts and a weekly email

**Goal.** Opt-in, free nudges in the reader's own time zone, never inside their quiet hours, with no AI-written text and nothing anyone else wrote:
- a daily reading reminder at a time the reader picks;
- an evening streak alert;
- circle checkpoint reminders (the free part of BOO-11);
- a weekly email, "Your week in books".

They're offered once, on a sheet after the reader's first finished book. Launch audit RET-01; the persona panel's number one ask.

## Decisions (31 Oct 2026)
- **Vercel Pro**, so the tick is a native cron (`*/15 * * * *` in `apps/web/vercel.json`). The 27 Oct plan's external scheduler is dropped.
- **The weekly email ships in this PR**, behind the opt-in. The ops steps below come before it's switched on.
- **The opt-in sheet is included.** It appears after the first book finished on Bookmark (`User.remindersPromptedAt`).
- **The streak alert needs a streak of 3 days or more.**
- **Rules from the round-3 persona brief:**
  - Quiet hours are 10pm to 8am by default, and the reader can change them.
  - At most one reading nudge a day. The streak alert takes the daily reminder's place when a streak is at risk.
  - Checkpoint reminders go out two days before a section is due, at 9am, and only if the reader is behind.
  - The email goes out on Sunday from 9am.

## How it works
- **Tick.**
  - `GET /api/cron/tick` runs every 15 minutes, guarded by `CRON_SECRET` through `lib/cronAuth.ts` (a timing-safe compare; the series cron uses it too).
  - It runs `lib/jobs/readingNudges.ts`, `checkpointReminders.ts` and `weeklyDigest.ts`, each with a deadline.
  - It clears ledger rows older than 60 days.
- **Ledger.**
  - `ScheduledSend` has `@@unique([userId, kind, key])`. `claimSend()` creates the row first and skips on P2002, so a retried or overlapping tick can't send twice.
  - Keys:
    - `nudge` plus the local day;
    - `checkpoint` plus `circleId:due`;
    - `digest` plus the ISO week.
- **Due window.** A send is due from its slot for 45 minutes in the reader's local time, so one missed tick still delivers.
- **Rules and words.** They live in `packages/shared/src/reminders.ts`: `localClock`, `inQuietHours`, `isDue`, `streakAlertMinute`, `streakState`, `nudgeFor` and the push copy. The email is built in `packages/shared/src/digest.ts`, whose input has no field for comment, review or note text.
- **Pushes.**
  - The reminder groups are `reminders` and `checkpoints` (`OPT_IN_PUSH_GROUPS`). They're left out of the on-unless-off toggles and switched on by their own `User` fields.
  - They're sent by `sendSystemPushes` in `lib/push.ts`, with no bell row.
  - A private book's title never reaches the lock screen.
- **Email.**
  - It goes only to verified addresses on accounts that aren't suspended.
  - It carries `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058).
  - `lib/unsubscribeToken.ts` signs the token with an HMAC keyed by `EMAIL_UNSUBSCRIBE_SECRET`. Without the secret, no email is sent.
  - `POST /api/email/unsubscribe` handles one-click unsubscribes. `/email/unsubscribe` asks for a click, because link scanners open every GET.
  - Turning the email on stamps `weeklyEmailConsentAt` (PECR). There's no Plus promotion in it.
- **Settings.**
  - `GET/PATCH /api/push/settings` now carries `reminders`, `email`, `prompted` and `hasPhone` alongside `push`, which older app builds still use.
  - The reminder time must be on a quarter hour and outside quiet hours.
  - The web gets a new `#notifications` section. The app gets a Reminders card.
- **Sheet.**
  - `book-progress` returns `askReminders` on a finish until the reader has been asked.
  - The web (`RemindersSheet`) and the app wait until the celebration or Up next has closed.
  - "Turn on" saves the draft in one PATCH. "Not now", or closing the sheet, only records that the reader was asked.

## Ops before switching on
1. Add `EMAIL_UNSUBSCRIBE_SECRET` in Production. `CRON_SECRET` already exists.
2. Set up SPF, DKIM and DMARC on the sending domain, and use an SMTP provider with bounce and complaint handling. Gmail and Yahoo's bulk-sender rules require a spam rate under 0.3%.
3. Update the privacy policy (BOO-56): reminders, the weekly email, and how the time zone is used.

## Later
- `PendingPush`, which holds event pushes during quiet hours and handles BOO-43's Phase B batching.
- BOO-11's Plus features: custom timing for hosts, and nudging members who are behind.
- New books from followed authors in the digest, once BOO-8 lands.
- Bounce and complaint webhooks that switch `weeklyEmail` off.
