# BOO-54 Error monitoring and an alert on 5xx spikes

**Goal.** Every unhandled error on the web server, in the browser and in the phone app reaches one Sentry
organisation, tagged with the release that shipped it, with readable stack traces and no personal data.
Michael is alerted on a new kind of error and on a spike in 5xx responses.
**Why it blocks launch.** Launch audit OPS-01: today `app/global-error.tsx` only logs to the console and the
Expo app has no crash reporting, so we would launch blind. It goes first so the other launch tickets'
rollout is measured.

**Effort: S.** Two SDKs, one shared scrubber, env docs, and the alert rules (set in Sentry, not in code).

## What exists today (verified in this worktree)

- No monitoring package in `apps/web/package.json` (only `@vercel/analytics` and `@vercel/speed-insights`).
- `apps/web/app/global-error.tsx:37-39` does `console.error(error)` and nothing else.
- No `instrumentation.ts`. (Written against Next 14.2; main has since moved to Next 15.5, so the setup uses
  Next 15's `onRequestError` and `onRouterTransitionStart` hooks.) The Sentry build wrapper is applied to
  production builds only, because under `next dev` it caused constant Fast Refresh rebuilds.
- Only a handful of route handlers catch and return 500 themselves (`mobile/upload`, `mobile/auth/magic-link`,
  `register`, `user` DELETE). Everything else throws, which Sentry sees.
- Expo SDK 58, `apps/mobile/src/app/_layout.tsx` is the root. EAS profiles `development`, `preview`,
  `production` in `apps/mobile/eas.json`. No `expo-updates` in the app.

## Design decisions

1. **Sentry**, one organisation, two projects: `bookmark-web` (Next.js: server, edge and browser) and
   `bookmark-mobile` (React Native). Free/Team plan covers launch volume.
2. **Off unless configured.** Every `Sentry.init` is gated on its DSN env var, so local dev, tests and forks
   send nothing. The build only uploads source maps when `SENTRY_AUTH_TOKEN` is set.
3. **Releases.** Web: the git commit (`VERCEL_GIT_COMMIT_SHA`, which the Sentry build plugin picks up and
   injects into server and client bundles). `environment` is `VERCEL_ENV` (production / preview / development).
   Mobile: the SDK's default `<bundle id>@<version>+<build number>`; `environment` comes from
   `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, set per EAS profile in `eas.json`.
4. **Source maps.** Web: `withSentryConfig` uploads them during `next build` on Vercel and deletes them from
   the deploy so they're never public. Mobile: the `@sentry/react-native/expo` config plugin uploads them in
   EAS builds; Metro uses `getSentryExpoConfig` so debug ids match.
5. **PII.** `sendDefaultPii: false` everywhere, plus one shared, pure scrubber
   (`packages/shared/src/errorScrub.ts`) run in `beforeSend`, `beforeSendTransaction` and `beforeBreadcrumb`:
   - `user` is cut down to `id` (an opaque ObjectId); no email, username or IP.
   - request cookies, `authorization` and other non-allow-listed headers, and request bodies are dropped.
   - any field named like an email, token, password, secret, cookie, review, comment, note, bio, body or
     text is replaced with `[Filtered]`, at any depth.
   - in every string: email addresses, bearer/JWT tokens, secret query parameters (`token`, `code`, `email`,
     `callbackUrl`…), and quoted values after those keys (Prisma prints its arguments in error messages, so
     a failed review update would otherwise carry the review) are replaced.
   - No session replay. Tracing at 10% in production (`SENTRY_TRACES_SAMPLE_RATE` overrides), which is what
     the 5xx alert counts.
6. **Test errors.** Admin-only (`staff.log`): `/staff/monitoring` has buttons that throw on the server
   (`POST /api/staff/monitoring-test`) and in the browser; the mobile settings screen shows "Send a test
   error" to admins. Not linked from the staff nav.
7. **Alerts** (Sentry UI, documented in `docs/ops/error-monitoring.md`):
   - Issue alert, both projects: "A new issue is created" → email Michael.
   - Metric alert, `bookmark-web`: `failure_rate()` of transactions above 5% over 5 minutes (critical),
     2% (warning) → email Michael. `failure_rate` counts responses with a 5xx status.
   - Metric alert, `bookmark-web`: errors (`event.type:error`) above 25 in 5 minutes → email Michael.

## Changes

- `packages/shared/src/errorScrub.ts`: the scrubber. Tests in `apps/web/scripts/test/errorScrub.test.ts`.
- `apps/web`: `@sentry/nextjs`; `lib/sentry.ts` (shared options), `instrumentation.ts` (server and edge),
  `instrumentation-client.ts` (browser); `next.config.mjs` wrapped in `withSentryConfig`; `global-error.tsx`
  and `ErrorState.tsx` (the segment boundaries) call `Sentry.captureException`, since React boundaries
  swallow errors; the few route handlers that catch and log an error report it too; the test route and page.
- `pnpm-workspace.yaml`: allow `@sentry/cli`'s install script, which fetches the binary that uploads source maps.
- `apps/mobile`: `@sentry/react-native`; config plugin in `app.config.ts`; `metro.config.js`;
  `src/lib/sentry.ts` and `Sentry.wrap` in `_layout.tsx`; settings test button; `eas.json` environments.
- Docs: `docs/ops/error-monitoring.md` (setup, env vars, alerts, verifying), the root README and
  `apps/mobile/README.md` env tables.

## Env vars (none committed)

| Where | Variable | Secret? |
| --- | --- | --- |
| Vercel (all envs) | `NEXT_PUBLIC_SENTRY_DSN` | No (DSNs are public) |
| Vercel (all envs) | `SENTRY_AUTH_TOKEN` | **Yes** (org auth token, `project:releases` + `org:read`) |
| Vercel | `SENTRY_ORG`, `SENTRY_PROJECT` (`bookmark-web`) | No |
| EAS (preview, production) | `EXPO_PUBLIC_SENTRY_DSN` | No |
| EAS (preview, production) | `SENTRY_AUTH_TOKEN` | **Yes**, as an EAS secret |
| EAS | `SENTRY_ORG`, `SENTRY_PROJECT` (`bookmark-mobile`) | No |

## Verifying

Needs Michael's Sentry account: create the org and two projects, set the env vars, deploy a preview, sign in
as an admin, open `/staff/monitoring`, press both buttons, and check that both issues arrive with a release,
`environment: preview`, a readable stack trace and no email. Same for the mobile preview build via settings.
