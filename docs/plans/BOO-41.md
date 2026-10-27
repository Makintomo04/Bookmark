# BOO-41 Plus page calls live features "soon" (and promises unbuilt ones)

**Goal.** Every claim on the paywall (web `/plus`, mobile Plus screen, store listings, upgrade prompts) matches what the app does today.
**Why it blocks launch.** App Store guideline 3.1.2 needs the paywall to describe accurately what the subscriber gets. UK consumer law (CPRs, DMCC Act 2024) treats a misleading claim about a paid service as an unfair practice. Today the paywall labels two live features "Coming soon" and lists one that isn't built.

**Effort: S.** Copy changes in one shared file and four components, plus one guard test. No schema changes. One product question (Q1) could add a small code change.

## What exists today (verified in this worktree)

- `packages/shared/src/plusFeatures.ts:16-19` (`FREE_SOON`) and `:28-33` (`PLUS_SOON`) list Ask the shelf and Catch me up as "soon". **Both are live, on web and mobile:**
  - **Ask the shelf.** `app/api/discover/ask/route.ts:59` meters it with `consumeAllowance`. Pages: `app/(main)/discover/ask/page.tsx` and `apps/mobile/src/app/(app)/discover/ask.tsx`.
  - **Catch me up.** `app/api/books/[bookId]/recap/route.ts` serves it, and `lib/recap.ts` meters it. Shown in `components/modals/BookUpdateModal.tsx:599` and `apps/mobile/src/components/books/CatchMeUp.tsx`.
  - **Allowances.** `MONTHLY_ALLOWANCES` (`packages/shared/src/entitlements.ts:28-31`) gives Ask the shelf 5 free / 100 Plus and Catch me up 3 free / 30 Plus. `lib/ai/usage.ts:110` enforces them, and both Plus screens already show what's left (mobile `plus.tsx:101`).
- Consumers of the lists: `apps/web/app/components/plus/PlusPricing.tsx:147,175` and `apps/mobile/src/app/(app)/plus.tsx:79-80` (render :262-265).
- More stale copy the ticket didn't name:
  - `PlusPricing.tsx:100` and `plus.tsx:71` both say "with AI recaps on the way".
  - `entitlements.ts:25`: comment says "AI slices that come later".
  - `entitlements.ts:143`: `FEATURE_COPY.askShelfSearches.title` is **"Ask the shelf, without limits"**. That contradicts both the rule at :26-27 ("never 'unlimited'") and the 100-a-month cap. The 402 upgrade prompt shows this text.
- `apps/web/app/components/wrapped/wrappedImage.tsx:81` says "A month's card (Plus)". The card is free: `app/api/wrap/monthly/route.tsx:10-12` says "Free for everyone". The ticket is right.
- `terms/page.tsx:61` says "coming soon" features aren't part of what you pay for. That protects us legally, but it doesn't make listing them on the paywall acceptable to App Review.

## Claim-by-claim audit

