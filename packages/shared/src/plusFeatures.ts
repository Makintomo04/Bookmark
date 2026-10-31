import { MONTHLY_ALLOWANCES } from "./entitlements";

// The free and Plus columns, from the strategy's table. Shared by the web's /plus and the
// mobile app's Plus screen, so both make the same claims. Every line here has to match something
// the app does today (App Store 3.1.2, UK consumer law). Nothing goes in a *_SOON list unless it's
// built and switched off; scripts/test/plusFeatures.test.ts holds them empty until then.
export const FREE = [
  'Import from Goodreads and StoryGraph',
  'Every stat on your stats page, and your Wrapped',
  'A yearly goal and your monthly pace',
  'Wrap cards for any month or year: your cover grid and your stats, in 9:16, 4:5 and 1:1',
  'Join any circle: every comment, reply and reaction',
  'Host one active reading circle at a time',
  'Reviews, notes, lists, feed, follows and privacy controls',
  'DNF, paused, re-reads, quarter stars and medals',
  'Export all your data, always',
  // AI starts off on a free account (preferences.ts), so "opt-in" is true here.
  `Ask the shelf: ${MONTHLY_ALLOWANCES.askShelfSearches.free} mood searches a month (opt-in AI)`,
]
export const FREE_SOON: string[] = []

// Supporting Bookmark leads, then digging into your stats, hosting and goals. AI comes last. It's on by default with Plus
// (preferences.ts), so these lines never call it opt-in.
export const PLUS = [
  'Everything in Free',
  'Keep Bookmark independent and ad-free, with a supporter badge on your profile',
  'Explore your stats: any dates, two periods side by side, and filters by format, genre, mood, spice, author and re-reads',
  'Saved stat views, a CSV of any chart, and Wrap cards for any dates you pick',
  'Host as many active circles as you like',
  'A page goal and your own monthly target',
  'Two more designs for your Wrap cards: Paper and your own colour',
  `Ask the shelf: up to ${MONTHLY_ALLOWANCES.askShelfSearches.plus} mood searches a month`,
  `Catch me up: recaps of the story so far, up to ${MONTHLY_ALLOWANCES.recaps.plus} a month`,
  'AI features are on with Plus. Switch them off any time in Settings.',
]
export const PLUS_SOON: string[] = []
