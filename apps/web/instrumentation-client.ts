import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// Error monitoring in the browser (BOO-54). Next loads this file before the app in every page. No
// session replay: it would record what readers type, reviews included.
Sentry.init(sentryOptions);

// Lets Sentry time client-side navigations, for the request traces the 5xx alert reads.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
