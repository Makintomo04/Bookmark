# End-to-end smoke tests

Playwright flows covering what has to keep working at launch (BOO-57, plan in `docs/plans/BOO-57.md`):

- `signup-circle.spec.ts`: landing, register, onboarding, add a book, start a reading circle, copy the invite. It also runs the axe checks on the landing, circle, shelf and settings pages.
- `circle-unlock.spec.ts`: a second reader joins through the invite and posts at 50%. The host sees the comment locked, logs their progress and sees it unlocked.
- `import.spec.ts`: a Goodreads CSV lands on the right shelves.

Each flow runs at 375px (`mobile`) and at 1280px (`desktop`).

```bash
pnpm --filter @bookmark/web test:e2e
```

This starts `next dev` on port 3040 against the `bookmark-test` database through `scripts/with-test-db.mjs`, so locally it needs `apps/web/.env.local`. If a server is already running on that port, the tests reuse it. You can pick another port with `E2E_PORT`. To run one flow, use `-- --project=desktop circle-unlock`.

## What's stubbed

- **Email**: `MAIL_OUTBOX_DIR` makes `lib/mailer.ts` write each message to `e2e/.outbox/*.json` instead of sending it. The tests open the confirmation link from that folder. Production ignores the setting.
- **Stripe, Anthropic, Hardcover, UploadThing, Google/GitHub sign-in, Sentry**: these keys are blanked through `WITH_TEST_DB_BLANK` (`playwright.config.ts`). The app treats them as not configured.
- **Rate limits**: each browser context sends its own `x-forwarded-for`, so runs don't use up each other's limits.

Every reader is new: a random `@bookmark.test` address and password, signed up through the UI. Nothing is seeded and nothing is deleted. Open Library is still live, for the import's matching only. Rows it can't match are imported as typed.

## Screenshots for pull requests

`scripts/pr-screenshots.mjs` takes demo screenshots of a branch's work for its PR description. It signs in to a local test-DB dev server as a seeded reader (`circlehost` by default, from `scripts/seed-test-readers.ts`), shoots each page at 1280px and 375px in dark mode, and saves the PNGs to `e2e/.screenshots/<branch>/`, which git ignores.

```bash
node scripts/with-test-db.mjs node scripts/seed-test-readers.ts
node scripts/pr-screenshots.mjs --base http://localhost:3030 shelf=/u/circlehost circles=/circles
```

Look at the images, then run the same command with `--publish`. It commits them to the `pr-screenshots` branch on origin (an orphan branch that only holds images, one folder per feature branch) and prints a Markdown "Screenshots" section to paste into the PR. The links point at that commit, so a later run never changes an older PR's pictures.

For a dialog or a filled-in form, pass `--spec shots.mjs` instead of `name=/path` pairs. Its default export is a list of `{ name, path, caption?, sizes?, fullPage?, action? }`, and `action(page)` runs before the picture:

```js
export default [
  { name: "add-book", path: "/u/circlehost", caption: "Adding a book by hand",
    action: async (page) => { await page.getByRole("button", { name: "Add a book" }).first().click() } },
]
```

Other options: `--as <email>` (with `SHOT_PASSWORD` for anyone but the two seeded readers), `--signed-out`, `--sizes desktop`, `--out <dir>`. It refuses any `--base` that isn't localhost. In Git Bash, drop the leading slash (`shelf=u/circlehost`), since Bash turns `/u/...` into a Windows path.