| Where | Claim | Status | Proposed |
|---|---|---|---|
| FREE | Import from Goodreads and StoryGraph | Shipped (`lib/import/formats.ts:21-22`) | keep |
| FREE | Every personal stat, your Wrapped and a yearly goal | Shipped | keep |
| FREE | A monthly Wrap card for any month, and your monthly pace | Shipped (`api/wrap/monthly`) | keep |
| FREE | Join any circle: every comment, reply and reaction | Shipped | keep |
| FREE | Host one active reading circle at a time | Shipped (`buddyReadsServer.ts:102`) | keep |
| FREE | Reviews, notes, lists, feed, follows and privacy controls | Shipped | keep |
| FREE | DNF, paused, re-reads, quarter stars and medals | Shipped (quarter stars: `StarRating.tsx:34-38`) | keep |
| FREE | Export all your data, always | Shipped | keep |
| FREE_SOON | Ask the shelf: 5 mood searches a month | **Shipped**; allowance cut to 3 (Q4) | move to FREE: "Ask the shelf: 3 mood searches a month (opt-in AI)" |
| FREE_SOON | Catch me up: 3 recaps a month | **Shipped**; becomes Plus-only (Q4) | **remove from FREE** |
| PLUS | Independent and ad-free, with a supporter badge on your profile | Shipped. Badge on web `ProfileHeader.tsx`. **Mobile profiles don't show it** (no supporter code in `apps/mobile/src`). | keep; the badge is on the profile, which web shows. See Q3. |
| PLUS | Host as many active circles as you like | Shipped | keep |
| PLUS | A page goal and your own monthly target | Shipped (`api/reading-goal/route.ts:35`) | keep |
| PLUS_SOON | Your say on the roadmap, and early access to new features | **Not built** (BOO-15) | **remove** |
| PLUS_SOON | More Wrap card designs | **Not built** (`entitlements.ts:45` "planned"; no UI reads `customWrapDesigns`) | **remove** for launch (Q2) |
| PLUS_SOON | Ask the shelf: up to 100 a month (opt-in AI) | **Shipped**, but AI is on by default for Plus (Q1), so "opt-in" is untrue here | move to PLUS: "Ask the shelf: up to 100 mood searches a month" |
| PLUS_SOON | Catch me up: up to 30 a month (opt-in AI) | **Shipped**, same | move to PLUS: "Catch me up: up to 30 recaps a month" |
| PLUS (new line) | none | AI on by default with Plus (Q1) | add to PLUS: "AI features are on with Plus. Switch them off any time in Settings." |
| Plus header (web + mobile) | "…with AI recaps on the way." | Stale | "Plus lets you host more circles, set extra goals and use Ask the shelf and Catch me up more often. It never gates your stats, your import, or the circles your friends invite you to." |
| `FEATURE_COPY` | "Ask the shelf, without limits" | **Untrue** (cap of 100) | "More Ask the shelf searches" (message built from the allowances: 3 and 100) |
| `FEATURE_COPY.recaps` | "Catch me up more often" / "Free accounts get 3 recaps a month…" | Untrue once Catch me up is Plus-only (Q4) | title "Catch me up comes with Plus", message "Plus recaps the story so far when you come back to a book: up to 30 a month." |
| App Store description (`docs/store/app-store.md:39-42`) | Plus "…AI features are opt-in… Ask the shelf…, Catch me up…" | Shipped, but it reads as if AI is Plus-only, and see Q1 on "opt-in" | "…set page and monthly goals, use Ask the shelf more often, and get Catch me up, which recaps the story so far when you come back to a book. A free account gets 3 Ask the shelf searches a month to try. AI features start off on a free account and come on with Plus, and you can switch them off any time in Settings. They're always labelled, and only ever do what you ask." |
| App Store description `:26` | "Set a schedule if your group likes one." | Shipped (schedules, **no reminders**) | keep; it doesn't promise reminders |
| Google Play (`docs/store/google-play.md`) | No feature claims about Plus beyond "a subscription" | OK | add the same long description as the App Store copy if the Play long description is drafted elsewhere |
| Landing FAQ (`components/landing/Landing.tsx:85`) | Free covers tracking, import, stats, Wrapped, circles, export; Plus hosts more | Shipped | keep |

**"Reading schedules with reminders" (BOO-11).** Not found in `plusFeatures.ts`, the Plus screens, the landing page or `docs/store` in this worktree. The only mention is the P2 product list in `docs/audit/launch-audit-2026-10-22.md:239`. Nothing to remove: the store copy promises schedules, which exist, and not reminders. **The ticket's premise is wrong here:** it is not currently claimed anywhere.

## Open questions for Michael
- **Q1 (AI opt-in). DECIDED by Michael, 27 Oct 2026: option (b).** `packages/shared/src/preferences.ts:12-13,44` defaults `aiFeatures` to **on for Plus** accounts that haven't chosen, and that stays. The copy changes instead, so no claim says "opt-in" about Plus:
  - Free lines can keep "(opt-in AI)", since AI starts off for free accounts.
  - Plus lines and the store paragraph say AI is on with Plus and can be switched off any time in Settings. It's always labelled and only does what you ask.
  - Don't change `preferences.ts` behaviour. Only make sure its comments match.
- **Q4 (free AI allowance). DECIDED by Michael, 27 Oct 2026:** free keeps Ask the shelf at **3 searches a month** (down from 5), and **Catch me up becomes Plus-only** (free allowance 0). Reasons: Ask the shelf helps new readers find a first book (BOO-52) and is the main Plus upsell; Catch me up mostly serves returning re-readers. This is now in scope here (see Changes). Readers who get Plus later, then lapse, can still open recaps they already have, since kept recaps are served free (`lib/recap.ts:424-425`).
- **Q2.** Drop "More Wrap card designs" entirely, or keep one honest line ("We're working on more Wrap card designs for Plus") outside the feature list? Recommendation: drop it. A paywall list should be things you get on day one.
- **Q3.** Should the mobile profile show the supporter badge before launch, given it's a stated Plus benefit and mobile is the main surface? A separate small ticket if yes.

## Changes

**Shared**
- `packages/shared/src/plusFeatures.ts`:
  - append the two AI lines to `FREE` and `PLUS` with the wording above, built from `MONTHLY_ALLOWANCES`
  - empty `FREE_SOON` and `PLUS_SOON`, keeping the exports so a later "soon" item has a home
  - rewrite the header comment: "Nothing goes in a *_SOON list unless it's built and switched off."
