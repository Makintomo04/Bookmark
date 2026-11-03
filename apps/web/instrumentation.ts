import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// Starts error monitoring on the server and in middleware (BOO-54). The browser's copy is
// instrumentation-client.ts.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") Sentry.init(sentryOptions);
}

// Errors thrown while rendering a server component or running a route handler or server action.
export const onRequestError = Sentry.captureRequestError;
