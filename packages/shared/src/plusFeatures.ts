import { MONTHLY_ALLOWANCES } from "./entitlements";

// The free and Plus columns, from the strategy's table. Shared by the web's /plus and the
// mobile app's Plus screen, so both make the same claims. Features that haven't shipped yet say so:
// every claim on this page has to match something the app does.
export const FREE = [
  'Import from Goodreads and StoryGraph',
  'Every personal stat, your Wrapped and a yearly goal',
  'A monthly Wrap card for any month, and your monthly pace',
  'Join any circle: every comment, reply and reaction',
  'Host one active reading circle at a time',
  'Reviews, notes, lists, feed, follows and privacy controls',
  'DNF, paused, re-reads, half stars and medals',
  'Export all your data, always',
]
export const FREE_SOON = [
  `Ask the shelf: ${MONTHLY_ALLOWANCES.askShelfSearches.free} mood searches a month`,
  `Catch me up: ${MONTHLY_ALLOWANCES.recaps.free} recaps a month`,
]

// Supporting Bookmark leads, then hosting and goals. AI comes last and is opt-in.
export const PLUS = [
  'Everything in Free',
  'Keep Bookmark independent and ad-free, with a supporter badge on your profile',
  'Host as many active circles as you like',
  'A page goal and your own monthly target',
]
export const PLUS_SOON = [
  'Your say on the roadmap, and early access to new features',
  'More Wrap card designs',
  `Ask the shelf: up to ${MONTHLY_ALLOWANCES.askShelfSearches.plus} searches a month (opt-in AI)`,
  `Catch me up: up to ${MONTHLY_ALLOWANCES.recaps.plus} recaps a month (opt-in AI)`,
]
