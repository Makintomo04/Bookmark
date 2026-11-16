import { sentryOptions } from "@/lib/sentry";

type Sentry = typeof import("@sentry/nextjs");

// Error monitoring in the browser (BOO-54). Next loads this file before the app in every page. No
// session replay: it would record what readers type, reviews included. Without a DSN the SDK isn't
// even compiled (see lib/reportError.ts); with one, it loads straight away as its own chunk.
let sentry: Sentry | undefined;
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init(sentryOptions);
    sentry = Sentry;
  });
}

// Lets Sentry time client-side navigations, for the request traces the 5xx alert reads.
export function onRouterTransitionStart(...args: Parameters<Sentry["captureRouterTransitionStart"]>) {
  sentry?.captureRouterTransitionStart(...args);
}