- `packages/shared/src/entitlements.ts`: fix the `:25` comment and the `:143` title.
- (Q4) `entitlements.ts:28-31`: `askShelfSearches: { free: 3, plus: 100 }`, `recaps: { free: 0, plus: 30 }`. Rewrite `FEATURE_COPY.recaps` as in the audit table. Check `allowanceLeft`/`hasAllowance` treat 0 as "none" (they do: `Math.max(0, 0 - used)`), and that nothing reads `free: 0` as "unlimited" (only `null` means that).
- (Q4) `plusFeatures.ts`: the FREE list gets only the Ask the shelf line. PLUS gets "Ask the shelf: up to 100 mood searches a month" and "Catch me up: recaps of the story so far, up to 30 a month".

**Catch me up for free readers (Q4)**
- Web `app/components/books/CatchMeUp.tsx` and mobile `components/books/CatchMeUp.tsx`: for a free reader with no kept recap, don't show a button that spends an allowance they don't have. Show one quiet line instead, "Catch me up comes with Plus", linking to /plus (web) or the Plus screen (app). Use the existing `UpgradePrompt`/`Notice` pattern, not a new modal. A kept recap still opens for anyone.
- `app/api/books/[bookId]/recap/route.ts`: no logic change. With `free: 0`, `catchMeUp` already refuses new ones through the allowance, so confirm it returns the same 402 `EntitlementError("recaps")` the UI expects, and that GET (`recapState`) still reports kept recaps.
- `api/plus/status/route.ts` and mobile `plus.tsx:101`: a free reader shows "Catch me up: with Plus", not "0 of 0 left".
- A reader's `aiFeatures` switch is unchanged: free readers still opt in to use their 3 searches.
- (Q1, option b) `packages/shared/src/preferences.ts`: no behaviour change. The comments at :12-13 and :37-38 already say "on by default on Plus"; leave them unless they've drifted.
- Settings (web and mobile): check the AI toggle's helper text says it's on with Plus and can be switched off, so the paywall promise points somewhere real.

**Web**
- `app/components/plus/PlusPricing.tsx:100`: new header line. `:147,175` already skip empty lists; check there is no stray gap.
- `app/components/wrapped/wrappedImage.tsx:81`: comment becomes "A month's card (free for everyone)".

**Mobile**
- `apps/mobile/src/app/(app)/plus.tsx:71`: the same header line. `Column` already copes with an empty `soon`.

**Docs/store**
- `docs/store/app-store.md:39-42`: the reworded Plus paragraph. Check that the App Store "promotional text" and the subscription display names (`docs/store/README.md:34`) make no other promises.

## Tests
- New `apps/web/scripts/test/plusFeatures.test.ts`:
  - no `FREE`/`PLUS` line contains "soon", "unlimited" or "without limits"
  - the AI lines contain the numbers from `MONTHLY_ALLOWANCES`, so a cap change can't leave the page behind
  - `FEATURE_COPY` titles and messages contain no "unlimited"/"without limits"
  - `PLUS_SOON` and `FREE_SOON` are empty: an explicit tripwire, deleted on purpose when something is staged
- (Q1, option b) In `plusFeatures.test.ts`: no `PLUS` line contains "opt-in", since AI is on by default for Plus. In `preferences.test.ts`: Plus with no choice is `true`, free is `false`, and an explicit `false` on Plus sticks.
- (Q4) `entitlements` tests: free has 3 Ask the shelf searches and 0 recaps; Plus has 100 and 30; `allowanceLeft(free, "recaps", 0) === 0`. A recap test with a stub source: a free reader with a kept recap gets it, and a free reader without one gets the allowance refusal and no model call.
- `pnpm test` in apps/web.

## Manual verification
1. Web `/plus` signed out, signed in free, and signed in Plus: no "Coming soon" pills. Both AI lines show in each column with the right numbers. Header copy updated.
2. Mobile Plus screen (Expo, iOS and Android): same lists, no "· Coming soon".
3. As free: spend the 3 Ask the shelf searches. The 402 prompt says "More Ask the shelf searches", with 3 and 100.
3b. (Q4) As free, on a book in progress: no "Catch me up" button, just "Catch me up comes with Plus" linking to Plus, on web and in the app. As Plus: a recap works and counts down from 30. Lapse a test Plus account: its kept recap still opens.
4. (Q1, option b) New Plus trial account: AI is on, Settings shows the toggle with the "switch off any time" wording, and switching it off sticks. A new free account starts with AI off.

## Out of scope
- Building schedule reminders (BOO-11), the roadmap/early-access perk (BOO-15) and Wrap designs.
- The mobile supporter badge (Q3).
- Store screenshots. Retake the Plus screen screenshot after this lands: it is the App Review screenshot (`app-store.md:59`).
