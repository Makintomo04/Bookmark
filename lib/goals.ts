import { z } from "zod";

// Reading goals: the yearly book count everyone has, plus the Plus goals (a page total for the year
// and a monthly pace). Pure, shared by /api/reading-goal, the profile widget and the stats page.

export const GOAL_BOOKS_MAX = 999;
export const GOAL_PAGES_MAX = 99_999;
export const GOAL_MONTHLY_MAX = 99;

const optionalTarget = (max: number) => z.union([z.coerce.number().int().min(1).max(max), z.null()]).optional();

// `targetPages` / `targetBooksPerMonth`: a number sets, null clears, absent leaves alone.
export const goalInputSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  targetBooks: z.coerce.number().int().min(1, `Goal must be between 1 and ${GOAL_BOOKS_MAX} books.`).max(GOAL_BOOKS_MAX, `Goal must be between 1 and ${GOAL_BOOKS_MAX} books.`),
  targetPages: optionalTarget(GOAL_PAGES_MAX),
  targetBooksPerMonth: optionalTarget(GOAL_MONTHLY_MAX),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

// True when the request sets a Plus goal (clearing one is always allowed, so a lapsed account can tidy up).
export function setsExtraGoals(input: Pick<GoalInput, "targetPages" | "targetBooksPerMonth">): boolean {
  return typeof input.targetPages === "number" || typeof input.targetBooksPerMonth === "number";
}

export interface StoredGoal {
  targetBooks: number;
  targetPages?: number | null;
  targetBooksPerMonth?: number | null;
}

export interface MonthlyPace {
  // Books a month: the reader's own target (Plus), or the yearly goal spread over twelve months.
  perMonth: number;
  custom: boolean;
}

// The monthly pace is a stat everyone gets, worked out from the yearly goal. A custom monthly target
// replaces it while `allowCustom` (Plus); a lapsed account falls back to the worked-out pace.
export function monthlyPace(goal: StoredGoal, allowCustom = true): MonthlyPace {
  if (allowCustom && goal.targetBooksPerMonth && goal.targetBooksPerMonth > 0) return { perMonth: goal.targetBooksPerMonth, custom: true };
  return { perMonth: goal.targetBooks / 12, custom: false };
}

// Whole books to finish this month to stay on course for the yearly goal: what was left at the start of
// the month, shared over the months that remain (this one included), rounded up. So a reader behind
// pace sees what catching up takes, and one ahead sees less. 0 once the goal is already met.
// A custom monthly target (Plus) replaces it. `month` is 0–11.
export function monthTarget(goal: StoredGoal, finishedBeforeMonth: number, month: number, allowCustom = true): MonthlyPace {
  if (allowCustom && goal.targetBooksPerMonth && goal.targetBooksPerMonth > 0) return { perMonth: goal.targetBooksPerMonth, custom: true };
  const left = Math.max(0, goal.targetBooks - finishedBeforeMonth);
  return { perMonth: Math.ceil(left / (12 - month)), custom: false };
}

// "2", or "2.5" for a pace that isn't whole.
export function formatPace(perMonth: number): string {
  const rounded = Math.round(perMonth * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// One finished read, placed in the reader's calendar (lib/stats.ts). Undated finishes have no year.
export interface GoalFinish {
  year: number | null;
  month: number | null; // 0 to 11
  pages: number;
}

export interface GoalProgress {
  // Finishes this year, re-reads included, and their pages.
  books: number;
  pages: number;
  // Finishes so far in `month`.
  thisMonth: number;
  month: number;
}

// Progress against a year's goal, counted the way the stats page counts it: every dated finished read,
// so a book read twice counts twice and starting a re-read doesn't take back the earlier finish.
export function goalProgress(finishes: GoalFinish[], year: number, month: number): GoalProgress {
  const done = finishes.filter((f) => f.year === year);
  return {
    books: done.length,
    pages: done.reduce((sum, f) => sum + f.pages, 0),
    thisMonth: done.filter((f) => f.month === month).length,
    month,
  };
}
