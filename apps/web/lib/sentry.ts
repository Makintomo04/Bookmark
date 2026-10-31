import { scrubBreadcrumb, scrubEvent } from "@bookmark/shared/errorScrub";

// Error monitoring (BOO-54, docs/ops/error-monitoring.md). The options every runtime shares: the server and
// edge runtimes (instrumentation.ts) and the browser (instrumentation-client.ts).
//
// Off unless NEXT_PUBLIC_SENTRY_DSN is set, so local dev and tests send nothing. The release is the git
// commit, injected at build time by withSentryConfig (next.config.mjs). Personal data is stripped twice:
// sendDefaultPii is off, and every event and breadcrumb goes through the shared scrubber.

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

// Vercel's production / preview / development. NEXT_PUBLIC_VERCEL_ENV is the copy the browser can read.
const environment = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;

// Tracing feeds the 5xx alert (failure rate of requests). Every request in previews, a tenth in production.
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? (environment === "production" ? 0.1 : 1));

export const sentryOptions = {
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment,
  tracesSampleRate,
  sendDefaultPii: false,
  beforeSend: <T extends object>(event: T) => scrubEvent(event),
  beforeSendTransaction: <T extends object>(event: T) => scrubEvent(event),
  beforeBreadcrumb: <T extends object>(breadcrumb: T) => scrubBreadcrumb(breadcrumb),
};
