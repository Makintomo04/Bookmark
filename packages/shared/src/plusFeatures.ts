import { MONTHLY_ALLOWANCES } from "./entitlements";

// The free and Plus columns, from the strategy's table. Shared by the web's /plus and the
// mobile app's Plus screen, so both make the same claims. Every line here has to match something
// the app does today (App Store 3.1.2, UK consumer law). Nothing goes in a *_SOON list unless it's
// built and switched off; scripts/test/plusFeatures.test.ts holds them empty until then.
export const FREE = [
  'Import from Goodreads and StoryGraph',
  'Every personal stat, your Wrapped and a yearly goal',
  'A monthly Wrap card for any month, and your monthly pace',
  'Join any circle: every comment, reply and reaction',
  'Host one active reading circle at a time',
  'Reviews, notes, lists, feed, follows and privacy controls',
  'DNF, paused, re-reads, quarter stars and medals',
  'Export all your data, always',
  // AI starts off on a free account (preferences.ts), so "opt-in" is true here.
  `Ask the shelf: ${MONTHLY_ALLOWANCES.askShelfSearches.free} mood searches a month (opt-in AI)`,
]
export const FREE_SOON: string[] = []

// Supporting Bookmark leads, then hosting and goals. AI comes last. It's on by default with Plus
// (preferences.ts), so these lines never call it opt-in.
export const PLUS = [
  'Everything in Free',
  'Keep Bookmark independent and ad-free, with a supporter badge on your profile',
  'Host as many active circles as you like',
  'A page goal and your own monthly target',
  `Ask the shelf: up to ${MONTHLY_ALLOWANCES.askShelfSearches.plus} mood searches a month`,
  `Catch me up: recaps of the story so far, up to ${MONTHLY_ALLOWANCES.recaps.plus} a month`,
  'AI features are on with Plus. Switch them off any time in Settings.',
]
export const PLUS_SOON: string[] = []
