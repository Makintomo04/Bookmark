# Shipping the Bookmark app

What's left between the code in `apps/mobile` and the app being live on the App Store and Google Play,
in the order it has to happen. The listing copy and the privacy answers are in [app-store.md](app-store.md)
and [google-play.md](google-play.md).

## Start now: these take the longest

1. **Apple Developer Program** ($99 a year). Enrol as an organisation if Bookmark is a company: the
   seller name on the App Store comes from it, and a D-U-N-S number takes a week or two.
2. **Google Play Console** ($25 once). A new *personal* account must run a closed test with at least
   12 testers for 14 days in a row before it can publish to production. An organisation account skips
   that. If it's personal, start the closed test as soon as the first build is in.
3. **Legal review of the privacy policy and terms.** Both pages still say "LEGAL REVIEW NEEDED", and both
   stores link to them. The privacy policy has a draft covering the apps; [privacy-changes.md](privacy-changes.md)
   lists every change and the questions for the reviewer.
4. **The deletion page.** Google Play needs a web link where anyone can find out how to delete their
   account. [/delete-account](../../apps/web/app/(main)/delete-account/page.tsx) is drafted; it goes in
   the Data safety form once it's been reviewed and `SUPPORT_EMAIL` is set.

## Accounts and services

- **EAS:** `cd apps/mobile && eas init`, then set `EAS_PROJECT_ID`. Create the EAS environments
  `development`, `preview` and `production` with the variables in [apps/mobile/README.md](../../apps/mobile/README.md),
  pointing `EXPO_PUBLIC_API_URL` at the right site for each.
- **App Store Connect:** create the app with bundle id `app.bookmark.mobile` (or whatever `IOS_BUNDLE_ID`
  is), then put its Apple ID in `apps/mobile/eas.json` as `submit.production.ios.ascAppId`.
  - Enable Sign in with Apple and Associated Domains on the identifier.
  - Create an APNs key for push and upload it to EAS (`eas credentials`).
- **Play Console:** create the app with package `app.bookmark.mobile`. Make a service account with release
  access and save its JSON key as `apps/mobile/google-play-service-account.json` (gitignored) for
  `eas submit`. Copy the app signing certificate's SHA-256 into `ANDROID_SHA256_CERTS` on the server, so
  app links verify.
- **Subscriptions:** in both stores, an auto-renewing subscription group "Bookmark Plus" with three
  products: monthly, yearly, and the Founding Reader yearly price. Free trial as an introductory offer,
  matching the web's 14 days.
- **RevenueCat:** one project with both apps, the entitlement `plus` attached to all three products, and a
  current offering with a monthly package, an annual package, and a custom package whose identifier
  contains `founding`.
  - Set the webhook to `https://<site>/api/billing/revenuecat` with an Authorization value, saved on the
    server as `REVENUECAT_WEBHOOK_AUTH`.
  - Save the secret API key as `REVENUECAT_SECRET_API_KEY`, and the Founding product ids as
    `STORE_PRODUCTS_FOUNDING`.
  - The two public SDK keys go in EAS as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `_ANDROID_KEY`.
- **Server env for sign-in and links:** `APPLE_BUNDLE_ID`, `GOOGLE_MOBILE_CLIENT_IDS`, `APP_DOMAIN` and
  `ANDROID_SHA256_CERTS` (listed in the Phase 1 commit).

## Building and submitting

```bash
cd apps/mobile
eas build --profile development --platform all     # dev client, for testing on your own phones
eas build --profile preview --platform android     # an APK to pass around
eas build --profile production --platform all      # store builds
eas submit --profile production --platform ios     # to TestFlight
eas submit --profile production --platform android # to Play's internal track, as a draft
```

Then: TestFlight internal testers, Play internal testing, the Play closed test (if the account needs it),
then production in both.

## The review account

Reviewers sign in to the live app, so the account lives in the production database:

```bash
cd apps/web
REVIEW_EMAIL=review@<your domain> REVIEW_PASSWORD=<12+ characters> node scripts/seed-review-account.ts --production
```

It's safe to run again before each submission: it puts the shelf, the friend and the reading circle
back as they were. Put the email and password in the review notes ([app-store.md](app-store.md#review-notes)).
Use an address you can receive mail at, in case a reviewer tries the emailed sign-in link.

## Still to check on a real phone

Nothing below can be tested in the browser build. A development build on one iPhone and one Android
phone covers it:

- Sign in with Apple and with Google, and universal and app links (an invite link opening the app).
- Push notifications arriving, and opening the right screen.
- A sandbox purchase, restore, and `/api/plus/store-sync` turning Plus on; then cancelling in the store.
- The data export's share sheet, and picking a CSV from Files or Drive.
- Icons on the home screen (including Android's themed icon), and the splash.
