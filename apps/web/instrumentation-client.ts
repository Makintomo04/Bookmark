import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// Error monitoring in the browser (BOO-54). withSentryConfig adds this file to every page's bundle. No
// session replay: it would record what readers type, reviews included.
Sentry.init(sentryOptions);
