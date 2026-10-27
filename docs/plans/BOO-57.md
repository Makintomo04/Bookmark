# BOO-57: end-to-end smoke tests (sign-up, circle, unlock)

27 Oct 2026. Launch blocker: `pnpm test` covers lib code and the spoiler-lock script, with no route or
flow tests, while BOO-43, BOO-44 and BOO-47 change circles in parallel.

## What we're building

Playwright in `apps/web` (`pnpm test:e2e`), running `next dev` against the `bookmark-test` database through
`scripts/with-test-db.mjs`. Every flow runs twice: a 375px phone viewport (`mobile`) and 1280px (`desktop`).

1. **Sign-up to invite** (`e2e/signup-circle.spec.ts`): landing, "Start reading free", register, confirm
   the email, onboarding, add a book by hand, start a reading circle, and copy the invite link.
2. **Spoiler unlock** (`e2e/circle-unlock.spec.ts`): a host sets up a circle. A second reader opens the
   invite, signs up through it, lands in the circle, reads to 50% and posts. The host (at 0%) sees
   "1 comment ahead at 50%" with no text. They log their progress past it and the comment appears.
3. **Goodreads import** (`e2e/import.spec.ts`): uploads `scripts/test/fixtures/goodreads.csv` and checks
   the shelves (2 Finished, 1 Reading, 1 Paused, 2 Did not finish).
4. **Accessibility** (`@axe-core/playwright`): landing, shelf, circle and settings, inside flow 1. The
   check fails on serious or critical WCAG A/AA violations.

## Test-only paths (all off in production)

- **Email**: a new `MAIL_OUTBOX_DIR` setting in `lib/mailer.ts` writes each message to a JSON file
  instead of sending it. The tests read the confirmation link from there, so sign-up goes through the
  real verify-email route. `mailTransportFor` ignores the setting when `NODE_ENV` is production (unit
  test added), and `next build`/`next start` always run as production.
- **Stripe, AI, Hardcover, UploadThing, OAuth, Sentry**: `with-test-db.mjs` gains
  `WITH_TEST_DB_BLANK`, which blanks the named keys. The app then takes its own "not configured"
  paths: no checkout, AI returns "unavailable", search uses Open Library only. Nothing in the flows
  clicks billing or upload.
- **Rate limits**: they key on `x-forwarded-for`, so each browser context sends a random one. No app
  change is needed.
- No sign-in bypass. Readers sign up through the UI with generated `@bookmark.test` addresses and
  random passwords. No seed or real accounts are used, and nothing is deleted from the shared test
  database.

## CI

A new job, `e2e`, in `.github/workflows/ci.yml`, run on pull requests to main. It starts a single-node
MongoDB replica set in Docker (Prisma on MongoDB needs one). `with-test-db.mjs` now falls back to the
environment when there's no `.env.local`. The job pushes the schema and runs the suite on Chromium, then
uploads the Playwright report when a run fails.

## Known limits

- The phone project uses Chrome's desktop user agent at 375px, so "Copy invite link" goes through the
  clipboard. A real phone's user agent opens the share sheet instead, and Playwright can't drive that.
- The import's Open Library matching is live. Unmatched rows are still imported as typed, so the
  shelf checks hold either way. A slow Open Library only slows the test down.

## Found while building it (fixed in this PR)

- **Signed in, but onboarding said "Sign in to see your account".** Confirming the email, password
  sign-in and resetting a password each navigate client-side. The signed-out `/api/user` answer stayed
  in SWR's cache, so `/new-user` stayed on the signed-out state until the tab regained focus. Each now
  refetches `/api/user` before moving on.
- **Axe (serious, WCAG 2.5.3)**: the Currently reading card's progress button had an `aria-label`
  that hid its visible "Page x of y · n%". The extra context is now screen-reader-only text added to
  the visible counts.
