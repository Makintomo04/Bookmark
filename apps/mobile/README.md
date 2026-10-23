# Bookmark for iOS and Android

The Expo (React Native) app. It talks to the web app's API in `apps/web`, signs in with a bearer
token (`apps/web/lib/mobileAuth.ts`), and shares rules and colours with the web through
`packages/shared`.

## Running it

From the repo root, once: `pnpm install`.

- **In a browser (quickest, for layout and flows):** start the web app (`pnpm dev`, port 3000), then
  `pnpm --filter @bookmark/mobile web`. `next dev` allows the app's web build (port 8081) to call the API.
- **On a phone or emulator:** sign-in with Google, Sign in with Apple and push need native code, so use a
  development build rather than Expo Go:
  `cd apps/mobile && npx eas-cli@latest build --profile development --platform android` (or `ios`;
  EAS builds iOS in the cloud, no Mac needed), install it, then `pnpm --filter @bookmark/mobile start`.

To point the app at another API, put `EXPO_PUBLIC_API_URL=...` in `apps/mobile/.env.local`. Locally it
defaults to `http://localhost:3000` (`http://10.0.2.2:3000` on the Android emulator).

## Settings

Public values (`EXPO_PUBLIC_*`) are built into the app. The rest are only read by `app.config.ts` at build
time. Set them as EAS environment variables.

| Variable | What it's for |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | The Bookmark site the app talks to |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Native Google sign-in (the button is hidden without them) |
| `GOOGLE_IOS_URL_SCHEME` | The reversed iOS client id, for the Google sign-in config plugin |
| `EAS_PROJECT_ID` | Set by `eas init`; push tokens need it |
| `APP_DOMAIN` | The site's host, for universal and app links |
| `IOS_BUNDLE_ID`, `ANDROID_PACKAGE` | Default `app.bookmark.mobile` |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat's public SDK keys. Without them, the Plus screen has no paywall |

RevenueCat's current offering needs a monthly package, an annual package, and a custom package whose
identifier contains `founding`, all on the `plus` entitlement. On the server, `REVENUECAT_SECRET_API_KEY`
lets `/api/plus/store-sync` switch Plus on as soon as a purchase or restore finishes; without it, Plus
waits for the webhook.

The server side of each one is listed in the Phase 1 commit message (`APPLE_BUNDLE_ID`,
`GOOGLE_MOBILE_CLIENT_IDS`, `ANDROID_SHA256_CERTS`, and so on).

## Layout

- `src/app`: screens, by Expo Router's file routes. `(auth)` is signed out, `(tabs)` is the app, `setup`
  is onboarding, and `open/signin` and `signin/link` are where emailed sign-in links land.
- `src/lib`: the API client (`api.ts`), session (`auth.ts`), theme (`theme.ts`), push and native sign-in.
- `src/components/ui`: the building blocks every screen uses (text, buttons, fields, the screen frame).
