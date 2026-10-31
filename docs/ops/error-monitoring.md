# Error monitoring

Sentry collects errors from the web server, the browser and the phone app (BOO-54). Each event is tagged
with its release and environment, has a readable stack trace from the uploaded source maps, and carries no
personal data. Everything is off until the DSNs below are set, so local development and tests send nothing.

## How it fits together

| Where | Set up in | Release | Environment |
| --- | --- | --- | --- |
| Web server and middleware | `apps/web/instrumentation.ts` | git commit (`VERCEL_GIT_COMMIT_SHA`) | `VERCEL_ENV` |
| Browser | `apps/web/instrumentation-client.ts`, plus `global-error.tsx` and `ErrorState.tsx` for errors React boundaries catch | same commit | `NEXT_PUBLIC_VERCEL_ENV` |
| iOS and Android | `apps/mobile/src/lib/sentry.ts`, `Sentry.wrap` in `src/app/_layout.tsx` | `<bundle id>@<version>+<build>` | `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, set per profile in `eas.json` |

Shared options are in `apps/web/lib/sentry.ts`. `next.config.mjs` wraps the config in `withSentryConfig`,
which instruments route handlers and pages, injects the release, and uploads source maps when
`SENTRY_AUTH_TOKEN` is set. It then deletes them from the deploy so they're never public. On mobile, the
`@sentry/react-native/expo` plugin (`app.config.ts`) and `getSentryExpoConfig` (`metro.config.js`) upload
source maps and native debug symbols during EAS builds.

### Personal data

`sendDefaultPii` is off, and every event, transaction and breadcrumb goes through
`packages/shared/src/errorScrub.ts` (tests: `apps/web/scripts/test/errorScrub.test.ts`):

- the user is cut down to their id. No email, username or IP.
- request cookies and bodies are dropped, and so is every header except a short allow list.
- fields named like an email, token, password, secret, cookie, review, comment, note, bio, body or text
  become `[Filtered]` at any depth.
- in every string, email addresses, bearer and JWT tokens, secret query parameters, and quoted values after
  those field names are replaced. Prisma prints a failed call's arguments, so a failed review save would
  otherwise carry the review.

There's no session replay, and the phone app never attaches screenshots or the view tree. If you add a new
kind of free text (a new field readers type into), add its name to `SENSITIVE_KEY` and `QUOTED_AFTER_KEY`.

## Setting it up (once, needs Michael's Sentry account)

1. In Sentry, create an organisation and two projects: `bookmark-web` (platform Next.js) and
   `bookmark-mobile` (React Native). In each project's settings, under Security & Privacy, leave
   "Data scrubber" and "Use default scrubbers" on and turn "Store IP addresses" off.
2. Create an organisation auth token (Settings → Auth Tokens) with the `project:releases` and `org:read`
   scopes. This is the only secret.
3. **Vercel** (Project → Settings → Environment Variables, for Production and Preview):

   | Variable | Value | Secret |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SENTRY_DSN` | `bookmark-web`'s DSN (Project Settings → Client Keys) | no, DSNs are public |
   | `SENTRY_ORG` | the organisation slug | no |
   | `SENTRY_PROJECT` | `bookmark-web` | no |
   | `SENTRY_AUTH_TOKEN` | the token from step 2 | **yes**, mark it Sensitive |
   | `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | optional; defaults to `0.1` in production and `1` elsewhere | no |

   Leave "Automatically expose System Environment Variables" on, so the browser gets `NEXT_PUBLIC_VERCEL_ENV`.
4. **EAS** (expo.dev → project → Environment variables, for `preview` and `production`):

   | Variable | Value | Visibility |
   | --- | --- | --- |
   | `EXPO_PUBLIC_SENTRY_DSN` | `bookmark-mobile`'s DSN | plain text |
   | `SENTRY_ORG` | the organisation slug | plain text |
   | `SENTRY_PROJECT` | `bookmark-mobile` | plain text |
   | `SENTRY_AUTH_TOKEN` | the token from step 2 | **secret** |

   Development builds skip the upload (`SENTRY_DISABLE_AUTO_UPLOAD` in `eas.json`), so they don't need the
   token. A preview or production build without it fails at the upload step, which is deliberate: it
   would otherwise ship unreadable stack traces.
5. Add the alerts below.

## Alerts

Set up in Sentry (Alerts → Create Alert), all sent to Michael by email (and the Sentry app, if installed):

| Alert | Project | Rule |
| --- | --- | --- |
| New kind of error | both | Issue alert: "A new issue is created", environment `production`. A second copy for `preview` is optional. |
| Regression | both | Issue alert: "The issue changes state from resolved to unresolved". |
| 5xx spike | `bookmark-web` | Metric alert on transactions: `failure_rate()`, environment `production`, over 5 minutes. Critical above 5%, warning above 2%, resolve below 1%. `failure_rate` counts responses with a 5xx status (and timeouts). |
| Error burst | `bookmark-web` | Metric alert on errors: `count()` of `event.type:error`, over 5 minutes, critical above 25. Catches failures that don't end the request, such as a background email. |
| Crash-free sessions | `bookmark-mobile` | Metric alert: crash-free session rate below 99% over 1 hour. |

## Checking it works

After a deploy (do this on the first preview with the variables set):

1. Sign in on the preview as an admin and open `/staff/monitoring` (not in the staff tabs).
2. Press **Throw on the server**, then **Throw in the browser**.
3. In Sentry, `bookmark-web` → Issues, both test errors appear within a minute or so. Check each one:
   - **Release** is the deploy's commit, **environment** is `preview`.
   - The stack trace shows TypeScript file names and lines (`app/api/staff/monitoring-test/route.ts`,
     `app/components/staff/StaffMonitoring.tsx`), not minified code.
   - **User** is an id only. No email, cookies or `authorization` header.
4. For the phone app, install a `preview` build, sign in as an admin, then Settings → Error monitoring →
   **Send a test error**. Check the same in `bookmark-mobile`.
5. Resolve the test issues.
