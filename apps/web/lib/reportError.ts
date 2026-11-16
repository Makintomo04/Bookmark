// Reports an error the app caught itself to Sentry (BOO-54), on the server or in the browser.
//
// The SDK is only loaded when NEXT_PUBLIC_SENTRY_DSN is set. Next writes that value into the code at build
// time, so without a DSN (local dev, the e2e suite) the branch is dead and webpack never compiles the SDK:
// importing it everywhere added about 2,700 modules to every route and made the e2e suite time out.
export function reportError(error: unknown) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }
}
