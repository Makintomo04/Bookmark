import { sentryOptions } from "@/lib/sentry";

type CaptureRequestError = typeof import("@sentry/nextjs").captureRequestError;

// Starts error monitoring on the server and in middleware (BOO-54). The browser's copy is
// instrumentation-client.ts. Without a DSN the SDK isn't even compiled (see lib/reportError.ts).
export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init(sentryOptions);
  }
}

// Errors thrown while rendering a server component or running a route handler or server action.
export async function onRequestError(...args: Parameters<CaptureRequestError>) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(...args);
  }
}
