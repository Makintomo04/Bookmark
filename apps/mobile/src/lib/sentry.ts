import * as Sentry from "@sentry/react-native";
import { scrubBreadcrumb, scrubEvent } from "@bookmark/shared/errorScrub";

// Crash and error reporting (BOO-54, docs/ops/error-monitoring.md). Off unless EXPO_PUBLIC_SENTRY_DSN is set
// (EAS environment variables), so local builds send nothing. The release is the SDK's default,
// <bundle id>@<version>+<build number>, and EAS builds upload the matching source maps (app.config.ts).
// Personal data is stripped twice: sendDefaultPii is off, and every event and breadcrumb goes through the
// scrubber the web app uses too.

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || undefined;

export function startSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !!SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? "development" : "production"),
    sendDefaultPii: false,
    // Screenshots and the view tree would show reviews, comments and names on screen.
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

// Ties reports to an account by its opaque id only, so Sentry can count how many readers an error hits.
export function setSentryUser(id: string | null | undefined) {
  Sentry.setUser(id ? { id } : null);
}

// Settings' "Send a test error", for admins checking a new build reports (docs/ops/error-monitoring.md).
export function sendTestError() {
  return Sentry.captureException(new Error(`Bookmark test error from the app, ${new Date().toISOString()}`));
}

export const wrapRoot = Sentry.wrap;
