import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// Starts error monitoring on the server and in middleware (BOO-54). Next 14 needs the instrumentation hook,
// which withSentryConfig switches on. The browser's copy is instrumentation-client.ts.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") Sentry.init(sentryOptions);
}
